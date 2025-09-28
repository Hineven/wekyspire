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
    USE_SKILL: 'player-use-skill',
    DROP_SKILL: 'player-drop-skill',
    END_TURN: 'player-end-turn',
    FRONTIER_UPDATED: 'player-frontier-skills-updated',
    TIER_UPGRADED: 'player-tier-upgraded',
    ABILITY_CLAIMED: 'player-ability-claimed',
    MONEY_CLAIMED: 'player-money-claimed',
    SKILL_USED: 'player-skill-used',
    SKILL_DROPPED: 'player-skill-dropped',
    SKILL_REWARD_CLAIMED: 'player-skill-claimed'
  },
  Enemy: {
    TURN_START: 'enemy-turn-start',
    ACTION_END: 'enemy-action-end',
    TURN_END: 'enemy-turn-end',
    BATTLE_VICTORY: 'battle-victory'
  },
  Rest: {
    REWARDS_SPAWNED: 'rewards-spawned',
    CLAIM_MONEY: 'rest-claim-money',
    CLAIM_SKILL: 'rest-claim-skill',
    CLAIM_ABILITY: 'rest-claim-ability',
    CLAIM_BREAKTHROUGH: 'rest-claim-breakthrough',
    PURCHASE_ITEM: 'rest-purchase-item',
    SHOP_REFRESHED: 'rest-shop-refreshed',
    FINISH: 'rest-finish',
    END: 'rest-end'
  },
  Shop: {
    ITEM_PURCHASED: 'item-purchased'
  }
};

export default backendEventBus;
