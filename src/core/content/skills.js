import { registerSkill } from '../skills/registry.js';
import { firstAliveEnemy } from '../state/battleState.js';
import { DealDamageInstruction, GainShieldInstruction, previewDamage } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { GainManaInstruction } from '../instructions/resources.js';
import { PlayerTurnStartInstruction } from '../instructions/turn.js';

// 应用后伤害文本（content 攻击卡通用）：基数 + 攻击面板 + power，再经
// previewDamage 干跑吃 PRE 修正（下次伤害翻倍、目标格挡减半等）。
// 无存活敌人（战斗收尾）时退化为裸面板值。
export function resolvedDamageText(sctx, base) {
  const amount = base + sctx.player.getStat('attack') + sctx.self.power;
  const target = enemyTarget(sctx);
  const { damage } = target
    ? previewDamage(sctx, { source: sctx.player, target, amount })
    : { damage: amount };
  return `${damage}伤害`;
}

// ① 纯伤害攻击牌
registerSkill({
  id: 'punch', name: '冲拳', type: 'normal', tier: 'D', series: 'punch',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  targetMode: 'enemy', // 前端交互声明：需指定敌方目标（曲线箭头瞄准）
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player,
      target: enemyTarget(sctx),
      amount: 6 + sctx.player.getStat('attack') + sctx.self.power,
    }));
    return true;
  },
  describe: () => '6伤害',
  battleDescribe: (sctx) => resolvedDamageText(sctx, 6),
});

// 玩家指定目标（须为敌方存活单位）优先，否则默认首个存活敌人
// （content 内多卡复用，导出供 bodySkills 等内容文件共享）
export function enemyTarget(sctx) {
  return (sctx.target?.side === 'enemy' && !sctx.target.isDead())
    ? sctx.target
    : firstAliveEnemy(sctx.battleState);
}

// ② 获得护盾牌：盾系列 D 位（BODY_CULTIVATION_CARDS §3.1 拆组合·盾系列）。
// 旧名"格挡"让位给 block 层数版（bodySkills.js），数值维持 5（旧占位，测试基线）。
registerSkill({
  id: 'guard', name: '盾', type: 'normal', tier: 'D', series: 'block',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 5 }));
    return true;
  },
  describe: () => '5护盾',
});

// ③ 施加/触发效果牌：伤害 + 燃烧（验证 effect 订阅）
registerSkill({
  id: 'inflame', name: '点火', type: 'fire', tier: 'C', series: 'inflame',
  cost: { mana: 1, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  targetMode: 'enemy',
  use(sctx) {
    const target = enemyTarget(sctx);
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target, amount: 2,
    }));
    sctx.kernel.submitInstruction(new AddEffectInstruction({
      target, effectId: 'burn', stacks: 2,
    }));
    return true;
  },
  describe: () => '2伤害，赋予/effect{燃烧}2',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 2)}，赋予/effect{燃烧}2`,
});

// ④ 咏唱牌：每个玩家回合开始回复 1 点魏启（验证 activated 生命周期 + WAIT 回合）
registerSkill({
  id: 'focusChant', name: '凝神诀', type: 'normal', tier: 'C', series: 'focusChant',
  cost: { mana: 1, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'chant',
  use() { return true; },
  activated: {
    subscriptions: () => [{
      when: PlayerTurnStartInstruction,
      phase: 'post',
      react: (instr, ctx) => {
        ctx.kernel.submitInstruction(new GainManaInstruction({ amount: 1 }), instr);
      },
    }],
  },
  describe: () => '咏唱：回合开始时魏启+1',
});
