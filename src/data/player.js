import SkillManager from './skillManager.js'
import backendEventBus, { EventNames } from '../backendEventBus.js'
import Unit from './unit.js'

export function getNextPlayerTier(playerTier) {
  const tierUpgrades = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9 };
  return tierUpgrades[playerTier];
}

export function upgradePlayerTier (player) {
  const nextTier = getNextPlayerTier(player.tier);
  if (nextTier !== undefined) {
    player.tier = nextTier;
    player.maxMana += 1;
    if (player.tier === 1) {
      // 特殊：第一次升级时多获得一点魏启
      player.maxMana += 1;
    }
    if (player.maxActionPoints < 8) {
      player.maxActionPoints++;
    }
  }
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  backendEventBus.emit(EventNames.Player.TIER_UPGRADED, player);
  return true;
}

export function getPlayerTierFromTierIndex(tierIndex) {
  const tiers = [
    {tier: 0, name: '旅人'},
    {tier: 1, name: '见习灵御'},
    {tier: 2, name: '普通灵御'},
    {tier: 3, name: '中级灵御'},
    {tier: 4, name: '资深灵御'},
    {tier: 5, name: '高级灵御'},
    {tier: 6, name: '准大师灵御'},
    {tier: 7, name: '大师灵御', subtitle: '古往今来，灵御协会所能给出的最高认可'},
    {tier: 8, name: '一代宗师', subtitle: '和独开一代的宗师们并肩而立'},
    {tier: 9, name: '传奇', subtitle: '即便肉身消陨，你的名字也会回荡于传说之中'}
  ];
  return tiers[tierIndex];
}

// 玩家数据类
export class Player extends Unit {
  constructor() {
    super();
    this.type = 'player';
    this.name = "你";
    this.hp = 40;
    this.shield = 0;
    this.maxHp = 40;
    this.mana = 0;
    this.maxMana = 0;
    this.baseAttack = 0;
    this.baseMagic = 1;
    this.baseDefense = 0;
    this.remainingActionPoints = 3;
    this.maxActionPoints = 3; // 行动点初始为3
    this.money = 0;
    this.tier = 0; // 等阶
    this.skillSlots = Array(9).fill(null); // 技能槽，这是一个养成概念，和战斗无关。玩家可以在技能槽内保存技能。战斗开始时，从技能槽中保存的技能创建skills，作为玩家在战场上的技能。
    this.skills = []; // 场上技能。skills仅在战斗时有效，用于存储当前战斗中玩家拥有的技能。在战斗开始前由skillSlots生成，在战斗结束后清空。
    this.frontierSkills = []; // 前台技能列表，玩家在当前回合可以使用的技能
    this.backupSkills = []; // 后备技能列表，用于存储暂时不可用的技能
    this.maxFrontierSkills = 5; // 最大前台技能数量
    // effects 由 Unit 初始化
  }

  // 计算属性
  // attack/magic 继承自 Unit

  get agility() {
    return (this.effects['敏捷'] || 0)
  }

  addBackupSkill (skill) {
    this.backupSkills.push(skill);
  }

  consumeActionPoints (amount) {
    this.remainingActionPoints -= amount;
    this.remainingActionPoints = Math.max(this.remainingActionPoints, 0);
  }

  consumeMana (amount) {
    this.mana -= amount;
    this.mana = Math.max(this.mana, 0);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  gainMana (amount) {
    this.mana += amount;
    this.mana = Math.max(this.mana, 0);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  gainActionPoint (amount) {
    this.remainingActionPoints += amount;
    this.remainingActionPoints = Math.min(this.remainingActionPoints, this.maxActionPoints);
  }
}