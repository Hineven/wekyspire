import { registerSkill } from '../skills/registry.js';
import { firstAliveEnemy } from '../state/battleState.js';
import { DealDamageInstruction, GainShieldInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { GainManaInstruction } from '../instructions/resources.js';
import { PlayerTurnStartInstruction } from '../instructions/turn.js';

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
  describe: (sctx) => `造成 ${6 + sctx.player.getStat('attack')} 点伤害。`,
});

// 玩家指定目标（须为敌方存活单位）优先，否则默认首个存活敌人
function enemyTarget(sctx) {
  return (sctx.target?.side === 'enemy' && !sctx.target.isDead())
    ? sctx.target
    : firstAliveEnemy(sctx.battleState);
}

// ② 获得护盾牌
registerSkill({
  id: 'guard', name: '格挡', type: 'normal', tier: 'D', series: 'guard',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 5 }));
    return true;
  },
  describe: () => '获得 5 点护盾。',
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
  describe: () => '造成 2 点伤害，施加 2 层/effect{燃烧}。',
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
  describe: () => '咏唱：每个你的回合开始时，回复 1 点魏启。',
});
