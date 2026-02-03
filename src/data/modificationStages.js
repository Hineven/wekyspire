/**
 * 修正阶段类
 * 
 * 管理角色的属性修正和战斗修正，包括数值增减、数值乘除、布尔值与或非、数值裁剪四个区域，顺序进行。
 * 
 * @class ModificationStages
 */
export class ModificationStages {
  /**
   * 构造函数
   */
  constructor() {
    this.modifications = [];
    this.nextId = 0;
  }

  /**
   * 添加修正
   * @param {Object} modification - 修正对象
   * @param {string} modification.type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} modification.attributeName - 属性名称
   * @param {string} modification.operation - 操作类型（'add' | 'multiply' | 'boolean' | 'clip'）
   * @param {*} modification.value - 修正值
   * @param {string} modification.source - 修正来源
   * @param {string} modification.operator - 布尔操作符（'and' | 'or' | 'not'），仅当operation为'boolean'时有效
   * @param {number} modification.min - 裁剪最小值，仅当operation为'clip'时有效
   * @param {number} modification.max - 裁剪最大值，仅当operation为'clip'时有效
   * @returns {string} 修正ID
   */
  addModification(modification) {
    const id = `mod_${this.nextId++}`;
    this.modifications.push({
      id,
      ...modification
    });
    return id;
  }

  /**
   * 移除修正
   * @param {string} modificationId - 修正ID
   * @returns {boolean} 是否移除成功
   */
  removeModification(modificationId) {
    const initialLength = this.modifications.length;
    this.modifications = this.modifications.filter(m => m.id !== modificationId);
    return this.modifications.length < initialLength;
  }

  /**
   * 清除所有修正
   */
  clear() {
    this.modifications = [];
  }

  /**
   * 获取所有修正
   * @returns {Array} 修正列表
   */
  getAllModifications() {
    return [...this.modifications];
  }

  /**
   * 获取指定类型的修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @returns {Array} 修正列表
   */
  getModificationsByType(type) {
    return this.modifications.filter(m => m.type === type);
  }

  /**
   * 获取指定属性的所有修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} attributeName - 属性名称
   * @returns {Array} 修正列表
   */
  getModificationsByAttribute(type, attributeName) {
    return this.modifications.filter(
      m => m.type === type && m.attributeName === attributeName
    );
  }

  /**
   * 应用一级属性修正
   * @param {string} attributeName - 属性名称
   * @param {number} baseValue - 基础值
   * @returns {number} 修正后的值
   */
  applyPrimaryAttributeModification(attributeName, baseValue) {
    return this.applyModification('primary', attributeName, baseValue);
  }

  /**
   * 应用二级属性修正
   * @param {string} attributeName - 属性名称
   * @param {number} baseValue - 基础值
   * @returns {number} 修正后的值
   */
  applySecondaryAttributeModification(attributeName, baseValue) {
    return this.applyModification('secondary', attributeName, baseValue);
  }

  /**
   * 应用战斗状态修正
   * @param {string} stateName - 状态名称
   * @param {number} baseValue - 基础值
   * @returns {number} 修正后的值
   */
  applyBattleStateModification(stateName, baseValue) {
    return this.applyModification('battle', stateName, baseValue);
  }

  /**
   * 应用修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} attributeName - 属性名称
   * @param {number} baseValue - 基础值
   * @returns {number} 修正后的值
   */
  applyModification(type, attributeName, baseValue) {
    let value = baseValue;

    const relevantModifications = this.modifications.filter(
      m => m.type === type && m.attributeName === attributeName
    );

    const addModifications = relevantModifications.filter(m => m.operation === 'add');
    const multiplyModifications = relevantModifications.filter(m => m.operation === 'multiply');
    const booleanModifications = relevantModifications.filter(m => m.operation === 'boolean');
    const clipModifications = relevantModifications.filter(m => m.operation === 'clip');

    for (const mod of addModifications) {
      value += mod.value;
    }

    for (const mod of multiplyModifications) {
      value *= mod.value;
    }

    for (const mod of booleanModifications) {
      if (mod.operator === 'and') {
        value = value && mod.value;
      } else if (mod.operator === 'or') {
        value = value || mod.value;
      } else if (mod.operator === 'not') {
        value = !value;
      }
    }

    for (const mod of clipModifications) {
      if (mod.min !== undefined) {
        value = Math.max(value, mod.min);
      }
      if (mod.max !== undefined) {
        value = Math.min(value, mod.max);
      }
    }

    return value;
  }

  /**
   * 创建数值增减修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} attributeName - 属性名称
   * @param {number} value - 修正值
   * @param {string} source - 修正来源
   * @returns {Object} 修正对象
   */
  static createAddModification(type, attributeName, value, source) {
    return {
      type,
      attributeName,
      operation: 'add',
      value,
      source
    };
  }

  /**
   * 创建数值乘除修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} attributeName - 属性名称
   * @param {number} value - 修正值
   * @param {string} source - 修正来源
   * @returns {Object} 修正对象
   */
  static createMultiplyModification(type, attributeName, value, source) {
    return {
      type,
      attributeName,
      operation: 'multiply',
      value,
      source
    };
  }

  /**
   * 创建布尔值与或非修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} attributeName - 属性名称
   * @param {string} operator - 布尔操作符（'and' | 'or' | 'not'）
   * @param {*} value - 修正值
   * @param {string} source - 修正来源
   * @returns {Object} 修正对象
   */
  static createBooleanModification(type, attributeName, operator, value, source) {
    return {
      type,
      attributeName,
      operation: 'boolean',
      operator,
      value,
      source
    };
  }

  /**
   * 创建数值裁剪修正
   * @param {string} type - 修正类型（'primary' | 'secondary' | 'battle'）
   * @param {string} attributeName - 属性名称
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @param {string} source - 修正来源
   * @returns {Object} 修正对象
   */
  static createClipModification(type, attributeName, min, max, source) {
    return {
      type,
      attributeName,
      operation: 'clip',
      min,
      max,
      source
    };
  }
}
