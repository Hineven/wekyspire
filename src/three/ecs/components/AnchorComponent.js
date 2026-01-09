/**
 * AnchorComponent - 锚点组件
 *
 * 代表一个可以被entity吸附的anchor，管理挂载的实体和布局逻辑
 */

class AnchorComponent {
  constructor(id, options = {}) {
    this.type = 'anchor'; // 组件类型，用于ComponentStore管理
    this.id = id;
    this.mountedEntities = new Map();
    this.options = {
      layoutType: 'horizontal',
      gap: 10,
      padding: 0,
      ...options
    };
  }

  /**
   * 当entity挂载到此anchor时调用
   * @param {Object} entity - 实体对象
   */
  onMounted(entity) {
    if (!entity || !entity.id) {
      console.warn('[AnchorComponent] Invalid entity mounted to anchor:', this.id);
      return;
    }

    this.mountedEntities.set(entity.id, entity);
    console.log(`[AnchorComponent] Entity ${entity.id} mounted to anchor ${this.id}`);

    this._updateLayout();
  }

  /**
   * 当entity从此anchor卸载时调用
   * @param {Object} entity - 实体对象
   */
  onUnmounted(entity) {
    if (!entity || !entity.id) {
      console.warn('[AnchorComponent] Invalid entity unmounted from anchor:', this.id);
      return;
    }

    this.mountedEntities.delete(entity.id);
    console.log(`[AnchorComponent] Entity ${entity.id} unmounted from anchor ${this.id}`);

    this._updateLayout();
  }

  /**
   * 获取entity在此anchor上的挂载位置
   * @param {Object} entity - 实体对象
   * @returns {Object} 位置和变换信息 { x, y, z, scale, rotation }
   */
  getEntityMountedPosition(entity) {
    if (!entity || !entity.id) {
      console.warn('[AnchorComponent] Invalid entity for position calculation');
      return { x: 0, y: 0, z: 0, scale: 1, rotation: 0 };
    }

    const entities = Array.from(this.mountedEntities.values());
    const index = entities.findIndex(e => e.id === entity.id);

    if (index === -1) {
      console.warn(`[AnchorComponent] Entity ${entity.id} not found in anchor ${this.id}`);
      return { x: 0, y: 0, z: 0, scale: 1, rotation: 0 };
    }

    return this._calculatePosition(index, entities.length, entity);
  }

  /**
   * 计算实体在anchor中的位置
   * @param {number} index - 实体索引
   * @param {number} total - 总实体数
   * @param {Object} entity - 实体对象
   * @returns {Object} 位置和变换信息
   */
  _calculatePosition(index, total, entity) {
    const { layoutType, gap, padding, basePosition, cardScale, cardDesignWidth, cardDesignHeight, zAllocator, zType, coordConverter } = this.options;

    let localPos;
    switch (layoutType) {
      case 'horizontal':
        localPos = this._calculateHorizontalPosition(index, total, entity, gap, padding);
        break;
      case 'vertical':
        localPos = this._calculateVerticalPosition(index, total, entity, gap, padding);
        break;
      case 'fan':
        localPos = this._calculateFanPosition(index, total, entity, gap, padding);
        break;
      case 'absolute':
        localPos = { x: 0, y: 0, z: 0, scale: cardScale || 1, rotation: 0 };
        break;
      default:
        localPos = this._calculateHorizontalPosition(index, total, entity, gap, padding);
    }

    if (layoutType === 'absolute') {
      const worldPos = coordConverter.screenToWorld(basePosition.x, basePosition.y);
      const z = zAllocator ? zAllocator.getNextZ(zType) : 0;
      return {
        x: worldPos.x,
        y: worldPos.y,
        z,
        scale: cardScale || 1,
        rotation: 0
      };
    }

    const worldPos = coordConverter.screenToWorld(basePosition.x, basePosition.y);
    const z = zAllocator ? zAllocator.getNextZ(zType) : 0;

    return {
      x: worldPos.x + localPos.x,
      y: worldPos.y + localPos.y,
      z,
      scale: cardScale || 1,
      rotation: localPos.rotation
    };
  }

  /**
   * 计算水平布局位置
   */
  _calculateHorizontalPosition(index, total, entity, gap, padding) {
    const { cardDesignWidth, cardScale } = this.options;
    const entityWidth = cardDesignWidth * cardScale;
    const totalWidth = total * entityWidth + (total - 1) * gap + padding * 2;
    const startX = -totalWidth / 2 + entityWidth / 2 + padding;
    const x = startX + index * (entityWidth + gap);

    return {
      x,
      y: 0,
      z: 0,
      scale: 1,
      rotation: 0
    };
  }

  /**
   * 计算垂直布局位置
   */
  _calculateVerticalPosition(index, total, entity, gap, padding) {
    const { cardDesignHeight, cardScale } = this.options;
    const entityHeight = cardDesignHeight * cardScale;
    const totalHeight = total * entityHeight + (total - 1) * gap + padding * 2;
    const startY = totalHeight / 2 - entityHeight / 2 - padding;
    const y = startY - index * (entityHeight + gap);

    return {
      x: 0,
      y,
      z: 0,
      scale: 1,
      rotation: 0
    };
  }

  /**
   * 计算扇形布局位置（用于手牌）
   */
  _calculateFanPosition(index, total, entity, gap, padding) {
    const { cardDesignWidth, cardScale } = this.options;
    const entityWidth = cardDesignWidth * cardScale;
    const totalWidth = total * entityWidth + (total - 1) * gap + padding * 2;
    const startX = -totalWidth / 2 + entityWidth / 2 + padding;
    const x = startX + index * (entityWidth + gap);

    const rotation = (index - (total - 1) / 2) * 3 * (Math.PI / 180);

    return {
      x,
      y: 0,
      z: 0,
      scale: 1,
      rotation
    };
  }

  /**
   * 更新所有挂载实体的布局
   */
  _updateLayout() {
    for (const entity of this.mountedEntities.values()) {
      const position = this.getEntityMountedPosition(entity);
      if (entity.object3D) {
        entity.object3D.position.set(position.x, position.y, position.z);
        if (position.rotation !== undefined) {
          entity.object3D.rotation.z = position.rotation;
        }
        if (position.scale !== undefined && position.scale !== 1) {
          entity.object3D.scale.set(position.scale, position.scale, 1);
        }
      }
    }
  }

  /**
   * 获取挂载的实体数量
   */
  getMountedCount() {
    return this.mountedEntities.size;
  }

  /**
   * 获取所有挂载的实体
   */
  getMountedEntities() {
    return Array.from(this.mountedEntities.values());
  }

  /**
   * 清理资源
   */
  dispose() {
    this.mountedEntities.clear();
  }
}

export default AnchorComponent;