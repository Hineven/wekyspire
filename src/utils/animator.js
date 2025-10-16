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

    // 创建 GSAP quickTo 函数用于高性能平滑跟踪
    const quickSetters = {
      x: gsap.quickTo(element, 'x', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase }),
      y: gsap.quickTo(element, 'y', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase }),
      scale: gsap.quickTo(element, 'scale', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase }),
      rotation: gsap.quickTo(element, 'rotation', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase })
    };

    this._registry.set(id, {
      element,
      adapterType,
      adapter,
      anchor: null,
      currentAnimation: null,
      quickSetters,
      isDragging: false, // 拖拽状态标记
      isPlayingInstruction: false // 是否正在播放动画指令
    });
  }

  /**
   * 解除注册
   */
  unregister(id) {
    if (id == null) return;
    
    const entry = this._registry.get(id);
    if (!entry) return;

    // 杀死正在播放的动画
    if (entry.currentAnimation) {
      try {
        gsap.killTweensOf(entry.element);
      } catch (_) {}
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
        // console.log('[animator] Updated anchor for', id, 'in container', containerKey, anchor);
        
        // 如果启用锚点跟踪，且元素未拖拽、未播放动画指令，则平滑跟踪到新锚点
        if (this._anchorTrackingEnabled && !entry.isDragging && !entry.isPlayingInstruction) {
          this._smoothTrackToAnchor(entry, anchor);
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
   * 平滑跟踪到锚点位置（使用 quickTo 实现高性能动画）
   */
  _smoothTrackToAnchor(entry, anchor) {
    if (!entry || !anchor || !entry.element) return;
    
    const { element, quickSetters } = entry;
    const rect = element.getBoundingClientRect();
    
    // 计算目标位置（锚点是中心点）
    const targetX = anchor.x - rect.width / 2;
    const targetY = anchor.y - rect.height / 2;
    const targetScale = anchor.scale || 1;
    const targetRotation = anchor.rotation || 0;
    
    // 使用 quickTo 平滑过渡
    if (quickSetters) {
      quickSetters.x(targetX);
      quickSetters.y(targetY);
      quickSetters.scale(targetScale);
      quickSetters.rotation(targetRotation);
    }
  }

  /**
   * 应用锚点位置到元素（立即设置，无动画）
   */
  setGlobalAnchorEl(name, element) {
    if (!name || !element) return;
    
    const updatePosition = () => {
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
   * 执行动画
   * @param {Object} payload - 动画载荷
   * @param {string|number} payload.id - 元素 ID
   * @param {Object} payload.to - 目标属性 { x?, y?, scale?, rotate?, opacity? }
   * @param {number} payload.duration - 持续时间（毫秒）
   * @param {string} payload.ease - 缓动函数
   * @param {string} payload.anchor - 目标锚点名称
   * @param {string} payload.instructionId - 完成回调标识
   */
  animate(payload) {
    const { id, to = {}, duration = 300, ease = defaultEase, anchor, instructionId, effect } = payload;

    const entry = this._registry.get(id);
    if (!entry) {
      console.warn('[animator] animate: element not registered', id);
      // 立即通知完成
      if (instructionId) {
        frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
      }
      return;
    }

    const { element, adapter } = entry;

    // 标记为正在播放动画指令（阻止锚点跟踪）
    entry.isPlayingInstruction = true;

    // 清理旧动画（包括 quickTo 创建的动画）
    try {
      gsap.killTweensOf(element);
    } catch (_) {}

    // 处理特殊效果
    if (effect === 'shake') {
      this._applyShakeEffect(element, payload);
      if (instructionId) {
        setTimeout(() => {
          frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
        }, duration);
      }
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
      console.log(`[animator] Animating element ${id} to anchor:`, {
        anchor,
        anchorPoint,
        elementSize: { width: rect.width, height: rect.height },
        targetTransform: { x: props.x, y: props.y }
      });
    }

    // 合并其他属性
    if (to.x != null) props.x = to.x;
    if (to.y != null) props.y = to.y;
    if (to.scale != null) props.scale = to.scale;
    if (to.rotate != null) props.rotate = to.rotate;
    if (to.opacity != null) props.autoAlpha = to.opacity;

    // 执行动画
    const tween = gsap.to(element, {
      ...props,
      duration: Math.max(0.001, duration / 1000),
      ease,
      force3D: true,
      lazy: false,
      overwrite: 'auto',
      onComplete: () => {
        try {
          adapter.afterAnimate(element, payload);
        } catch (_) {}
        
        // 动画指令完成，恢复锚点跟踪
        entry.isPlayingInstruction = false;
        
        // 如果有锚点，且锚点跟踪已启用，则恢复平滑跟踪
        if (this._anchorTrackingEnabled && entry.anchor && !entry.isDragging) {
          this._smoothTrackToAnchor(entry, entry.anchor);
        }
        
        // 通知完成
        if (instructionId) {
          frontendEventBus.emit('animation-instruction-finished', { id: instructionId });
        }
      }
    });

    entry.currentAnimation = tween;
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

  // ========== 拖拽状态管理 ==========

  /**
   * 开始拖拽（暂停锚点跟踪）
   */
  startDragging(id) {
    const entry = this._registry.get(id);
    if (!entry) return;
    
    entry.isDragging = true;
    
    // 清理所有 quickTo 创建的动画
    try {
      gsap.killTweensOf(entry.element);
    } catch (_) {}
    
    console.log(`[animator] Start dragging: ${id}`);
  }

  /**
   * 结束拖拽（恢复锚点跟踪）
   */
  stopDragging(id) {
    const entry = this._registry.get(id);
    if (!entry) return;
    
    entry.isDragging = false;
    
    // 恢复锚点跟踪
    if (this._anchorTrackingEnabled && entry.anchor && !entry.isPlayingInstruction) {
      this._smoothTrackToAnchor(entry, entry.anchor);
    }
    
    console.log(`[animator] Stop dragging: ${id}`);
  }

  /**
   * 设置锚点跟踪配置
   */
  setAnchorTrackingConfig({ enabled, duration, ease } = {}) {
    if (enabled != null) this._anchorTrackingEnabled = enabled;
    if (duration != null) this._anchorTrackingDuration = duration;
    if (ease != null) this._anchorTrackingEase = ease;
    
    // 更新所有已注册元素的 quickSetters
    for (const [id, entry] of this._registry.entries()) {
      if (entry.element) {
        entry.quickSetters = {
          x: gsap.quickTo(entry.element, 'x', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase }),
          y: gsap.quickTo(entry.element, 'y', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase }),
          scale: gsap.quickTo(entry.element, 'scale', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase }),
          rotation: gsap.quickTo(entry.element, 'rotation', { duration: this._anchorTrackingDuration, ease: this._anchorTrackingEase })
        };
      }
    }
  }

  /**
   * 重置所有动画
   */
  reset() {
    for (const [id, entry] of this._registry.entries()) {
      try {
        gsap.killTweensOf(entry.element);
      } catch (_) {}
    }
    this._registry.clear();
    this._containerAnchors.clear();
  }
}

// 导出单例
const animator = new Animator();

export default animator;
