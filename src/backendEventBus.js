import mitt from 'mitt';

const backendEventBus = mitt();

export const EventNames = {
  Game: {
    START: 'start-game',
    BEFORE_GAME_START: 'before-game-start',
    START_BATTLE: 'start-battle',
    BEFORE_BATTLE: 'before-battle',
    AFTER_BATTLE: 'after-battle',
    GAME_OVER: 'game-over',
    ENTER_REST: 'enter-rest'
  },
  Player: {
    USE_SKILL: 'player-use-skill',
    DROP_SKILL: 'player-drop-skill',
    END_TURN: 'player-end-turn',
    FRONTIER_UPDATED: 'frontier-skills-updated',
    TIER_UPGRADED: 'player-tier-upgraded',
    AFTER_SKILL_USE: 'after-skill-use',
    SKILL_DROPPED: 'skill-dropped',
    SKILL_REWARD_CLAIMED: 'player-claim-skill'
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
    MONEY_CLAIMED: 'money-claimed',
    CLAIM_SKILL: 'rest-claim-skill',
    CLAIM_ABILITY: 'rest-claim-ability',
    ABILITY_CLAIMED: 'player-ability-claimed',
    CLAIM_BREAKTHROUGH: 'rest-claim-breakthrough',
    PURCHASE_ITEM: 'rest-purchase-item',
    REFRESH_SHOP: 'rest-refresh-shop',
    FINISH: 'rest-finish',
    END: 'rest-end'
  },
  Shop: {
    ITEM_PURCHASED: 'item-purchased'
  }
};

export default backendEventBus;
