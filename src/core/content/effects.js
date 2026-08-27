import { registerEffect } from '../effects/registry.js';
import { TurnStartInstruction, PlayerTurnEndInstruction } from '../instructions/turn.js';
import { DealDamageInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { DrawCardsInstruction } from '../instructions/cards.js';

// 燃烧：自己阵营回合开始时受到等于层数的伤害（穿透），然后层数 -1。
// 行为完全由订阅表达，结算指令里无任何"燃烧"特判。
registerEffect({
  id: 'burn',
  type: 'debuff',
  stacking: 'count',
  name: '燃烧',
  description: '回合开始时受到等于层数的伤害，然后层数减少 1。',
  icon: '🔥',
  color: 'red',
  subscriptions: (unit) => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr) => instr.side === unit.side && !unit.isDead(),
    react: (instr, ctx) => {
      const stacks = unit.getEffectStacks('burn');
      if (stacks <= 0) return;
      ctx.kernel.submitInstruction(new DealDamageInstruction({
        source: null, target: unit, amount: stacks, pierce: true,
      }), instr);
      ctx.kernel.submitInstruction(new AddEffectInstruction({
        target: unit, effectId: 'burn', stacks: -1,
      }), instr);
    },
  }],
});

// 格挡（体修·拆体系核心资源，BODY_CULTIVATION_CARDS §0）：buff 层数，≠ 护盾池。
// 受攻击时伤害减半（向下取整），层数 -1；扣尽由 AddEffect 通用逻辑注销订阅。
// 原型验证：test/posture.test.js（此处为正式落地，语义不变）。
registerEffect({
  id: 'block',
  type: 'buff',
  stacking: 'count',
  name: '格挡',
  description: '受到攻击时伤害减半，然后层数减少 1。',
  icon: '🛡️',
  color: 'blue',
  subscriptions: (unit) => [{
    when: DealDamageInstruction,
    phase: 'pre',
    filter: (instr) => instr.target === unit,
    react: (instr, ctx) => {
      instr.setPayload('damage', Math.floor(instr.payload.damage / 2));
      ctx.kernel.submitInstruction(
        new AddEffectInstruction({ target: unit, effectId: 'block', stacks: -1 }), instr);
    },
  }],
});

// 滞气（体修通用代价关键词）：debuff，无法抽牌（含回合开始抽牌与技能抽牌），
// 玩家回合结束层数 -1。藏锋系列等高收益卡的费用语言。
// 原型验证：test/slashSeries.test.js。
registerEffect({
  id: 'stall',
  type: 'debuff',
  stacking: 'count',
  name: '滞气',
  description: '无法抽牌。回合结束时层数减少 1。',
  icon: '🌀',
  color: 'gray',
  subscriptions: (unit) => [
    {
      when: DrawCardsInstruction,
      phase: 'pre',
      react: (instr, ctx) => ctx.kernel.veto(instr, 'stall'),
    },
    {
      when: PlayerTurnEndInstruction,
      phase: 'post',
      react: (instr, ctx) => ctx.kernel.submitInstruction(
        new AddEffectInstruction({ target: unit, effectId: 'stall', stacks: -1 }), instr),
    },
  ],
});
