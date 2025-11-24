/**
 * ColoredTextComponent - 彩色文本组件
 *
 * 职责：
 * - 解析并渲染带颜色标记的文本
 * - 管理多个文本段落的布局
 * - 支持自动换行
 */

import * as THREE from 'three';
import { getTextFactory } from '../../text/TextFactory.js';
import { parseColoredText } from '../../text/ColoredTextParser.js';

class ColoredTextComponent {
  constructor(text, options = {}) {
    this.text = text;
    this.options = {
      fontSize: 14,
      maxWidth: 180,
      lineHeight: 1.2,
      align: 'left',
      ...options
    };

    this.group = new THREE.Group();
    this.textMeshes = [];
    this.textFactory = getTextFactory();

    this._build();
  }

  /**
   * 构建文本段落
   */
  _build() {
    // 清理旧的文本节点
    this._dispose();

    // 解析彩色文本
    const segments = parseColoredText(this.text);

    // 创建文本节点
    let currentX = 0;
    let currentY = 0;
    const fontSize = this.options.fontSize;
    const lineHeight = this.options.lineHeight;
    const maxWidth = this.options.maxWidth;

    for (const segment of segments) {
      const textMesh = this.textFactory.createText(segment.text, {
        fontSize,
        color: segment.color,
        anchorX: 'left',
        anchorY: 'top',
        maxWidth: maxWidth - currentX // 剩余宽度
      });

      // 等待同步完成后获取实际宽度
      textMesh.sync(() => {
        const bounds = textMesh.textRenderInfo?.blockBounds;
        if (bounds) {
          const width = bounds[2] - bounds[0];
          const height = bounds[3] - bounds[1];

          // 检查是否需要换行
          if (currentX + width > maxWidth && currentX > 0) {
            currentX = 0;
            currentY -= fontSize * lineHeight;
          }

          // 设置位置
          textMesh.position.set(currentX, currentY, 0);

          // 更新偏移
          currentX += width;

          // 如果超出最大宽度，换行
          if (currentX > maxWidth) {
            currentX = 0;
            currentY -= fontSize * lineHeight;
          }
        }
      });

      this.group.add(textMesh);
      this.textMeshes.push(textMesh);
    }
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
    for (const mesh of this.textMeshes) {
      this.group.remove(mesh);
      this.textFactory.dispose(mesh);
    }
    this.textMeshes = [];
  }

  /**
   * 销毁组件
   */
  dispose() {
    this._dispose();
    // Group会由EntityStore清理
  }
}

export default ColoredTextComponent;

