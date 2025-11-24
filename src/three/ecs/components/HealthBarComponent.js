/**
 * HealthBarComponent - 生命值条组件
 *
 * 继承BarComponent，添加生命值特定的功能
 */

import BarComponent from './BarComponent.js';
import { getTextFactory } from '../../text/TextFactory.js';

class HealthBarComponent extends BarComponent {
  constructor(currentHealth, maxHealth, options = {}) {
    super({
      width: 200,
      height: 20,
      maxValue: maxHealth,
      currentValue: currentHealth,
      backgroundColor: 0x2a2a2a,
      fillColor: 0x00ff00, // 绿色
      borderColor: 0xffffff,
      ...options
    });

    this.textFactory = getTextFactory();
    this.healthText = null;

    this._createHealthText();
    this._updateHealthColor();
  }

  /**
   * 创建生命值文本
   */
  _createHealthText() {
    const text = `${Math.floor(this.options.currentValue)}/${this.options.maxValue}`;
    this.healthText = this.textFactory.createText(text, {
      fontSize: 14,
      color: 0xffffff,
      anchorX: 'center',
      anchorY: 'middle',
      outlineWidth: 2,
      outlineColor: 0x000000
    });
    this.healthText.position.z = 0.3; // 位于进度条之上
    this.group.add(this.healthText);
  }

  /**
   * 根据生命值比例更新颜色
   */
  _updateHealthColor() {
    const ratio = this.options.currentValue / this.options.maxValue;

    let color;
    if (ratio > 0.6) {
      color = 0x00ff00; // 绿色
    } else if (ratio > 0.3) {
      color = 0xffff00; // 黄色
    } else {
      color = 0xff0000; // 红色
    }

    this.setFillColor(color);
  }

  /**
   * 设置生命值
   */
  setHealth(current, max) {
    if (max !== undefined) {
      this.options.maxValue = max;
    }
    this.setValue(current);
    this._updateHealthColor();

    // 更新文本
    if (this.healthText) {
      const text = `${Math.floor(current)}/${this.options.maxValue}`;
      this.textFactory.updateText(this.healthText, text);
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    super.dispose();
    if (this.healthText) {
      this.textFactory.dispose(this.healthText);
    }
  }
}

export default HealthBarComponent;

