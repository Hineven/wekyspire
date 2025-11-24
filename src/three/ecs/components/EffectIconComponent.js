/**
 * EffectIconComponent - 效果图标组件
 *
 * 职责：
 * - 渲染效果图标（Sprite）
 * - 显示效果层数（Text）
 * - 支持图标更新
 */

import * as THREE from 'three';
import { getTextFactory } from '../../text/TextFactory.js';

class EffectIconComponent {
  constructor(effectData, options = {}) {
    this.effectData = effectData;
    this.options = {
      iconSize: 32,
      fontSize: 14,
      ...options
    };

    this.group = new THREE.Group();
    this.iconSprite = null;
    this.stackText = null;
    this.textFactory = getTextFactory();

    this._build();
  }

  /**
   * 构建效果图标
   */
  _build() {
    const { iconSize, fontSize } = this.options;

    // 创建图标Sprite
    // TODO: 实际应该从effectDescriptions加载对应的图标纹理
    // 暂时使用纯色方块作为占位
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // 绘制图标占位（使用效果名称首字母）
    ctx.fillStyle = this._getEffectColor(this.effectData.effectName);
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.effectData.effectName[0] || '?', 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    this.iconSprite = new THREE.Sprite(spriteMaterial);
    this.iconSprite.scale.set(iconSize, iconSize, 1);
    this.group.add(this.iconSprite);

    // 创建层数文本
    if (this.effectData.stack && this.effectData.stack > 1) {
      this.stackText = this.textFactory.createText(
        String(this.effectData.stack),
        {
          fontSize,
          color: 0xffffff,
          anchorX: 'right',
          anchorY: 'bottom',
          outlineWidth: 2,
          outlineColor: 0x000000
        }
      );
      this.stackText.position.set(iconSize / 2 - 2, -iconSize / 2 + 2, 0.1);
      this.group.add(this.stackText);
    }
  }

  /**
   * 根据效果名称获取颜色
   */
  _getEffectColor(effectName) {
    const colorMap = {
      '燃烧': '#ff4500',
      '冰冻': '#00bfff',
      '中毒': '#32cd32',
      '虚弱': '#9370db',
      '强化': '#ffd700',
      '护盾': '#4169e1'
    };

    // 查找包含关键字的效果
    for (const [key, color] of Object.entries(colorMap)) {
      if (effectName.includes(key)) {
        return color;
      }
    }

    return '#888888'; // 默认灰色
  }

  /**
   * 更新效果数据
   */
  update(newEffectData) {
    this.effectData = newEffectData;

    // 更新层数文本
    if (this.stackText && newEffectData.stack) {
      this.textFactory.updateText(this.stackText, String(newEffectData.stack));
    } else if (!this.stackText && newEffectData.stack && newEffectData.stack > 1) {
      // 重新构建（添加了层数）
      this.group.clear();
      this._build();
    } else if (this.stackText && (!newEffectData.stack || newEffectData.stack <= 1)) {
      // 移除层数文本
      this.group.remove(this.stackText);
      this.textFactory.dispose(this.stackText);
      this.stackText = null;
    }
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
    if (this.iconSprite) {
      this.iconSprite.material.map.dispose();
      this.iconSprite.material.dispose();
    }
    if (this.stackText) {
      this.textFactory.dispose(this.stackText);
    }
  }
}

export default EffectIconComponent;

