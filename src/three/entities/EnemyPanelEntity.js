/**
 * EnemyPanelEntity - 敌人状态面板实体构造器
 *
 * 创建包含以下组件的面板：
 * - 敌人头像
 * - 名称和副标题
 * - 攻击/防御数值
 * - 生命值条
 * - 效果图标栏
 */

import * as THREE from 'three';
import { getTextFactory } from '../text/TextFactory.js';
import HealthBarComponent from '../ecs/components/HealthBarComponent.js';
import EffectDisplayBarComponent from '../ecs/components/EffectDisplayBarComponent.js';

class EnemyPanelEntity {
  constructor(enemyData, options = {}) {
    this.enemyData = enemyData;
    this.options = {
      width: 280,
      height: 240,
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
    let yOffset = 0;

    // 创建背景面板
    this._createBackground();

    // 1. 敌人头像
    yOffset = 80;
    this._createAvatar(yOffset);

    // 2. 名称
    yOffset = 20;
    const nameText = this.textFactory.createText(
      this.enemyData.name || '敌人',
      {
        fontSize: 18,
        color: 0xff8888,
        anchorX: 'center',
        anchorY: 'middle',
        outlineWidth: 2,
        outlineColor: 0x000000
      }
    );
    nameText.position.set(0, yOffset, 0.1);
    this.group.add(nameText);
    this.components.nameText = nameText;

    // 3. 攻击/防御
    yOffset -= 22;
    const statsText = this.textFactory.createText(
      `攻击:${this.enemyData.attack || 0} | 防御:${this.enemyData.defense || 0}`,
      {
        fontSize: 14,
        color: 0xcccccc,
        anchorX: 'center',
        anchorY: 'middle'
      }
    );
    statsText.position.set(0, yOffset, 0.1);
    this.group.add(statsText);
    this.components.statsText = statsText;

    // 4. 生命值条
    yOffset -= 30;
    const healthBar = new HealthBarComponent(
      this.enemyData.health,
      this.enemyData.maxHealth,
      { width: 260 }
    );
    const healthGroup = healthBar.getObject3D();
    healthGroup.position.set(0, yOffset, 0.1);
    this.group.add(healthGroup);
    this.components.healthBar = healthBar;

    // 5. 效果图标栏
    yOffset -= 40;
    const effectBar = new EffectDisplayBarComponent(
      this.enemyData.effects || [],
      { iconSize: 28, maxColumns: 6 }
    );
    const effectGroup = effectBar.getObject3D();
    effectGroup.position.set(-130, yOffset, 0.1);
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

    // 边框（红色调，表示敌人）
    const borderGeometry = new THREE.EdgesGeometry(bgGeometry);
    const borderMaterial = new THREE.LineBasicMaterial({ color: 0x884444 });
    const border = new THREE.LineSegments(borderGeometry, borderMaterial);
    border.position.z = 0.05;
    this.group.add(border);
  }

  /**
   * 创建敌人头像
   */
  _createAvatar(yOffset) {
    // TODO: 实际应该从enemyData.avatarUrl加载纹理
    // 暂时使用纯色占位
    const avatarSize = 80;
    const avatarGeometry = new THREE.PlaneGeometry(avatarSize, avatarSize);
    const avatarMaterial = new THREE.MeshBasicMaterial({
      color: 0x884444,
      transparent: true,
      opacity: 0.7
    });
    const avatarMesh = new THREE.Mesh(avatarGeometry, avatarMaterial);
    avatarMesh.position.set(0, yOffset, 0.05);
    this.group.add(avatarMesh);

    // 头像边框
    const avatarBorderGeometry = new THREE.EdgesGeometry(avatarGeometry);
    const avatarBorderMaterial = new THREE.LineBasicMaterial({ color: 0xff4444 });
    const avatarBorder = new THREE.LineSegments(avatarBorderGeometry, avatarBorderMaterial);
    avatarBorder.position.set(0, yOffset, 0.06);
    this.group.add(avatarBorder);
  }

  /**
   * 更新面板数据
   */
  update(newEnemyData) {
    this.enemyData = newEnemyData;

    // 更新各个组件
    if (this.components.healthBar) {
      this.components.healthBar.setHealth(newEnemyData.health, newEnemyData.maxHealth);
    }
    if (this.components.effectBar && newEnemyData.effects) {
      this.components.effectBar.updateEffects(newEnemyData.effects);
    }
    if (this.components.statsText) {
      this.textFactory.updateText(
        this.components.statsText,
        `攻击:${newEnemyData.attack || 0} | 防御:${newEnemyData.defense || 0}`
      );
    }
    if (this.components.nameText && newEnemyData.name) {
      this.textFactory.updateText(this.components.nameText, newEnemyData.name);
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

export default EnemyPanelEntity;

