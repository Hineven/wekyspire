/**
 * 丹田类
 * 
 * 丹田是角色的培养核心，每个角色都有一个丹田，丹田中包含脉位和经脉，拥有灵气容量、灵气恢复速度等属性。
 * 在培养中，角色可以在突破中改变丹田中的脉位和经脉，在一般时刻调整丹田上脉位运作的功夫。
 * 在战斗中，角色依赖在经脉间运作灵气，发动脉位上功夫提供的技能来战斗。
 * 
 * @class Dantian
 */
export class Dantian {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {string} config.id - 丹田唯一标识符
   * @param {string} config.characterId - 所属角色ID
   * @param {number} config.maxDissipation - 散气上限，一次散气的最大量
   */
  constructor({
    id,
    characterId,
    maxDissipation = 50
  } = {}) {
    this.id = id;
    this.characterId = characterId;
    this.maxDissipation = maxDissipation;

    this.acupoints = new Map();
    this.meridians = new Map();
    this.trueQiAcupointId = null;
  }

  /**
   * 添加脉位
   * @param {Acupoint} acupoint - 脉位对象
   * @returns {boolean} 是否添加成功
   */
  addAcupoint(acupoint) {
    if (this.acupoints.has(acupoint.id)) {
      return false;
    }
    this.acupoints.set(acupoint.id, acupoint);
    return true;
  }

  /**
   * 移除脉位
   * @param {string} acupointId - 脉位ID
   * @returns {boolean} 是否移除成功
   */
  removeAcupoint(acupointId) {
    return this.acupoints.delete(acupointId);
  }

  /**
   * 获取脉位
   * @param {string} acupointId - 脉位ID
   * @returns {Acupoint|null} 脉位对象，不存在则返回null
   */
  getAcupoint(acupointId) {
    return this.acupoints.get(acupointId) || null;
  }

  /**
   * 获取所有脉位
   * @returns {Array<Acupoint>} 脉位数组
   */
  getAllAcupoints() {
    return Array.from(this.acupoints.values());
  }

  /**
   * 添加经脉
   * @param {Meridian} meridian - 经脉对象
   * @returns {boolean} 是否添加成功
   */
  addMeridian(meridian) {
    if (this.meridians.has(meridian.id)) {
      return false;
    }
    this.meridians.set(meridian.id, meridian);
    return true;
  }

  /**
   * 移除经脉
   * @param {string} meridianId - 经脉ID
   * @returns {boolean} 是否移除成功
   */
  removeMeridian(meridianId) {
    return this.meridians.delete(meridianId);
  }

  /**
   * 获取经脉
   * @param {string} meridianId - 经脉ID
   * @returns {Meridian|null} 经脉对象，不存在则返回null
   */
  getMeridian(meridianId) {
    return this.meridians.get(meridianId) || null;
  }

  /**
   * 获取所有经脉
   * @returns {Array<Meridian>} 经脉数组
   */
  getAllMeridians() {
    return Array.from(this.meridians.values());
  }

  /**
   * 设置真气所在脉位
   * @param {string} acupointId - 脉位ID
   * @returns {boolean} 是否设置成功
   */
  setTrueQiAcupoint(acupointId) {
    if (!this.acupoints.has(acupointId)) {
      return false;
    }
    this.trueQiAcupointId = acupointId;
    return true;
  }

  /**
   * 获取真气所在脉位
   * @returns {Acupoint|null} 脉位对象，不存在则返回null
   */
  getTrueQiAcupoint() {
    if (!this.trueQiAcupointId) {
      return null;
    }
    return this.acupoints.get(this.trueQiAcupointId) || null;
  }

  /**
   * 计算两个脉位之间的距离
   * @param {string} fromAcupointId - 起始脉位ID
   * @param {string} toAcupointId - 目标脉位ID
   * @returns {number|null} 距离，无法到达则返回null
   */
  calculateDistance(fromAcupointId, toAcupointId) {
    if (!this.acupoints.has(fromAcupointId) || !this.acupoints.has(toAcupointId)) {
      return null;
    }

    if (fromAcupointId === toAcupointId) {
      return 0;
    }

    const distances = new Map();
    const queue = [fromAcupointId];
    distances.set(fromAcupointId, 0);

    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentDistance = distances.get(currentId);

      if (currentId === toAcupointId) {
        return currentDistance;
      }

      const currentAcupoint = this.acupoints.get(currentId);
      const connections = currentAcupoint.getConnections();

      for (const connection of connections) {
        const targetId = connection.targetAcupointId;
        const meridian = connection.meridian;

        if (meridian.isBroken()) {
          continue;
        }

        if (!distances.has(targetId)) {
          distances.set(targetId, currentDistance + 1);
          queue.push(targetId);
        }
      }
    }

    return null;
  }

  /**
   * 获取散气上限
   * @returns {number} 散气上限
   */
  getMaxDissipation() {
    return this.maxDissipation;
  }

  /**
   * 设置散气上限
   * @param {number} maxDissipation - 散气上限
   */
  setMaxDissipation(maxDissipation) {
    this.maxDissipation = maxDissipation;
  }

  /**
   * 战斗回合开始时的处理
   * @param {number} currentTick - 当前刻数
   */
  onBattleTurnStart(currentTick) {
    for (const acupoint of this.acupoints.values()) {
      acupoint.onBattleTurnStart(currentTick);
    }
  }

  /**
   * 战斗回合结束时的处理
   * @param {number} currentTick - 当前刻数
   */
  onBattleTurnEnd(currentTick) {
    for (const acupoint of this.acupoints.values()) {
      acupoint.onBattleTurnEnd(currentTick);
    }
  }
}
