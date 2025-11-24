/**
 * ColoredTextComponent - 彩色文本组件
 *
 * 职责：
 * - 解析并渲染带颜色标记的文本
 * - 支持嵌入效果图标、命名实体图标
 * - 管理多个文本段落的布局
 * - 支持自动换行
 */

import * as THREE from 'three';
import { getTextFactory } from '../../text/TextFactory.js';
import { parseColoredText } from '../../text/ColoredTextParser.js';
import effectDescriptions from '../../../data/effectDescription.js';
import namedEntities from '../../../data/namedEntities.js';

class ColoredTextComponent {
  constructor(text, options = {}) {
    this.text = text;
    this.options = {
      fontSize: 14,
      maxWidth: 180,
      lineHeight: 1.2,
      align: 'left',
      iconSize: 16, // 内联图标大小
      ...options
    };

    this.group = new THREE.Group();
    this.elements = []; // 存储所有元素（文本、图标等）
    this.textFactory = getTextFactory();

    this._build();
  }

  /**
   * 构建文本段落（包含内联图标）
   */
  _build() {
    // 清理旧的元素
    this._dispose();

    // 解析彩色文本
    const segments = parseColoredText(this.text);

    // 使用简单的从左到右布局
    let currentX = 0;
    let currentY = 0;
    const fontSize = this.options.fontSize;
    const iconSize = this.options.iconSize;
    const lineHeight = this.options.lineHeight;
    const maxWidth = this.options.maxWidth;

    for (const segment of segments) {
      if (segment.type === 'text' || segment.type === 'color') {
        // 文本段落
        const textContent = segment.text || '';
        if (!textContent) continue;

        const textMesh = this.textFactory.createText(textContent, {
          fontSize,
          color: segment.color,
          anchorX: 'left',
          anchorY: 'middle', // 改为middle对齐，与图标对齐
          maxWidth: maxWidth
        });

        // 立即设置位置（不等待sync）
        textMesh.position.set(currentX, currentY, 0);
        this.group.add(textMesh);
        this.elements.push({ type: 'text', object: textMesh });

        // 估算文本宽度（简单估算：每个字符约为fontSize * 0.6）
        const estimatedWidth = textContent.length * fontSize * 0.6;
        currentX += estimatedWidth;

      } else if (segment.type === 'effect') {
        // 效果图标
        const effectIcon = this._createEffectIcon(segment.effectName, iconSize);
        effectIcon.position.set(currentX, currentY - iconSize / 2, 0); // 垂直居中
        this.group.add(effectIcon);
        this.elements.push({ type: 'icon', object: effectIcon });

        currentX += iconSize + 2;

      } else if (segment.type === 'named') {
        // 命名实体图标
        const namedIcon = this._createNamedEntityIcon(segment.entityName, iconSize);
        namedIcon.position.set(currentX, currentY - iconSize / 2, 0); // 垂直居中
        this.group.add(namedIcon);
        this.elements.push({ type: 'icon', object: namedIcon });

        currentX += iconSize + 2;

      } else if (segment.type === 'skill') {
        // 技能图标（暂时用文本替代）
        const skillText = this.textFactory.createText(
          `[${segment.skillName}${segment.powerDelta ? (segment.powerDelta > 0 ? '+' : '') + segment.powerDelta : ''}]`,
          {
            fontSize: fontSize * 0.9,
            color: 0xffdd88,
            anchorX: 'left',
            anchorY: 'middle'
          }
        );

        skillText.position.set(currentX, currentY, 0);
        this.group.add(skillText);
        this.elements.push({ type: 'text', object: skillText });

        const skillNameLength = segment.skillName.length + (segment.powerDelta ? 2 : 0);
        currentX += skillNameLength * fontSize * 0.6;
      }

      // 简单换行检测
      if (currentX > maxWidth) {
        currentX = 0;
        currentY -= fontSize * lineHeight;
      }
    }
  }

  /**
   * 创建效果图标的内联显示
   */
  _createEffectIcon(effectName, size) {
    const group = new THREE.Group();
    const effectInfo = effectDescriptions[effectName] || {};

    // 创建小型图标（使用Canvas绘制emoji）
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // 背景色
    ctx.fillStyle = effectInfo.color || '#888888';
    ctx.fillRect(0, 0, 32, 32);

    // 绘制图标
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(effectInfo.icon || '?', 16, 16);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(size, size, 1);

    group.add(sprite);
    group.userData = { type: 'effect', effectName, canvas, texture };

    return group;
  }

  /**
   * 创建命名实体图标的内联显示
   */
  _createNamedEntityIcon(entityName, size) {
    const group = new THREE.Group();
    const entityInfo = namedEntities[entityName] || {};

    // 创建小型图标
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // 背景色
    const colorMap = {
      'purple': '#9370DB',
      'red': '#FF4444',
      'orange': '#FF8800',
      'blue': '#4444FF',
      'gold': '#FFD700',
      'green': '#44FF44',
      'aqua': '#00FFFF',
      'brown': '#8B4513',
      'yellow': '#FFFF00'
    };
    ctx.fillStyle = colorMap[entityInfo.color] || '#888888';
    ctx.fillRect(0, 0, 32, 32);

    // 绘制图标
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entityInfo.icon || '?', 16, 16);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(size, size, 1);

    group.add(sprite);
    group.userData = { type: 'named', entityName, canvas, texture };

    return group;
  }

  /**
   * 更新文本内容
   */
  update(newText) {
    if (this.text === newText) return;

    this.text = newText;
    this._build();
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
  _dispose() {
    for (const element of this.elements) {
      this.group.remove(element.object);

      if (element.type === 'text') {
        this.textFactory.dispose(element.object);
      } else if (element.type === 'icon') {
        // 清理图标资源
        const userData = element.object.userData;
        if (userData.texture) userData.texture.dispose();
        if (userData.canvas) userData.canvas = null;

        element.object.traverse((child) => {
          if (child.material) {
            if (child.material.map) child.material.map.dispose();
            child.material.dispose();
          }
          if (child.geometry) child.geometry.dispose();
        });
      }
    }
    this.elements = [];
  }

  /**
   * 销毁组件
   */
  dispose() {
    this._dispose();
  }
}

export default ColoredTextComponent;

