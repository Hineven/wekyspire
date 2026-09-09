import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { BattleDriver } from '../src/core/sdk/driver.js';
import { canUseSkill, makeSkillCtx } from '../src/core/skills/helpers.js';
import { getSkillDefinition } from '../src/core/skills/registry.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import { ChantTriggerInstruction } from '../src/core/instructions/turn.js';
import { moveCard, zoneOf } from '../src/core/state/battleState.js';
import { createRunState } from '../src/core/state/runState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { promoteCard } from '../src/core/run/promotion.js';
import { spawnableCardPool } from '../src/core/run/rewards.js';

// 体修·拆组合（BODY_CULTIVATION_CARDS §3）：完美 / 命中 / 破 / 盾 / 姿态咏唱 /
// 以无胜有·以有胜无 的后端结算验证。headless 驱动真实结算，不 mock Core。

const enemyHp = (d) => d.state.enemies[0].hp;

// 高血木桩（沿用 slime 行为：无防御、奇数轮才会攻击），伤害类用例的活靶
function tank() {
  const e = getEnemyDefinition('slime').createUnit();
  e.maxHp = 300;
  e.hp = 300;
  return e;
}

// 龟缩木桩（rockshell：首个敌方回合只上盾不攻击）——回合末/跨回合类用例避免敌方
// 攻击消耗玩家格挡层数，断言保持干净
function turtle() {
  const e = getEnemyDefinition('rockshell').createUnit();
  e.maxHp = 300;
  e.hp = 300;
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

const cardInHand = (d, defId) => d.state.zones.hand.find(c => c.defId === defId);

// 测试布置捷径：玩家直接获得 N 层格挡（不经出牌）
const gainBlock = (d, n) => d.dispatch(
  new AddEffectInstruction({ target: d.player, effectId: 'block', stacks: n }));

describe('精准系列：【完美】位置门槛', () => {
  it('左侧存在不可打出的卡时完美卡不可打出，左侧全部可打出时可以', () => {
    const d = new BattleDriver({
      deck: ['perfectStrike', 'carefulStrike', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    placeAt(d, 'perfectStrike', 2); // 左侧：punch + carefulStrike
    const ps = cardInHand(d, 'perfectStrike');
    expect(canUseSkill(d.ctx, ps)).toBe(true);

    cardInHand(d, 'punch').remainingUses = 0; // 左侧第一张不可打
    expect(canUseSkill(d.ctx, ps)).toBe(false);

    cardInHand(d, 'punch').remainingUses = 1;
    expect(canUseSkill(d.ctx, ps)).toBe(true);

    // 完美判定递归含同类完美卡：左侧精心一击不可打同样封锁
    cardInHand(d, 'carefulStrike').remainingUses = 0;
    expect(canUseSkill(d.ctx, ps)).toBe(false);
  });

  it('最左端（无左侧卡）恒可打出；右侧卡不可打不影响', () => {
    const d = new BattleDriver({
      deck: ['carefulStrike', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    placeAt(d, 'carefulStrike', 0);
    cardInHand(d, 'punch').remainingUses = 0; // 只在右侧
    expect(canUseSkill(d.ctx, cardInHand(d, 'carefulStrike'))).toBe(true);
  });

  it('精心二击（延伸卡）不带完美：左侧有不可打出卡也可打出', () => {
    const d = new BattleDriver({
      deck: ['doubleStrike', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    placeAt(d, 'doubleStrike', 2);
    cardInHand(d, 'punch').remainingUses = 0;
    expect(canUseSkill(d.ctx, cardInHand(d, 'doubleStrike'))).toBe(true);
  });

  it('精准一击 23 / 精心一击 15 / 精心二击 15×2（基础面板 0）', () => {
    for (const [defId, times, base] of [['perfectStrike', 1, 23], ['carefulStrike', 1, 15], ['doubleStrike', 2, 15]]) {
      const d = new BattleDriver({
        deck: [defId, 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
      });
      d.start();
      placeAt(d, defId, 0); // 完美卡置最左，门槛恒过
      const hp0 = enemyHp(d);
      d.play(defId);
      expect(hp0 - enemyHp(d)).toBe(base * times);
    }
  });
});

describe('精准系列：【命中】触发与未命中', () => {
  it('折杨手命中：23 伤害并获得 3 层格挡', () => {
    const d = new BattleDriver({
      deck: ['foldWillow', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    const hp0 = enemyHp(d);
    d.play('foldWillow');
    expect(hp0 - enemyHp(d)).toBe(23);
    expect(d.player.getEffectStacks('block')).toBe(3);
  });

  it('伤害被护盾完全吸收（零生命伤害）算未命中：不获得格挡', () => {
    const d = new BattleDriver({
      deck: ['foldWillow', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    d.state.enemies[0].shield = 100;
    const hp0 = enemyHp(d);
    d.play('foldWillow');
    expect(hp0 - enemyHp(d)).toBe(0);            // 全部入护盾
    expect(d.state.enemies[0].shield).toBe(77);  // 100 - 23
    expect(d.player.getEffectStacks('block')).toBe(0);
  });

  it('摘星手（S）命中给 7 层格挡（等阶数值）', () => {
    const d = new BattleDriver({
      deck: ['pluckStar', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    const hp0 = enemyHp(d);
    d.play('pluckStar');
    expect(hp0 - enemyHp(d)).toBe(23);
    expect(d.player.getEffectStacks('block')).toBe(7);
  });
});

describe('破势系列：【破】逐层转化', () => {
  it('破势：7 伤害 + 每失去一层格挡独立 11 伤害（3 层 → 共 40）', () => {
    const d = new BattleDriver({
      deck: ['breakStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    gainBlock(d, 3);
    const hp0 = enemyHp(d);
    d.play('breakStance');
    expect(hp0 - enemyHp(d)).toBe(7 + 3 * 11);
    expect(d.player.getEffectStacks('block')).toBe(0);
  });

  it('解体 16/层（2 层 → 39）；贯心 24/层（2 层 → 55）', () => {
    for (const [defId, per] of [['disassemble', 16], ['pierceHeart', 24]]) {
      const d = new BattleDriver({
        deck: [defId, 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
      });
      d.start();
      gainBlock(d, 2);
      const hp0 = enemyHp(d);
      d.play(defId);
      expect(hp0 - enemyHp(d)).toBe(7 + 2 * per);
      expect(d.player.getEffectStacks('block')).toBe(0);
    }
  });

  it('边界：无格挡时破落空，仅结算基础伤害', () => {
    const d = new BattleDriver({
      deck: ['breakStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    const hp0 = enemyHp(d);
    d.play('breakStance');
    expect(hp0 - enemyHp(d)).toBe(7);
    expect(d.player.getEffectStacks('block')).toBe(0);
  });

  it('壁垒：每层 12 护盾（3 层 → 36），消耗焚毁', () => {
    const d = new BattleDriver({
      deck: ['barrier', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    gainBlock(d, 3);
    const card = cardInHand(d, 'barrier');
    d.play(card.uniqueID);
    expect(d.player.shield).toBe(36);
    expect(d.player.getEffectStacks('block')).toBe(0);
    expect(zoneOf(d.state, card.uniqueID)).toBe('burnt');
  });

  it('壁垒无格挡时落空，仍照常消耗；铜城每层 18 护盾', () => {
    const d = new BattleDriver({
      deck: ['barrier', 'bronzeCity', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    const barrier = cardInHand(d, 'barrier');
    d.play(barrier.uniqueID);
    expect(d.player.shield).toBe(0);
    expect(zoneOf(d.state, barrier.uniqueID)).toBe('burnt');

    gainBlock(d, 2);
    d.play('bronzeCity');
    expect(d.player.shield).toBe(36);
  });

  it('武魂：每层 +1 行动点（3 层 → +3）', () => {
    const d = new BattleDriver({
      deck: ['soulOfWar', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    gainBlock(d, 3);
    const apBefore = d.player.actionPoints;
    d.play('soulOfWar');
    expect(d.player.actionPoints).toBe(apBefore + 3);
    expect(d.player.getEffectStacks('block')).toBe(0);
  });
});

describe('盾系列', () => {
  it('坚固盾 8 护盾；强化盾 8 护盾 + 1 层格挡', () => {
    const d = new BattleDriver({
      deck: ['solidShield', 'reinforcedShield', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    d.play('solidShield');
    expect(d.player.shield).toBe(8);
    d.play('reinforcedShield');
    expect(d.player.shield).toBe(16);
    expect(d.player.getEffectStacks('block')).toBe(1);
  });
});

describe('姿态系列（咏唱）：龟守链', () => {
  it('防御准备：发动当回合结束即 P5 触发 +1 格挡，咏唱节拍反复触发持续累积', () => {
    const d = new BattleDriver({
      deck: ['defensePrep', 'punch', 'punch', 'punch'], enemies: [turtle()], seed: 5,
    });
    d.start();
    d.play('defensePrep');
    const stance = cardInHand(d, 'defensePrep');
    expect(stance.isActivated).toBe(true);   // 发动：留手牌点亮（咏唱4 占位）
    expect(d.player.getEffectStacks('block')).toBe(0); // P5 在回合结束段才触发

    d.endTurn(); // 本回合 P5 咏唱触发 → +1；敌方龟缩不攻击
    expect(d.player.getEffectStacks('block')).toBe(1);

    d.dispatch(new ChantTriggerInstruction()); // 再拍一次咏唱节拍（同 P5 挂载点）
    expect(d.player.getEffectStacks('block')).toBe(2);
  });

  it('龟守姿态：每节拍 +2 格挡；发动时获得笨拙2，笨拙封锁下回合抽牌', () => {
    const d = new BattleDriver({
      deck: ['turtleStance', 'punch', 'punch', 'punch'], enemies: [turtle()], seed: 5,
    });
    d.start();
    d.play('turtleStance');
    expect(d.player.getEffectStacks('clumsy')).toBe(2); // 激活瞬间代价

    const handBefore = d.state.zones.hand.length;
    d.endTurn(); // P5 +2 格挡；敌方龟缩；下回合 P3 抽牌被笨拙否决
    expect(d.player.getEffectStacks('block')).toBe(2);
    expect(d.state.zones.hand).toHaveLength(handBefore); // 抽牌被取消，手牌不变
    // 注：笨拙「层数 -1」由 effects.js 作为被 veto 抽牌指令的子节点提交、当前不会
    // 落地（被取消节点的子节点不执行——内核铁律），递减语义属 effects.js 既有行为，
    // 此处只断言封锁语义。
  });

  it('神龟姿态（S）：每节拍 +2 格挡且无笨拙代价', () => {
    const d = new BattleDriver({
      deck: ['divineTurtle', 'punch', 'punch', 'punch'], enemies: [turtle()], seed: 5,
    });
    d.start();
    d.play('divineTurtle');
    expect(d.player.getEffectStacks('clumsy')).toBe(0);
    d.endTurn();
    expect(d.player.getEffectStacks('block')).toBe(2);
  });
});

describe('姿态系列（咏唱）：武术链（格挡转攻击）', () => {
  it('武术姿态：每层格挡令玩家伤害 +2（无格挡时不加成）', () => {
    const d = new BattleDriver({
      deck: ['martialStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
      player: { maxActionPoints: 5 },
    });
    d.start();
    let hp0 = enemyHp(d);
    d.play('punch'); // 未激活：裸 6 伤
    expect(hp0 - enemyHp(d)).toBe(6);

    d.play('martialStance'); // 激活（2AP）
    hp0 = enemyHp(d);
    d.play('punch'); // 0 格挡：仍不加成
    expect(hp0 - enemyHp(d)).toBe(6);

    gainBlock(d, 3);
    hp0 = enemyHp(d);
    d.play('punch'); // 6 + 3×2
    expect(hp0 - enemyHp(d)).toBe(12);
  });

  it('天一姿态：每层 +6（2 层 → 6+12=18）', () => {
    const d = new BattleDriver({
      deck: ['heavenStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    d.play('heavenStance'); // 0 费激活
    gainBlock(d, 2);
    const hp0 = enemyHp(d);
    d.play('punch');
    expect(hp0 - enemyHp(d)).toBe(6 + 2 * 6);
  });
});

describe('姿态系列（咏唱）：狂战链（格挡转力量）', () => {
  it('狂战姿态：获得格挡时也获得 1 层力量；失去格挡（破）不触发', () => {
    const d = new BattleDriver({
      deck: ['berserkStance', 'blockGuard', 'barrier', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    d.play('berserkStance');
    d.play('blockGuard'); // 一次获得事件（+2 层）→ +1 力量
    expect(d.player.getEffectStacks('block')).toBe(2);
    expect(d.player.getEffectStacks('strength')).toBe(1);

    d.play('barrier'); // 破：失去 2 层（负向 AddEffect）→ 不触发力量
    expect(d.player.getEffectStacks('block')).toBe(0);
    expect(d.player.shield).toBe(24);
    expect(d.player.getEffectStacks('strength')).toBe(1);

    const hp0 = enemyHp(d); // 力量读轨生效：punch 6 + 1
    d.play('punch');
    expect(hp0 - enemyHp(d)).toBe(7);
  });
});

describe('咏唱散卡：以无胜有 / 以有胜无', () => {
  it('以无胜有：回合结束时无其他手牌 → 8 层格挡；手中有其他牌时不触发', () => {
    const negative = new BattleDriver({
      deck: ['winWithout', 'punch', 'punch', 'punch'], enemies: [turtle()], seed: 5,
    });
    negative.start();
    negative.play('winWithout');
    negative.endTurn(); // 手中还有 3 张拳
    expect(negative.player.getEffectStacks('block')).toBe(0);

    const positive = new BattleDriver({
      deck: ['winWithout', 'punch', 'punch', 'punch'], enemies: [turtle()], seed: 5,
    });
    positive.start();
    positive.play('winWithout');
    for (const c of [...positive.state.zones.hand.filter(c => c.defId !== 'winWithout')]) {
      moveCard(positive.state, c.uniqueID, 'deck'); // 清空其他手牌
    }
    positive.endTurn(); // 回合末：仅剩驻手的自身 → +8
    expect(positive.player.getEffectStacks('block')).toBe(8);
  });

  it('以有胜无：回合结束时加权手牌 ≥6（咏唱自身计 2）→ 8 层格挡', () => {
    const d = new BattleDriver({
      deck: ['haveWithout', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: [turtle()], seed: 5, config: { initialDraw: 6 },
    });
    d.start();
    d.play('haveWithout'); // 手牌：5 张其他 + 自身（加权 2）= 7
    expect(d.state.zones.hand).toHaveLength(6);
    d.endTurn();
    expect(d.player.getEffectStacks('block')).toBe(8);
  });

  it('以有胜无：加权手牌不足 6 时不触发', () => {
    const d = new BattleDriver({
      deck: ['haveWithout', 'punch', 'punch', 'punch'], enemies: [turtle()], seed: 5,
    });
    d.start();
    d.play('haveWithout'); // 3 张其他 + 自身（2）= 5 < 6
    d.endTurn();
    expect(d.player.getEffectStacks('block')).toBe(0);
  });
});

describe('描述双轨与投放', () => {
  it('破势 battleDescribe：数字按当前格挡层数实时结算', () => {
    const d = new BattleDriver({
      deck: ['breakStance', 'punch', 'punch', 'punch'], enemies: [tank()], seed: 5,
    });
    d.start();
    const def = getSkillDefinition('breakStance');
    const rt = cardInHand(d, 'breakStance');
    expect(def.battleDescribe(makeSkillCtx(d.ctx, rt))).toBe('7伤害，/named{破}：11伤害');
    gainBlock(d, 3);
    expect(def.battleDescribe(makeSkillCtx(d.ctx, rt)))
      .toBe('7伤害，/named{破}：11伤害（当前3层 → +33）');
  });

  it('全部新卡 describe 可渲染（应用前纯文本轨）', () => {
    const ids = [
      'perfectStrike', 'carefulStrike', 'doubleStrike', 'foldWillow', 'embraceCloud', 'pluckStar',
      'breakStance', 'disassemble', 'pierceHeart', 'barrier', 'fortress', 'bronzeCity', 'soulOfWar',
      'solidShield', 'reinforcedShield',
      'defensePrep', 'guardStance', 'turtleStance', 'mysticTurtle', 'divineTurtle',
      'martialStance', 'masterStance', 'heavenStance', 'berserkStance', 'berserkMastery',
      'winWithout', 'haveWithout',
    ];
    for (const id of ids) {
      expect(typeof getSkillDefinition(id).describe()).toBe('string');
    }
  });

  it('promotesTo 晋升链（表序线性；S 阶梯外不作目标）', () => {
    const run = createRunState({ seed: 1 });
    const chains = [
      ['perfectStrike', 'carefulStrike'],
      ['carefulStrike', 'foldWillow'],
      ['foldWillow', 'embraceCloud'],
      ['breakStance', 'disassemble'],
      ['disassemble', 'pierceHeart'],
      ['barrier', 'fortress'],
      ['fortress', 'bronzeCity'],
      ['defensePrep', 'guardStance'],
      ['guardStance', 'turtleStance'],
      ['turtleStance', 'mysticTurtle'],
      ['martialStance', 'masterStance'],
      ['masterStance', 'heavenStance'],
      ['berserkStance', 'berserkMastery'],
    ];
    for (const [from] of chains) run.player.deck.push(createSkillRuntime(from));
    for (const [from, to] of chains) {
      const rt = run.player.deck.find(c => c.defId === from);
      promoteCard(run, rt.uniqueID);
      expect(rt.defId).toBe(to);
    }
  });

  it('奖励池：C 阶新卡入池，S 阶（摘星手/神龟姿态）恒不入池', () => {
    const pool = spawnableCardPool().map(def => def.id);
    for (const id of ['perfectStrike', 'carefulStrike', 'doubleStrike', 'breakStance', 'barrier',
      'solidShield', 'reinforcedShield', 'defensePrep', 'martialStance', 'winWithout', 'haveWithout']) {
      expect(pool).toContain(id);
    }
    expect(pool).not.toContain('pluckStar');
    expect(pool).not.toContain('divineTurtle');
  });
});
