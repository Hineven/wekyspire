import { registerEffect } from '../effects/registry.js';
import { TurnStartInstruction } from '../instructions/turn.js';
import { DealDamageInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';

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
