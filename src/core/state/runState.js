import Player from './player.js';

// runState：整局寿命。战斗级状态一律不进这里（见 battleState.js）。
export function createRunState({ player = null } = {}) {
  return {
    gameStage: 'start',       // 'start' | 'battle' | 'rest' | 'end'
    battleCount: 0,
    level: 1,
    player: player ?? new Player(),
    rewards: null,            // 休整阶段奖励暂存（rest 流程装配）
    shopItems: [],
  };
}
