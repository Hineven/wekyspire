import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { BattleDriver } from '../src/core/sdk/driver.js';
import { registerSkill } from '../src/core/skills/registry.js';
import { registerEffect } from '../src/core/effects/registry.js';
import { moveCard } from '../src/core/state/battleState.js';
import { DrawCardsInstruction } from '../src/core/instructions/cards.js';
import { DealDamageInstruction } from '../src/core/instructions/combat.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import { PlayerTurnStartInstruction } from '../src/core/instructions/turn.js';

// ---- 姿态系列原型：格挡（效果形态）首次落地 ----
// 语义对齐旧仓库（tag pre-rewrite-archive）：
//   格挡 = buff 效果层数（≠ 护盾池）：受攻击时伤害减半，层数 -1。
//   龟守姿态 = 咏唱：回合开始格挡恢复（2/回合，上限 5），回合开始抽牌 -1。
//   神龟姿态 = 龟守变体：抽牌修正由 -1 反转为 +1。
// 注意：早前摘星手/武者原型用护盾池做过格挡的替身，二者语义不同，此处按旧仓库落地效果形态。

// 格挡：受攻击伤害减半，层数 -1（扣尽由 AddEffect 通用逻辑注销订阅）
registerEffect({
  id: 'block', type: 'buff', stacking: 'count',
  subscriptions: (unit) => [{
    when: DealDamageInstruction, phase: 'pre',
    filter: (instr) => instr.target === unit,
    react: (instr, ctx) => {
      instr.setPayload('damage', Math.floor(instr.payload.damage / 2));
      ctx.kernel.submitInstruction(
        new AddEffectInstruction({ target: unit, effectId: 'block', stacks: -1 }), instr);
    },
  }],
});

// 龟守姿态（咏唱）：回合开始格挡 +2（上限 5）；回合开始抽牌 -1
registerSkill({
  id: 'turtlePose', name: '龟守姿态',
  cost: { mana: 0, actionPoint: 3 },
  cardMode: 'chant',
  use() { return true; },
  activated: {
    subscriptions: (sctx) => [
      {
        when: PlayerTurnStartInstruction, phase: 'post',
        react: (instr, ctx) => {
          const cur = ctx.player.getEffectStacks('block');
          const delta = Math.min(2, 5 - cur);
          if (delta > 0) {
            ctx.kernel.submitInstruction(new AddEffectInstruction({
              target: ctx.player, effectId: 'block', stacks: delta,
            }), instr);
          }
        },
      },
      {
        when: DrawCardsInstruction, phase: 'pre',
        filter: (instr) => instr.reason === 'turnStart', // 只修正回合开始抽牌
        react: (instr) => instr.setPayload('count', Math.max(instr.payload.count - 1, 0)),
      },
    ],
  },
});

// 神龟姿态（咏唱）：同龟守，但抽牌修正 +1
registerSkill({
  id: 'divineTurtlePose', name: '神龟姿态',
  cost: { mana: 0, actionPoint: 3 },
  cardMode: 'chant',
  use() { return true; },
  activated: {
    subscriptions: (sctx) => [
      {
        when: PlayerTurnStartInstruction, phase: 'post',
        react: (instr, ctx) => {
          const cur = ctx.player.getEffectStacks('block');
          const delta = Math.min(2, 5 - cur);
          if (delta > 0) {
            ctx.kernel.submitInstruction(new AddEffectInstruction({
              target: ctx.player, effectId: 'block', stacks: delta,
            }), instr);
          }
        },
      },
      {
        when: DrawCardsInstruction, phase: 'pre',
        filter: (instr) => instr.reason === 'turnStart',
        react: (instr) => instr.setPayload('count', instr.payload.count + 1),
      },
    ],
  },
});

const hitPlayer = (d, amount) => d.dispatch(new DealDamageInstruction({
  source: d.state.enemies[0], target: d.player, amount,
}));

function bringToHand(d, defId) {
  const card = d.state.zones.deck.find(c => c.defId === defId);
  if (card) moveCard(d.state, card.uniqueID, 'hand');
}

describe('格挡（效果形态）：伤害减半，层数递减', () => {
  it('2 层格挡挡两次攻击各减半，耗尽后全额承伤', () => {
    const d = new BattleDriver({
      deck: ['punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    d.dispatch(new AddEffectInstruction({ target: d.player, effectId: 'block', stacks: 2 }));

    hitPlayer(d, 10);
    expect(d.player.hp).toBe(30 - 5);
    expect(d.player.getEffectStacks('block')).toBe(1);

    hitPlayer(d, 10);
    expect(d.player.hp).toBe(30 - 10);
    expect(d.player.getEffectStacks('block')).toBe(0);
    expect(d.player.getEffect('block')).toBeNull(); // 扣尽注销

    hitPlayer(d, 10);
    expect(d.player.hp).toBe(30 - 20); // 全额
  });
});

describe('龟守姿态：格挡再生 + 回合抽牌 -1', () => {
  it('每回合开始恢复 2 层格挡（上限 5），回合开始抽牌减 1，技能抽牌不受影响', () => {
    const d = new BattleDriver({
      deck: ['turtlePose', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
      config: { initialDraw: 4, drawPerTurn: 3 },
    });
    d.start();
    bringToHand(d, 'turtlePose');

    d.play('turtlePose');
    const handAfterPlay = d.state.zones.hand.length;

    d.endTurn(); // 回合 2：格挡 +2，抽 3-1=2
    expect(d.player.getEffectStacks('block')).toBe(2);
    expect(d.state.zones.hand).toHaveLength(handAfterPlay + 2);

    // 技能抽牌不受姿态修正（reason ≠ turnStart）
    d.dispatch(new DrawCardsInstruction({ count: 2 }));
    expect(d.state.zones.hand).toHaveLength(handAfterPlay + 4);

    d.endTurn(); // 回合 3：格挡 4
    expect(d.player.getEffectStacks('block')).toBe(4);
    d.endTurn(); // 回合 4：delta = min(2, 5-4) = 1 → 封顶 5
    expect(d.player.getEffectStacks('block')).toBe(5);
    d.endTurn(); // 回合 5：不再增长
    expect(d.player.getEffectStacks('block')).toBe(5);
  });
});

describe('神龟姿态：抽牌修正反转为 +1', () => {
  it('回合开始抽 3+1=4 张', () => {
    const d = new BattleDriver({
      deck: ['divineTurtlePose', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
      config: { initialDraw: 4, drawPerTurn: 3 },
    });
    d.start();
    bringToHand(d, 'divineTurtlePose');

    d.play('divineTurtlePose');
    const handAfterPlay = d.state.zones.hand.length;

    d.endTurn();
    expect(d.state.zones.hand).toHaveLength(handAfterPlay + 4);
    expect(d.player.getEffectStacks('block')).toBe(2);
  });
});
