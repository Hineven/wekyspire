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
    
    // 存储文本段和它们的位置信息
    const textSegments = [];
    
    // 首先创建所有文本段
    for (const segment of segments) {
      const textMesh = new Text();
      textMesh.text = segment.text;
      
      // 应用样式
      this.applyStyle(textMesh, {
        ...baseStyle,
        color: segment.color || this.defaultColor,
        anchorX: 'left',
        anchorY: 'middle'
      });
      
      textSegments.push({
        mesh: textMesh,
        segment
      });
      
      group.add(textMesh);
    }
    
    // 同步所有文本段并计算准确位置
    this._syncColoredTextSegments(textSegments);
    
    return group;
  }

  /**
   * 同步彩色文本段并计算准确位置
   * @param {Array} textSegments - 文本段数组
   */
  _syncColoredTextSegments(textSegments) {
    if (textSegments.length === 0) return;
    
    let processedCount = 0;
    let currentOffsetX = 0;
    
    // 为每个文本段添加sync回调
    textSegments.forEach((item, index) => {
      const { mesh } = item;
      
      // 保存原始的onSync回调
      const originalOnSync = mesh.onSync;
      
      // 设置新的onSync回调来处理位置计算
      mesh.onSync = () => {
        // 调用原始回调（如果有）
        if (originalOnSync) {
          originalOnSync();
        }
        
        // 计算当前文本段的位置
        mesh.position.x = currentOffsetX;
        
        // 更新下一个文本段的偏移量
        // 使用textBounds来获取准确的文本宽度
        if (mesh.textBounds) {
          currentOffsetX += mesh.textBounds.width;
        } else {
          // 后备方案：使用字符数估算
          const fontSize = mesh.fontSize || this.defaultFontSize;
          currentOffsetX += mesh.text.length * fontSize * 0.6;
        }
        
        processedCount++;
        
        // 当所有文本段都处理完成后，再次同步以确保最终位置正确
        if (processedCount === textSegments.length) {
          textSegments.forEach(segment => {
            segment.mesh.sync();
          });
        }
      };
      
      // 首次同步
      mesh.sync();
    });
  }

  /**
   * 更新彩色文本段落
   * @param {THREE.Group} group - 彩色文本组
   * @param {Array} segments - 新的文本段落数组
   * @param {Object} baseStyle - 基础样式
   */
  updateColoredText(group, segments, baseStyle = {}) {
    // 移除旧的文本段
    group.children.forEach(child => {
      if (child instanceof Text) {
        group.remove(child);
        this.dispose(child);
      }
    });
    
    // 创建新的彩色文本段
    const newGroup = this.createColoredText(segments, baseStyle);
    
    // 将新的文本段添加到现有组
    newGroup.children.forEach(child => {
      group.add(child);
    });
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

