/**
 * 角色类
 * 
 * 角色是可以参与战斗的单位，每个角色拥有属性、丹田、功法、修正、物品。
 * 
 * @class Character
 */
import { ModificationStages } from './modificationStages.js';
import {
  Realm,
  CharacterType,
  PrimaryAttribute,
  SecondaryAttribute,
  BattleState
} from './enums.js';

export class Character {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.id - 角色唯一标识符
   * @param {string} config.name - 角色名称
   * @param {string} config.type - 角色类型（使用CharacterType枚举）
   * @param {Object} config.primaryAttributes - 一级属性
   * @param {number} config.primaryAttributes.rootBone - 根骨，决定力量成长、生命成长、恢复速度等
   * @param {number} config.primaryAttributes.comprehension - 悟性，决定技能学习速度、神识成长速度等
   * @param {number} config.primaryAttributes.talent - 天赋，决定灵力运作进步速度等
   * @param {number} config.primaryAttributes.spiritRoot - 灵根，决定灵气获取速度、适配性等
   * @param {Object} config.secondaryAttributes - 二级属性
   * @param {number} config.secondaryAttributes.vitality - 元气，影响闭关期间的收益率
   * @param {number} config.secondaryAttributes.strength - 力量，影响物理攻击和肉身攻击
   * @param {number} config.secondaryAttributes.spiritPower - 灵能，影响技能威能
   * @param {number} config.secondaryAttributes.hp - 生命值
   * @param {number} config.secondaryAttributes.maxHp - 最大生命值
   * @param {number} config.secondaryAttributes.escapeSpeed - 遁速，决定逃跑能力和速度条初始位置
   * @param {number} config.secondaryAttributes.recovery - 恢复力，影响生命和耐久恢复速度
   * @param {number} config.secondaryAttributes.qiGain - 灵气获取量
   * @param {number} config.secondaryAttributes.qiDissipation - 灵气散气速度
   * @param {number} config.secondaryAttributes.maxActivationMultiplier - 引动最大倍率
   * @param {number} config.secondaryAttributes.speed - 速度，影响行动顺序
   * @param {number} config.secondaryAttributes.consciousness - 神识，决定压制关系和所受压制效果
   * @param {Object} config.dantian - 丹田对象
   * @param {Array} config.techniques - 功法列表
   * @param {Array} config.items - 物品列表
   * @param {string} config.realm - 大境界（使用Realm枚举）
   */
  constructor({
    id,
    name,
    type = CharacterType.PLAYER,
    primaryAttributes = {},
    secondaryAttributes = {},
    dantian = null,
    techniques = [],
    items = [],
    realm = Realm.QI_REFINING
  } = {}) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.realm = realm;

    this.primaryAttributes = {
      [PrimaryAttribute.ROOT_BONE]: primaryAttributes.rootBone || 10,
      [PrimaryAttribute.COMPREHENSION]: primaryAttributes.comprehension || 10,
      [PrimaryAttribute.TALENT]: primaryAttributes.talent || 10,
      [PrimaryAttribute.SPIRIT_ROOT]: primaryAttributes.spiritRoot || 10
    };

    this.secondaryAttributes = {
      [SecondaryAttribute.VITALITY]: secondaryAttributes.vitality || 100,
      [SecondaryAttribute.STRENGTH]: secondaryAttributes.strength || 10,
      [SecondaryAttribute.SPIRIT_POWER]: secondaryAttributes.spiritPower || 10,
      [SecondaryAttribute.HP]: secondaryAttributes.hp || 100,
      [SecondaryAttribute.MAX_HP]: secondaryAttributes.maxHp || 100,
      [SecondaryAttribute.ESCAPE_SPEED]: secondaryAttributes.escapeSpeed || 10,
      [SecondaryAttribute.RECOVERY]: secondaryAttributes.recovery || 1.0,
      [SecondaryAttribute.QI_GAIN]: secondaryAttributes.qiGain || 10,
      [SecondaryAttribute.QI_DISSIPATION]: secondaryAttributes.qiDissipation || 5,
      [SecondaryAttribute.MAX_ACTIVATION_MULTIPLIER]: secondaryAttributes.maxActivationMultiplier || 1,
      [SecondaryAttribute.SPEED]: secondaryAttributes.speed || 10,
      [SecondaryAttribute.CONSCIOUSNESS]: secondaryAttributes.consciousness || 10
    };

    this.dantian = dantian;
    this.techniques = techniques;
    this.items = items;

    this.modifications = new ModificationStages();
    this.battleState = {
      [BattleState.POWER_MULTIPLIER]: 1.0,
      [BattleState.LUCK]: 1.0,
      [BattleState.DURABILITY_CONSUMPTION_MULTIPLIER]: 1.0,
      [BattleState.SPEED_MODIFIER]: 0,
      [BattleState.DAMAGE_TAKEN_MULTIPLIER]: 1.0
    };

    this.isDying = false;
    this.isDead = false;
  }

  /**
   * 获取一级属性
   * @param {string} attributeName - 属性名称（使用PrimaryAttribute枚举）
   * @returns {number} 属性值（应用修正后）
   */
  getPrimaryAttribute(attributeName) {
    const baseValue = this.primaryAttributes[attributeName];
    return this.modifications.applyPrimaryAttributeModification(attributeName, baseValue);
  }

  /**
   * 获取二级属性
   * @param {string} attributeName - 属性名称（使用SecondaryAttribute枚举）
   * @returns {number} 属性值（应用修正后）
   */
  getSecondaryAttribute(attributeName) {
    const baseValue = this.secondaryAttributes[attributeName];
    return this.modifications.applySecondaryAttributeModification(attributeName, baseValue);
  }

  /**
   * 获取战斗状态
   * @param {string} stateName - 状态名称（使用BattleState枚举）
   * @returns {number} 状态值（应用修正后）
   */
  getBattleState(stateName) {
    const baseValue = this.battleState[stateName];
    return this.modifications.applyBattleStateModification(stateName, baseValue);
  }

  /**
   * 添加属性修正
   * @param {Object} modification - 修正对象
   * @param {string} modification.type - 修正类型（使用ModificationType枚举）
   * @param {string} modification.attributeName - 属性名称
   * @param {string} modification.operation - 操作类型（使用ModificationOperation枚举）
   * @param {*} modification.value - 修正值
   * @param {string} modification.source - 修正来源
   */
  addModification(modification) {
    this.modifications.addModification(modification);
  }

  /**
   * 移除属性修正
   * @param {string} modificationId - 修正ID
   */
  removeModification(modificationId) {
    this.modifications.removeModification(modificationId);
  }

  /**
   * 清除所有修正
   */
  clearModifications() {
    this.modifications.clear();
  }

  /**
   * 检查角色是否死亡
   * @returns {boolean} 是否死亡
   */
  isCharacterDead() {
    return this.isDead;
  }

  /**
   * 检查角色是否濒死
   * @returns {boolean} 是否濒死
   */
  isCharacterDying() {
    return this.isDying;
  }

  /**
   * 受到伤害
   * @param {number} damage - 伤害值
   * @returns {Object} 伤害结果 { hpDamage: number, shieldDamage: number, isDead: boolean }
   */
  takeDamage(damage) {
    const damageTakenMultiplier = this.getBattleState(BattleState.DAMAGE_TAKEN_MULTIPLIER);
    const finalDamage = damage * damageTakenMultiplier;

    let hpDamage = 0;
    let shieldDamage = 0;

    if (finalDamage > 0) {
      hpDamage = Math.min(this.secondaryAttributes[SecondaryAttribute.HP], finalDamage);
      this.secondaryAttributes[SecondaryAttribute.HP] -= hpDamage;

      if (this.secondaryAttributes[SecondaryAttribute.HP] <= 0) {
        this.secondaryAttributes[SecondaryAttribute.HP] = 0;
        this.isDying = true;
      }

      if (finalDamage > this.secondaryAttributes[SecondaryAttribute.MAX_HP]) {
        this.isDead = true;
        this.isDying = false;
      }
    }

    return { hpDamage, shieldDamage, isDead: this.isDead };
  }

  /**
   * 恢复生命
   * @param {number} amount - 恢复量
   * @returns {number} 实际恢复量
   */
  heal(amount) {
    const spaceAvailable = this.secondaryAttributes[SecondaryAttribute.MAX_HP] - this.secondaryAttributes[SecondaryAttribute.HP];
    const actualAmount = Math.min(amount, spaceAvailable);
    this.secondaryAttributes[SecondaryAttribute.HP] += actualAmount;
    return actualAmount;
  }

  /**
   * 学习功法
   * @param {Object} technique - 功法对象
   * @returns {boolean} 是否学习成功
   */
  learnTechnique(technique) {
    if (this.techniques.some(t => t.id === technique.id)) {
      return false;
    }
    this.techniques.push(technique);
    return true;
  }

  /**
   * 遗忘功法
   * @param {string} techniqueId - 功法ID
   * @returns {boolean} 是否遗忘成功
   */
  forgetTechnique(techniqueId) {
    const index = this.techniques.findIndex(t => t.id === techniqueId);
    if (index !== -1) {
      this.techniques.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 添加物品
   * @param {Object} item - 物品对象
   */
  addItem(item) {
    this.items.push(item);
  }

  /**
   * 移除物品
   * @param {string} itemId - 物品ID
   * @returns {boolean} 是否移除成功
   */
  removeItem(itemId) {
    const index = this.items.findIndex(i => i.id === itemId);
    if (index !== -1) {
      this.items.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取物品列表
   * @returns {Array} 物品列表
   */
  getItems() {
    return [...this.items];
  }

  /**
   * 获取功法列表
   * @returns {Array} 功法列表
   */
  getTechniques() {
    return [...this.techniques];
  }

  /**
   * 获取丹田
   * @returns {Object} 丹田对象
   */
  getDantian() {
    return this.dantian;
  }

  /**
   * 设置丹田
   * @param {Object} dantian - 丹田对象
   */
  setDantian(dantian) {
    this.dantian = dantian;
  }

  /**
   * 获取大境界
   * @returns {string} 大境界（使用Realm枚举）
   */
  getRealm() {
    return this.realm;
  }

  /**
   * 设置大境界
   * @param {string} realm - 大境界（使用Realm枚举）
   */
  setRealm(realm) {
    if (Realm.isValid(realm)) {
      this.realm = realm;
    }
  }

  /**
   * 尝试突破到下一大境界
   * @returns {boolean} 是否突破成功
   */
  attemptBreakthrough() {
    const nextRealm = Realm.getNext(this.realm);
    if (nextRealm) {
      this.setRealm(nextRealm);
      return true;
    }
    return false;
  }

  /**
   * 获取角色类型
   * @returns {string} 角色类型（使用CharacterType枚举）
   */
  getCharacterType() {
    return this.type;
  }
}
