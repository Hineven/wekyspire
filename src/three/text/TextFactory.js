/**
 * TextFactory - Troika文本工厂
 *
 * 职责：
 * - 创建和管理Troika Text节点
 * - 统一文本样式
 * - 字体管理
 */

import { Text } from 'troika-three-text';

class TextFactory {
  constructor() {
    this.defaultFontSize = 16;
    this.defaultColor = 0xffffff;
    this.textCache = new Map(); // 文本对象缓存（用于对象池）

    console.log('[TextFactory] Initialized');
  }

  /**
   * 创建文本节点
   * @param {string} text - 文本内容
   * @param {Object} style - 样式配置
   * @returns {Text}
   */
  createText(text, style = {}) {
    const textMesh = new Text();

    // 设置文本内容
    textMesh.text = text;

    // 应用样式
    this.applyStyle(textMesh, style);

    // 同步几何体（必须调用）
    textMesh.sync();

    return textMesh;
  }

  /**
   * 应用样式到文本对象
   * @param {Text} textMesh - 文本对象
   * @param {Object} style - 样式配置
   */
  applyStyle(textMesh, style) {
    const {
      fontSize = this.defaultFontSize,
      color = this.defaultColor,
      align = 'center',
      anchorX = 'center',
      anchorY = 'middle',
      maxWidth = null,
      lineHeight = 1.2,
      letterSpacing = 0,
      outlineWidth = 0,
      outlineColor = 0x000000,
      outlineOpacity = 1,
      strokeWidth = 0,
      strokeColor = 0x000000,
      fillOpacity = 1
    } = style;

    textMesh.fontSize = fontSize;
    textMesh.color = color;
    textMesh.textAlign = align;
    textMesh.anchorX = anchorX;
    textMesh.anchorY = anchorY;
    textMesh.lineHeight = lineHeight;
    textMesh.letterSpacing = letterSpacing;

    if (maxWidth !== null) {
      textMesh.maxWidth = maxWidth;
    }

    // 描边
    if (outlineWidth > 0) {
      textMesh.outlineWidth = `${outlineWidth}%`;
      textMesh.outlineColor = outlineColor;
      textMesh.outlineOpacity = outlineOpacity;
    }

    // 笔画
    if (strokeWidth > 0) {
      textMesh.strokeWidth = `${strokeWidth}%`;
      textMesh.strokeColor = strokeColor;
    }

    textMesh.fillOpacity = fillOpacity;
  }

  /**
   * 更新文本内容
   * @param {Text} textMesh - 文本对象
   * @param {string} newText - 新文本
   */
  updateText(textMesh, newText) {
    textMesh.text = newText;
    textMesh.sync();
  }

  /**
   * 更新文本样式
   * @param {Text} textMesh - 文本对象
   * @param {Object} style - 新样式
   */
  updateStyle(textMesh, style) {
    this.applyStyle(textMesh, style);
    textMesh.sync();
  }

  /**
   * 创建彩色文本段落
   * @param {Array} segments - 文本段落数组 [{text, color}, ...]
   * @param {Object} baseStyle - 基础样式
   * @returns {THREE.Group}
   */
  createColoredText(segments, baseStyle = {}) {
    const group = new THREE.Group();
    let offsetX = 0;

    const fontSize = baseStyle.fontSize || this.defaultFontSize;
    const lineHeight = baseStyle.lineHeight || 1.2;

    for (const segment of segments) {
      const textMesh = this.createText(segment.text, {
        ...baseStyle,
        color: segment.color || this.defaultColor,
        anchorX: 'left',
        anchorY: 'middle'
      });

      // 定位
      textMesh.position.x = offsetX;

      group.add(textMesh);

      // 计算下一个段落的偏移（需要等待sync完成后获取宽度）
      // 这里暂时使用估算，实际应该在sync回调中处理
      offsetX += segment.text.length * fontSize * 0.6; // 粗略估算
    }

    return group;
  }

  /**
   * 清理文本对象
   * @param {Text} textMesh - 文本对象
   */
  dispose(textMesh) {
    if (textMesh && textMesh.dispose) {
      textMesh.dispose();
    }
  }
}

// 单例模式
let textFactoryInstance = null;

export function getTextFactory() {
  if (!textFactoryInstance) {
    textFactoryInstance = new TextFactory();
  }
  return textFactoryInstance;
}

export default TextFactory;

