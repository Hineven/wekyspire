/**
 * SceneGraphAdapter - 数据到场景的映射适配器
 *
 * 职责：
 * - 监听displayGameState的变化
 * - 创建/更新/销毁对应的Three.js Object3D
 * - 维护实体ID与Object3D的映射关系
 * - 管理锚点坐标系统
 */

import { watch } from 'vue';
import { displayGameState } from '../../data/gameState.js';
import { getEntityStore, EntityType } from './EntityStore.js';
import { getThreeRoot } from '../core/ThreeRoot.js';
import PlayerPanelEntity from '../entities/PlayerPanelEntity.js';
import EnemyPanelEntity from '../entities/EnemyPanelEntity.js';
import CardEntity from '../entities/CardEntity.js';
import DeckIconEntity from '../entities/DeckIconEntity.js';
import GraveyardIconEntity from '../entities/GraveyardIconEntity.js';
import CoordinateConverter from '../utils/CoordinateConverter.js';

class SceneGraphAdapter {
  constructor() {
    this.entityStore = null;
    this.threeRoot = null;
    this.watchers = [];
    this.isInitialized = false;
    this.coordConverter = null;

    // 面板实体引用
    this.playerPanel = null;
    this.enemyPanel = null;

    console.log('[SceneGraphAdapter] Created');
  }

  /**
   * 初始化适配器
   * @param {EntityStore} entityStore - 实体存储
   * @param {ThreeRoot} threeRoot - Three.js根实例
   */
  init(entityStore, threeRoot) {
    this.entityStore = entityStore;
    this.threeRoot = threeRoot;

    // 初始化坐标转换器
    this.coordConverter = new CoordinateConverter(threeRoot.getCamera());

    // 设置初始锚点
    this._setupAnchors();

    // 创建牌库和墓地图标
    this._createDeckAndGraveyardIcons();

    // 设置响应式监听
    this._setupWatchers();

    // 主动创建玩家面板（不等待watch触发）
    if (displayGameState.player) {
      this._updatePlayerPanel(displayGameState.player);
    }

    // 主动创建敌人面板（如果存在敌人）
    if (displayGameState.enemy && displayGameState.enemy.name) {
      this._updateEnemyPanel(displayGameState.enemy);
    }

    // 主动同步初始卡牌（不等待watch触发）
    if (displayGameState.player.skills && displayGameState.player.skills.length > 0) {
      const handIds = displayGameState.player.skills.map(s => s.uniqueID);
      this._syncCards('hand', handIds, []);
      console.log('[SceneGraphAdapter] Initial hand cards synced:', handIds.length);
    }

    if (displayGameState.player.activatedSkills && displayGameState.player.activatedSkills.length > 0) {
      const activatedIds = displayGameState.player.activatedSkills.map(s => s.uniqueID);
      this._syncCards('activated', activatedIds, []);
      console.log('[SceneGraphAdapter] Initial activated skills synced:', activatedIds.length);
    }

    this.isInitialized = true;
    console.log('[SceneGraphAdapter] Initialized');
  }

  /**
   * 创建牌库和墓地图标
   */
  _createDeckAndGraveyardIcons() {
    const scene = this.threeRoot.getScene();
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 创建牌库图标（右下角）
    const deckPos = this.coordConverter.screenToWorld(width - 120, height - 100);
    const deckIcon = new DeckIconEntity(displayGameState.player.deck?.length || 0);
    const deckGroup = deckIcon.getObject3D();
    deckGroup.position.copy(deckPos);
    // 缩放图标到合适大小
    deckGroup.scale.set(0.5, 0.5, 1);
    scene.add(deckGroup);
    const deckEntity = this.entityStore.register('deck-icon', EntityType.ICON, deckGroup);
    deckEntity.addComponent('deckIcon', deckIcon);

    // 创建墓地图标（左下角）
    const graveyardPos = this.coordConverter.screenToWorld(120, height - 100);
    const graveyardIcon = new GraveyardIconEntity(displayGameState.player.burntSkills?.length || 0);
    const graveyardGroup = graveyardIcon.getObject3D();
    graveyardGroup.position.copy(graveyardPos);
    // 缩放图标到合适大小
    graveyardGroup.scale.set(0.5, 0.5, 1);
    scene.add(graveyardGroup);
    const graveyardEntity = this.entityStore.register('graveyard-icon', EntityType.ICON, graveyardGroup);
    graveyardEntity.addComponent('graveyardIcon', graveyardIcon);

    console.log('[SceneGraphAdapter] Deck and graveyard icons created');
  }

  /**
   * 设置初始锚点
   */
  _setupAnchors() {
    // 全局锚点（使用世界坐标）
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 中心锚点
    const centerPos = this.coordConverter.screenToWorld(width / 2, height / 2);
    this.entityStore.setGlobalAnchor('center', centerPos);

    // 牌库锚点（右下角）
    const deckPos = this.coordConverter.screenToWorld(width - 120, height - 120);
    this.entityStore.setGlobalAnchor('deck', deckPos);

    // 坟墓锚点（左下角）
    const graveyardPos = this.coordConverter.screenToWorld(120, height - 120);
    this.entityStore.setGlobalAnchor('graveyard', graveyardPos);

    console.log('[SceneGraphAdapter] Anchors setup complete');
  }

  /**
   * 设置响应式监听器
   */
  _setupWatchers() {
    // 监听玩家手牌变化
    const handWatcher = watch(
      () => displayGameState.player.skills.map(s => s.uniqueID),
      (newIds, oldIds) => {
        this._syncCards('hand', newIds, oldIds);
      },
      { deep: true }
    );
    this.watchers.push(handWatcher);

    // 监听激活技能变化
    const activatedWatcher = watch(
      () => displayGameState.player.activatedSkills.map(s => s.uniqueID),
      (newIds, oldIds) => {
        this._syncCards('activated', newIds, oldIds);
      },
      { deep: true }
    );
    this.watchers.push(activatedWatcher);

    // 监听玩家状态变化（用于面板更新）
    const playerWatcher = watch(
      () => ({
        hp: displayGameState.player.hp,
        maxHp: displayGameState.player.maxHp,
        mana: displayGameState.player.mana,
        maxMana: displayGameState.player.maxMana,
        remainingActionPoints: displayGameState.player.remainingActionPoints,
        maxActionPoints: displayGameState.player.maxActionPoints,
        money: displayGameState.player.money,
        tier: displayGameState.player.tier
      }),
      (newState) => {
        this._updatePlayerPanel(newState);
      },
      { deep: true }
    );
    this.watchers.push(playerWatcher);

    // 监听敌人状态变化
    const enemyWatcher = watch(
      () => displayGameState.enemy,
      (newEnemy) => {
        this._updateEnemyPanel(newEnemy);
      },
      { deep: true }
    );
    this.watchers.push(enemyWatcher);

    console.log('[SceneGraphAdapter] Watchers setup complete');
  }

  /**
   * 同步卡牌实体
   * @param {string} container - 容器名称 'hand' | 'activated'
   * @param {string[]} newIds - 新的卡牌ID列表
   * @param {string[]} oldIds - 旧的卡牌ID列表
   */
  _syncCards(container, newIds, oldIds) {
    if (!this.isInitialized) return;

    const oldSet = new Set(oldIds || []);
    const newSet = new Set(newIds || []);

    // 找出需要移除的卡牌
    for (const id of oldSet) {
      if (!newSet.has(id)) {
        this.entityStore.unregister(id);
      }
    }

    // 找出需要添加的卡牌并先创建实体
    for (const id of newSet) {
      if (!oldSet.has(id)) {
        this._createCardEntity(id, container);
      }
    }

    // 计算并应用布局锚点（在所有卡牌创建后）
    this._updateCardAnchors(container, newIds);

    // 应用锚点到所有卡牌，并设置z坐标
    for (let i = 0; i < newIds.length; i++) {
      const id = newIds[i];
      this._applyAnchorToCard(id);

      // 设置z坐标：每张卡间隔1.0（足够大的间隔）
      // 后面的卡片z值更大，会渲染在上面
      const entity = this.entityStore.getEntity(id);
      if (entity && entity.object3D) {
        const currentPos = entity.object3D.position;
        entity.object3D.position.set(currentPos.x, currentPos.y, i * 1.0);
      }
    }
  }

  /**
   * 应用锚点位置到卡牌
   * @param {string} cardId - 卡牌ID
   */
  _applyAnchorToCard(cardId) {
    const entity = this.entityStore.getEntity(cardId);
    if (!entity || !entity.anchor) return;

    const { x, y, z, scale, rotation } = entity.anchor;
    const object3D = entity.object3D;

    object3D.position.set(x, y, z);
    if (rotation !== undefined) {
      object3D.rotation.z = rotation;
    }
    if (scale !== undefined && scale !== 1.0) {
      object3D.scale.multiplyScalar(scale);
    }
  }

  /**
   * 创建卡牌实体
   * @param {string} cardId - 卡牌ID
   * @param {string} container - 容器名称
   */
  _createCardEntity(cardId, container) {
    const scene = this.threeRoot.getScene();

    // 从displayGameState中查找卡牌数据
    let skillData = null;
    if (container === 'hand') {
      skillData = displayGameState.player.skills.find(s => s.uniqueID === cardId);
    } else if (container === 'activated') {
      skillData = displayGameState.player.activatedSkills.find(s => s.uniqueID === cardId);
    }

    if (!skillData) {
      console.warn(`[SceneGraphAdapter] Card ${cardId} not found in ${container}`);
      return;
    }

    // 创建卡牌实体
    const cardEntity = new CardEntity(skillData);
    const cardGroup = cardEntity.getObject3D();

    // 缩放卡牌到合适大小（卡牌设计尺寸198x266像素）
    const scale = 0.5;
    cardGroup.scale.set(scale, scale, 1);

    // 暂时放在屏幕中心（稍后会被锚点更新）
    cardGroup.position.set(0, 0, 0);

    scene.add(cardGroup);

    // 注册到EntityStore
    const entity = this.entityStore.register(cardId, EntityType.CARD, cardGroup);
    entity.addComponent('card', cardEntity);

    console.log(`[SceneGraphAdapter] Card ${cardId} created in ${container}`);
  }

  /**
   * 更新卡牌布局锚点
   * @param {string} container - 容器名称
   * @param {string[]} cardIds - 卡牌ID列表
   */
  _updateCardAnchors(container, cardIds) {
    const anchors = new Map();
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (container === 'hand') {
      // 手牌扇形布局
      const cardDesignWidth = 198;
      const cardScale = 0.5;
      const cardWidth = cardDesignWidth * cardScale;
      const gap = 10;
      const count = cardIds.length;

      if (count === 0) return;

      const totalWidth = count * cardWidth + (count - 1) * gap;
      const startX = (width - totalWidth) / 2;
      const baseY = height - 100;

      for (let i = 0; i < count; i++) {
        const screenX = startX + i * (cardWidth + gap) + cardWidth / 2;
        const screenY = baseY;
        const worldPos = this.coordConverter.screenToWorld(screenX, screenY);
        const rotation = (i - (count - 1) / 2) * 3 * (Math.PI / 180);
        const scale = 1.0;

        anchors.set(cardIds[i], {
          x: worldPos.x,
          y: worldPos.y,
          z: 0,
          scale,
          rotation
        });
      }
    } else if (container === 'activated') {
      // 激活技能水平布局
      const cardDesignWidth = 198;
      const cardScale = 0.5;
      const cardWidth = cardDesignWidth * cardScale * 0.8;  // 激活技能再缩小20%
      const gap = 10;
      const count = cardIds.length;

      if (count === 0) return;

      const totalWidth = count * cardWidth + (count - 1) * gap;
      const startX = (width - totalWidth) / 2;
      const baseY = 150; // 距离顶部150px

      for (let i = 0; i < count; i++) {
        const screenX = startX + i * (cardWidth + gap) + cardWidth / 2;
        const screenY = baseY;

        // 转换为世界坐标
        const worldPos = this.coordConverter.screenToWorld(screenX, screenY);

        const rotation = 0;
        const scale = 0.8; // 激活技能缩小显示

        anchors.set(cardIds[i], {
          x: worldPos.x,
          y: worldPos.y,
          z: 0,
          scale,
          rotation
        });
      }
    }

    // 更新容器锚点
    this.entityStore.updateContainerAnchors(container, anchors);
    console.log(`[SceneGraphAdapter] Updated ${container} anchors:`, anchors.size);
  }

  /**
   * 更新玩家面板
   * @param {Object} state - 玩家状态
   */
  _updatePlayerPanel(state) {
    const scene = this.threeRoot.getScene();

    // 如果面板不存在，创建它
    if (!this.playerPanel) {
      this.playerPanel = new PlayerPanelEntity(displayGameState.player);
      const panelGroup = this.playerPanel.getObject3D();

      // 缩放面板：将像素尺寸转换为合理的世界单位
      // 面板设计尺寸是300x252像素，缩放到合适大小
      const scale = 0.5; // 缩小到50%
      panelGroup.scale.set(scale, scale, 1);

      // 定位到屏幕右上角（使用世界坐标）
      const width = window.innerWidth;
      const panelPos = this.coordConverter.screenToWorld(width - 180, 150);
      panelGroup.position.copy(panelPos);

      scene.add(panelGroup);

      // 注册到EntityStore
      const entity = this.entityStore.register('player-panel', EntityType.PANEL, panelGroup);
      entity.addComponent('playerPanel', this.playerPanel);

      // 添加到渲染回调以更新进度条动画
      this.threeRoot.addRenderCallback((deltaTime) => {
        if (this.playerPanel && this.playerPanel.components.healthBar) {
          this.playerPanel.components.healthBar.update(deltaTime);
        }
        if (this.playerPanel && this.playerPanel.components.manaBar) {
          this.playerPanel.components.manaBar.update(deltaTime);
        }
        if (this.playerPanel && this.playerPanel.components.apBar) {
          this.playerPanel.components.apBar.update(deltaTime);
        }
      });

      console.log('[SceneGraphAdapter] Player panel created');
    } else {
      // 更新现有面板
      this.playerPanel.update(displayGameState.player);
    }
  }

  /**
   * 更新敌人面板
   * @param {Object} enemy - 敌人数据
   */
  _updateEnemyPanel(enemy) {
    const scene = this.threeRoot.getScene();

    // 如果敌人不存在，清理面板
    if (!enemy || !enemy.name) {
      if (this.enemyPanel) {
        this.entityStore.unregister('enemy-panel');
        this.enemyPanel = null;
        console.log('[SceneGraphAdapter] Enemy panel removed');
      }
      return;
    }

    // 如果面板不存在，创建它
    if (!this.enemyPanel) {
      this.enemyPanel = new EnemyPanelEntity(enemy);
      const panelGroup = this.enemyPanel.getObject3D();

      // 缩放面板：将像素尺寸转换为合理的世界单位
      const scale = 0.5; // 缩小到50%
      panelGroup.scale.set(scale, scale, 1);

      // 定位到屏幕左上角（使用世界坐标）
      const enemyPos = this.coordConverter.screenToWorld(180, 150);
      panelGroup.position.copy(enemyPos);

      scene.add(panelGroup);

      // 注册到EntityStore
      const entity = this.entityStore.register('enemy-panel', EntityType.PANEL, panelGroup);
      entity.addComponent('enemyPanel', this.enemyPanel);

      // 添加到渲染回调以更新进度条动画
      this.threeRoot.addRenderCallback((deltaTime) => {
        if (this.enemyPanel && this.enemyPanel.components.healthBar) {
          this.enemyPanel.components.healthBar.update(deltaTime);
        }
      });

      console.log('[SceneGraphAdapter] Enemy panel created');
    } else {
      // 更新现有面板
      this.enemyPanel.update(enemy);
    }
  }

  /**
   * 手动触发布局更新（如窗口大小变化）
   */
  updateLayout() {
    this._setupAnchors();

    // 重新计算所有容器锚点
    const handIds = displayGameState.player.skills.map(s => s.uniqueID);
    const activatedIds = displayGameState.player.activatedSkills.map(s => s.uniqueID);

    if (handIds.length > 0) {
      this._updateCardAnchors('hand', handIds);
    }
    if (activatedIds.length > 0) {
      this._updateCardAnchors('activated', activatedIds);
    }

    console.log('[SceneGraphAdapter] Layout updated');
  }

  /**
   * 清理资源
   */
  dispose() {
    // 移除所有监听器
    for (const watcher of this.watchers) {
      watcher();
    }
    this.watchers = [];

    this.isInitialized = false;
    console.log('[SceneGraphAdapter] Disposed');
  }
}

// 单例模式
let adapterInstance = null;

export function getSceneGraphAdapter() {
  if (!adapterInstance) {
    adapterInstance = new SceneGraphAdapter();
  }
  return adapterInstance;
}

export default SceneGraphAdapter;

