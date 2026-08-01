import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { BattleDriver } from '../src/core/sdk/driver.js';
import { registerSkill } from '../src/core/skills/registry.js';
import { registerAbility } from '../src/core/abilities/registry.js';
import { zoneOf, moveCard, swapCostOf } from '../src/core/state/battleState.js';
import { ManualStopChantInstruction } from '../src/core/instructions/skill.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import { PlayerTurnStartInstruction } from '../src/core/instructions/turn.js';

// ---- 换牌流程 / 咏唱槽扩容 / 锚定咏唱原型 ----
// 换牌语义对齐旧仓库：费用 = swapBaseCost(0) + 本场换牌次数，逐次 +1；
// 刀客/刀圣封顶（cap），归元秘术重置次数。

// 精英能力·刀客：换卡开销不超过 3
registerAbility({
  id: 'bladeDisciple', name: '刀客',
  onBattleStart: (ctx) => { ctx.battleState.swapCostCap = 3; },
});

// 精英能力·武神：获得一个咏唱槽
registerAbility({
  id: 'warGod', name: '武神',
  onBattleStart: (ctx) => { ctx.battleState.chant.capacity += 1; },
});

// 归元秘术（消耗性）：重置换牌行动力消耗
registerSkill({
  id: 'resetOrigin', name: '归元秘术',
  cost: { mana: 0, actionPoint: 0 },
  keywords: ['exhaust'],
  use(sctx) {
    sctx.battleState.swapCount = 0;
    return true;
  },
});

// 燃心决（咏唱，anchored）：无法撤下；回合开始获得 1 层燃烧
registerSkill({
  id: 'burnHeartMantra', name: '燃心决',
  cost: { mana: 0, actionPoint: 1 },
  cardMode: 'chant',
  keywords: ['anchored'],
  use() { return true; },
  activated: {
    subscriptions: (sctx) => [{
      when: PlayerTurnStartInstruction, phase: 'post',
      react: (instr, ctx) => ctx.kernel.submitInstruction(new AddEffectInstruction({
        target: ctx.player, effectId: 'burn', stacks: 1,
      }), instr),
    }],
  },
});

function bringToHand(d, defId) {
  const card = d.state.zones.deck.find(c => c.defId === defId);
  if (card) moveCard(d.state, card.uniqueID, 'hand');
}

describe('换牌：费用阶梯', () => {
  it('首次 0 AP，逐次 +1；费用不足时被拒', () => {
    const d = new BattleDriver({
      deck: Array(9).fill('punch'),
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    d.start();
    expect(swapCostOf(d.state)).toBe(0);

    const first = d.state.zones.hand[0];
    d.swap(first.uniqueID); // 0 AP
    expect(d.player.actionPoints).toBe(3);
    expect(zoneOf(d.state, first.uniqueID)).toBe('discard');
    expect(d.state.zones.hand).toHaveLength(4); // 弃 1 抽 1
    expect(d.state.swapCount).toBe(1);

    d.swap('punch'); // 1 AP
    expect(d.player.actionPoints).toBe(2);
    d.swap('punch'); // 2 AP
    expect(d.player.actionPoints).toBe(0);
    expect(d.state.swapCount).toBe(3);

    expect(swapCostOf(d.state)).toBe(3);
    expect(() => d.swap('punch')).toThrow('无法换牌'); // 费用不足
  });
});

describe('换牌：刀客封顶', () => {
  it('费用 cap 3：跨回合第 5 次换牌仍只要 3 AP；无能力时第 5 次要 4 AP 被拒', () => {
    const withCap = new BattleDriver({
      deck: Array(12).fill('punch'),
      enemies: ['slime'], abilities: ['bladeDisciple'], seed: 5, config: { initialDraw: 4 },
    });
    withCap.start();
    withCap.swap('punch'); // 0
    withCap.swap('punch'); // 1
    withCap.swap('punch'); // 2 → AP 0
    withCap.endTurn();
    withCap.swap('punch'); // min(3,3)=3 → AP 0
    withCap.endTurn();
    expect(swapCostOf(withCap.state)).toBe(3); // min(4, 3)
    withCap.swap('punch'); // 仍 3 AP
    expect(withCap.state.swapCount).toBe(5);

    const noCap = new BattleDriver({
      deck: Array(12).fill('punch'),
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    noCap.start();
    noCap.swap('punch');
    noCap.swap('punch');
    noCap.swap('punch');
    noCap.endTurn();
    noCap.swap('punch'); // 3
    noCap.endTurn();
    expect(swapCostOf(noCap.state)).toBe(4);
    expect(() => noCap.swap('punch')).toThrow('无法换牌'); // 4 > 3 AP
  });
});

describe('归元秘术：重置换牌费用', () => {
  it('两次换牌后打出归元秘术，下次换牌回到 0 AP', () => {
    const d = new BattleDriver({
      deck: ['resetOrigin', ...Array(9).fill('punch')],
      enemies: ['slime'], seed: 5, config: { initialDraw: 5 },
    });
    d.start();
    bringToHand(d, 'resetOrigin');

    d.swap('punch'); // 0
    d.swap('punch'); // 1 → AP 2
    expect(d.player.actionPoints).toBe(2);

    d.play('resetOrigin'); // 0 AP，消耗入焚毁区
    expect(d.state.swapCount).toBe(0);

    d.swap('punch'); // 重新从 0 计
    expect(d.player.actionPoints).toBe(2);
    expect(d.state.swapCount).toBe(1);
  });
});

describe('武神：咏唱槽扩容', () => {
  it('双咏唱槽可同挂两张咏唱；无能力时第二张被拒', () => {
    const d = new BattleDriver({
      deck: ['focusChant', 'focusChant', 'punch', 'punch'],
      enemies: ['slime'], abilities: ['warGod'], seed: 5, config: { initialDraw: 4 },
      player: { maxMana: 5 },
    });
    d.start();
    expect(d.state.chant.capacity).toBe(2);

    d.play('focusChant');
    d.play('focusChant'); // 第二槽
    expect(d.state.chant.slots).toHaveLength(2);

    const d2 = new BattleDriver({
      deck: ['focusChant', 'focusChant', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
      player: { maxMana: 5 },
    });
    d2.start();
    expect(d2.state.chant.capacity).toBe(1);
    d2.play('focusChant');
    expect(() => d2.play('focusChant')).toThrow('无法出牌'); // 槽满
  });
});

describe('燃心决：无法撤下（anchored）', () => {
  it('ManualStopChant 被守卫拒绝，咏唱留在槽中且订阅存活', () => {
    const d = new BattleDriver({
      deck: ['burnHeartMantra', 'focusChant', 'punch', 'punch'],
      enemies: ['slime'], abilities: ['warGod'], seed: 5, config: { initialDraw: 4 },
      player: { maxMana: 5 },
    });
    d.start();
    bringToHand(d, 'burnHeartMantra');

    d.play('burnHeartMantra');
    d.play('focusChant');
    const mantra = d.state.chant.slots.find(c => c.defId === 'burnHeartMantra');
    const owned = () => d.kernel.subscriptions.filter(s => s.owner === mantra.uniqueID);
    expect(owned().length).toBeGreaterThan(0);

    d.dispatch(new ManualStopChantInstruction({ uniqueID: mantra.uniqueID }));
    expect(d.calls('chantStopFailed')).toHaveLength(1);
    expect(zoneOf(d.state, mantra.uniqueID)).toBe('chantSlot'); // 撤不下
    expect(mantra.isActivated).toBe(true);
    expect(owned().length).toBeGreaterThan(0); // 订阅存活

    // 对照：普通咏唱可撤
    const chant = d.state.chant.slots.find(c => c.defId === 'focusChant');
    d.dispatch(new ManualStopChantInstruction({ uniqueID: chant.uniqueID }));
    expect(zoneOf(d.state, chant.uniqueID)).toBe('discard');
  });
});
