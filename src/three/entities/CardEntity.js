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
import ColoredTextComponent from '../ecs/components/ColoredTextComponent.js';
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
    // 设置卡牌组的renderOrder，确保渲染顺序正确
    this.group.renderOrder = 1;
    this.textFactory = getTextFactory();
    this.components = {};

    this._build();
  }

  /**
   * 构建卡牌
   */
  _build() {
    // 卡牌使用局部坐标系，所有子元素相对于this.group定位
    // z坐标分层：
    // 0: 背景
    // 0.01: 装饰层（边框等）
    // 0.02: 文本和图标

    // 1. 创建背景
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

    // 背景在最底层，z=0
    mesh.position.z = 0;
    
    // 确保背景渲染在所有子元素之下
    mesh.renderOrder = 0;

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
    titleText.position.set(0, 110, 0.02);
    titleText.renderOrder = 2;

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
      subtitleText.position.set(0, 88, 0.02);
      subtitleText.renderOrder = 2;

      this.group.add(subtitleText);
      this.components.subtitleText = subtitleText;
    }
  }

  /**
   * 创建描述文本
   */
  _createDescription() {
    const description = this.skillData.description || '';

    // 使用ColoredTextComponent处理描述文本（支持彩色文本和图标）
    const coloredTextComponent = new ColoredTextComponent(description, {
      fontSize: 12,
      maxWidth: 170,
      iconSize: 12,
      lineHeight: 1.4
    });

    const descGroup = coloredTextComponent.getObject3D();
    descGroup.position.set(-85, 50, 0.02);
    descGroup.renderOrder = 2;
    this.group.add(descGroup);
    this.components.descGroup = descGroup;
    this.components.coloredText = coloredTextComponent;
  }

  /**
   * 创建费用图标
   */
  _createCostIcons() {
    const costs = this.skillData.costs || {};
    const costGroup = new THREE.Group();
    costGroup.renderOrder = 2;

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

    costGroup.position.set(0, -100, 0.02);
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
      opacity: 0.8,
      depthTest: true,
      depthWrite: true
    });
    const circle = new THREE.Mesh(circleGeometry, circleMaterial);
    circle.position.z = 0;
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
    valueText.position.z = 0.01;
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
    tierText.position.set(85, 110, 0.02);
    tierText.renderOrder = 2;
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
    featureGroup.renderOrder = 2;

    for (let i = 0; i < Math.min(features.length, 3); i++) {
      const feature = features[i];
      const icon = this._createFeatureIcon(feature);
      icon.position.x = i * 25;
      featureGroup.add(icon);
    }

    featureGroup.position.set(-80, -120, 0.02);
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
      opacity: 0.7,
      depthTest: true,
      depthWrite: true
    });
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.z = 0;
    group.add(box);

    // 特性首字母
    const featureText = this.textFactory.createText(feature[0] || '?', {
      fontSize: 12,
      color: 0xffffff,
      anchorX: 'center',
      anchorY: 'middle'
    });
    featureText.position.z = 0.01;
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

    // 更新副标题
    if (this.components.subtitleText) {
      const subtitle = newSkillData.subtitle || '';
      if (subtitle) {
        this.textFactory.updateText(this.components.subtitleText, subtitle);
      } else {
        // 如果副标题为空，隐藏或移除
        this.components.subtitleText.visible = false;
      }
    }

    // 更新描述文本
    if (this.components.coloredText) {
      this.components.coloredText.update(newSkillData.description || '');
    }

    // 更新费用图标
    this._updateCostIcons();

    // 更新等阶标签
    if (this.components.tierText) {
      const tier = newSkillData.tier || 1;
      this.textFactory.updateText(this.components.tierText, `T${tier}`);
    }

    // 更新特性图标
    this._updateFeatures();
  }

  /**
   * 更新费用图标
   */
  _updateCostIcons() {
    const costs = this.skillData.costs || {};
    
    // 移除旧的费用图标
    if (this.components.costGroup) {
      this.components.costGroup.children.forEach(child => {
        this.components.costGroup.remove(child);
        // 清理材质和几何体
        if (child.material) {
          child.material.dispose();
        }
        if (child.geometry) {
          child.geometry.dispose();
        }
      });
    }

    let offsetX = -80;

    // 魔力费用
    if (costs.mana) {
      const manaIcon = this._createCostIcon('M', costs.mana, 0x0088ff);
      manaIcon.position.x = offsetX;
      this.components.costGroup.add(manaIcon);
      offsetX += 30;
    }

    // 行动点费用
    if (costs.actionPoints) {
      const apIcon = this._createCostIcon('A', costs.actionPoints, 0xffd700);
      apIcon.position.x = offsetX;
      this.components.costGroup.add(apIcon);
      offsetX += 30;
    }
  }

  /**
   * 更新特性图标
   */
  _updateFeatures() {
    const features = this.skillData.features || [];
    
    // 移除旧的特性图标
    if (this.components.featureGroup) {
      this.components.featureGroup.children.forEach(child => {
        this.components.featureGroup.remove(child);
        // 清理材质和几何体
        if (child.material) {
          child.material.dispose();
        }
        if (child.geometry) {
          child.geometry.dispose();
        }
      });
    }

    for (let i = 0; i < Math.min(features.length, 3); i++) {
      const feature = features[i];
      const icon = this._createFeatureIcon(feature);
      icon.position.x = i * 25;
      this.components.featureGroup.add(icon);
    }
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
   * 设置高亮效果
   * @param {number} intensity - 高亮强度 (0.0 - 1.0)
   */
  setHighlight(intensity) {
    if (this.components.background) {
      this.components.background.material.setHighlight(intensity);
    }
  }

  /**
   * 设置冷却效果
   * @param {number} progress - 冷却进度 (0.0 - 1.0)
   */
  setCooldown(progress) {
    if (this.components.background) {
      this.components.background.material.setCooldownProgress(progress);
    }
  }

  /**
   * 设置焚毁效果
   * @param {number} progress - 焚毁进度 (0.0 - 1.0)
   */
  setBurn(progress) {
    if (this.components.background) {
      this.components.background.material.setBurnProgress(progress);
    }
  }

  /**
   * 设置闪光效果
   * @param {number} intensity - 闪光强度 (0.0 - 1.0)
   */
  setFlash(intensity) {
    if (this.components.background) {
      this.components.background.material.setFlashIntensity(intensity);
    }
  }

  /**
   * 重置所有特效
   */
  resetEffects() {
    if (this.components.background) {
      this.components.background.material.resetEffects();
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

