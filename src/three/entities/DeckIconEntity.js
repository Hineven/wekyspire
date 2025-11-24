/**
 * DeckIconEntity - 牌库图标实体
 *
 * 显示牌库剩余卡牌数量
 */

import * as THREE from 'three';
import { getTextFactory } from '../text/TextFactory.js';

class DeckIconEntity {
  constructor(deckCount = 0, options = {}) {
    this.deckCount = deckCount;
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

    // 创建图标背景（卡牌堆叠效果）
    this._createCardStack();

    // 创建数量文本
    const countText = this.textFactory.createText(String(this.deckCount), {
      fontSize: 24,
      color: 0xffffff,
      anchorX: 'center',
      anchorY: 'middle',
      outlineWidth: 3,
      outlineColor: 0x000000
    });
    countText.position.set(0, 0, 0.3);
    this.group.add(countText);
    this.components.countText = countText;

    // 创建标签
    const labelText = this.textFactory.createText('牌库', {
      fontSize: 12,
      color: 0xaaaaaa,
      anchorX: 'center',
      anchorY: 'top'
    });
    labelText.position.set(0, -size / 2 - 5, 0.1);
    this.group.add(labelText);
    this.components.labelText = labelText;
  }

  /**
   * 创建卡牌堆叠效果
   */
  _createCardStack() {
    const { size } = this.options;

    // 创建3层卡牌表示堆叠
    for (let i = 0; i < 3; i++) {
      const offset = i * 3;
      const geometry = new THREE.PlaneGeometry(size, size * 1.3);
      const material = new THREE.MeshBasicMaterial({
        color: 0x3a3a3a,
        transparent: true,
        opacity: 0.8 - i * 0.1
      });
      const card = new THREE.Mesh(geometry, material);
      card.position.set(offset, -offset, i * 0.05);
      this.group.add(card);

      // 边框
      const borderGeometry = new THREE.EdgesGeometry(geometry);
      const borderMaterial = new THREE.LineBasicMaterial({ color: 0x888888 });
      const border = new THREE.LineSegments(borderGeometry, borderMaterial);
      border.position.copy(card.position);
      border.position.z += 0.01;
      this.group.add(border);
    }
  }

  /**
   * 更新牌库数量
   */
  updateCount(count) {
    this.deckCount = count;
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

export default DeckIconEntity;

