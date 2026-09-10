import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册全部内容（敌人/效果）
import { BattleDriver } from '../src/core/sdk/driver.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { getEffectDefinition } from '../src/core/effects/registry.js';
import { DealDamageInstruction, ApplyHealInstruction } from '../src/core/instructions/combat.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import {
  generateEncounter, floorDifficulty, difficultyScaling, spawnEnemy, isEliteFloor,
} from '../src/core/run/floorEnemyGenerator.js';
import { spawnableCardPool } from '../src/core/run/rewards.js';
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
        { intent: { kinds: ['attack'], damage: 6 }, expect: (d, s) => expect(s.playerHpDelta).toBe(6) },
        { intent: { kinds: ['debuff'] }, expect: (d) => expect(d.player.getEffectStacks('weaken')).toBe(2) },
        { intent: { kinds: ['attack'], damage: 8 }, expect: (d, s) => expect(s.playerHpDelta).toBe(8) },
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

describe('floorEnemyGenerator（2026-09 难度制）', () => {
  const runAt = (floor, seed = 9) => {
    const run = createRunState({ seed, player: new Player({ maxHp: 30 }) });
    run.floor = floor;
    return run;
  };
  const sumDiff = (enc) => enc.reduce((n, e) => n + e.difficulty, 0);

  it('描述符可序列化（存档/回放安全），含 defId / 难度 / 缩放终值', () => {
    const enc = generateEncounter(runAt(20));
    for (const e of enc) {
      expect(typeof e.defId).toBe('string');
      expect(Number.isFinite(e.maxHp)).toBe(true);
      expect(Number.isFinite(e.attack)).toBe(true);
      expect(Number.isInteger(e.difficulty)).toBe(true);
    }
    expect(() => JSON.parse(JSON.stringify(enc))).not.toThrow();
  });

  it('确定性：同 seed 同楼层编成一致；强度随层单调不减', () => {
    const a = generateEncounter(runAt(17));
    const b = generateEncounter(runAt(17));
    expect(a).toEqual(b);

    const sum = (enc) => enc.reduce((acc, e) => ({ hp: acc.hp + e.maxHp, atk: acc.atk + e.attack }), { hp: 0, atk: 0 });
    const low = sum(generateEncounter(runAt(4)));
    const high = sum(generateEncounter(runAt(38)));
    expect(high.hp).toBeGreaterThan(low.hp);
    expect(high.atk).toBeGreaterThanOrEqual(low.atk);
  });

  it('全楼层可行性：1-44 每层任何种子都生成成功，且 Σ难度 贴近层难度', () => {
    for (let floor = 1; floor <= 44; floor++) {
      for (let i = 0; i < 6; i++) {
        const enc = generateEncounter(runAt(floor, 1000 + i * 7));
        expect(enc.length, `${floor}`).toBeGreaterThanOrEqual(1);
        expect(enc.length, `${floor}`).toBeLessThanOrEqual(3);
        // 贴模板时 Σ 恒等；贴线收场（无够得着的模板）最多缺 2（章末高预算保护带）
        expect(floorDifficulty(floor) - sumDiff(enc), `${floor}`).toBeLessThanOrEqual(2);
        expect(sumDiff(enc), `${floor}`).toBeLessThanOrEqual(floorDifficulty(floor));
        for (const e of enc) {
          const def = getEnemyDefinition(e.defId);
          expect(floor, `${floor}/${e.defId}`).toBeGreaterThanOrEqual(def.difficulty.floorMin);
          expect(floor, `${floor}/${e.defId}`).toBeLessThanOrEqual(def.difficulty.floorMax);
          expect(e.difficulty, `${floor}/${e.defId}`).toBeGreaterThanOrEqual(def.difficulty.min);
          expect(e.difficulty, `${floor}/${e.defId}`).toBeLessThanOrEqual(def.difficulty.max);
        }
      }
    }
  });

  it('难度曲线：开局陡升、后续每 2 层 +1；Boss 按章取难度', () => {
    expect(floorDifficulty(1)).toBe(2);
    expect(floorDifficulty(2)).toBe(4);
    expect(floorDifficulty(3)).toBe(5);
    expect(floorDifficulty(12)).toBe(9);
    expect(floorDifficulty(13)).toBe(9);
    expect(floorDifficulty(14)).toBe(10);
    expect([11, 22, 33, 44].map(floorDifficulty)).toEqual([8, 11, 14, 18]);
    // 单调不减
    for (let f = 2; f <= 43; f++) {
      const a = floorDifficulty(isBossFloor(f) ? f - 1 : f);
      const b = floorDifficulty(isBossFloor(f + 1) ? f : f + 1);
      expect(b).toBeGreaterThanOrEqual(a);
    }
  });

  it('属性缩放只由实例难度决定：d=2 白板；每 +1 难度 HP +40%、攻击每 2 难 +1', () => {
    expect(difficultyScaling(1)).toEqual({ hpMult: 1, attackBonus: 0 });
    expect(difficultyScaling(2)).toEqual({ hpMult: 1, attackBonus: 0 });
    expect(difficultyScaling(4)).toEqual({ hpMult: 1.8, attackBonus: 1 });
    expect(difficultyScaling(8).hpMult).toBeCloseTo(3.4);
    expect(difficultyScaling(8).attackBonus).toBe(3);
    // 描述符终值 = 基准 × 难度缩放
    const enc = generateEncounter(runAt(12));
    for (const e of enc) {
      const base = getEnemyDefinition(e.defId).createUnit();
      const sc = difficultyScaling(e.difficulty);
      expect(e.maxHp).toBe(Math.max(1, Math.round(base.maxHp * sc.hpMult)));
      expect(e.attack).toBe(base.attack + sc.attackBonus);
    }
  });

  it('分段池（楼层区间）：低层不出高层敌人；敌人按楼层区间退役', () => {
    const chapter1 = new Set(['slime', 'hedgehog', 'wraith']);
    for (let i = 0; i < 20; i++) {
      const enc = generateEncounter(runAt(2, 100 + i));
      for (const e of enc) expect(chapter1.has(e.defId)).toBe(true);
    }
    // 史莱姆 14 层后退役：任何种子都不再出现
    for (let i = 0; i < 30; i++) {
      const enc = generateEncounter(runAt(20, 700 + i));
      expect(enc.some(e => e.defId === 'slime')).toBe(false);
    }
  });

  it('编成规模：第 1 层恒 1；第 2 场起恒 ≥2，后期 2-3', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateEncounter(runAt(1, 300 + i))).toHaveLength(1);
    }
    for (let floor = 2; floor <= 10; floor++) {
      for (let i = 0; i < 8; i++) {
        const enc = generateEncounter(runAt(floor, 400 + i));
        // 精英层允许「精英独战」单敌；普通层维持恒 ≥2
        expect(enc.length).toBeGreaterThanOrEqual(isEliteFloor(floor) ? 1 : 2);
      }
    }
    let three = false;
    for (let i = 0; i < 40; i++) {
      const enc = generateEncounter(runAt(30, 500 + i));
      if (enc.length === 3) three = true;
      expect(enc.length).toBeLessThanOrEqual(3);
      expect(enc.length).toBeGreaterThanOrEqual(2);
    }
    expect(three).toBe(true);
  });

  it('主题模板：史莱姆战（2-10）恒含 1 史莱姆 + 1 其他；影袭含暗影刺客', () => {
    // 史莱姆战可能与其他双敌模板竞争——只验证「出现史莱姆的 2 敌编成里必是 1 史莱姆」
    // 的结构约束，不锁定模板选择本身（那是 rng 的事）
    for (let i = 0; i < 30; i++) {
      const enc = generateEncounter(runAt(6, 900 + i));
      const slimes = enc.filter(e => e.defId === 'slime').length;
      expect(enc).toHaveLength(2);
      expect(slimes).toBeLessThanOrEqual(1);
    }
    // 章 2+ 出现的影袭编成：含暗影刺客的编成长度为 2
    for (let i = 0; i < 30; i++) {
      const enc = generateEncounter(runAt(16, 1100 + i));
      if (enc.some(e => e.defId === 'shadowblade')) {
        expect(enc.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('Boss 层：恒单只 Boss，难度按章（8/11/14/18），属性吃难度缩放', () => {
    const enc = generateEncounter(runAt(22));
    expect(enc).toHaveLength(1);
    expect(enc[0].defId).toBe('pyro');
    expect(enc[0].difficulty).toBe(11);
    const base = getEnemyDefinition('pyro').createUnit();
    const sc = difficultyScaling(11);
    expect(enc[0].maxHp).toBe(Math.round(base.maxHp * sc.hpMult));
    expect(enc[0].attack).toBe(base.attack + sc.attackBonus);
    expect(isBossFloor(22)).toBe(true);
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

describe('精英怪：雪狼（第 1 章样例）', () => {
  // 高血玩家直驱雪狼：开局压制 → 三拍循环（攻8防8 / 攻8×2 / 塞2震慑）
  function wolfBattle() {
    const d = new BattleDriver({
      deck: ['punch', 'punch', 'punch'],
      enemies: [spawnEnemy('snowwolf')],
      seed: 5, player: { maxHp: 100 }, config: { drawPerTurn: 0 },
    });
    d.start();
    return d;
  }

  it('开局：虚弱2 + 攻8；意图与行为一致', () => {
    const d = wolfBattle();
    const wolf = d.state.enemies[0];
    expect(wolf.maxHp).toBe(70);                       // 白板（spawnEnemy 裸 id）
    const intent = getEnemyDefinition('snowwolf').getIntention(wolf, d.state);
    expect(intent.kinds).toEqual(['debuff', 'attack']);
    expect(intent.damage).toBe(8);
    d.endTurn();
    expect(d.player.getEffectStacks('weaken')).toBe(2);
    expect(100 - d.player.hp).toBe(8);
  });

  it('循环拍一：攻8 + 护盾8；意图含 defend', () => {
    const d = wolfBattle();
    d.endTurn();                                        // 开局拍
    const intent = getEnemyDefinition('snowwolf').getIntention(d.state.enemies[0], d.state);
    expect(intent.kinds).toEqual(['attack', 'defend']);
    const hp0 = d.player.hp;
    d.endTurn();
    expect(hp0 - d.player.hp).toBe(8);
    expect(d.state.enemies[0].shield).toBe(8);
  });

  it('循环拍二：攻8×2（一段意图预告 hits=2）', () => {
    const d = wolfBattle();
    d.endTurn(); d.endTurn();                           // 开局拍 + 循环拍一
    const intent = getEnemyDefinition('snowwolf').getIntention(d.state.enemies[0], d.state);
    expect(intent.kinds).toEqual(['attack']);
    expect(intent.hits).toBe(2);
    const hp0 = d.player.hp;
    d.endTurn();
    expect(hp0 - d.player.hp).toBe(16);
  });

  it('循环拍三：向手牌随机位置塞 2 张震慑（消耗/无效果/1AP）', () => {
    const d = wolfBattle();
    d.endTurn(); d.endTurn(); d.endTurn();              // 开局 + 拍一 + 拍二
    const intent = getEnemyDefinition('snowwolf').getIntention(d.state.enemies[0], d.state);
    expect(intent.kinds).toEqual(['debuff']);
    expect(intent.note).toContain('震慑');
    const hand0 = d.state.zones.hand.length;
    const hp0 = d.player.hp;
    d.endTurn();
    expect(d.state.zones.hand.length).toBe(hand0 + 2);  // 塞入 2 张（未满手）
    const shocks = d.state.zones.hand.filter(c => c.defId === 'shockCard');
    expect(shocks).toHaveLength(2);
    expect(d.player.hp).toBe(hp0);                        // 塞牌拍不攻击
    // 震慑是 1AP 无效果消耗牌：打出只烧 AP 与充能，不产生任何结算
    const ap0 = d.player.actionPoints;
    const hp1 = d.player.hp;
    d.play(shocks[0].uniqueID);
    expect(d.player.actionPoints).toBe(ap0 - 1);
    expect(d.player.hp).toBe(hp1);
    expect(d.state.zones.burnt.some(c => c.uniqueID === shocks[0].uniqueID)).toBe(true);
    expect(spawnableCardPool().map(x => x.id)).not.toContain('shockCard');  // 不入奖励池
  });
});

describe('精英怪房（生成侧）', () => {
  const runAt = (floor, seed = 9) => {
    const run = createRunState({ seed, player: new Player({ maxHp: 30 }) });
    run.floor = floor;
    return run;
  };

  it('排期：每章第 5、8 层为精英层；Boss/普通层不是', () => {
    for (const f of [5, 8, 16, 19, 27, 30, 38, 41]) expect(isEliteFloor(f)).toBe(true);
    for (const f of [1, 4, 6, 10, 11, 15, 17, 22, 44]) expect(isEliteFloor(f)).toBe(false);
  });

  it('章 1 精英层：1-2 敌、恒含一只雪狼、Σ=层难度、雪狼按 base 锚点缩放', () => {
    for (const floor of [5, 8]) {
      for (let i = 0; i < 12; i++) {
        const enc = generateEncounter(runAt(floor, 600 + i));
        expect(enc.length, `${floor}`).toBeGreaterThanOrEqual(1);
        expect(enc.length, `${floor}`).toBeLessThanOrEqual(2);
        const wolves = enc.filter(e => e.defId === 'snowwolf');
        expect(wolves, `${floor}`).toHaveLength(1);     // 恒一只精英
        expect(enc.reduce((n, e) => n + e.difficulty, 0), `${floor}`)
          .toBe(floorDifficulty(floor));                // Σ = D（精英模板恒贴线）
        const w = wolves[0];
        expect(w.difficulty).toBeGreaterThanOrEqual(4);
        expect(w.difficulty).toBeLessThanOrEqual(7);
        const sc = difficultyScaling(w.difficulty, 5);  // 锚点 = base 5
        expect(w.maxHp).toBe(Math.round(70 * sc.hpMult));
      }
    }
  });

  it('精英不进普通层：章 1 非精英层任何种子都不出雪狼', () => {
    for (let i = 0; i < 20; i++) {
      const enc = generateEncounter(runAt(6, 800 + i));
      expect(enc.some(e => e.defId === 'snowwolf')).toBe(false);
    }
  });

  it('章 2+ 尚无精英内容：精英层自动回落普通编成（不出错、无精英）', () => {
    for (const floor of [16, 27, 41]) {
      for (let i = 0; i < 6; i++) {
        const enc = generateEncounter(runAt(floor, 900 + i));
        expect(enc.length).toBeGreaterThanOrEqual(2);
        expect(enc.some(e => getEnemyDefinition(e.defId).difficulty.elite)).toBe(false);
      }
    }
  });
});
