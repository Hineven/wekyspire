/**
 * AnimationRuntime - Three.js动画运行时系统
 *
 * 核心职责：
 * 1. 管理实体的动画状态机：idle/tracking/animating/dragging
 * 2. 执行来自animationSequencer的动画指令
 * 3. 实现锚点跟踪系统（tracking状态）
 * 4. 桥接frontendEventBus事件
 * 5. 提供Three.js版本的补间动画（替代GSAP）
 *
 * 状态转换规则：
 * - idle: 待命状态，无动画
 * - tracking: 跟踪锚点，锚点变化时平滑跟随
 * - animating: 执行指令动画，完成后自动回到idle
 * - dragging: 拖拽状态，由InputSystem触发
 */

import * as THREE from 'three';
import frontendEventBus from '../../../frontendEventBus.js';

// 状态常量
const STATES = Object.freeze({
  IDLE: 'idle',
  TRACKING: 'tracking',
  ANIMATING: 'animating',
  DRAGGING: 'dragging'
});

// 默认配置
const DEFAULT_TRACKING_DURATION = 0.3; // 秒
const DEFAULT_TRACKING_LERP = 0.15; // 线性插值系数

/**
 * Tween类 - 补间动画
 */
class Tween {
  constructor(object, targetProps, duration, options = {}) {
    this.reset(object, targetProps, duration, options);
  }

  /**
   * 重置Tween对象，用于对象池重用
   */
  reset(object, targetProps, duration, options = {}) {
    this.object = object;
    this.targetProps = targetProps;
    this.duration = duration;
    this.elapsed = 0;
    this.isComplete = false;
    this.isPaused = false;

    this.easing = options.easing || this.easeInOutQuad;
    this.onUpdate = options.onUpdate || null;
    this.onComplete = options.onComplete || null;
    this.onInterrupt = options.onInterrupt || null;

    // 记录起始值
    this.startProps = {};
    for (const key in targetProps) {
      this.startProps[key] = this.getNestedValue(object, key);
    }
    
    return this;
  }

  getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    for (const key of keys) {
      value = value[key];
    }
    return value;
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let target = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
  }

  update(deltaTime) {
    if (this.isComplete || this.isPaused) return;

    this.elapsed += deltaTime;
    const t = Math.min(this.elapsed / this.duration, 1);
    const easedT = this.easing(t);

    // 插值
    for (const key in this.targetProps) {
      const start = this.startProps[key];
      const end = this.targetProps[key];
      const current = start + (end - start) * easedT;
      this.setNestedValue(this.object, key, current);
    }

    if (this.onUpdate) {
      this.onUpdate(easedT);
    }

    if (t >= 1) {
      this.complete();
    }
  }

  complete() {
    if (this.isComplete) return;
    this.isComplete = true;
    if (this.onComplete) {
      this.onComplete();
    }
  }

  interrupt() {
    if (this.isComplete) return;
    this.isComplete = true;
    if (this.onInterrupt) {
      this.onInterrupt();
    }
  }

  // 缓动函数
  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  easeOutCubic(t) {
    return (--t) * t * t + 1;
  }

  linear(t) {
    return t;
  }
}

/**
 * AnimationRuntime类
 */
class AnimationRuntime {
  constructor() {
    this.entityStore = null;

    // 状态注册表: entityId -> { state, currentTween, trackingConfig }
    this.stateRegistry = new Map();

    // 活动Tween列表
    this.activeTweens = [];

    // Tween对象池
    this.tweenPool = [];
    this.maxPoolSize = 100; // 预分配100个Tween对象
    this._initializeTweenPool();

    // 容器锚点: containerKey -> Map<entityId, anchor>
    this.containerAnchors = new Map();

    // 全局锚点: name -> {x, y}
    this.globalAnchors = new Map();

    // 跟踪配置
    this.trackingDuration = DEFAULT_TRACKING_DURATION;
    this.trackingLerp = DEFAULT_TRACKING_LERP;

    this.isInitialized = false;
  }

  /**
   * 初始化Tween对象池
   */
  _initializeTweenPool() {
    for (let i = 0; i < this.maxPoolSize; i++) {
      // 创建空Tween对象并加入池
      const tween = new Tween({}, {}, 0);
      this.tweenPool.push(tween);
    }
  }

  /**
   * 从对象池获取Tween对象
   */
  _getTweenFromPool(object, targetProps, duration, options = {}) {
    let tween;
    if (this.tweenPool.length > 0) {
      tween = this.tweenPool.pop();
      tween.reset(object, targetProps, duration, options);
    } else {
      // 池为空时创建新对象
      tween = new Tween(object, targetProps, duration, options);
    }
    return tween;
  }

  /**
   * 回收Tween对象到对象池
   */
  _returnTweenToPool(tween) {
    if (this.tweenPool.length < this.maxPoolSize) {
      this.tweenPool.push(tween);
    }
  }

  /**
   * 初始化
   */
  init(entityStore) {
    this.entityStore = entityStore;
    this._setupEventListeners();
    this.isInitialized = true;
    console.log('[AnimationRuntime] Initialized');
  }

  /**
   * 设置事件监听
   */
  _setupEventListeners() {
    // 动画指令事件
    frontendEventBus.on('animate-element', this.onAnimateElement.bind(this));
    frontendEventBus.on('animate-element-to-anchor', this.onAnimateToAnchor.bind(this));

    // 状态切换事件
    frontendEventBus.on('enter-element-tracking', this.onEnterTracking.bind(this));
    frontendEventBus.on('enter-element-idle', this.onEnterIdle.bind(this));
    frontendEventBus.on('enter-element-dragging', this.onEnterDragging.bind(this));

    // 锚点更新事件
    frontendEventBus.on('update-anchors', this.onUpdateAnchors.bind(this));
  }

  /**
   * 获取或创建状态条目
   */
  _getOrCreateState(entityId) {
    if (!this.stateRegistry.has(entityId)) {
      this.stateRegistry.set(entityId, {
        state: STATES.IDLE,
        currentTween: null,
        trackingConfig: null
      });
    }
    return this.stateRegistry.get(entityId);
  }

  /**
   * 获取实体当前状态
   */
  getState(entityId) {
    const entry = this.stateRegistry.get(entityId);
    return entry ? entry.state : STATES.IDLE;
  }

  /**
   * 停止当前tween
   */
  _killCurrentTween(stateEntry) {
    if (stateEntry.currentTween) {
      stateEntry.currentTween.interrupt();
      stateEntry.currentTween = null;
    }
  }

  /**
   * 处理animate-element事件
   */
  onAnimateElement(payload) {
    const { id, from = {}, to = {}, duration = 300, ease, anchor, instructionId } = payload;

    // 检查entityStore是否存在
    if (!this.entityStore) {
      console.warn(`[AnimationRuntime] EntityStore not initialized - animate-element event ignored`);
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    const entity = this.entityStore.getEntity(id);
    if (!entity || !entity.object3D) {
      console.warn(`[AnimationRuntime] Entity not found: ${id}`);
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    const stateEntry = this._getOrCreateState(id);

    // 停止跟踪/旧动画
    this._killCurrentTween(stateEntry);

    // 切换到animating状态
    stateEntry.state = STATES.ANIMATING;

    const object3D = entity.object3D;

    // 处理from属性
    if (from.anchor) {
      const anchorPoint = this.getAnchorPoint(from.anchor);
      object3D.position.set(anchorPoint.x, anchorPoint.y, 0);
    }
    if (from.x !== undefined) object3D.position.x = from.x;
    if (from.y !== undefined) object3D.position.y = from.y;
    if (from.scale !== undefined) {
      object3D.scale.set(from.scale, from.scale, from.scale);
    }
    if (from.rotation !== undefined || from.rotate !== undefined) {
      object3D.rotation.z = from.rotation !== undefined ? from.rotation : from.rotate;
    }
    if (from.opacity !== undefined) {
      this._setOpacity(object3D, from.opacity);
    }

    // 确保元素可见
    object3D.visible = true;

    // 构建目标属性
    const targetProps = {};

    // 处理anchor
    if (anchor) {
      const anchorPoint = this.getAnchorPoint(anchor);
      targetProps['position.x'] = anchorPoint.x;
      targetProps['position.y'] = anchorPoint.y;
    }

    // 合并to属性
    if (to.x !== undefined) targetProps['position.x'] = to.x;
    if (to.y !== undefined) targetProps['position.y'] = to.y;
    if (to.scale !== undefined) {
      targetProps['scale.x'] = to.scale;
      targetProps['scale.y'] = to.scale;
      targetProps['scale.z'] = to.scale;
    }
    if (to.rotation !== undefined || to.rotate !== undefined) {
      targetProps['rotation.z'] = to.rotation !== undefined ? to.rotation : to.rotate;
    }

    // opacity需要特殊处理
    const hasOpacity = to.opacity !== undefined;
    let opacityStart = 1, opacityTarget = 1;
    if (hasOpacity) {
      opacityStart = this._getOpacity(object3D);
      opacityTarget = to.opacity;
    }

    // 创建tween（使用对象池）
    const durationSec = Math.max(0.001, duration / 1000);
    const tween = this._getTweenFromPool(object3D, targetProps, durationSec, {
      easing: ease ? this._getEasingFunction(ease) : undefined,
      onUpdate: hasOpacity ? (t) => {
        const opacity = opacityStart + (opacityTarget - opacityStart) * t;
        this._setOpacity(object3D, opacity);
      } : null,
      onComplete: () => {
        // 动画完成，回到idle
        if (stateEntry.state === STATES.ANIMATING) {
          stateEntry.state = STATES.IDLE;
        }
        stateEntry.currentTween = null;

        if (instructionId) {
          frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
        }

        // 回收Tween到对象池
        this._returnTweenToPool(tween);
      },
      onInterrupt: () => {
        stateEntry.currentTween = null;

        // 回收Tween到对象池
        this._returnTweenToPool(tween);
      }
    });

    stateEntry.currentTween = tween;
    this.activeTweens.push(tween);
  }

  /**
   * 处理animate-to-anchor事件
   */
  onAnimateToAnchor(payload) {
    const { id, anchor = 'rest', duration = 300, ease, instructionId } = payload;

    // 检查entityStore是否存在
    if (!this.entityStore) {
      console.warn(`[AnimationRuntime] EntityStore not initialized - animate-to-anchor event ignored`);
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    // 查找锚点
    const entity = this.entityStore.getEntity(id);
    if (!entity) {
      console.warn(`[AnimationRuntime] Entity not found: ${id}`);
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    const anchorData = entity.anchor || this.getAnchorPoint(anchor);
    if (!anchorData) {
      console.warn(`[AnimationRuntime] Anchor not found: ${anchor}`);
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    // 转换为animate-element格式
    this.onAnimateElement({
      id,
      to: {
        x: anchorData.x,
        y: anchorData.y,
        scale: anchorData.scale,
        rotation: anchorData.rotation
      },
      duration,
      ease,
      instructionId
    });
  }

  /**
   * 进入tracking状态
   */
  onEnterTracking(payload) {
    const { id, durationMs, ease } = payload;
    
    // 检查entityStore是否存在
    if (!this.entityStore) {
      console.warn(`[AnimationRuntime] EntityStore not initialized - enter-tracking event ignored`);
      return;
    }
    
    const entity = this.entityStore.getEntity(id);
    if (!entity) return;

    const stateEntry = this._getOrCreateState(id);

    // 停止当前动画
    this._killCurrentTween(stateEntry);

    // 切换到tracking状态
    stateEntry.state = STATES.TRACKING;
    stateEntry.trackingConfig = {
      durationMs: durationMs || this.trackingDuration * 1000,
      ease: ease || 'linear'
    };

    console.log(`[AnimationRuntime] Entity ${id} entered tracking state`);
  }

  /**
   * 进入idle状态
   */
  onEnterIdle(payload) {
    const { id } = payload;
    const stateEntry = this._getOrCreateState(id);

    this._killCurrentTween(stateEntry);
    stateEntry.state = STATES.IDLE;
    stateEntry.trackingConfig = null;

    console.log(`[AnimationRuntime] Entity ${id} entered idle state`);
  }

  /**
   * 进入dragging状态
   */
  onEnterDragging(payload) {
    const { id } = payload;
    const stateEntry = this._getOrCreateState(id);

    this._killCurrentTween(stateEntry);
    stateEntry.state = STATES.DRAGGING;

    console.log(`[AnimationRuntime] Entity ${id} entered dragging state`);
  }

  /**
   * 更新锚点
   */
  onUpdateAnchors(payload) {
    const { containerKey, anchorsMap } = payload;
    if (!containerKey || !anchorsMap) return;

    this.containerAnchors.set(containerKey, anchorsMap);

    // 检查entityStore是否存在
    if (!this.entityStore) {
      console.warn(`[AnimationRuntime] EntityStore not initialized - update-anchors event ignored`);
      return;
    }

    // 更新实体的anchor引用
    for (const [entityId, anchor] of anchorsMap) {
      const entity = this.entityStore.getEntity(entityId);
      if (entity) {
        entity.anchor = anchor;
        
        // 如果实体正在跟踪锚点，确保它能平滑过渡到新位置
        const stateEntry = this.stateRegistry.get(entityId);
        if (stateEntry && stateEntry.state === STATES.TRACKING) {
          // 不需要额外操作，updateTracking会处理平滑过渡
        }
      }
    }
  }

  /**
   * 设置全局锚点
   */
  setGlobalAnchor(name, position) {
    if (!name || !position) return;
    this.globalAnchors.set(name, { x: position.x, y: position.y });
  }

  /**
   * 获取锚点坐标
   */
  getAnchorPoint(anchorName) {
    // 如果是对象形式的坐标
    if (typeof anchorName === 'object' && anchorName.x != null && anchorName.y != null) {
      return { x: anchorName.x, y: anchorName.y, z: anchorName.z || 0 };
    }

    // 从全局锚点获取
    if (typeof anchorName === 'string') {
      const global = this.globalAnchors.get(anchorName);
      if (global) return global;
    }

    // 默认返回屏幕中心
    return {
      x: 0,
      y: 0,
      z: 0
    };
  }

  /**
   * 每帧更新
   */
  update(deltaTime) {
    if (!this.isInitialized) return;

    // 更新所有Tween
    for (let i = this.activeTweens.length - 1; i >= 0; i--) {
      const tween = this.activeTweens[i];
      tween.update(deltaTime);

      if (tween.isComplete) {
        this.activeTweens.splice(i, 1);
      }
    }

    // 更新tracking状态的实体
    this.updateTracking(deltaTime);
  }

  /**
   * 更新跟踪状态
   */
  updateTracking(deltaTime) {
    // 检查entityStore是否存在
    if (!this.entityStore) {
      return;
    }
    
    for (const [entityId, stateEntry] of this.stateRegistry) {
      if (stateEntry.state !== STATES.TRACKING) continue;

      const entity = this.entityStore.getEntity(entityId);
      if (!entity || !entity.object3D || !entity.anchor) continue;

      const object3D = entity.object3D;
      const anchor = entity.anchor;
      
      // 使用配置的插值系数或默认值
      const lerpFactor = stateEntry.trackingConfig ? this.trackingLerp : 0.1;

      // 平滑跟随锚点位置
      const targetPos = new THREE.Vector3(anchor.x, anchor.y, anchor.z || 0);
      object3D.position.lerp(targetPos, lerpFactor);

      // 平滑跟随旋转（如果有）
      if (anchor.rotation !== undefined) {
        // 自定义角度插值，避免绕远路
        const currentRotation = object3D.rotation.z;
        const targetRotation = anchor.rotation;
        
        // 计算最短路径的角度差
        let delta = targetRotation - currentRotation;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        
        // 线性插值
        const lerpedRotation = currentRotation + delta * lerpFactor;
        object3D.rotation.z = lerpedRotation;
      }

      // 平滑跟随缩放（如果有）
      if (anchor.scale !== undefined) {
        const targetScale = new THREE.Vector3(anchor.scale, anchor.scale, anchor.scale);
        object3D.scale.lerp(targetScale, lerpFactor);
      }
    }
  }

  /**
   * 设置透明度
   */
  _setOpacity(object3D, opacity) {
    object3D.traverse((child) => {
      if (child.material) {
        child.material.transparent = true;
        child.material.opacity = opacity;
      }
    });
  }

  /**
   * 获取透明度
   */
  _getOpacity(object3D) {
    let opacity = 1;
    object3D.traverse((child) => {
      if (child.material && child.material.opacity !== undefined) {
        opacity = child.material.opacity;
        return; // 只取第一个
      }
    });
    return opacity;
  }

  /**
   * 获取缓动函数
   */
  _getEasingFunction(easeName) {
    const tween = new Tween({}, {}, 1);
    if (easeName === 'linear') return tween.linear;
    if (easeName.includes('cubic')) return tween.easeOutCubic;
    return tween.easeInOutQuad;
  }

  /**
   * 检查是否正在动画
   */
  isAnimating(entityId) {
    const stateEntry = this.stateRegistry.get(entityId);
    return stateEntry && stateEntry.state === STATES.ANIMATING;
  }

  /**
   * 停止所有动画
   */
  stopAll() {
    for (let i = this.activeTweens.length - 1; i >= 0; i--) {
      const tween = this.activeTweens[i];
      tween.interrupt();
      // 回收Tween到对象池
      this._returnTweenToPool(tween);
      this.activeTweens.splice(i, 1);
    }

    for (const [entityId, stateEntry] of this.stateRegistry) {
      stateEntry.state = STATES.IDLE;
      stateEntry.currentTween = null;
      stateEntry.trackingConfig = null;
    }
  }

  /**
   * 清理
   */
  dispose() {
    this.stopAll();
    this.stateRegistry.clear();
    this.containerAnchors.clear();
    this.globalAnchors.clear();

    frontendEventBus.off('animate-element', this.onAnimateElement);
    frontendEventBus.off('animate-element-to-anchor', this.onAnimateToAnchor);
    frontendEventBus.off('enter-element-tracking', this.onEnterTracking);
    frontendEventBus.off('enter-element-idle', this.onEnterIdle);
    frontendEventBus.off('enter-element-dragging', this.onEnterDragging);
    frontendEventBus.off('update-anchors', this.onUpdateAnchors);

    this.entityStore = null;
    this.isInitialized = false;

    console.log('[AnimationRuntime] Disposed');
  }
}

// 单例
let instance = null;

export function getAnimationRuntime() {
  if (!instance) {
    instance = new AnimationRuntime();
  }
  return instance;
}

export default AnimationRuntime;

