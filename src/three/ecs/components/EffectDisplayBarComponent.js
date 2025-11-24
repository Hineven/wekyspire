/**
 * EffectDisplayBarComponent - 效果图标容器组件
 *
 * 管理多个效果图标的布局和显示
 */

import * as THREE from 'three';
import EffectIconComponent from './EffectIconComponent.js';

class EffectDisplayBarComponent {
  constructor(effects = [], options = {}) {
    // 确保effects是数组
    this.effects = Array.isArray(effects) ? effects : [];
    this.options = {
      iconSize: 32,
      gap: 4,
      maxColumns: 6,
      ...options
    };

    this.group = new THREE.Group();
    this.effectIcons = new Map(); // effectId -> EffectIconComponent

    this._build();
  }

  /**
   * 构建效果图标网格
   */
  _build() {
    const { iconSize, gap, maxColumns } = this.options;

    let col = 0;
    let row = 0;

    // 如果没有效果，直接返回
    if (this.effects.length === 0) {
      return;
    }

    for (const effect of this.effects) {
      const iconComponent = new EffectIconComponent(effect, { iconSize });
      const iconGroup = iconComponent.getObject3D();

      // 计算位置（网格布局）
      const x = col * (iconSize + gap);
      const y = -row * (iconSize + gap);
      iconGroup.position.set(x, y, 0);

      this.group.add(iconGroup);
      this.effectIcons.set(effect.effectId || effect.effectName, iconComponent);

      // 更新列和行
      col++;
      if (col >= maxColumns) {
        col = 0;
        row++;
      }
    }
  }

  /**
   * 更新效果列表
   */
  updateEffects(newEffects) {
    // 简单策略：清空重建
    // TODO: 优化为增量更新
    this._clear();
    this.effects = newEffects;
    this._build();
  }

  /**
   * 更新单个效果
   */
  updateEffect(effectId, newEffectData) {
    const icon = this.effectIcons.get(effectId);
    if (icon) {
      icon.update(newEffectData);
    }
  }

  /**
   * 清空所有图标
   */
  _clear() {
    for (const [id, icon] of this.effectIcons) {
      this.group.remove(icon.getObject3D());
      icon.dispose();
    }
    this.effectIcons.clear();
  }

  /**
   * 获取Group对象
   */
  getObject3D() {
    return this.group;
  }

  /**
   * 清理资源
   */
  dispose() {
    this._clear();
  }
}

export default EffectDisplayBarComponent;

