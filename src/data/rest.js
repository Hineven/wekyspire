// rest.js - 休整阶段逻辑

import SkillManager from './skillManager.js'
import AbilityManager from './abilityManager.js'
import ItemManager from './itemManager.js'
import backendEventBus, { EventNames } from '../backendEventBus.js'
import { backendGameState as gameState } from './gameState.js'
import { getNextPlayerTier, upgradePlayerTier } from './player.js'

export function spawnSkillRewards() {
  // 技能奖励
  let tier = gameState.player.tier;
  // 如果已经生成了突破奖励，那么生成技能奖励时奖励提升
  if(gameState.rewards.breakthrough) {
    const nextTier = getNextPlayerTier(tier);
    if(nextTier) tier = nextTier;
  }
  gameState.rewards.skills = SkillManager.getInstance().getRandomSkills(
    3, gameState.player.leino, gameState.player.cultivatedSkills, tier, true // 生成高质量奖励
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
  gameState.rewards.breakthrough = (
    gameState.battleCount === 2 || gameState.enemy.isBoss
  );

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
  refreshShopItems();
  
  // 发送事件
  backendEventBus.emit(EventNames.Rest.REWARDS_SPAWNED, gameState.rewards);
}

// 领取金钱奖励
export function claimMoney() {
  gameState.player.money += gameState.rewards.money;
  const amount = gameState.rewards.money;
  gameState.rewards.money = 0;
  // 发送事件（已领取）
  backendEventBus.emit(EventNames.Player.MONEY_CLAIMED, amount);
}

// 领取技能奖励
export function claimSkillReward(skill, slotIndex, clearRewardsFlag) {
  // 计算可用容量（最多 maxSkills 个）
  const capacity = gameState.player.maxSkills || 0;
  if (typeof slotIndex !== 'number' || slotIndex < 0) slotIndex = 0;
  if (slotIndex >= capacity) slotIndex = capacity - 1;

  // 确保 cultivatedSkills 作为一个稀疏列表（允许 null 作为空位）
  const arr = Array.isArray(gameState.player.cultivatedSkills)
    ? gameState.player.cultivatedSkills.slice()
    : [];

  // 如果超出当前长度，用 null 填充直到 slotIndex
  while (arr.length < capacity && arr.length <= slotIndex) arr.push(null);

  // 放置/替换技能
  arr[slotIndex] = skill;

  // 截断到容量上限
  if (arr.length > capacity) arr.length = capacity;

  gameState.player.cultivatedSkills = arr;

  if(clearRewardsFlag) {
    gameState.rewards.skills = [];
  }
  // 发送事件（统一为 Player.SKILL_REWARD_CLAIMED）
  backendEventBus.emit(EventNames.Player.SKILL_REWARD_CLAIMED, { skill: skill, slotIndex: slotIndex });
}

// 领取能力奖励
export function claimAbilityReward(ability, clearRewardsFlag) {
  // 领取能力奖励
  ability.apply(gameState.player);
  if(clearRewardsFlag) {
    gameState.rewards.abilities = [];
  }
  // 发送玩家领取能力奖励事件（已领取）
  backendEventBus.emit(EventNames.Player.ABILITY_CLAIMED, { ability: ability });
}

// 领取突破奖励（新加：由UI调用，而不是在UI组件中直接变更display层）
export function claimBreakthroughReward() {
  if (!gameState.rewards.breakthrough) return;
  gameState.rewards.breakthrough = false;
  upgradePlayerTier(gameState.player);
  backendEventBus.emit(EventNames.Player.TIER_UPGRADED, gameState.player);
}


// 购买物品（后端结算）
export function purchaseItem(item) {
  if (!item) return false;
  if (gameState.player.money < item.price) return false;
  // 扣费并应用物品效果
  item.purchase(gameState.player);
  gameState.player.money -= item.price;
  // 通知UI
  backendEventBus.emit(EventNames.Shop.ITEM_PURCHASED, item);
  return true;
}

// 刷新商店物品
export function refreshShopItems() {
  const itemManager = new ItemManager();
  gameState.shopItems = itemManager.getRandomItems(3, gameState.player.tier);
  backendEventBus.emit(EventNames.Rest.SHOP_REFRESHED, gameState.shopItems);
}

export function reorderSkills(skillUniqueIDs) {
  // 根据传入的技能唯一ID数组，重新排序玩家的 cultivatedSkills
  const skills = gameState.player.cultivatedSkills || [];
  const reordered = skillUniqueIDs.map(id =>
    skills.find(skill => skill && skill.uniqueID === id) || null
  );
  // 保持容量一致
  while (reordered.length < (gameState.player.maxSkills || 0)) {
    reordered.push(null);
  }
  gameState.player.cultivatedSkills = reordered;
  backendEventBus.emit(EventNames.Player.SKILLS_REORDERED, reordered);
}
