/**
 * CardEntity - 卡牌实体构造器
 *
 * 创建完整的卡牌Three.js实体，包含：
 * - 背景卡面（CardMaterial）
 * - 标题文本
 * - 描述文本（彩色）
 * - 费用图标
 * - 等阶徽章
 * - 特性图标
 */

import * as THREE from 'three';
import { getTextFactory } from '../text/TextFactory.js';
import { parseColoredText } from '../text/ColoredTextParser.js';
import CardMaterial from '../materials/CardMaterial.js';

class CardEntity {
  constructor(skillData, options = {}) {
    this.skillData = skillData;
    this.options = {
      width: 198,
      height: 266,
      ...options
    };

    this.group = new THREE.Group();
    this.textFactory = getTextFactory();
    this.components = {};

    this._build();
  }

  /**
   * 构建卡牌
   */
  _build() {
    const { width, height } = this.options;

    // 1. 创建背景卡面
    this._createBackground();

    // 2. 创建标题
    this._createTitle();

    // 3. 创建描述文本
    this._createDescription();

    // 4. 创建费用图标
    this._createCostIcons();

    // 5. 创建等阶标签
    this._createTierBadge();

    // 6. 创建特性图标
    this._createFeatures();
  }

  /**
   * 创建背景卡面
   */
  _createBackground() {
    const { width, height } = this.options;
    const tier = this.skillData.tier || 1;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new CardMaterial(tier);
    const mesh = new THREE.Mesh(geometry, material);

    this.group.add(mesh);
    this.components.background = { mesh, material };
  }

  /**
   * 创建标题
   */
  _createTitle() {
    const name = this.skillData.name || '未命名';
    const subtitle = this.skillData.subtitle || '';

    // 主标题
    const titleText = this.textFactory.createText(name, {
      fontSize: 18,
      color: 0xffffff,
      anchorX: 'center',
      anchorY: 'top',
      outlineWidth: 2,
      outlineColor: 0x000000,
      maxWidth: 180
    });
    titleText.position.set(0, 110, 0.1);
    this.group.add(titleText);
    this.components.titleText = titleText;

    // 副标题
    if (subtitle) {
      const subtitleText = this.textFactory.createText(subtitle, {
        fontSize: 12,
        color: 0xaaaaaa,
        anchorX: 'center',
        anchorY: 'top',
        maxWidth: 180
      });
      subtitleText.position.set(0, 88, 0.1);
      this.group.add(subtitleText);
      this.components.subtitleText = subtitleText;
    }
  }

  /**
   * 创建描述文本
   */
  _createDescription() {
    const description = this.skillData.description || '';

    // 解析彩色文本
    const segments = parseColoredText(description);
    const descGroup = new THREE.Group();

    let offsetY = 0;
    for (const segment of segments) {
      const text = this.textFactory.createText(segment.text, {
        fontSize: 14,
        color: segment.color,
        anchorX: 'left',
        anchorY: 'top',
        maxWidth: 170
      });
      text.position.set(-85, offsetY, 0);
      descGroup.add(text);

      // 简单换行逻辑（实际应该根据文本宽度计算）
      if (segment.text.length > 15) {
        offsetY -= 20;
      }
    }

    descGroup.position.set(0, 50, 0.1);
    this.group.add(descGroup);
    this.components.descGroup = descGroup;
  }

  /**
   * 创建费用图标
   */
  _createCostIcons() {
    const costs = this.skillData.costs || {};
    const costGroup = new THREE.Group();

    let offsetX = -80;

    // 魔力费用
    if (costs.mana) {
      const manaIcon = this._createCostIcon('M', costs.mana, 0x0088ff);
      manaIcon.position.x = offsetX;
      costGroup.add(manaIcon);
      offsetX += 30;
    }

    // 行动点费用
    if (costs.actionPoints) {
      const apIcon = this._createCostIcon('A', costs.actionPoints, 0xffd700);
      apIcon.position.x = offsetX;
      costGroup.add(apIcon);
      offsetX += 30;
    }

    costGroup.position.set(0, -100, 0.1);
    this.group.add(costGroup);
    this.components.costGroup = costGroup;
  }

  /**
   * 创建单个费用图标
   */
  _createCostIcon(type, value, color) {
    const group = new THREE.Group();

    // 图标背景圆形
    const circleGeometry = new THREE.CircleGeometry(12, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    group.add(circle);

    // 数值文本
    const valueText = this.textFactory.createText(String(value), {
      fontSize: 14,
      color: 0xffffff,
      anchorX: 'center',
      anchorY: 'middle',
      outlineWidth: 2,
      outlineColor: 0x000000
    });
    valueText.position.z = 0.05;
    group.add(valueText);

    return group;
  }

  /**
   * 创建等阶标签
   */
  _createTierBadge() {
    const tier = this.skillData.tier || 1;

    // 等阶星星或数字
    const tierText = this.textFactory.createText(`T${tier}`, {
      fontSize: 12,
      color: 0xffdd88,
      anchorX: 'right',
      anchorY: 'top',
      outlineWidth: 2,
      outlineColor: 0x000000
    });
    tierText.position.set(85, 110, 0.1);
    this.group.add(tierText);
    this.components.tierText = tierText;
  }

  /**
   * 创建特性图标
   */
  _createFeatures() {
    const features = this.skillData.features || [];
    if (features.length === 0) return;

    const featureGroup = new THREE.Group();

    for (let i = 0; i < Math.min(features.length, 3); i++) {
      const feature = features[i];
      const icon = this._createFeatureIcon(feature);
      icon.position.x = i * 25;
      featureGroup.add(icon);
    }

    featureGroup.position.set(-80, -120, 0.1);
    this.group.add(featureGroup);
    this.components.featureGroup = featureGroup;
  }

  /**
   * 创建单个特性图标
   */
  _createFeatureIcon(feature) {
    const group = new THREE.Group();

    // 简单的方块图标
    const boxGeometry = new THREE.PlaneGeometry(20, 20);
    const boxMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.7
    });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    group.add(box);

    // 特性首字母
    const featureText = this.textFactory.createText(feature[0] || '?', {
      fontSize: 12,
      color: 0xffffff,
      anchorX: 'center',
      anchorY: 'middle'
    });
    featureText.position.z = 0.05;
    group.add(featureText);

    return group;
  }

  /**
   * 更新卡牌数据
   */
  update(newSkillData) {
    this.skillData = newSkillData;

    // 更新等阶
    if (this.components.background) {
      this.components.background.material.setTier(newSkillData.tier || 1);
    }

    // 更新标题
    if (this.components.titleText && newSkillData.name) {
      this.textFactory.updateText(this.components.titleText, newSkillData.name);
    }

    // TODO: 更新其他组件
  }

  /**
   * 设置禁用状态
   */
  setDisabled(disabled) {
    if (this.components.background) {
      this.components.background.material.setDisabled(disabled);
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
      }
    }

    // 清理材质
    if (this.components.background) {
      this.components.background.material.dispose();
      this.components.background.mesh.geometry.dispose();
    }
  }
}

export default CardEntity;

