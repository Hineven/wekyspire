/**
 * ManaBarComponent - 魔力条组件
 *
 * 继承BarComponent，蓝色填充
 */

import BarComponent from './BarComponent.js';
import { getTextFactory } from '../../text/TextFactory.js';

class ManaBarComponent extends BarComponent {
  constructor(currentMana, maxMana, options = {}) {
    super({
      width: 200,
      height: 18,
      maxValue: maxMana,
      currentValue: currentMana,
      backgroundColor: 0x1a1a2a,
      fillColor: 0x0088ff, // 蓝色
      borderColor: 0x88ccff,
      ...options
    });

    this.textFactory = getTextFactory();
    this.manaText = null;

    this._createManaText();
  }

  /**
   * 创建魔力文本
   */
  _createManaText() {
    const text = `${Math.floor(this.options.currentValue)}/${this.options.maxValue}`;
    this.manaText = this.textFactory.createText(text, {
      fontSize: 13,
      color: 0xaaccff,
      anchorX: 'center',
      anchorY: 'middle',
      outlineWidth: 2,
      outlineColor: 0x000000
    });
    this.manaText.position.z = 0.3;
    this.group.add(this.manaText);
  }

  /**
   * 设置魔力值
   */
  setMana(current, max) {
    if (max !== undefined) {
      this.options.maxValue = max;
    }
    this.setValue(current);

    // 更新文本
    if (this.manaText) {
      const text = `${Math.floor(current)}/${this.options.maxValue}`;
      this.textFactory.updateText(this.manaText, text);
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    super.dispose();
    if (this.manaText) {
      this.textFactory.dispose(this.manaText);
    }
  }
}

export default ManaBarComponent;

