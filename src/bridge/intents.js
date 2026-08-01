import {
  playerUseSkill, playerEndTurn, playerSwapCard, playerStopChant,
  respondInput, isWaitingPlayerInput, canSwapCard,
} from '../core/flow/battle.js';
import { canUseSkill } from '../core/skills/helpers.js';

// 玩家意图层：UI 操作 → flow API 的唯一入口（Stage Picker / Shell 按钮都走这里）。
// 同时暴露可用性查询（按钮置灰、Picker 仲裁用），避免 UI 直接读 Core 状态做判断。
export function createIntents(battle) {
  const { ctx } = battle;
  return {
    // ---- 操作（返回 bool：是否被接受） ----
    playCard: (uniqueID, targetUniqueID = null) => playerUseSkill(battle, uniqueID, targetUniqueID),
    endTurn: () => playerEndTurn(battle),
    swapCard: (uniqueID) => playerSwapCard(battle, uniqueID),
    stopChant: (uniqueID) => playerStopChant(battle, uniqueID),
    respondInput: (selection) => respondInput(battle, selection),

    // ---- 可用性（置灰/仲裁） ----
    canPlayCard: (uniqueID) => {
      if (!isWaitingPlayerInput(battle)) return false;
      const skill = ctx.battleState.zones.hand.find(s => s.uniqueID === uniqueID);
      return !!skill && canUseSkill(ctx, skill);
    },
    canEndTurn: () => isWaitingPlayerInput(battle),
    canSwapCard: (uniqueID) => canSwapCard(battle, uniqueID),
    canStopChant: (uniqueID) => isWaitingPlayerInput(battle)
      && ctx.battleState.chant.slots.some(s => s.uniqueID === uniqueID),
  };
}
