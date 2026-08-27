import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { BattleDriver } from '../src/core/sdk/driver.js';
import { BODY_STARTER_DECK } from '../src/core/content/bodySkills.js';
import { RunDriver } from '../src/core/run/runDriver.js';
import { spawnableCardPool } from '../src/core/run/rewards.js';
import { promoteCard } from '../src/core/run/promotion.js';
import { createRunState } from '../src/core/state/runState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { canUseSkill } from '../src/core/skills/helpers.js';
import { getSkillDefinition } from '../src/core/skills/registry.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { zoneOf, moveCard, handNeighbors } from '../src/core/state/battleState.js';
import { DrawCardsInstruction } from '../src/core/instructions/cards.js';
import { DealDamageInstruction, previewDamage } from '../src/core/instructions/combat.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import { makeSkillCtx } from '../src/core/skills/helpers.js';

// 体修基础卡组（BODY_CULTIVATION_CARDS）：拳/刀/拆三系 D+C 内容的正式落地验证。
// 原型时期的机制（block/stall/牌库末抽牌/位置敏感）已从各原型测试收编进 content。

const enemyHp = (d) => d.state.enemies[0].hp;

// 高血木桩（沿用 slime 行为定义，仅改血量）：卡序/冷却类用例需跨多回合打牌
function tank() {
  const e = getEnemyDefinition('slime').createUnit();
  e.maxHp = 200;
  e.hp = 200;
  return e;
}

// 手牌按 defId 重排（位置敏感卡的确定性布置）
function placeAt(d, defId, index) {
  const hand = d.state.zones.hand;
  const i = hand.findIndex(c => c.defId === defId);
  const [card] = hand.splice(i, 1);
  hand.splice(index, 0, card);
  return card;
}

// 任意 zone 查找（初始抽牌后位置不确定，测试布置用）
function findCard(d, defId) {
  for (const zone of ['hand', 'deck', 'discard']) {
    const card = d.state.zones[zone].find(c => c.defId === defId);
    if (card) return card;
  }
  return undefined;
}

// 把指定卡弄回手牌（无论当前在哪）
function toHand(d, defId) {
  const card = findCard(d, defId);
  if (zoneOf(d.state, card.uniqueID) !== 'hand') {
    moveCard(d.state, card.uniqueID, 'hand');
  }
  return card;
}

// 卡牌 sctx（battleDescribe 断言用）
function sctxOf(d, rt) {
  return makeSkillCtx(d.ctx, rt);
}

describe('伤害干跑预估（previewDamage）', () => {
  it('吃 PRE 修正：目标格挡减半体现在预览值，且预览不消耗格挡层数', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    d.dispatch(new AddEffectInstruction({ target: d.state.enemies[0], effectId: 'block', stacks: 2 }));

    const preview = previewDamage(d.ctx, { source: d.player, target: d.state.enemies[0], amount: 10 });
    expect(preview.damage).toBe(5); // 格挡减半
    expect(d.state.enemies[0].getEffectStacks('block')).toBe(2); // 预览未消耗

    const hp0 = enemyHp(d);
    d.play('punch'); // 6 → 减半 3，格挡 -1
    expect(hp0 - enemyHp(d)).toBe(3);
    expect(d.state.enemies[0].getEffectStacks('block')).toBe(1);
  });

  it('一次性触发（once 窗口"下次伤害翻倍"）预览翻倍且不被干跑消耗', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    // 模拟"下次伤害翻倍"buff：once 窗口 PRE 订阅
    d.kernel.addSubscription({
      when: DealDamageInstruction, phase: 'pre', window: 'once',
      filter: (instr) => instr.source === d.player,
      react: (instr) => instr.setPayload('damage', instr.payload.damage * 2),
    });

    expect(previewDamage(d.ctx, { source: d.player, target: d.state.enemies[0], amount: 6 }).damage).toBe(12);
    expect(d.kernel.subscriptions.some(s => s.window === 'once')).toBe(true); // 未被预览消耗

    const hp0 = enemyHp(d);
    d.play('punch');
    expect(hp0 - enemyHp(d)).toBe(12); // 真实结算翻倍，触发后被消耗
    expect(d.kernel.subscriptions.some(s => s.window === 'once')).toBe(false);
  });
});

describe('描述双轨（应用前 describe / 应用后 battleDescribe）', () => {
  it('飞刀：应用前含条件与公式；应用后按当前手牌结算', () => {
    const def = getSkillDefinition('flyingDagger');
    expect(def.describe()).toBe('6伤害；弃两侧手牌，每弃1张+5，需两侧有牌');

    const d = new BattleDriver({
      deck: ['flyingDagger', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    const rt = d.state.zones.hand.find(c => c.defId === 'flyingDagger');
    placeAt(d, 'flyingDagger', 0); // 缺一侧
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('6伤害；需两侧有牌');
    placeAt(d, 'flyingDagger', 1); // 两侧齐
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('16伤害，弃两侧牌');
  });

  it('破势：应用后按当前格挡层数结算转化伤害', () => {
    const def = getSkillDefinition('breakStance');
    const d = new BattleDriver({ deck: ['breakStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const rt = toHand(d, 'breakStance');
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('12伤害');
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'block', stacks: 3 }));
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('24伤害，弃3/effect{格挡}');
  });

  it('斩：应用后伤害反映衰败（power）', () => {
    const def = getSkillDefinition('slash');
    const d = new BattleDriver({ deck: ['slash', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const rt = toHand(d, 'slash');
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('16伤害');
    rt.power = -2; // 模拟两回合衰败
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('14伤害');
  });

  it('仿形拳：应用后按是否最后手牌切换结算', () => {
    const def = getSkillDefinition('mimicFist');
    const d = new BattleDriver({ deck: ['mimicFist', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const rt = toHand(d, 'mimicFist');
    placeAt(d, 'mimicFist', 0);
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('5伤害');
    placeAt(d, 'mimicFist', d.state.zones.hand.length - 1);
    expect(def.battleDescribe(sctxOf(d, rt))).toBe('12伤害，抽1牌');
  });
});

describe('拆组合：格挡（block 效果）', () => {
  it('格挡层数使受击伤害减半并递减，耗尽后全额承伤', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch', 'punch', 'punch'], enemies: ['slime'], seed: 5 });
    d.start();
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'block', stacks: 2 }));

    d.dispatch(new DealDamageInstruction({ source: d.state.enemies[0], target: d.player, amount: 10 }));
    expect(d.player.hp).toBe(30 - 5);
    expect(d.player.getEffectStacks('block')).toBe(1);

    d.dispatch(new DealDamageInstruction({ source: d.state.enemies[0], target: d.player, amount: 10 }));
    expect(d.player.hp).toBe(30 - 10);
    expect(d.player.getEffect('block')).toBeNull();

    d.dispatch(new DealDamageInstruction({ source: d.state.enemies[0], target: d.player, amount: 10 }));
    expect(d.player.hp).toBe(30 - 20);
  });

  it('抱头 +1 层 / 格挡 +2 层（blockGuard）', () => {
    const d = new BattleDriver({ deck: ['duckHead', 'blockGuard', 'punch', 'punch'], enemies: ['slime'], seed: 5 });
    d.start();
    d.play('duckHead');
    expect(d.player.getEffectStacks('block')).toBe(1);
    d.play('blockGuard');
    expect(d.player.getEffectStacks('block')).toBe(3);
  });

  it('破势：失去至多 4 层格挡转化为伤害', () => {
    const d = new BattleDriver({ deck: ['breakStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'block', stacks: 3 }));
    const hp0 = enemyHp(d);
    d.play('breakStance'); // 12 + 3*4 = 24
    expect(hp0 - enemyHp(d)).toBe(24);
    expect(d.player.getEffectStacks('block')).toBe(0);
  });

  it('防御姿态（咏唱）：回合开始获得 1 层格挡', () => {
    const d = new BattleDriver({
      deck: ['defenseStance', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    d.play('defenseStance');
    expect(d.state.chant.slots).toHaveLength(1);
    d.endTurn(); // 敌方回合 → 我方回合开始 +1 格挡
    expect(d.player.getEffectStacks('block')).toBe(1);
  });
});

describe('拳组合：过牌引擎', () => {
  it('敏捷连击：最左端打出抽 1，非最左端不抽', () => {
    const d = new BattleDriver({
      deck: ['agileCombo', 'punch', 'punch', 'punch', 'punch'],
      enemies: [tank()], seed: 5,
    });
    d.start();
    const hp0 = enemyHp(d);

    placeAt(d, 'agileCombo', 0);
    const before = d.state.zones.hand.length;
    d.play('agileCombo');
    expect(hp0 - enemyHp(d)).toBe(7);
    expect(d.state.zones.hand.length).toBe(before); // 自身离手 -1、抽 1 +1

    d.endTurn();
    toHand(d, 'agileCombo');
    placeAt(d, 'agileCombo', 1); // 非最左端
    const before2 = d.state.zones.hand.length;
    d.play('agileCombo');
    expect(d.state.zones.hand.length).toBe(before2 - 1); // 无抽牌
  });

  it('蓄力：向牌库随机位插入 1 张千击；千击 0 费抽 1 后消耗', () => {
    const d = new BattleDriver({
      deck: ['chargeUp', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    d.play('chargeUp');
    expect(d.state.zones.deck.filter(c => c.defId === 'thousandHits')).toHaveLength(1);

    const hit = d.state.zones.deck.find(c => c.defId === 'thousandHits');
    moveCard(d.state, hit.uniqueID, 'hand');
    const before = d.state.zones.hand.length;
    d.play('thousandHits');
    expect(d.state.zones.hand.length).toBe(before); // 自身离手 + 抽 1
    expect(zoneOf(d.state, hit.uniqueID)).toBe('burnt'); // 消耗
  });

  it('猛拳：手中无自然冷却，每打出 1 牌冷却 1，归零回充', () => {
    const d = new BattleDriver({
      deck: ['fierceFist', 'punch', 'punch', 'punch', 'punch'],
      enemies: [tank()], seed: 5,
    });
    d.start();
    const hp0 = enemyHp(d);
    d.play('fierceFist'); // 14 伤，充能耗尽，冷却 4
    expect(hp0 - enemyHp(d)).toBe(14);

    const fist = toHand(d, 'fierceFist'); // 弄回手中模拟"在手等待冷却"
    fist.remainingUses = 0;
    fist.currentCooldown = 4;

    d.play('punch');
    expect(fist.currentCooldown).toBe(3);
    d.play('punch');
    expect(fist.currentCooldown).toBe(2);
    d.endTurn(); // 手中无自然冷却（cooldownZones 仅牌库）
    expect(fist.currentCooldown).toBe(2);

    toHand(d, 'punch');
    d.play('punch');
    expect(fist.currentCooldown).toBe(1);
    toHand(d, 'punch');
    d.play('punch');
    expect(fist.currentCooldown).toBe(0);
    expect(fist.remainingUses).toBe(1); // 回充
  });

  it('仿形拳：作为最后一张手牌打出时 12 伤并抽 1，否则 5 伤', () => {
    const d = new BattleDriver({
      deck: ['mimicFist', 'punch', 'punch', 'punch', 'punch'],
      enemies: [tank()], seed: 5,
    });
    d.start();

    placeAt(d, 'mimicFist', 0); // 非最后一张
    let hp0 = enemyHp(d);
    d.play('mimicFist');
    expect(hp0 - enemyHp(d)).toBe(5);

    const again = toHand(d, 'mimicFist');
    placeAt(d, 'mimicFist', d.state.zones.hand.length - 1);
    again.currentCooldown = 0; // 冷却 1 回合，测试直改解锁
    again.remainingUses = 1;
    hp0 = enemyHp(d);
    const before = d.state.zones.hand.length;
    d.play('mimicFist');
    expect(hp0 - enemyHp(d)).toBe(12);
    expect(d.state.zones.hand.length).toBe(before); // 离手 -1、抽 1 +1
  });
});

describe('刀组合：卡序机制', () => {
  it('斩：仅在牌库中冷却；在手中渡过回合伤害 -1 且冷却不推进', () => {
    const d = new BattleDriver({
      deck: ['slash', 'punch', 'punch', 'punch', 'punch'],
      enemies: [tank()], seed: 5,
    });
    d.start();

    // 在手中渡过回合：衰败 + 不冷却
    const slash = toHand(d, 'slash');
    slash.remainingUses = 0;
    slash.currentCooldown = 2;
    d.endTurn();
    expect(slash.power).toBe(-1);
    expect(slash.currentCooldown).toBe(2);

    // 回到牌库：正常冷却推进、不再衰败
    moveCard(d.state, slash.uniqueID, 'deck');
    d.endTurn();
    expect(slash.currentCooldown).toBe(1);
    expect(slash.power).toBe(-1);

    // 打出：16 + power(-1) = 15（木桩第二次行动会上盾，先清零免干扰）
    slash.currentCooldown = 0;
    slash.remainingUses = 1;
    moveCard(d.state, slash.uniqueID, 'hand');
    d.state.enemies[0].shield = 0;
    const hp0 = enemyHp(d);
    d.play('slash');
    expect(hp0 - enemyHp(d)).toBe(15);
  });

  it('回旋斩：从牌库末抽牌', () => {
    const d = new BattleDriver({
      deck: ['cycloneSlash', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    const bottom = d.state.zones.deck[d.state.zones.deck.length - 1];
    d.play('cycloneSlash');
    expect(zoneOf(d.state, bottom.uniqueID)).toBe('hand');
  });

  it('刀背打击：丢弃最右侧手牌（跳过自身）；自身已在最右端时丢次右一张', () => {
    const d = new BattleDriver({
      deck: ['knifeBack', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    placeAt(d, 'knifeBack', 0); // 手牌：[knifeBack, x, x, x]
    const rightmost = d.state.zones.hand[d.state.zones.hand.length - 1];
    const hp0 = enemyHp(d);
    d.play('knifeBack');
    expect(hp0 - enemyHp(d)).toBe(6);
    expect(zoneOf(d.state, rightmost.uniqueID)).toBe('discard');

    // 边界：自身位于最右端 → 跳过自身丢次右一张
    const d2 = new BattleDriver({
      deck: ['knifeBack', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d2.start();
    placeAt(d2, 'knifeBack', d2.state.zones.hand.length - 1);
    const secondRight = d2.state.zones.hand.at(-2);
    d2.play('knifeBack');
    expect(zoneOf(d2.state, secondRight.uniqueID)).toBe('discard');
    expect(d2.state.zones.hand).toHaveLength(2);
  });

  it('飞刀：需两侧都有手牌，每弃 1 张 +5 伤害', () => {
    const d = new BattleDriver({
      deck: ['flyingDagger', 'punch', 'punch', 'punch'],
      enemies: [tank()], seed: 5,
    });
    d.start();
    placeAt(d, 'flyingDagger', 1); // 两侧各 1 张
    const [left, right] = [d.state.zones.hand[0], d.state.zones.hand[2]];
    const hp0 = enemyHp(d);
    d.play('flyingDagger');
    expect(hp0 - enemyHp(d)).toBe(6 + 10);
    expect(zoneOf(d.state, left.uniqueID)).toBe('discard');
    expect(zoneOf(d.state, right.uniqueID)).toBe('discard');

    // 缺一侧：不可用
    toHand(d, 'flyingDagger');
    placeAt(d, 'flyingDagger', 0); // 最左端：无左侧牌
    const rt = d.state.zones.hand.find(c => c.defId === 'flyingDagger');
    expect(canUseSkill(d.ctx, rt)).toBe(false);
  });

  it('收刃：15 伤 + 1 层滞气；滞气封锁抽牌且回合结束递减', () => {
    const d = new BattleDriver({
      deck: ['storeEdge', 'punch', 'punch', 'punch', 'punch'],
      enemies: [tank()], seed: 5,
    });
    d.start();
    const hp0 = enemyHp(d);
    d.play('storeEdge');
    expect(hp0 - enemyHp(d)).toBe(15);
    expect(d.state.zones.burnt.some(c => c.defId === 'storeEdge')).toBe(true);
    expect(d.player.getEffectStacks('stall')).toBe(1);

    const before = d.state.zones.hand.length;
    d.dispatch(new DrawCardsInstruction({ count: 2 })); // 被 veto
    expect(d.state.zones.hand.length).toBe(before);

    d.endTurn(); // 玩家回合结束：滞气 -1
    expect(d.player.getEffect('stall')).toBeNull();
  });
});

describe('体修卡组：晋升链与投放', () => {
  it('抱头/敏捷连击/蓄力/刀背打击 晋升到 C 阶（promotesTo）', () => {
    const run = createRunState({ seed: 1 });
    const chains = [
      ['duckHead', 'blockGuard'],
      ['agileCombo', 'rapidCombo'],
      ['chargeUp', 'comboStrike'],
      ['knifeBack', 'knifeBackHeavy'],
    ];
    for (const [from] of chains) run.player.deck.push(createSkillRuntime(from));
    for (const [from, to] of chains) {
      const rt = run.player.deck.find(c => c.defId === from);
      promoteCard(run, rt.uniqueID);
      expect(rt.defId).toBe(to);
    }
  });

  it('奖励池含体修卡、排除衍生牌千击', () => {
    const pool = spawnableCardPool().map(def => def.id);
    for (const id of ['agileCombo', 'slash', 'flyingDagger', 'duckHead', 'breakStance', 'defenseStance']) {
      expect(pool).toContain(id);
    }
    expect(pool).not.toContain('thousandHits');
  });

  it('guard 已更名「盾」，格挡名下只剩 block 层数版', () => {
    expect(getSkillDefinition('guard').name).toBe('盾');
    expect(getSkillDefinition('blockGuard').name).toBe('格挡');
  });
});

describe('整局可玩性：体修起始卡组跑完整 run', () => {
  it('RunDriver 默认策略可杀穿 3 层（发育链路畅通）', () => {
    const d = new RunDriver({ seed: 42, totalFloors: 3, deck: [...BODY_STARTER_DECK] });
    d.start().runToEnd();
    expect(d.result).toBe('victory');
  });
});
