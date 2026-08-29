import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册全部内容（敌人/效果）
import { BattleDriver } from '../src/core/sdk/driver.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { getEffectDefinition } from '../src/core/effects/registry.js';
import { DealDamageInstruction, ApplyHealInstruction } from '../src/core/instructions/combat.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import { generateEncounter, enemyScaling, spawnEnemy, bandOfFloor } from '../src/core/run/floorEnemyGenerator.js';
import { isBossFloor } from '../src/core/run/runFlow.js';
import { createRunState } from '../src/core/state/runState.js';
import Player from '../src/core/state/player.js';

// 新敌人体系验证：四个新效果（荆棘/蓄势/虚弱/再生）的结算语义、
// 六个新敌人的行为循环与意图一致性、floorEnemyGenerator 的缩放与确定性。

function tank() {
  const e = getEnemyDefinition('slime').createUnit();
  e.maxHp = 500;
  e.hp = 500;
  return e;
}

describe('新效果结算', () => {
  it('荆棘：受到攻击时对攻击者造成层数点穿透伤害（无来源不反）', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const enemy = d.state.enemies[0];
    d.dispatch(new AddEffectInstruction({ target: enemy, effectId: 'thorns', stacks: 3 }));
    const hp0 = d.player.hp;
    d.dispatch(new DealDamageInstruction({ source: d.player, target: enemy, amount: 10 }));
    expect(d.player.hp).toBe(hp0 - 3); // 反伤 3，穿透（无视护盾/防御）

    // 环境伤害（无来源）不触发反伤
    d.player.shield = 5;
    const hp1 = d.player.hp;
    d.dispatch(new DealDamageInstruction({ source: null, target: enemy, amount: 5 }));
    expect(d.player.hp).toBe(hp1);
  });

  it('蓄势：每层攻击 +1（读轨）', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const enemy = d.state.enemies[0];
    const a0 = enemy.getStat('attack');
    d.dispatch(new AddEffectInstruction({ target: enemy, effectId: 'focus', stacks: 3 }));
    expect(enemy.getStat('attack')).toBe(a0 + 3);
  });

  it('虚弱：每层攻击 -1（可压成负值，伤害算式对称衰减）', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const a0 = d.player.getStat('attack');
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'weaken', stacks: 2 }));
    expect(d.player.getStat('attack')).toBe(a0 - 2);
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'weaken', stacks: 8 }));
    expect(d.player.getStat('attack')).toBe(a0 - 10); // 负面板合法
  });

  it('再生：回合开始恢复层数点生命，层数 -1', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    d.player.hp = 20;
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'regen', stacks: 3 }));
    d.endTurn(); // 敌方回合（攻 6，无再生 tick）→ 己方回合开始 tick
    expect(d.player.hp).toBe(20 - 6 + 3); // 先挨刀后回血
    expect(d.player.getEffectStacks('regen')).toBe(2);
  });
});

describe('新敌人：行为循环与意图一致', () => {
  const cases = [
    {
      id: 'hedgehog',
      name: '针鼠',
      turns: [
        { intent: { kinds: ['buff'] }, expect: (d) => expect(d.state.enemies[0].getEffectStacks('thorns')).toBe(2) },
        { intent: { kinds: ['attack'], damage: 6 }, expect: (d, s) => expect(s.playerHpDelta).toBe(6) },
        { intent: { kinds: ['buff'] }, expect: (d) => expect(d.state.enemies[0].getEffectStacks('thorns')).toBe(4) }, // 封顶 4
        { intent: { kinds: ['attack'], damage: 6 }, expect: (d, s2) => expect(s2.playerHpDelta).toBe(6) }, // 攻击手（棘满不再叠）
      ],
    },
    {
      id: 'shadowblade',
      name: '暗影刺客',
      turns: [
        { intent: { kinds: ['attack'], damage: 6 }, expect: (d, s) => expect(s.playerHpDelta).toBe(6) },
        { intent: { kinds: ['buff'] }, expect: (d) => expect(d.state.enemies[0].getEffectStacks('focus')).toBe(2) },
        { intent: { kinds: ['attack'], damage: 14 + 2 }, expect: (d, s) => expect(s.playerHpDelta).toBe(16) }, // 蓄势已+2攻击
      ],
    },
    {
      id: 'wraith',
      name: '怨灵',
      turns: [
        { intent: { kinds: ['attack'], damage: 8 }, expect: (d, s) => expect(s.playerHpDelta).toBe(8) },
        { intent: { kinds: ['debuff'] }, expect: (d) => expect(d.player.getEffectStacks('weaken')).toBe(2) },
      ],
    },
    {
      id: 'gargoyle',
      name: '石像卫士',
      turns: [
        { intent: { kinds: ['buff'] }, expect: (d) => expect(d.state.enemies[0].getEffectStacks('regen')).toBe(3) },
        { intent: { kinds: ['attack'], damage: 10 }, expect: (d, s) => expect(s.playerHpDelta).toBe(10) },
        { intent: { kinds: ['defend'] }, expect: (d) => expect(d.state.enemies[0].shield).toBe(6) },
      ],
    },
    {
      id: 'nightbat',
      name: '夜蝠',
      turns: [
        { intent: { kinds: ['attack', 'buff'], damage: 8 }, expect: (d, s, e) => { expect(s.playerHpDelta).toBe(8); expect(e.hp).toBe(e.maxHp); } },
        { intent: { kinds: ['attack', 'buff'], damage: 8 }, expect: (d, s, e) => expect(e.hp).toBe(e.maxHp) },
        { intent: { kinds: ['debuff'] }, expect: (d) => expect(d.player.getEffectStacks('stall')).toBe(1) },
      ],
    },
    {
      id: 'rockshell',
      name: '岩甲龟',
      turns: [
        { intent: { kinds: ['defend', 'buff'] }, expect: (d) => { expect(d.state.enemies[0].shield).toBe(7); expect(d.state.enemies[0].getEffectStacks('thorns')).toBe(1); } },
        { intent: { kinds: ['attack'], damage: 10 }, expect: (d, s) => expect(s.playerHpDelta).toBe(10) },
      ],
    },
  ];

  for (const c of cases) {
    it(`${c.name}：行动循环按序执行，意图预告与实际结算一致`, () => {
      const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: [c.id], seed: 5, player: { maxHp: 200 } });
      d.start();
      for (const turn of c.turns) {
        const enemy = d.state.enemies[0];
        const intent = enemy.intention;
        expect(intent.kinds).toEqual(turn.intent.kinds);
        expect(intent.kinds.length).toBeLessThanOrEqual(2); // 组合上限：两两
        if (turn.intent.damage != null) expect(intent.damage).toBe(turn.intent.damage);

        const before = { hp: d.player.hp, enemyHp: enemy.hp };
        d.endTurn(); // 敌方回合执行
        const snapshot = { playerHpDelta: before.hp - d.player.hp };
        turn.expect(d, snapshot, enemy);
        expect(enemy.hp).toBeLessThanOrEqual(before.enemyHp); // 夜蝠自愈不超上限
      }
    });
  }

  it('意图与实际伤害同源：受虚弱影响的敌人攻击预告同步衰减', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: ['slime'], seed: 5, player: { maxHp: 200 } });
    d.start();
    const slime = d.state.enemies[0];
    d.dispatch(new AddEffectInstruction({ target: slime, effectId: 'weaken', stacks: 10 }));
    // 重算意图（endTurn 后会刷新）：直接调 getIntention 校验算式
    const def = getEnemyDefinition('slime');
    const intent = def.getIntention(slime);
    expect(intent.damage).toBe(-4); // 6 + attack(0-10) = -4：负面板合法
  });
});

describe('floorEnemyGenerator', () => {
  const runAt = (floor, seed = 9) => {
    const run = createRunState({ seed, player: new Player({ maxHp: 30 }) });
    run.floor = floor;
    return run;
  };

  it('描述符可序列化（存档/回放安全），含 defId 与缩放终值', () => {
    const enc = generateEncounter(runAt(20));
    for (const e of enc) {
      expect(typeof e.defId).toBe('string');
      expect(Number.isFinite(e.maxHp)).toBe(true);
      expect(Number.isFinite(e.attack)).toBe(true);
    }
    expect(() => JSON.parse(JSON.stringify(enc))).not.toThrow();
  });

  it('确定性：同 seed 同楼层编成一致；异楼层随强度单调不减', () => {
    const a = generateEncounter(runAt(17));
    const b = generateEncounter(runAt(17));
    expect(a).toEqual(b);

    // 强度单调：高层编成的（HP 总和 / 攻击总和）不低于低层
    const sum = (enc) => enc.reduce((acc, e) => ({ hp: acc.hp + e.maxHp, atk: acc.atk + e.attack }), { hp: 0, atk: 0 });
    const low = sum(generateEncounter(runAt(4)));
    const high = sum(generateEncounter(runAt(38)));
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.atk).toBeGreaterThanOrEqual(low.atk);
  });

  it('分段池：低层不出高层敌人（band 内取材）', () => {
    // 第一章（floor 2）只可能是 slime/hedgehog/wraith
    const chapter1 = new Set(['slime', 'hedgehog', 'wraith']);
    for (let i = 0; i < 20; i++) {
      const enc = generateEncounter(runAt(2, 100 + i));
      for (const e of enc) expect(chapter1.has(e.defId)).toBe(true);
    }
    expect(bandOfFloor(1)).toBe(0);
    expect(bandOfFloor(12)).toBe(1);
    expect(bandOfFloor(44)).toBe(3);
  });

  it('编成规模：教学层恒 1，第 1 章即常出双敌，后期可 2-3', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateEncounter(runAt(1, 300 + i))).toHaveLength(1);
    }
    let earlyMulti = false;
    for (let i = 0; i < 40; i++) {
      if (generateEncounter(runAt(6, 400 + i)).length >= 2) earlyMulti = true;
    }
    expect(earlyMulti).toBe(true);
    let three = false;
    for (let i = 0; i < 40; i++) {
      const enc = generateEncounter(runAt(30, 500 + i));
      if (enc.length === 3) three = true;
      expect(enc.length).toBeLessThanOrEqual(3);
    }
    expect(three).toBe(true);
  });

  it('Boss 层：恒单只强化 Boss（HP 吃 Boss 倍率）', () => {
    const enc = generateEncounter(runAt(11));
    expect(enc).toHaveLength(1);
    const base = getEnemyDefinition(enc[0].defId).createUnit();
    const scaling = enemyScaling(11, { boss: true });
    expect(enc[0].maxHp).toBe(Math.round(base.maxHp * scaling.hpMult));
    expect(enc[0].attack).toBe(base.attack + scaling.attackBonus);
    expect(isBossFloor(11)).toBe(true);
  });

  it('缩放曲线：HP 随层增长且封顶；攻击每 8 层 +1', () => {
    expect(enemyScaling(1)).toEqual({ hpMult: 1, attackBonus: 0 });
    expect(enemyScaling(9).attackBonus).toBe(1);
    expect(enemyScaling(9).hpMult).toBeGreaterThan(enemyScaling(5).hpMult);
    expect(enemyScaling(200).hpMult).toBe(4); // 封顶
  });

  it('spawnEnemy：描述符落地为实例（HP/攻击就位）；裸 id 兼容旧写法', () => {
    const u = spawnEnemy({ defId: 'gargoyle', maxHp: 77, attack: 4 });
    expect(u.maxHp).toBe(77);
    expect(u.hp).toBe(77);
    expect(u.attack).toBe(4);
    const bare = spawnEnemy('slime');
    expect(bare.defId).toBe('slime');
    expect(bare.maxHp).toBe(20);
  });
});

describe('效果定义元数据完整（前端效果行渲染依赖）', () => {
  it('四个新效果均有 name/icon/type/color/描述', () => {
    for (const id of ['thorns', 'focus', 'weaken', 'regen']) {
      const def = getEffectDefinition(id);
      expect(def.name, id).toBeTruthy();
      expect(def.icon, id).toBeTruthy();
      expect(['buff', 'debuff']).toContain(def.type);
      expect(def.description, id).toBeTruthy();
    }
  });
});
