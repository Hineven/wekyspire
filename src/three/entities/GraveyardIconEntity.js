/**
 * GraveyardIconEntity - 墓地（焚毁牌堆）图标实体
 *
 * 显示焚毁区卡牌数量
 */

import * as THREE from 'three';
import { getTextFactory } from '../text/TextFactory.js';

class GraveyardIconEntity {
  constructor(graveyardCount = 0, options = {}) {
    this.graveyardCount = graveyardCount;
    this.options = {
      size: 80,
      ...options
    };

    this.group = new THREE.Group();
    this.textFactory = getTextFactory();
    this.components = {};

    this._build();
  }

  /**
   * 构建图标
   */
  _build() {
    const { size } = this.options;

    // 创建图标背景（焚毁效果 - 红色调）
    this._createBurntCardStack();

    // 创建数量文本
    const countText = this.textFactory.createText(String(this.graveyardCount), {
      fontSize: 24,
      color: 0xff6666,
      anchorX: 'center',
      anchorY: 'middle',
      outlineWidth: 3,
      outlineColor: 0x000000
    });
    countText.position.set(0, 0, 0.3);
    this.group.add(countText);
    this.components.countText = countText;

    // 创建标签
    const labelText = this.textFactory.createText('焚毁', {
      fontSize: 12,
      color: 0xffaaaa,
      anchorX: 'center',
      anchorY: 'top'
    });
    labelText.position.set(0, -size / 2 - 5, 0.1);
    this.group.add(labelText);
    this.components.labelText = labelText;
  }

  /**
   * 创建焚毁卡牌堆叠效果
   */
  _createBurntCardStack() {
    const { size } = this.options;

    // 创建2层卡牌表示焚毁堆
    for (let i = 0; i < 2; i++) {
      const offset = i * 4;
      const geometry = new THREE.PlaneGeometry(size, size * 1.3);
      const material = new THREE.MeshBasicMaterial({
        color: 0x4a2a2a, // 深红色调
        transparent: true,
        opacity: 0.7 - i * 0.1
      });
      const card = new THREE.Mesh(geometry, material);
      card.position.set(offset, -offset, i * 0.05);
      this.group.add(card);

      // 边框（红色）
      const borderGeometry = new THREE.EdgesGeometry(geometry);
      const borderMaterial = new THREE.LineBasicMaterial({ color: 0xaa4444 });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial);
      border.position.copy(card.position);
      border.position.z += 0.01;
      this.group.add(border);
    }
  }

  /**
   * 更新墓地数量
   */
  updateCount(count) {
    this.graveyardCount = count;
    if (this.components.countText) {
      this.textFactory.updateText(this.components.countText, String(count));
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
    for (const key in this.components) {
      const component = this.components[key];
      if (component && component.dispose) {
        component.dispose();
      } else if (component && this.textFactory.dispose) {
        this.textFactory.dispose(component);
      }
    }
  }
}

export default GraveyardIconEntity;

