/**
 * EntityStore - 实体注册表（ECS核心）
 *
 * 职责：
 * - 管理所有游戏实体（卡牌、面板、粒子、UI元素）
 * - 提供实体CRUD接口
 * - 维护实体的Component集合
 * - 管理锚点系统
 */

import * as THREE from 'three';

/**
 * 实体状态枚举
 */
export const EntityState = {
  IDLE: 'idle',           // 待命状态
  TRACKING: 'tracking',   // 跟踪锚点状态
  ANIMATING: 'animating', // 执行动画状态
  DRAGGING: 'dragging'    // 拖拽状态
};

/**
 * 实体类型枚举
 */
export const EntityType = {
  CARD: 'card',
  PANEL: 'panel',
  PARTICLE: 'particle',
  UI: 'ui',
  ICON: 'icon',
  TEXT: 'text'
};

/**
 * 实体数据结构
 */
class Entity {
  constructor(id, type, object3D) {
    this.id = id;                           // 唯一标识
    this.type = type;                        // 实体类型
    this.object3D = object3D;                // Three.js场景节点
    this.components = new Map();             // Component集合
    this.state = EntityState.IDLE;          // 当前状态
    this.anchor = null;                      // 目标锚点 { x, y, z, scale, rotation }
    this.userData = {};                      // 用户自定义数据
  }

  /**
   * 添加组件
   */
  addComponent(componentType, component) {
    this.components.set(componentType, component);
  }

  /**
   * 获取组件
   */
  getComponent(componentType) {
    return this.components.get(componentType);
  }

  /**
   * 移除组件
   */
  removeComponent(componentType) {
    const component = this.components.get(componentType);
    if (component && component.dispose) {
      component.dispose();
    }
    this.components.delete(componentType);
  }

  /**
   * 检查是否有组件
   */
  hasComponent(componentType) {
    return this.components.has(componentType);
  }

  /**
   * 清理所有组件
   */
  disposeComponents() {
    for (const [type, component] of this.components) {
      if (component.dispose) {
        component.dispose();
      }
    }
    this.components.clear();
  }
}

/**
 * EntityStore - 实体管理器
 */
class EntityStore {
  constructor() {
    this.entities = new Map();              // id -> Entity
    this.entitiesByType = new Map();        // type -> Set<Entity>
    this.anchors = {
      global: new Map(),                    // 全局锚点（如deckAnchor, centerAnchor）
      containers: new Map()                 // 容器锚点（如hand, activated）
    };

    // 初始化类型集合
    for (const type of Object.values(EntityType)) {
      this.entitiesByType.set(type, new Set());
    }

    console.log('[EntityStore] Initialized');
  }

  /**
   * 注册实体
   * @param {string} id - 实体ID
   * @param {string} type - 实体类型
   * @param {THREE.Object3D} object3D - 场景节点
   * @returns {Entity}
   */
  register(id, type, object3D) {
    if (this.entities.has(id)) {
      console.warn(`[EntityStore] Entity ${id} already exists, replacing...`);
      this.unregister(id);
    }

    const entity = new Entity(id, type, object3D);
    this.entities.set(id, entity);

    // 添加到类型集合
    const typeSet = this.entitiesByType.get(type);
    if (typeSet) {
      typeSet.add(entity);
    }

    console.log(`[EntityStore] Registered entity: ${id} (${type})`);
    return entity;
  }

  /**
   * 注销实体
   * @param {string} id - 实体ID
   */
  unregister(id) {
    const entity = this.entities.get(id);
    if (!entity) {
      console.warn(`[EntityStore] Entity ${id} not found`);
      return;
    }

    // 清理组件
    entity.disposeComponents();

    // 从类型集合移除
    const typeSet = this.entitiesByType.get(entity.type);
    if (typeSet) {
      typeSet.delete(entity);
    }

    // 从场景移除（延迟2帧避免渲染中途销毁）
    setTimeout(() => {
      if (entity.object3D && entity.object3D.parent) {
        entity.object3D.parent.remove(entity.object3D);
      }

      // 清理几何体和材质
      if (entity.object3D) {
        entity.object3D.traverse((child) => {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    }, 32); // 约2帧@60fps

    // 从注册表移除
    this.entities.delete(id);

    console.log(`[EntityStore] Unregistered entity: ${id}`);
  }

  /**
   * 获取实体
   * @param {string} id - 实体ID
   * @returns {Entity|null}
   */
  getEntity(id) {
    return this.entities.get(id) || null;
  }

  /**
   * 按类型获取实体
   * @param {string} type - 实体类型
   * @returns {Set<Entity>}
   */
  getEntitiesByType(type) {
    return this.entitiesByType.get(type) || new Set();
  }

  /**
   * 获取所有实体
   * @returns {Map<string, Entity>}
   */
  getAllEntities() {
    return this.entities;
  }

  /**
   * 添加组件到实体
   * @param {string} id - 实体ID
   * @param {string} componentType - 组件类型
   * @param {Object} component - 组件实例
   */
  addComponent(id, componentType, component) {
    const entity = this.getEntity(id);
    if (!entity) {
      console.warn(`[EntityStore] Entity ${id} not found`);
      return;
    }
    entity.addComponent(componentType, component);
  }

  /**
   * 更新组件
   * @param {string} id - 实体ID
   * @param {string} componentType - 组件类型
   * @param {Object} updates - 更新数据
   */
  updateComponent(id, componentType, updates) {
    const entity = this.getEntity(id);
    if (!entity) {
      console.warn(`[EntityStore] Entity ${id} not found`);
      return;
    }

    const component = entity.getComponent(componentType);
    if (!component) {
      console.warn(`[EntityStore] Component ${componentType} not found on entity ${id}`);
      return;
    }

    // 调用组件的update方法
    if (component.update) {
      component.update(updates);
    } else {
      // 如果没有update方法，直接赋值
      Object.assign(component, updates);
    }
  }

  /**
   * 设置实体状态
   * @param {string} id - 实体ID
   * @param {string} state - 新状态
   */
  setState(id, state) {
    const entity = this.getEntity(id);
    if (!entity) {
      console.warn(`[EntityStore] Entity ${id} not found`);
      return;
    }
    entity.state = state;
  }

  /**
   * 设置实体锚点
   * @param {string} id - 实体ID
   * @param {Object} anchor - 锚点数据 { x, y, z, scale, rotation }
   */
  setAnchor(id, anchor) {
    const entity = this.getEntity(id);
    if (!entity) {
      console.warn(`[EntityStore] Entity ${id} not found`);
      return;
    }
    entity.anchor = anchor;
  }

  /**
   * 设置全局锚点
   * @param {string} key - 锚点名称（如'deck', 'center', 'graveyard'）
   * @param {Object} position - 位置 { x, y, z }
   */
  setGlobalAnchor(key, position) {
    this.anchors.global.set(key, position);
  }

  /**
   * 获取全局锚点
   * @param {string} key - 锚点名称
   * @returns {Object|null}
   */
  getGlobalAnchor(key) {
    return this.anchors.global.get(key) || null;
  }

  /**
   * 更新容器锚点
   * @param {string} containerKey - 容器名称（如'hand', 'activated'）
   * @param {Map<string, Object>} anchorsMap - id -> { x, y, z, scale, rotation }
   */
  updateContainerAnchors(containerKey, anchorsMap) {
    this.anchors.containers.set(containerKey, anchorsMap);

    // 自动更新对应实体的锚点
    for (const [id, anchor] of anchorsMap) {
      this.setAnchor(id, anchor);
    }
  }

  /**
   * 获取容器锚点
   * @param {string} containerKey - 容器名称
   * @returns {Map<string, Object>|null}
   */
  getContainerAnchors(containerKey) {
    return this.anchors.containers.get(containerKey) || null;
  }

  /**
   * 清空所有实体
   */
  clear() {
    const ids = Array.from(this.entities.keys());
    for (const id of ids) {
      this.unregister(id);
    }
    this.anchors.global.clear();
    this.anchors.containers.clear();
    console.log('[EntityStore] Cleared all entities');
  }
}

// 单例模式
let entityStoreInstance = null;

export function getEntityStore() {
  if (!entityStoreInstance) {
    entityStoreInstance = new EntityStore();
  }
  return entityStoreInstance;
}

export default EntityStore;

