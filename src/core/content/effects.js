import { registerEffect } from '../effects/registry.js';
import { TurnStartInstruction, PlayerTurnStartInstruction, PlayerTurnEndInstruction } from '../instructions/turn.js';
import { DealDamageInstruction, ApplyHealInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { DrawCardsInstruction } from '../instructions/cards.js';
import { GainManaInstruction } from '../instructions/resources.js';

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

// 纳气：玩家回合开始时获得层数点魏启，层数归零（一次性整取，非逐层递减——
// 汲取系卡的"存气"语言：入罐 → 下回合开闸）。魏启获取走上限截断管线。
registerEffect({
  id: 'naqi',
  type: 'buff',
  stacking: 'count',
  name: '纳气',
  description: '回合开始时获得层数点魏启，然后层数归零。',
  icon: '🌀',
  color: 'blue',
  subscriptions: (unit) => [{
    when: PlayerTurnStartInstruction,
    phase: 'post',
    filter: (instr) => instr.side === 'player' && !unit.isDead() && unit.getEffectStacks('naqi') > 0,
    react: (instr, ctx) => {
      const stacks = unit.getEffectStacks('naqi');
      ctx.kernel.submitInstruction(new GainManaInstruction({ amount: stacks }), instr);
      ctx.kernel.submitInstruction(
        new AddEffectInstruction({ target: unit, effectId: 'naqi', stacks: -stacks }), instr);
    },
  }],
});

// 荆棘：受到攻击时，攻击来源受到层数点穿透伤害（无来源的环境伤害不反）。
// 敌我通用（针鼠竖刺 / 未来反伤遗物同语言）。
registerEffect({
  id: 'thorns',
  type: 'buff',
  stacking: 'count',
  name: '荆棘',
  description: '受到攻击时，对攻击者造成层数点伤害。',
  icon: '🌵',
  color: 'green',
  subscriptions: (unit) => [{
    when: DealDamageInstruction,
    phase: 'post',
    filter: (instr) => instr.target === unit && instr.source && !instr.source.isDead(),
    react: (instr, ctx) => {
      const stacks = unit.getEffectStacks('thorns');
      if (stacks <= 0) return;
      ctx.kernel.submitInstruction(new DealDamageInstruction({
        source: unit, target: instr.source, amount: stacks, pierce: true, tags: ['thorns'],
      }), instr);
    },
  }],
});

// 蓄势：每层攻击 +1（纯读轨标记，滚雪球压力源——暗影刺客等蓄力型敌人用）。
registerEffect({
  id: 'focus',
  type: 'buff',
  stacking: 'count',
  statModifiers: {
    attack: (stacks) => stacks,
  },
  name: '蓄势',
  description: '每层使攻击提高 1 点。',
  icon: '⚡',
  color: 'yellow',
});

// 虚弱：每层攻击 -1（可把攻击压到负——伤害算式对负面板天然衰减，减半/加成仍对称生效）。
registerEffect({
  id: 'weaken',
  type: 'debuff',
  stacking: 'count',
  statModifiers: {
    attack: (stacks) => -stacks,
  },
  name: '虚弱',
  description: '每层使攻击降低 1 点。',
  icon: '📉',
  color: 'purple',
});

// 再生：回合开始恢复层数点生命，然后层数 -1（EFFECTS.md 目录既有定义的正式落地）。
registerEffect({
  id: 'regen',
  type: 'buff',
  stacking: 'count',
  name: '再生',
  description: '回合开始时恢复层数点生命，然后层数减少 1。',
  icon: '💚',
  color: 'green',
  subscriptions: (unit) => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr) => instr.side === unit.side && !unit.isDead() && unit.getEffectStacks('regen') > 0,
    react: (instr, ctx) => {
      const stacks = unit.getEffectStacks('regen');
      ctx.kernel.submitInstruction(new ApplyHealInstruction({
        target: unit, amount: stacks,
      }), instr);
      ctx.kernel.submitInstruction(
        new AddEffectInstruction({ target: unit, effectId: 'regen', stacks: -1 }), instr);
    },
  }],
});
