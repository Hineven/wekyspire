import mitt from 'mitt';

const backendEventBus = mitt();

export const EventNames = {
  Game: {
    PRE_GAME_START: 'pre-game-start',
    GAME_START: 'game-start',
    ENTER_BATTLE_STAGE: 'enter-battle-stage',
    ENTER_REST_STAGE: 'enter-rest-stage',
    PRE_BATTLE: 'pre-battle',
    POST_BATTLE: 'post-battle',
    GAME_OVER: 'game-over',
  },
  Player: {
    // 休息/通用事件（由后端触发的结果类事件）
    TIER_UPGRADED: 'player-tier-upgraded',
    ABILITY_CLAIMED: 'player-ability-claimed',
    MONEY_CLAIMED: 'player-money-claimed',
    SKILL_REWARD_CLAIMED: 'player-skill-claimed',
    // 战斗事件（后端广播的状态更新/通知）
    FRONTIER_UPDATED: 'player-frontier-skills-updated',
    ACTIVATED_SKILLS_UPDATED: 'player-activated-skills-updated',
    ACTIVATED_SKILL_ENABLED: 'player-activated-skill-enabled',
    ACTIVATED_SKILL_DISABLED: 'player-activated-skill-disabled',
    SKILL_BURNT: 'player-skill-burnt',
    SKILL_DISCOVERED: 'player-skill-discovered',
    SKILL_USED: 'player-skill-used',
    SKILL_DROPPED: 'player-skill-dropped'
  },
  // 新增：玩家操作事件（仅由前端发起，用于告知后端进行结算/流程推进）
  PlayerOperations: {
    // 战斗内玩家操作
    PLAYER_USE_SKILL: 'battle-player-use-skill',
    PLAYER_DROP_SKILL: 'battle-player-drop-skill',
    PLAYER_END_TURN: 'player-end-turn',
    PLAYER_STOP_ACTIVATED_SKILL: 'battle-player-stop-activated-skill',
    // 休整阶段操作
    CLAIM_MONEY: 'rest-claim-money',
    CLAIM_SKILL: 'rest-claim-skill',
    CLAIM_ABILITY: 'rest-claim-ability',
    CLAIM_BREAKTHROUGH: 'rest-claim-breakthrough',
    REORDER_SKILLS: 'rest-reorder-skills',
    PURCHASE_ITEM: 'rest-purchase-item',
    FINISH: 'rest-finish',
    DROP_REWARD: 'rest-drop-reward',
    // Overlay 操作
    CONFIRM_OVERLAY_SKILL_SELECTIONS: 'overlay-confirm-skill-selections'
  },
  Battle: {
    BATTLE_START: 'battle-battle-start',
    PLAYER_TURN: 'battle-player-turn',
    ENEMY_TURN: 'battle-enemy-turn',
    BATTLE_VICTORY: 'battle-victory',
  },
  Enemy: {
    TURN_START: 'enemy-turn-start',
    ACTION_END: 'enemy-action-end',
    TURN_END: 'enemy-turn-end',
  },
  Rest: {
    REWARDS_SPAWNED: 'rewards-spawned',
    SHOP_REFRESHED: 'rest-shop-refreshed',
    END: 'rest-end'
  },
  Shop: {
    ITEM_PURCHASED: 'item-purchased'
  }
};

export default backendEventBus;
