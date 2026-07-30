import BattleInstruction from '../kernel/BattleInstruction.js';
import { cloneSkillRuntime } from '../state/skillRuntime.js';
import { getSkillDefinition } from '../skills/registry.js';
import { registerSkillSubscriptions } from '../skills/helpers.js';
import { getAbilityDefinition } from '../abilities/registry.js';
import { getEnemyDefinition } from '../enemies/registry.js';
import { DrawCardsInstruction } from './cards.js';

// 战斗根指令：完成 = 战斗结束。子节点固定为 战前 → 回合循环 → 战后。
export class BattleRootInstruction extends BattleInstruction {
  execute() { return true; } // 实体逻辑全在子节点；loop 中本节点不会被执行到
}

// 战前准备：重置玩家战斗字段 → 克隆构筑进牌库并初始化充能 → 洗牌 →
// 注册技能/能力订阅（window:'battle'）→ 能力 onBattleStart → 初始意图 → 初始抽牌
export class PreBattleInstruction extends BattleInstruction {
  execute(ctx) {
    if (this._stage === 0) {
      const { player, battleState, runState } = ctx;

      // 玩家战斗字段重置（hp/money/deck 等 run 级不动）
      player.shield = 0;
      player.clearEffects();
      player.mana = player.maxMana;
      player.actionPoints = player.maxActionPoints;

      // 构筑牌组：克隆 runtime，初始化充能（slowStart 起手 0 充能）
      battleState.zones.deck = player.deck.map(rt => {
        const clone = cloneSkillRuntime(rt);
        const def = getSkillDefinition(clone.defId);
        const slow = def.keywords?.includes('slowStart');
        const max = def.charges?.max ?? Infinity;
        clone.remainingUses = slow ? 0 : max;
        clone.currentCooldown = def.charges?.cooldownTurns ?? 0;
        clone.isActivated = false;
        return clone;
      });
      battleState.rng.shuffle(battleState.zones.deck);

      // 注册订阅：每张技能卡一份（zone 限定在 filter 内，跨 zone 无需重注册）
      for (const skill of battleState.zones.deck) {
        registerSkillSubscriptions(ctx, skill);
      }
      // 能力：onBattleStart + 常驻订阅
      for (const abilityId of player.abilities) {
        const def = getAbilityDefinition(abilityId);
        def.onBattleStart?.(ctx);
        for (const sub of def.subscriptions?.(ctx) ?? []) {
          ctx.kernel.addSubscription({ window: 'battle', ...sub, owner: `ability:${abilityId}` });
        }
      }

      // 初始意图预览
      for (const e of battleState.enemies) {
        const def = getEnemyDefinition(e.defId);
        e.intention = def.getIntention ? def.getIntention(e) : null;
      }

      ctx.presenter?.battleStart?.({ battleState, runState });
      return false;
    }
    if (this._stage === 1) {
      ctx.kernel.submitInstruction(
        new DrawCardsInstruction({ count: ctx.battleState.config.initialDraw }), this);
      return false;
    }
    return true;
  }
}

// 战后清理：注销全部 battle 窗口订阅、播报结果。
// 终局时内核 abort 的是 TurnLoop（不是根），本指令因此能正常执行到。
export class PostBattleInstruction extends BattleInstruction {
  execute(ctx) {
    ctx.battleState.result = ctx.kernel.verdict;
    ctx.kernel.clearWindow('battle');
    ctx.presenter?.battleEnd?.({ result: ctx.kernel.verdict });
    return true;
  }
}
