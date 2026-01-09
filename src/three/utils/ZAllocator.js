/**
 * ZAllocator - 统一的Z轴分配器
 *
 * 为不同类型的实体分配不同的Z轴范围，确保正确的渲染顺序
 *
 * Z轴范围分配：
 * - PANEL: 100-199 - 面板实体
 * - HAND_CARD: 200-299 - 手牌卡牌
 * - ACTIVATED_SKILL: 300-399 - 激活技能
 * - DRAGGING_CARD: 400-499 - 拖拽中的卡牌
 * - EFFECT: 500-599 - 特效
 * - ICON: 600-699 - 图标
 */

class ZAllocator {
  constructor() {
    // 定义不同实体类型的Z轴范围起始值
    this.zRanges = {
      PANEL: 100,      // 面板实体（玩家/敌人面板）
      HAND_CARD: 200,  // 手牌卡牌
      ACTIVATED_SKILL: 300,  // 激活技能
      DRAGGING_CARD: 400,    // 拖拽中的卡牌（最高层级）
      EFFECT: 500,     // 特效（如高亮、闪光）
      ICON: 600        // 图标（牌库、墓地）
    };

    // 记录每个范围的当前Z值
    this.currentZ = {
      PANEL: this.zRanges.PANEL,
      HAND_CARD: this.zRanges.HAND_CARD,
      ACTIVATED_SKILL: this.zRanges.ACTIVATED_SKILL,
      DRAGGING_CARD: this.zRanges.DRAGGING_CARD,
      EFFECT: this.zRanges.EFFECT,
      ICON: this.zRanges.ICON
    };
  }

  /**
   * 获取下一个可用的Z值
   * @param {string} type - 实体类型
   * @returns {number} 下一个可用的Z值
   */
  getNextZ(type) {
    if (!this.currentZ[type]) {
      console.warn(`[ZAllocator] Unknown entity type: ${type}, using default Z range`);
      return this.currentZ.HAND_CARD++;
    }
    return this.currentZ[type]++;
  }

  /**
   * 获取指定类型的Z轴范围起始值
   * @param {string} type - 实体类型
   * @returns {number} Z轴范围起始值
   */
  getBaseZ(type) {
    return this.zRanges[type] || this.zRanges.HAND_CARD;
  }

  /**
   * 重置指定类型的Z轴计数器
   * @param {string} type - 实体类型
   */
  resetZ(type) {
    if (this.currentZ[type]) {
      this.currentZ[type] = this.zRanges[type];
    }
  }

  /**
   * 重置所有Z轴计数器
   */
  resetAll() {
    for (const type in this.currentZ) {
      this.currentZ[type] = this.zRanges[type];
    }
  }
}

// 单例模式
let zAllocatorInstance = null;

export function getZAllocator() {
  if (!zAllocatorInstance) {
    zAllocatorInstance = new ZAllocator();
  }
  return zAllocatorInstance;
}

export default ZAllocator;