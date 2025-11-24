/**
 * ActionPointsBarComponent - 行动点条组件
 *
 * 继承BarComponent，金色填充
 */

import BarComponent from './BarComponent.js';
import { getTextFactory } from '../../text/TextFactory.js';

class ActionPointsBarComponent extends BarComponent {
  constructor(currentAP, maxAP, options = {}) {
    super({
      width: 150,
      height: 16,
      maxValue: maxAP,
      currentValue: currentAP,
      backgroundColor: 0x2a2a1a,
      fillColor: 0xffd700, // 金色
      borderColor: 0xffee88,
      ...options
    });

    this.textFactory = getTextFactory();
    this.apText = null;

    this._createAPText();
  }

  /**
   * 创建行动点文本
   */
  _createAPText() {
    const text = `${Math.floor(this.options.currentValue)}/${this.options.maxValue}`;
    this.apText = this.textFactory.createText(text, {
      fontSize: 12,
      color: 0xffffaa,
      anchorX: 'center',
      anchorY: 'middle',
      outlineWidth: 2,
      outlineColor: 0x000000
    });
    this.apText.position.z = 0.3;
    this.group.add(this.apText);
  }

  /**
   * 设置行动点
   */
  setActionPoints(current, max) {
    if (max !== undefined) {
      this.options.maxValue = max;
    }
    this.setValue(current);

    // 更新文本
    if (this.apText) {
      const text = `${Math.floor(current)}/${this.options.maxValue}`;
      this.textFactory.updateText(this.apText, text);
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    super.dispose();
    if (this.apText) {
      this.textFactory.dispose(this.apText);
    }
  }
}

export default ActionPointsBarComponent;

