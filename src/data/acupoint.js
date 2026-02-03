/**
 * 脉位基类
 * 
 * 脉位是角色的培养关键组件，容纳灵气、运作功法的容器。
 * 脉位可容纳灵气，可运作（默认至多一个）功法，并可以主动引动功法提供的技能、运动灵气以启用功法的被动效果。
 * 
 * @class Acupoint
 */
export class Acupoint {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.id - 脉位唯一标识符
   * @param {string} config.name - 脉位名称
   * @param {number} config.capacity - 脉位容量，能容纳灵气的量
   * @param {number} config.maxDurability - 脉位最大耐久度
   * @param {number} config.tenacity - 脉位韧性，决定在低耐久状态下，脉位的效能，以及每回合耐久恢复速度
   * @param {number} config.maxTechniqueSlots - 最大功法槽数量（默认1，结婴期后为2）
   */
  constructor({
    id,
    name,
    capacity = 100,
    maxDurability = 100,
    tenacity = 1.0,
    maxTechniqueSlots = 1
  } = {}) {
    this.id = id;
    this.name = name;
    this.capacity = capacity;
    this.maxDurability = maxDurability;
    this.tenacity = tenacity;
    this.maxTechniqueSlots = maxTechniqueSlots;

    this.currentQi = 0;
    this.durability = maxDurability;
    this.techniques = [];
    this.isCollapsed = false;
    this.connections = [];
  }

  /**
   * 获取脉位类型
   * @returns {string} 脉位类型（'normal' | 'spiritRoot' | 'immortalGate'）
   */
  getType() {
    return 'normal';
  }

  /**
   * 检查脉位是否崩溃
   * @returns {boolean} 是否崩溃
   */
  isAcupointCollapsed() {
    return this.isCollapsed;
  }

  /**
   * 获取当前灵气量
   * @returns {number} 当前灵气量
   */
  getCurrentQi() {
    return this.currentQi;
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
   * 获取脉位容量
   * @returns {number} 脉位容量
   */
  getCapacity() {
    return this.capacity;
  }

  /**
   * 获取脉位韧性
   * @returns {number} 脉位韧性
   */
  getTenacity() {
    return this.tenacity;
  }

  /**
   * 获取最大功法槽数量
   * @returns {number} 最大功法槽数量
   */
  getMaxTechniqueSlots() {
    return this.maxTechniqueSlots;
  }

  /**
   * 添加灵气
   * @param {number} amount - 要添加的灵气量
   * @returns {number} 实际添加的灵气量（可能因为容量限制而减少）
   */
  addQi(amount) {
    if (this.isCollapsed) {
      return 0;
    }
    const spaceAvailable = this.capacity - this.currentQi;
    const actualAmount = Math.min(amount, spaceAvailable);
    this.currentQi += actualAmount;
    return actualAmount;
  }

  /**
   * 消耗灵气
   * @param {number} amount - 要消耗的灵气量
   * @returns {Object} 消耗结果 { consumed: number, overflow: boolean }
   */
  consumeQi(amount) {
    if (this.isCollapsed) {
      return { consumed: 0, overflow: false };
    }
    const consumed = Math.min(amount, this.currentQi);
    this.currentQi -= consumed;
    const overflow = consumed < amount;
    return { consumed, overflow };
  }

  /**
   * 检查是否会发生灵气溢出
   * @param {number} amount - 要添加的灵气量
   * @returns {boolean} 是否会溢出
   */
  willOverflow(amount) {
    return this.currentQi + amount > this.capacity;
  }

  /**
   * 检查是否会发生灵气枯竭
   * @param {number} amount - 要消耗的灵气量
   * @returns {boolean} 是否会枯竭
   */
  willDeplete(amount) {
    return amount > this.currentQi;
  }

  /**
   * 处理灵气溢出
   * @returns {number} 损失的耐久量
   */
  handleOverflow() {
    const damage = this.maxDurability * 0.5;
    this.consumeDurability(damage);
    return damage;
  }

  /**
   * 处理灵气枯竭
   * @returns {number} 损失的耐久量
   */
  handleDepletion() {
    const damage = this.maxDurability * 0.3;
    this.consumeDurability(damage);
    return damage;
  }

  /**
   * 消耗脉位耐久
   * @param {number} amount - 要消耗的耐久量
   * @returns {boolean} 是否导致崩溃
   */
  consumeDurability(amount) {
    this.durability -= amount;
    if (this.durability <= 0) {
      this.collapse();
      return true;
    }
    return false;
  }

  /**
   * 恢复脉位耐久
   * @param {number} amount - 要恢复的耐久量
   * @returns {number} 实际恢复的耐久量
   */
  recoverDurability(amount) {
    if (this.isCollapsed) {
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
    if (this.isCollapsed) {
      return 0;
    }
    const durabilityRatio = this.durability / this.maxDurability;
    const efficiency = durabilityRatio < 0.5 ? this.tenacity : 1.0;
    return efficiency;
  }

  /**
   * 崩溃脉位
   */
  collapse() {
    this.isCollapsed = true;
    this.durability = 0;
  }

  /**
   * 修复崩溃的脉位
   */
  repair() {
    this.isCollapsed = false;
    this.durability = this.maxDurability;
  }

  /**
   * 安装功法
   * @param {Object} technique - 功法对象
   * @returns {boolean} 是否安装成功
   */
  installTechnique(technique) {
    if (this.techniques.length >= this.maxTechniqueSlots) {
      return false;
    }
    this.techniques.push(technique);
    return true;
  }

  /**
   * 卸载功法
   * @param {string} techniqueId - 功法ID
   * @returns {boolean} 是否卸载成功
   */
  uninstallTechnique(techniqueId) {
    const index = this.techniques.findIndex(t => t.id === techniqueId);
    if (index !== -1) {
      this.techniques.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取安装的功法列表
   * @returns {Array} 功法列表
   */
  getTechniques() {
    return [...this.techniques];
  }

  /**
   * 添加连接（经脉）
   * @param {string} targetAcupointId - 目标脉位ID
   * @param {Object} meridian - 经脉对象
   */
  addConnection(targetAcupointId, meridian) {
    this.connections.push({
      targetAcupointId,
      meridian
    });
  }

  /**
   * 移除连接
   * @param {string} targetAcupointId - 目标脉位ID
   * @returns {boolean} 是否移除成功
   */
  removeConnection(targetAcupointId) {
    const index = this.connections.findIndex(c => c.targetAcupointId === targetAcupointId);
    if (index !== -1) {
      this.connections.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 获取连接列表
   * @returns {Array} 连接列表
   */
  getConnections() {
    return [...this.connections];
  }

  /**
   * 检查是否有到目标脉位的连接
   * @param {string} targetAcupointId - 目标脉位ID
   * @returns {boolean} 是否有连接
   */
  hasConnectionTo(targetAcupointId) {
    return this.connections.some(c => c.targetAcupointId === targetAcupointId);
  }

  /**
   * 获取到目标脉位的经脉
   * @param {string} targetAcupointId - 目标脉位ID
   * @returns {Object|null} 经脉对象，如果没有连接则返回null
   */
  getMeridianTo(targetAcupointId) {
    const connection = this.connections.find(c => c.targetAcupointId === targetAcupointId);
    return connection ? connection.meridian : null;
  }

  /**
   * 战斗回合开始时的处理
   * @param {number} currentTick - 当前刻数
   */
  onBattleTurnStart(currentTick) {
  }

  /**
   * 战斗回合结束时的处理
   * @param {number} currentTick - 当前刻数
   */
  onBattleTurnEnd(currentTick) {
    const recoveryRate = this.getDurabilityRecoveryRate();
    const baseRecovery = 5;
    const actualRecovery = baseRecovery * recoveryRate;
    this.recoverDurability(actualRecovery);
  }

  /**
   * 真气离开脉位时的处理
   * @param {Object} trueQiState - 真气状态对象
   * @returns {Object} 处理后的真气状态
   */
  onTrueQiLeave(trueQiState) {
    return trueQiState;
  }

  /**
   * 真气进入脉位时的处理
   * @param {Object} trueQiState - 真气状态对象
   * @returns {Object} 处理后的真气状态
   */
  onTrueQiEnter(trueQiState) {
    return trueQiState;
  }

  /**
   * 计算灵力倍率
   * @param {Object} context - 上下文对象
   * @returns {number} 灵力倍率
   */
  calculatePowerMultiplier(context) {
    return 1.0;
  }

  /**
   * 计算经脉耐久消耗倍率
   * @param {Object} context - 上下文对象
   * @returns {number} 经脉耐久消耗倍率
   */
  calculateMeridianDurabilityCostMultiplier(context) {
    return 1.0;
  }
}

/**
 * 灵根脉位类
 * 
 * 灵根是一个特殊的脉位，是角色的培养核心。
 * 战斗中，每经过100刻，此处生成一次灵气（并堆积到脉位上），直到脉位上灵气满。
 * 
 * @class SpiritRootAcupoint
 */
export class SpiritRootAcupoint extends Acupoint {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.id - 脉位唯一标识符
   * @param {string} config.name - 脉位名称
   * @param {number} config.capacity - 脉位容量
   * @param {number} config.maxDurability - 脉位最大耐久度
   * @param {number} config.tenacity - 脉位韧性
   * @param {number} config.qiGenerationInterval - 灵气生成间隔（刻数）
   * @param {number} config.qiGenerationAmount - 每次生成的灵气量
   */
  constructor({
    id,
    name = '灵根',
    capacity = 100,
    maxDurability = 100,
    tenacity = 1.0,
    qiGenerationInterval = 100,
    qiGenerationAmount = 10
  } = {}) {
    super({
      id,
      name,
      capacity,
      maxDurability,
      tenacity
    });
    this.qiGenerationInterval = qiGenerationInterval;
    this.qiGenerationAmount = qiGenerationAmount;
    this.lastGenerationTick = 0;
  }

  /**
   * 获取脉位类型
   * @returns {string} 脉位类型
   */
  getType() {
    return 'spiritRoot';
  }

  /**
   * 战斗回合开始时的处理
   * @param {number} currentTick - 当前刻数
   */
  onBattleTurnStart(currentTick) {
    if (currentTick - this.lastGenerationTick >= this.qiGenerationInterval) {
      this.generateQi();
      this.lastGenerationTick = currentTick;
    }
    super.onBattleTurnStart(currentTick);
  }

  /**
   * 生成灵气
   * @returns {number} 实际生成的灵气量
   */
  generateQi() {
    return this.addQi(this.qiGenerationAmount);
  }

  /**
   * 设置灵气生成间隔
   * @param {number} interval - 间隔（刻数）
   */
  setQiGenerationInterval(interval) {
    this.qiGenerationInterval = interval;
  }

  /**
   * 设置灵气生成量
   * @param {number} amount - 生成量
   */
  setQiGenerationAmount(amount) {
    this.qiGenerationAmount = amount;
  }

  /**
   * 获取灵气生成间隔
   * @returns {number} 间隔（刻数）
   */
  getQiGenerationInterval() {
    return this.qiGenerationInterval;
  }

  /**
   * 获取灵气生成量
   * @returns {number} 生成量
   */
  getQiGenerationAmount() {
    return this.qiGenerationAmount;
  }
}

/**
 * 仙门穴脉位类
 * 
 * 仙门穴是一个化神期才拥有的特殊脉位。
 * 真气离开此脉位时，可让真气获得"仙形"状态，或从"仙形"状态转化为普通状态。
 * 
 * @class ImmortalGateAcupoint
 */
export class ImmortalGateAcupoint extends Acupoint {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.id - 脉位唯一标识符
   * @param {string} config.name - 脉位名称
   * @param {number} config.capacity - 脉位容量
   * @param {number} config.maxDurability - 脉位最大耐久度
   * @param {number} config.tenacity - 脉位韧性
   */
  constructor({
    id,
    name = '仙门穴',
    capacity = 100,
    maxDurability = 100,
    tenacity = 1.0
  } = {}) {
    super({
      id,
      name,
      capacity,
      maxDurability,
      tenacity
    });
  }

  /**
   * 获取脉位类型
   * @returns {string} 脉位类型
   */
  getType() {
    return 'immortalGate';
  }

  /**
   * 真气离开脉位时的处理
   * @param {Object} trueQiState - 真气状态对象
   * @returns {Object} 处理后的真气状态
   */
  onTrueQiLeave(trueQiState) {
    if (trueQiState.isImmortalForm) {
      trueQiState.isImmortalForm = false;
    } else {
      trueQiState.isImmortalForm = true;
    }
    return trueQiState;
  }

  /**
   * 计算灵力倍率
   * @param {Object} context - 上下文对象
   * @returns {number} 灵力倍率
   */
  calculatePowerMultiplier(context) {
    if (context.trueQiState && context.trueQiState.isImmortalForm) {
      return 10.0;
    }
    return 1.0;
  }

  /**
   * 计算经脉耐久消耗倍率
   * @param {Object} context - 上下文对象
   * @returns {number} 经脉耐久消耗倍率
   */
  calculateMeridianDurabilityCostMultiplier(context) {
    if (context.trueQiState && context.trueQiState.isImmortalForm) {
      return 3.0;
    }
    return 1.0;
  }

  /**
   * 检查是否可以进行多倍引动
   * @param {Object} context - 上下文对象
   * @returns {boolean} 是否可以进行多倍引动
   */
  canMultiActivate(context) {
    if (context.trueQiState && context.trueQiState.isImmortalForm) {
      return false;
    }
    return true;
  }
}
