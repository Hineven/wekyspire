// animator.js - 新一代动画编排器
// 核心职责：
// 1. 管理可动画元素的 DOM 注册表
// 2. 执行来自 animationSequencer 的动画指令
// 3. 管理锚点信息，实现元素向锚点的"静息归位"
// 4. 提供适配器机制，支持不同类型元素的动画

import frontendEventBus from '../frontendEventBus.js';
import gsap from 'gsap';

const defaultEase = 'power2.out';

// ========== 适配器接口 ==========

/**
 * 卡牌适配器
 */
class CardAdapter {
  getDefaultProps(element) {
    const rect = element?.getBoundingClientRect?.();
    return {
      width: rect?.width || 198,
      height: rect?.height || 266
    };
  }

  beforeAnimate(element, animationPayload) {
    // 卡牌动画前的预处理
  }

  afterAnimate(element, animationPayload) {
    // 卡牌动画后的清理
  }

  getRestPosition(id, anchorsMap) {
    return anchorsMap.get(id) || null;
  }
}

/**
 * 单位面板适配器
 */
class UnitPanelAdapter {
  getDefaultProps(element) {
    const rect = element?.getBoundingClientRect?.();
    return {
      width: rect?.width || 300,
      height: rect?.height || 200
    };
  }

  beforeAnimate(element, animationPayload) {
    // 面板动画前的预处理
  }

  afterAnimate(element, animationPayload) {
    // 面板动画后的清理
  }

  getRestPosition(id, anchorsMap) {
    return anchorsMap.get(id) || null;
  }
}

// 适配器工厂
const adapters = {
  'card': new CardAdapter(),
  'unit-panel': new UnitPanelAdapter()
};

// ========== Animator 核心类 ==========

class Animator {
  constructor() {
    // DOM 注册表: id -> { element, adapterType, adapter, anchor, quickSetters, isDragging }
    this._registry = new Map();
    
    // 容器锚点表: containerKey -> Map<id, { x, y, scale?, rotation? }>
    this._containerAnchors = new Map();
    
    // 全局锚点: name -> { x, y }
    this._globalAnchors = new Map();
    
    // 配置
    this._overlayEl = null;
    
    // 锚点跟踪配置
    this._anchorTrackingEnabled = true;
    this._anchorTrackingDuration = 0.3; // 平滑跟踪持续时间（秒）
    this._anchorTrackingEase = 'power1.out';
    
    // 绑定事件监听
    this._bindEvents();
  }

  /**
   * 初始化
   */
  init(options = {}) {
    this._overlayEl = options.overlayEl || null;
    
    // 设置全局锚点
    if (options.centerAnchorEl) {
      this.setGlobalAnchorEl('center', options.centerAnchorEl);
    }
    
    // 注意：不再从 overlayRefs 中设置 deckAnchorEl
    // deck 锚点应该由 ActionPanel 在 mounted 时设置为实际的 DeckIcon
    
    // 其他全局锚点
    Object.entries(options).forEach(([key, value]) => {
      if (key.endsWith('AnchorEl') && key !== 'centerAnchorEl' && key !== 'deckAnchorEl') {
        const name = key.replace(/AnchorEl$/, '');
        this.setGlobalAnchorEl(name, value);
      }
    });
  }

  /**
   * 绑定前端事件总线监听
   */
  _bindEvents() {
    // 监听动画元素指令
    frontendEventBus.on('animate-element', (payload) => {
      this.animate(payload);
    });
    
    // 监听动画到锚点指令
    frontendEventBus.on('animate-element-to-anchor', (payload) => {
      this.animateToAnchor(payload.id, payload.anchor || 'rest', payload);
    });
  }

  // ========== 注册表管理 ==========

  /**
   * 注册可动画元素
   * @param {string|number} id - 元素唯一标识
   * @param {HTMLElement} element - DOM 元素
   * @param {string} adapterType - 适配器类型 ('card' | 'unit-panel')
   */
  register(id, element, adapterType = 'card') {
    if (id == null || !element) {
      console.warn('[animator] register: invalid id or element', id, element);
      return;
    }

    const adapter = adapters[adapterType];
    if (!adapter) {
      console.warn('[animator] register: unknown adapter type', adapterType);
      return;
    }

    // 解除旧的注册
    if (this._registry.has(id)) {
      this.unregister(id);
    }

    // 状态机：'idle' | 'tracking' | 'animating' | 'dragging'
    this._registry.set(id, {
      element,
      adapterType,
      adapter,
      anchor: null,
      state: 'idle', // 当前状态
      currentTween: null, // 当前的 GSAP tween（无论是跟踪还是指令）
      isDragging: false
    });
  }

  /**
   * 解除注册
   */
  unregister(id) {
    if (id == null) return;
    
    const entry = this._registry.get(id);
    if (!entry) return;

    // 停止跟踪（清理 trackingTimeout）
    this._stopTracking(entry);

    // 杀死当前正在执行的动画
    if (entry.currentTween) {
      entry.currentTween.kill();
      entry.currentTween = null;
    }

    this._registry.delete(id);
  }

  /**
   * 获取已注册的 DOM 元素
   */
  getElement(id) {
    return this._registry.get(id)?.element || null;
  }

  // ========== 锚点管理 ==========

  /**
   * 更新容器的锚点信息
   * @param {string} containerKey - 容器标识
   * @param {Map<string|number, {x, y, scale?, rotation?}>} anchorsMap - 锚点映射
   */
  updateAnchors(containerKey, anchorsMap) {
    if (!containerKey || !anchorsMap) {
      console.warn('[animator] updateAnchors: invalid params', containerKey, anchorsMap);
      return;
    }

    this._containerAnchors.set(containerKey, anchorsMap);

    // 更新注册表中的锚点引用
    for (const [id, anchor] of anchorsMap.entries()) {
      const entry = this._registry.get(id);
      if (entry) {
        entry.anchor = anchor;
        
        // 根据当前状态处理锚点更新
        if (this._anchorTrackingEnabled) {
          if (entry.state === 'idle') {
            // idle 状态：启动新的跟踪动画
            this._startTrackingAnchor(entry, anchor);
          } else if (entry.state === 'tracking') {
            // tracking 状态：更新跟踪目标（重启跟踪动画）
            this._updateTrackingTarget(entry, anchor);
          }
          // animating 或 dragging 状态：不干预，等待完成后自动跟踪
        }
      }
    }
  }

  /**
   * 应用锚点位置到元素（立即设置，无动画）
   */
  _applyAnchorPosition(entry, anchor) {
    if (!entry || !anchor || !entry.element) return;
    
    const { element } = entry;
    const rect = element.getBoundingClientRect();
    
    // 计算位置（锚点是中心点）
    const x = anchor.x - rect.width / 2;
    const y = anchor.y - rect.height / 2;
    
    gsap.set(element, {
      x,
      y,
      scale: anchor.scale || 1,
      rotation: anchor.rotation || 0
    });
  }

  /**
   * 开始跟踪锚点（仅在 idle 状态下调用）
   */
  _startTrackingAnchor(entry, anchor) {
    if (!entry || !anchor || !entry.element) return;
    if (entry.state !== 'idle') return; // 只有 idle 状态才能进入跟踪
    
    const { element } = entry;
    const rect = element.getBoundingClientRect();
    
    // 计算目标位置（锚点是中心点）
    const targetX = anchor.x - rect.width / 2;
    const targetY = anchor.y - rect.height / 2;
    const targetScale = anchor.scale || 1;
    const targetRotation = anchor.rotation || 0;
    
    // 转换到 tracking 状态
    entry.state = 'tracking';
    
    // 关键改进：使用普通的 gsap.to 代替 quickTo
    // 设置一个长时间运行的动画，通过 overwrite: true 确保单一通道
    const tween = gsap.to(element, {
      x: targetX,
      y: targetY,
      scale: targetScale,
      rotation: targetRotation,
      duration: this._anchorTrackingDuration,
      ease: this._anchorTrackingEase,
      overwrite: true, // 关键：覆盖之前的所有动画
      onComplete: () => {
        if (entry.state === 'tracking') {
          entry.state = 'idle';
        }
        if (entry.currentTween === tween) {
          entry.currentTween = null;
        }
      },
      onInterrupt: () => {
        if (entry.currentTween === tween) {
          entry.currentTween = null;
        }
      }
    });
    
    // 保存到 currentTween，确保可以被后续的 kill() 中断
    entry.currentTween = tween;
  }
  
  /**
   * 更新正在进行的跟踪动画的目标（tracking 状态下调用）
   */
  _updateTrackingTarget(entry, anchor) {
    if (!entry || !anchor || !entry.element) return;
    if (entry.state !== 'tracking') return; // 只在 tracking 状态下更新
    
    const { element } = entry;
    const rect = element.getBoundingClientRect();
    
    // 计算新的目标位置
    const targetX = anchor.x - rect.width / 2;
    const targetY = anchor.y - rect.height / 2;
    const targetScale = anchor.scale || 1;
    const targetRotation = anchor.rotation || 0;
    
    // 关键改进：直接重启跟踪动画
    // 杀死当前的 tracking tween
    if (entry.currentTween) {
      entry.currentTween.kill();
      entry.currentTween = null;
    }
    
    // 创建新的跟踪动画
    const tween = gsap.to(element, {
      x: targetX,
      y: targetY,
      scale: targetScale,
      rotation: targetRotation,
      duration: this._anchorTrackingDuration,
      ease: this._anchorTrackingEase,
      overwrite: true,
      onComplete: () => {
        if (entry.state === 'tracking') {
          entry.state = 'idle';
        }
        if (entry.currentTween === tween) {
          entry.currentTween = null;
        }
      },
      onInterrupt: () => {
        if (entry.currentTween === tween) {
          entry.currentTween = null;
        }
      }
    });
    
    entry.currentTween = tween;
  }
  
  /**
   * 应用锚点位置到元素（立即设置，无动画）
   */
  setGlobalAnchorEl(name, element) {
    if (!name) return;
    
    const updatePosition = () => {
      if(!element) {
        // 移除全局锚点
        this._globalAnchors.delete(name);
        console.log(`[animator] Removed global anchor '${name}'`);
        return;
      }
      const rect = element.getBoundingClientRect();
      if (rect) {
        const anchor = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        this._globalAnchors.set(name, anchor);
        console.log(`[animator] Global anchor '${name}' updated:`, anchor, 'from element:', element);
      }
    };

    updatePosition();
    
    // 监听窗口大小变化
    try {
      window.addEventListener('resize', updatePosition, { passive: true });
    } catch (_) {}
  }

  /**
   * 设置全局锚点（直接坐标）
   */
  setGlobalAnchor(name, position) {
    if (!name || !position) return;
    this._globalAnchors.set(name, { x: position.x, y: position.y });
  }

  /**
   * 获取锚点坐标
   */
  getAnchorPoint(anchorName) {
    // 如果是对象形式的坐标，直接返回
    if (typeof anchorName === 'object' && anchorName.x != null && anchorName.y != null) {
      return { x: anchorName.x, y: anchorName.y };
    }

    // 从全局锚点获取
    if (typeof anchorName === 'string') {
      const global = this._globalAnchors.get(anchorName);
      if (global) {
        console.log(`[animator] Using global anchor '${anchorName}':`, global);
        return global;
      }
      console.warn(`[animator] Global anchor '${anchorName}' not found, using screen center`);
    }

    // 默认返回屏幕中心
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
  }

  // ========== 动画执行 ==========

  /**
   * 执行动画指令
   */
  animate(payload) {
    const { id, to = {}, duration = 300, ease = defaultEase, anchor, instructionId, effect } = payload;

    const entry = this._registry.get(id);
    if (!entry) {
      console.warn('[animator] animate: element not registered', id);
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    const { element, adapter } = entry;

    // ===== 关键改进：单一通道管理 =====
    // 1. 停止 quickTo 跟踪动画（如果正在进行）
    this._stopTracking(entry);
    
    // 2. 杀死当前正在执行的动画（如果有）
    if (entry.currentTween) {
      entry.currentTween.kill();
      entry.currentTween = null;
    }
    
    // 3. 转换到 animating 状态
    entry.state = 'animating';

    // 处理特殊效果
    if (effect === 'shake') {
      this._applyShakeEffect(element, payload);
      // shake 执行后回到 idle
      setTimeout(() => {
        if (entry.state === 'animating') {
          entry.state = 'idle';
          // 尝试恢复锚点跟踪
          if (entry.anchor && this._anchorTrackingEnabled) {
            this._startTrackingAnchor(entry, entry.anchor);
          }
        }
        if (instructionId) {
          frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
        }
      }, duration);
      return;
    }

    // 前处理
    try {
      adapter.beforeAnimate(element, payload);
    } catch (_) {}

    // 构建目标属性
    const props = {};

    // 处理锚点
    if (anchor) {
      const anchorPoint = this.getAnchorPoint(anchor);
      const rect = element.getBoundingClientRect();
      props.x = anchorPoint.x - rect.width / 2;
      props.y = anchorPoint.y - rect.height / 2;
    }

    // 合并其他属性
    if (to.x != null) props.x = to.x;
    if (to.y != null) props.y = to.y;
    if (to.scale != null) props.scale = to.scale;
    if (to.rotate != null) props.rotate = to.rotate;
    if (to.opacity != null) props.autoAlpha = to.opacity;

    // 4. 创建新的动画 tween
    const tween = gsap.to(element, {
      ...props,
      duration: Math.max(0.001, duration / 1000),
      ease,
      force3D: true,
      lazy: false,
      overwrite: true, // 强制覆盖，确保单一通道
      onComplete: () => {
        try {
          adapter.afterAnimate(element, payload);
        } catch (_) {}
        
        // 5. 动画完成，回到 idle 状态
        if (entry.state === 'animating') {
          entry.state = 'idle';
        }
        entry.currentTween = null;
        
        // 6. 尝试恢复锚点跟踪
        if (entry.anchor && this._anchorTrackingEnabled && entry.state === 'idle') {
          this._startTrackingAnchor(entry, entry.anchor);
        }
        
        // 通知完成
        if (instructionId) {
          frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
        }
      },
      onInterrupt: () => {
        // 被中断也要清理状态
        entry.currentTween = null;
        if (entry.state === 'animating') {
          entry.state = 'idle';
        }
        if (instructionId) {
          frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
        }
      }
    });

    // 保存当前 tween
    entry.currentTween = tween;
  }

  /**
   * 动画到锚点（快捷方法）
   */
  animateToAnchor(id, anchorName, options = {}) {
    this.animate({
      id,
      anchor: anchorName,
      to: {},
      duration: options.duration || 300,
      ease: options.ease || defaultEase,
      instructionId: options.instructionId
    });
  }

  /**
   * 归位到静息位置
   */
  returnToRest(id, duration = 300) {
    const entry = this._registry.get(id);
    if (!entry || !entry.anchor) return;

    this.animate({
      id,
      to: {
        x: entry.anchor.x,
        y: entry.anchor.y,
        scale: entry.anchor.scale || 1,
        rotate: entry.anchor.rotation || 0
      },
      duration,
      ease: 'power1.out'
    });
  }

  /**
   * 应用震动效果
   */
  _applyShakeEffect(element, payload) {
    const { intensity = 2, duration = 300 } = payload;
    
    gsap.to(element, {
      x: `+=${intensity}`,
      duration: 0.05,
      repeat: Math.floor(duration / 100),
      yoyo: true,
      ease: 'power1.inOut',
      onComplete: () => {
        gsap.set(element, { x: 0 });
      }
    });
  }

  /**
   * 停止跟踪动画（内部使用）
   */
  _stopTracking(entry) {
    if (!entry) return;
    
    // 清除超时计时器（如果有）
    if (entry.trackingTimeout) {
      clearTimeout(entry.trackingTimeout);
      entry.trackingTimeout = null;
    }
    
    // 注意：不需要额外杀死动画，因为 currentTween 会在 animate() 中被 kill
    // 这里只需要清理超时即可
  }

  // ========== 拖拽状态管理 ==========

  /**
   * 开始拖拽（转换到 dragging 状态）
   */
  startDragging(id) {
    const entry = this._registry.get(id);
    if (!entry) return;
    
    // 停止跟踪动画
    this._stopTracking(entry);
    
    // 杀死当前正在执行的动画
    if (entry.currentTween) {
      entry.currentTween.kill();
      entry.currentTween = null;
    }
    
    // 转换到 dragging 状态
    entry.state = 'dragging';
    entry.isDragging = true;
  }

  /**
   * 结束拖拽（回到 idle 状态）
   */
  stopDragging(id) {
    const entry = this._registry.get(id);
    if (!entry) return;
    
    entry.isDragging = false;
    entry.state = 'idle';
    
    // 恢复锚点跟踪
    if (this._anchorTrackingEnabled && entry.anchor) {
      this._startTrackingAnchor(entry, entry.anchor);
    }
  }

  /**
   * 设置锚点跟踪配置
   */
  setAnchorTrackingConfig({ enabled, duration, ease } = {}) {
    if (enabled != null) this._anchorTrackingEnabled = enabled;
    if (duration != null) this._anchorTrackingDuration = duration;
    if (ease != null) this._anchorTrackingEase = ease;
  }

  /**
   * 重置所有动画
   */
  reset() {
    for (const [id, entry] of this._registry.entries()) {
      if (entry.currentTween) {
        entry.currentTween.kill();
      }
    }
    this._registry.clear();
    this._containerAnchors.clear();
  }
  
  /**
   * 调试工具：获取当前状态
   */
  getStatus() {
    const entries = [];
    for (const [id, entry] of this._registry.entries()) {
      entries.push({
        id,
        adapterType: entry.adapterType,
        state: entry.state,
        hasAnchor: !!entry.anchor,
        isDragging: entry.isDragging,
        hasTween: !!entry.currentTween
      });
    }
    return {
      registered: this._registry.size,
      containers: this._containerAnchors.size,
      globalAnchors: Array.from(this._globalAnchors.keys()),
      anchorTrackingEnabled: this._anchorTrackingEnabled,
      entries
    };
  }
  
  /**
   * 调试工具：打印状态
   */
  debug() {
    const status = this.getStatus();
    console.log('[animator] Status:', status);
    console.table(status.entries);
  }
}

// 导出单例
const animator = new Animator();

// 添加到 window 以便调试
if (typeof window !== 'undefined') {
  window.__animator = animator;
  window.__debugAnimator = () => animator.debug();
}

export default animator;
