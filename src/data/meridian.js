/**
 * 经脉类
 * 
 * 经脉是角色的培养关键组件，连接不同脉位，能单向传输灵气。
 * 每条丹田内的经脉需要神识维护，当一个脉位有超过一条离开此脉位的经脉时，每条给予神识数值乘除区降低修正。
 * 
 * @class Meridian
 */
export class Meridian {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.id - 经脉唯一标识符
   * @param {string} config.fromAcupointId - 起始脉位ID
   * @param {string} config.toAcupointId - 目标脉位ID
   * @param {number} config.maxDurability - 经脉最大耐久度
   * @param {number} config.tenacity - 经脉韧性，决定在低耐久或断裂状态下，经脉的传输效率，以及每回合耐久恢复速度
   */
  constructor({
    id,
    fromAcupointId,
    toAcupointId,
    maxDurability = 100,
    tenacity = 1.0
  } = {}) {
    this.id = id;
    this.fromAcupointId = fromAcupointId;
    this.toAcupointId = toAcupointId;
    this.maxDurability = maxDurability;
    this.tenacity = tenacity;

    this.durability = maxDurability;
    this.isBroken = false;
  }

  /**
   * 获取起始脉位ID
   * @returns {string} 起始脉位ID
   */
  getFromAcupointId() {
    return this.fromAcupointId;
  }

  /**
   * 获取目标脉位ID
   * @returns {string} 目标脉位ID
   */
  getToAcupointId() {
    return this.toAcupointId;
  }

  /**
   * 获取当前耐久度
   * @returns {number} 当前耐久度
   */
  getCurrentDurability() {
    return this.durability;
  }

  /**
   * 获取最大耐久度
   * @returns {number} 最大耐久度
   */
  getMaxDurability() {
    return this.maxDurability;
  }

  /**
   * 获取韧性
   * @returns {number} 韧性
   */
  getTenacity() {
    return this.tenacity;
  }

  /**
   * 检查经脉是否断裂
   * @returns {boolean} 是否断裂
   */
  isBroken() {
    return this.isBroken;
  }

  /**
   * 消耗经脉耐久
   * @param {number} amount - 要消耗的耐久量
   * @returns {boolean} 是否导致断裂
   */
  consumeDurability(amount) {
    if (this.isBroken) {
      return false;
    }
    this.durability -= amount;
    if (this.durability <= 0) {
      this.breakMeridian();
      return true;
    }
    return false;
  }

  /**
   * 恢复经脉耐久
   * @param {number} amount - 要恢复的耐久量
   * @returns {number} 实际恢复的耐久量
   */
  recoverDurability(amount) {
    if (this.isBroken) {
      return 0;
    }
    const spaceAvailable = this.maxDurability - this.durability;
    const actualAmount = Math.min(amount, spaceAvailable);
    this.durability += actualAmount;
    return actualAmount;
  }

  /**
   * 计算耐久恢复速度（基于韧性）
   * @returns {number} 耐久恢复速度
   */
  getDurabilityRecoveryRate() {
    if (this.isBroken) {
      return 0;
    }
    const durabilityRatio = this.durability / this.maxDurability;
    const efficiency = durabilityRatio < 0.5 ? this.tenacity : 1.0;
    return efficiency;
  }

  /**
   * 断裂经脉
   */
  breakMeridian() {
    this.isBroken = true;
    this.durability = 0;
  }

  /**
   * 修复断裂的经脉
   */
  repair() {
    this.isBroken = false;
    this.durability = this.maxDurability;
  }

  /**
   * 计算传输效率
   * @returns {number} 传输效率（0-1之间）
   */
  getTransmissionEfficiency() {
    if (this.isBroken) {
      return 0;
    }
    const durabilityRatio = this.durability / this.maxDurability;
    if (durabilityRatio >= 0.5) {
      return 1.0;
    }
    return durabilityRatio * 2 * this.tenacity;
  }

  /**
   * 计算神识维护消耗
   * @param {number} totalOutgoingMeridians - 该脉位的总出经脉数
   * @returns {number} 神识消耗倍率
   */
  calculateConsciousnessCost(totalOutgoingMeridians) {
    if (totalOutgoingMeridians <= 1) {
      return 0;
    }
    return (totalOutgoingMeridians - 1) * 0.1;
  }
}
