// rest.js - 休整阶段逻辑

import SkillManager from './skillManager.js'
import AbilityManager from './abilityManager.js'
import ItemManager from './itemManager.js'
import backendEventBus from '../backendEventBus.js'
import { backendGameState as gameState } from './gameState.js'
import { generateEnemy, startBattle } from './battle.js'
import { getNextPlayerTier, upgradePlayerTier } from './player.js'

export function spawnSkillRewards() {
  // 技能奖励
  let tier = gameState.player.tier;
  // 如果已经生成了突破奖励，那么生成技能奖励时奖励提升
  if(gameState.rewards.breakthrough) {
    tier = getNextPlayerTier(tier);
  }
  gameState.rewards.skills = SkillManager.getInstance().getRandomSkills(
    3, gameState.player.skillSlots, tier, true // 生成高质量奖励
  );
}

export function clearRewards() {
  gameState.rewards.money = 0;
  gameState.rewards.breakthrough = false;
  gameState.rewards.skills = [];
  gameState.rewards.abilities = [];
}

// 计算奖励
export function spawnRewards() {
  // 计算战斗奖励
  gameState.rewards.money = Math.floor(Math.random() * 20) + 10;

  // 突破奖励
  const haveBreakthroughReward = (
    gameState.battleCount == 2 || gameState.enemy.isBoss
  );
  gameState.rewards.breakthrough = haveBreakthroughReward;
  
  // 总是生成技能奖励
  spawnSkillRewards();

  // boss / 奇数次战斗后获得能力奖励
  const haveAbilityReward = (
    gameState.battleCount % 2 === 1 || gameState.enemy.isBoss
  );
  if(haveAbilityReward) {
    gameState.rewards.abilities = AbilityManager.getInstance().getRandomAbilities(
      3, gameState.player.tier
    );
  } else {
    gameState.rewards.abilities = [];
  }
  // 生成商店物品
  const itemManager = new ItemManager();
  gameState.shopItems = itemManager.getRandomItems(3, gameState.player.tier);
  
  // 发送事件
  backendEventBus.emit('rewards-spawned', gameState.rewards);
}

// 领取金钱奖励
export function claimMoney() {
  gameState.player.money += gameState.rewards.money;
  const amount = gameState.rewards.money;
  gameState.rewards.money = 0;
  // 发送事件
  backendEventBus.emit('money-claimed', amount);
}

// 领取技能奖励
export function claimSkillReward(skill, slotIndex, clearRewardsFlag) {
  gameState.player.skillSlots[slotIndex] = skill;
  if(clearRewardsFlag) {
    gameState.rewards.skills = [];
  }
  // 发送事件
  backendEventBus.emit('skill-reward-claimed', { skill: skill, slotIndex: slotIndex });
}

// 领取能力奖励
export function claimAbilityReward(ability, clearRewardsFlag) {
  // 领取能力奖励
  ability.apply(gameState.player);
  if(clearRewardsFlag) {
    gameState.rewards.abilities = [];
  }
  // 发送玩家领取能力奖励事件
  backendEventBus.emit('player-claim-ability', { ability: ability });
}

// 领取突破奖励（新加：由UI调用，而不是在UI组件中直接变更display层）
export function claimBreakthroughReward() {
  if (!gameState.rewards.breakthrough) return;
  gameState.rewards.breakthrough = false;
  upgradePlayerTier(gameState.player);
  backendEventBus.emit('player-tier-upgraded', gameState.player);
}

// 结束休整阶段
export function endRestStage() {
  // 发送事件
  backendEventBus.emit('rest-end');
  // 开始下一场战斗
  startBattle();  
}

// 购买物品（后端结算）
export function purchaseItem(item) {
  if (!item) return false;
  if (gameState.player.money < item.price) return false;
  // 扣费并应用物品效果
  item.purchase(gameState.player);
  gameState.player.money -= item.price;
  // 通知UI
  backendEventBus.emit('item-purchased', item);
  return true;
}
