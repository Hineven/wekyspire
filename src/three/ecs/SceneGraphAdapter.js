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
import { getZAllocator } from '../utils/ZAllocator.js';
import AnchorComponent from './components/AnchorComponent.js';
import frontendEventBus from '../../frontendEventBus.js';
import { getComponentStore } from './ComponentStore.js';

class SceneGraphAdapter {
  constructor() {
    this.entityStore = null;
    this.componentStore = null;
    this.threeRoot = null;
    this.watchers = [];
    this.isInitialized = false;
    this.coordConverter = null;

    // 面板实体引用
    this.playerPanel = null;
    this.enemyPanel = null;

    // Anchor组件集合
    this.anchors = new Map();

    console.log('[SceneGraphAdapter] Created');
  }

  /**
   * 初始化适配器
   * @param {EntityStore} entityStore - 实体存储
   * @param {ThreeRoot} threeRoot - Three.js根实例
   */
  init(entityStore, threeRoot) {
    this.entityStore = entityStore;
    this.componentStore = getComponentStore();
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

    // 创建墓地图标（左下角）
    const graveyardPos = this.coordConverter.screenToWorld(120, height - 100);
    const graveyardIcon = new GraveyardIconEntity(displayGameState.player.burntSkills?.length || 0);
    const graveyardGroup = graveyardIcon.getObject3D();
    graveyardGroup.position.copy(graveyardPos);
    // 缩放图标到合适大小
    graveyardGroup.scale.set(0.5, 0.5, 1);
    scene.add(graveyardGroup);
    const graveyardEntity = this.entityStore.register('graveyard-icon', EntityType.ICON, graveyardGroup);

    console.log('[SceneGraphAdapter] Deck and graveyard icons created');
  }

  /**
   * 设置初始锚点
   */
  _setupAnchors() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const zAllocator = getZAllocator();

    // 创建手牌anchor（扇形布局）
    const handAnchor = new AnchorComponent('hand', {
      layoutType: 'fan',
      gap: 10,
      padding: 0,
      basePosition: { x: width / 2, y: height - 150 },
      cardScale: 0.3,
      cardDesignWidth: 198,
      cardDesignHeight: 266,
      zAllocator,
      zType: 'HAND_CARD',
      coordConverter: this.coordConverter
    });
    this.anchors.set('hand', handAnchor);
    this.componentStore.register(handAnchor);

    // 创建激活技能anchor（水平布局）
    const activatedAnchor = new AnchorComponent('activated', {
      layoutType: 'horizontal',
      gap: 10,
      padding: 0,
      basePosition: { x: width / 2, y: 100 },
      cardScale: 0.25,
      cardDesignWidth: 198,
      cardDesignHeight: 266,
      zAllocator,
      zType: 'ACTIVATED_SKILL',
      coordConverter: this.coordConverter
    });
    this.anchors.set('activated', activatedAnchor);
    this.componentStore.register(activatedAnchor);

    // 创建自由区域anchor（用于拖拽中的卡牌）
    const freeAnchor = new AnchorComponent('free', {
      layoutType: 'absolute',
      gap: 0,
      padding: 0,
      basePosition: { x: width / 2, y: height / 2 },
      cardScale: 0.3,
      cardDesignWidth: 198,
      cardDesignHeight: 266,
      zAllocator,
      zType: 'FREE_CARD',
      coordConverter: this.coordConverter
    });
    this.anchors.set('free', freeAnchor);
    this.componentStore.register(freeAnchor);

    // 创建墓地anchor（左下角）
    const graveyardScreenPos = this.coordConverter.screenToWorld(120, height - 120);
    const burntAnchor = new AnchorComponent('burnt', {
      layoutType: 'absolute',
      gap: 0,
      padding: 0,
      basePosition: { x: 120, y: height - 120 },
      cardScale: 0.25,
      cardDesignWidth: 198,
      cardDesignHeight: 266,
      zAllocator,
      zType: 'BURNT_CARD',
      coordConverter: this.coordConverter
    });
    this.anchors.set('burnt', burntAnchor);
    this.componentStore.register(burntAnchor);

    // 创建牌库anchor（右下角）
    const deckAnchor = new AnchorComponent('deck', {
      layoutType: 'absolute',
      gap: 0,
      padding: 0,
      basePosition: { x: width - 120, y: height - 120 },
      cardScale: 0.25,
      cardDesignWidth: 198,
      cardDesignHeight: 266,
      zAllocator,
      zType: 'DECK_CARD',
      coordConverter: this.coordConverter
    });
    this.anchors.set('deck', deckAnchor);
    this.componentStore.register(deckAnchor);

    // 保持全局锚点兼容性（用于面板等）
    const centerPos = this.coordConverter.screenToWorld(width / 2, height / 2);
    const graveyardPos = this.coordConverter.screenToWorld(120, height - 120);

    console.log('[SceneGraphAdapter] Anchors setup complete');
  }

  /**
   * 设置响应式监听器
   */
  _setupWatchers() {
    // 监听玩家卡牌变化
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
   * @param {string} containerKey - 容器名称（'hand' 或 'activated'）
   * @param {string[]} newIds - 新的卡牌ID列表
   * @param {string[]} oldIds - 旧的卡牌ID列表
   */
  _syncCards(containerKey, newIds, oldIds) {
    if (!this.isInitialized) return;

    const anchor = this.anchors.get(containerKey);
    if (!anchor) {
      console.warn(`[SceneGraphAdapter] Anchor ${containerKey} not found`);
      return;
    }

    const oldSet = new Set(oldIds || []);
    const newSet = new Set(newIds || []);

    // 找出需要移除的卡牌
    for (const id of oldSet) {
      if (!newSet.has(id)) {
        // 从anchor卸载
        const entity = this.entityStore.getEntity(id);
        if (entity) {
          anchor.onUnmounted(entity);
        }
        // 从EntityStore移除
        this.entityStore.unregister(id);
      }
    }

    // 找出需要添加的卡牌并先创建实体
    for (const id of newIds) {
      if (!oldSet.has(id)) {
        this._createCardEntity(id);
      }
    }

    // 将所有卡牌挂载到anchor
    for (const id of newIds) {
      const entity = this.entityStore.getEntity(id);
      if (entity) {
        // 如果实体还未挂载到此anchor，则挂载
        if (!anchor.mountedEntities.has(id)) {
          anchor.onMounted(entity);
        }
      }
    }

    // 应用锚点位置到所有卡牌
    for (const id of newIds) {
      this._applyAnchorToCard(id, containerKey);
    }

    // 通知AnimationRuntime anchor已更新
    frontendEventBus.emit('update-anchors', { containerKey });
  }

  /**
   * 应用锚点位置到卡牌
   * @param {string} cardId - 卡牌ID
   * @param {string} containerKey - 容器名称
   */
  _applyAnchorToCard(cardId, containerKey) {
    const anchor = this.anchors.get(containerKey);
    if (!anchor) {
      console.warn(`[SceneGraphAdapter] Anchor ${containerKey} not found`);
      return;
    }

    const entity = this.entityStore.getEntity(cardId);
    if (!entity) {
      console.warn(`[SceneGraphAdapter] Entity ${cardId} not found`);
      return;
    }

    const position = anchor.getEntityMountedPosition(entity);
    const object3D = entity.object3D;

    object3D.position.x = position.x;
    object3D.position.y = position.y;
    object3D.position.z = position.z;
    
    if (position.rotation !== undefined) {
      object3D.rotation.z = position.rotation;
    }
    object3D.scale.set(position.scale, position.scale, 1);

    entity.anchor = position;
  }

  /**
   * 创建卡牌实体
   * @param {string} cardId - 卡牌ID
   */
  _createCardEntity(cardId) {
    const scene = this.threeRoot.getScene();

    // 从displayGameState中查找卡牌数据
    let skillData = null;
    skillData = displayGameState.player.skills.find(s => s.uniqueID === cardId);
    
    if (!skillData) {
      console.warn(`[SceneGraphAdapter] Card ${cardId} not found in player skills`);
      return;
    }

    // 创建卡牌实体
    const cardEntity = new CardEntity(skillData);
    const cardGroup = cardEntity.getObject3D();

    // 缩放卡牌到合适大小（卡牌设计尺寸198x266像素）
    const scale = 1.0;
    cardGroup.scale.set(scale, scale, 1);

    // 暂时放在屏幕中心（稍后会被锚点更新）
    cardGroup.position.set(0, 0, 0);

    scene.add(cardGroup);

    // 注册到EntityStore
    const entity = this.entityStore.register(cardId, EntityType.CARD, cardGroup);

    console.log(`[SceneGraphAdapter] Card ${cardId} created.`);
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

      const scale = 1;
      panelGroup.scale.set(scale, scale, 1);

      // 定位到屏幕右上角（使用世界坐标）
      const width = window.innerWidth;
      const panelPos = this.coordConverter.screenToWorld(width - 180, 150);
      panelGroup.position.copy(panelPos);

      scene.add(panelGroup);

      // 注册到EntityStore
      const entity = this.entityStore.register('player-panel', EntityType.PANEL, panelGroup);

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

      const scale = 1;
      panelGroup.scale.set(scale, scale, 1);

      // 定位到屏幕左上角（使用世界坐标）
      const enemyPos = this.coordConverter.screenToWorld(180, 150);
      panelGroup.position.copy(enemyPos);

      scene.add(panelGroup);

      // 注册到EntityStore
      const entity = this.entityStore.register('enemy-panel', EntityType.PANEL, panelGroup);

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
    if (handIds.length > 0) {
      this._syncCards('hand', handIds, handIds);
    }

    const activatedIds = displayGameState.player.activatedSkills.map(s => s.uniqueID);
    if (activatedIds.length > 0) {
      this._syncCards('activated', activatedIds, activatedIds);
    }
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
