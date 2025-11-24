/**
 * PlayerPanelEntity - 玩家状态面板实体构造器
 *
 * 创建包含以下组件的面板：
 * - 基础信息（名称、等阶、金钱）
 * - 生命值条
 * - 魔力条
 * - 行动点条
 * - 效果图标栏
 */

import * as THREE from 'three';
import { getTextFactory } from '../text/TextFactory.js';
import HealthBarComponent from '../ecs/components/HealthBarComponent.js';
import ManaBarComponent from '../ecs/components/ManaBarComponent.js';
import ActionPointsBarComponent from '../ecs/components/ActionPointsBarComponent.js';
import EffectDisplayBarComponent from '../ecs/components/EffectDisplayBarComponent.js';

class PlayerPanelEntity {
  constructor(playerData, options = {}) {
    this.playerData = playerData;
    this.options = {
      width: 300,
      height: 252,
      padding: 10,
      ...options
    };

    this.group = new THREE.Group();
    this.textFactory = getTextFactory();
    this.components = {};

    this._build();
  }

  /**
   * 构建面板
   */
  _build() {
    const { padding } = this.options;
    let yOffset = 0;

    // 创建背景面板
    this._createBackground();

    // 1. 基础信息文本
    yOffset = 110; // 从顶部开始
    this._createBasicStats(yOffset);

    // 2. 生命值条
    yOffset -= 30;
    const healthBar = new HealthBarComponent(
      this.playerData.health,
      this.playerData.maxHealth,
      { width: 280 }
    );
    const healthGroup = healthBar.getObject3D();
    healthGroup.position.set(0, yOffset, 0.1);
    this.group.add(healthGroup);
    this.components.healthBar = healthBar;

    // 3. 魔力条
    yOffset -= 28;
    const manaBar = new ManaBarComponent(
      this.playerData.mana,
      this.playerData.maxMana,
      { width: 280 }
    );
    const manaGroup = manaBar.getObject3D();
    manaGroup.position.set(0, yOffset, 0.1);
    this.group.add(manaGroup);
    this.components.manaBar = manaBar;

    // 4. 行动点条
    yOffset -= 26;
    const apBar = new ActionPointsBarComponent(
      this.playerData.actionPoints,
      this.playerData.actionPoints, // 初始最大值等于当前值
      { width: 280 }
    );
    const apGroup = apBar.getObject3D();
    apGroup.position.set(0, yOffset, 0.1);
    this.group.add(apGroup);
    this.components.apBar = apBar;

    // 5. 效果图标栏
    yOffset -= 40;
    const effectBar = new EffectDisplayBarComponent(
      this.playerData.effects || [],
      { iconSize: 28, maxColumns: 8 }
    );
    const effectGroup = effectBar.getObject3D();
    effectGroup.position.set(-140, yOffset, 0.1);
    this.group.add(effectGroup);
    this.components.effectBar = effectBar;
  }

  /**
   * 创建背景面板
   */
  _createBackground() {
    const bgGeometry = new THREE.PlaneGeometry(this.options.width, this.options.height);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.85
    });
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    this.group.add(bgMesh);

    // 边框
    const borderGeometry = new THREE.EdgesGeometry(bgGeometry);
    const borderMaterial = new THREE.LineBasicMaterial({ color: 0x4a4a4a });
    const border = new THREE.LineSegments(borderGeometry, borderMaterial);
    border.position.z = 0.05;
    this.group.add(border);
  }

  /**
   * 创建基础信息文本
   */
  _createBasicStats(yOffset) {
    // 名称
    const nameText = this.textFactory.createText(
      this.playerData.name || '玩家',
      {
        fontSize: 18,
        color: 0xffffff,
        anchorX: 'center',
        anchorY: 'middle',
        outlineWidth: 2
      }
    );
    nameText.position.set(0, yOffset, 0.1);
    this.group.add(nameText);
    this.components.nameText = nameText;

    // 等阶和金钱
    const infoText = this.textFactory.createText(
      `等阶${this.playerData.tier || 0} | 金钱:${this.playerData.money || 0}`,
      {
        fontSize: 14,
        color: 0xcccccc,
        anchorX: 'center',
        anchorY: 'middle'
      }
    );
    infoText.position.set(0, yOffset - 22, 0.1);
    this.group.add(infoText);
    this.components.infoText = infoText;
  }

  /**
   * 更新面板数据
   */
  update(newPlayerData) {
    this.playerData = newPlayerData;

    // 更新各个组件
    if (this.components.healthBar) {
      this.components.healthBar.setHealth(newPlayerData.health, newPlayerData.maxHealth);
    }
    if (this.components.manaBar) {
      this.components.manaBar.setMana(newPlayerData.mana, newPlayerData.maxMana);
    }
    if (this.components.apBar) {
      this.components.apBar.setActionPoints(newPlayerData.actionPoints, newPlayerData.actionPoints);
    }
    if (this.components.effectBar && newPlayerData.effects) {
      this.components.effectBar.updateEffects(newPlayerData.effects);
    }
    if (this.components.infoText) {
      this.textFactory.updateText(
        this.components.infoText,
        `等阶${newPlayerData.tier || 0} | 金钱:${newPlayerData.money || 0}`
      );
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
  }
}

export default PlayerPanelEntity;

