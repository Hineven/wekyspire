// 全局动画编排器（DOM + GSAP）
// 职责：
// - 初始化 overlay/anchors/ghost 容器引用
// - 生成“幽灵”克隆元素并用 transform 动画
// - 提供卡牌动画原语（飞行/渐隐/旋转/缩放等）与常用序列助手

import frontendEventBus from '../frontendEventBus.js';
import gsap from 'gsap';

const defaultEase = 'power2.out';

const orchestrator = {
  overlayEl: null,
  centerAnchorEl: null,
  deckAnchorEl: null,
  ghostContainerEl: null,

  init({ overlayEl, centerAnchorEl, deckAnchorEl, ghostContainerEl }) {
    this.overlayEl = overlayEl;
    this.centerAnchorEl = centerAnchorEl;
    this.deckAnchorEl = deckAnchorEl;
    this.ghostContainerEl = ghostContainerEl;
  },

  // 工具：测量/克隆/计算
  getRect(el) { return el?.getBoundingClientRect?.() || null; },
  getAnchor(nameOrEl) {
    if (!nameOrEl) return null;
    if (typeof nameOrEl === 'string') {
      if (nameOrEl === 'center') return this.centerAnchorEl;
      if (nameOrEl === 'deck') return this.deckAnchorEl;
      return null;
    }
    return nameOrEl;
  },
  getAnchorPoint(nameOrEl) {
    const el = this.getAnchor(nameOrEl);
    const r = this.getRect(el);
    if (!r) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: r.left, y: r.top };
  },
  createGhostFromEl(startEl, startRect) {
    if (!this.ghostContainerEl || !startEl || !startRect) return null;
    const ghost = startEl.cloneNode(true);
    Object.assign(ghost.style, {
      position: 'absolute',
      left: `${startRect.left}px`,
      top: `${startRect.top}px`,
      width: `${startRect.width}px`,
      height: `${startRect.height}px`,
      margin: '0',
      transformOrigin: 'center center',
      pointerEvents: 'none',
    });
    ghost.classList.add('animation-ghost');
    this.ghostContainerEl.appendChild(ghost);
    // 初始化transform基线，确保x/y可用
    gsap.set(ghost, { x: 0, y: 0, force3D: true });
    // 保险：禁用任何继承/克隆来的 CSS 动画，避免与 GSAP transform 冲突
    ghost.classList.remove('activating');
    ghost.style.animation = 'none';
    ghost.style.animationName = 'none';
    return ghost;
  },
  // 将屏幕点作为“卡牌中心”目标，换算为 transform x/y
  offsetsToPoint(startRect, point) {
    return {
      x: point.x - startRect.left - startRect.width / 2,
      y: point.y - startRect.top - startRect.height / 2
    };
  },

  // 原语：对幽灵元素进行一次 tween（支持 x/y/scale/rotate/opacity 按段配置）
  tweenGhost(ghost, props = {}, durationMs = 350, ease = defaultEase) {
    const tweenProps = { ...props };
    if (typeof tweenProps.opacity === 'number') tweenProps.autoAlpha = tweenProps.opacity;
    delete tweenProps.opacity;
    return gsap.to(ghost, { duration: Math.max(0.001, durationMs / 1000), ease, ...tweenProps });
  },

  // 高阶：按 steps 顺序执行动画（steps 支持 toPoint/toAnchor/delta/scale/rotate/opacity/holdMs）
  async playCardSequence(startEl, steps = [], { hideStart = true } = {}) {
    if (!startEl || !this.overlayEl) return;
    const startRect = this.getRect(startEl);
    if (!startRect) return;

    const ghost = this.createGhostFromEl(startEl, startRect);
    if (hideStart) { try { startEl.style.visibility = 'hidden'; } catch (_) {} }

    const finish = () => {
      try { ghost.remove(); } catch (_) {}
      if (hideStart) { try { startEl.style.visibility = ''; } catch (_) {} }
    };

    const tl = gsap.timeline({ onComplete: finish });

    for (const step of steps) {
      const { duration = 350, ease = defaultEase, holdMs = 0 } = step;
      const props = {};
      if (step.toPoint) {
        const o = this.offsetsToPoint(startRect, step.toPoint);
        props.x = o.x; props.y = o.y;
      } else if (step.toAnchor) {
        const p = this.getAnchorPoint(step.toAnchor);
        const o = this.offsetsToPoint(startRect, p);
        props.x = o.x; props.y = o.y;
      } else if (step.delta) {
        // 相对位移：在已有 transform 基础上叠加（用 "+="写法）
        props.x = `+=${step.delta.dx || 0}`;
        props.y = `+=${step.delta.dy || 0}`;
      }
      if (typeof step.scale === 'number') props.scale = step.scale;
      if (typeof step.rotate === 'number') props.rotate = step.rotate;
      if (typeof step.opacity === 'number') props.autoAlpha = step.opacity;

      // tween
      tl.to(ghost, { ...props, duration: Math.max(0.001, duration / 1000), ease });
      // hold（使用 x:'+=0' 作为无变化 tween，保证时间线前进）
      if (holdMs > 0) tl.to(ghost, { x: '+=0', duration: holdMs / 1000, ease: 'none' });
    }

    await new Promise(resolve => {
      tl.eventCallback('onComplete', () => { finish(); resolve(); });
      tl.play(0);
    });
  },

  // 常用序列助手
  async seqFlyToCenter(startEl, { scale = 1.2, durationMs = 350, holdMs = 0 } = {}) {
    return this.playCardSequence(startEl, [
      { toAnchor: 'center', scale, duration: durationMs, ease: 'power2.out', holdMs }
    ]);
  },
  async seqCastAtCenter(startEl, { pulseScale = 1.35, pulseMs = 220, repeats = 1 } = {}) {
    const steps = [];
    for (let i = 0; i < repeats; i++) {
      steps.push({ scale: pulseScale, duration: pulseMs, ease: 'power2.out' });
      steps.push({ scale: 1.2, duration: pulseMs, ease: 'power2.in' });
    }
    return this.playCardSequence(startEl, steps, { hideStart: false });
  },
  async seqFlyToDeckFade(startEl, { durationMs = 400 } = {}) {
    return this.playCardSequence(startEl, [
      { toAnchor: 'deck', scale: 0.5, rotate: 20, duration: durationMs, ease: 'power2.in' },
      { opacity: 0, duration: 120 }
    ]);
  },
  async seqPlayToCenterThenDeck(startEl, { centerHoldMs = 350, totalMs = 900 } = {}) {
    const first = 350;
    const rest = Math.max(300, totalMs - first - centerHoldMs);
    return this.playCardSequence(startEl, [
      { toAnchor: 'center', scale: 1.2, duration: first, ease: 'power2.out', holdMs: centerHoldMs },
      { toAnchor: 'deck', scale: 0.5, rotate: 20, duration: rest, ease: 'power2.in' }
    ]);
  },
  async seqAppearFromDeckToEl(startEl, { durationMs = 450, startScale = 0.6, fade = true, id = null } = {}) {
    if (!startEl || !this.overlayEl) return;
    const startRect = this.getRect(startEl);
    if (!startRect) return;

    const deck = this.getAnchorPoint('deck');
    const fromOffset = this.offsetsToPoint(startRect, deck);

    const ghost = this.createGhostFromEl(startEl, startRect);
    // 隐藏原件直到动画完成
    try { startEl.style.visibility = 'hidden'; } catch (_) {}

    // 初始化ghost在“牌库处”
    gsap.set(ghost, { x: fromOffset.x, y: fromOffset.y, scale: startScale, autoAlpha: fade ? 0 : 1, force3D: true });

    await new Promise(resolve => {
      gsap.to(ghost, {
        duration: Math.max(0.001, durationMs / 1000),
        x: 0, y: 0, scale: 1, autoAlpha: 1,
        ease: 'power2.out',
        onComplete: () => {
          try { ghost.remove(); } catch (_) {}
          try { startEl.style.visibility = ''; } catch (_) {}
          // 通知外部动画完成
          try { frontendEventBus.emit('card-appear-finished', { id }); } catch (_) {}
          resolve();
        }
      });
    });
  },

  // 兼容旧接口
  async flyCardToCenterThenToDeck({ startEl, hideStart = true, centerScale = 1.2, centerHoldMs = 350, totalMs = 900 }) {
    return this.seqPlayToCenterThenDeck(startEl, { centerHoldMs, totalMs });
  }
};

// 事件总线桥接：允许外部直接通过事件触发原语或序列
frontendEventBus.on('animate-card-play', async (payload = {}) => {
  try {
    const el = payload.el || null;
    if (!el) return;
    if (Array.isArray(payload.steps) && payload.steps.length) {
      await orchestrator.playCardSequence(el, payload.steps, { hideStart: payload.hideStart !== false });
    } else if (payload.kind === 'centerThenDeck') {
      await orchestrator.seqPlayToCenterThenDeck(el, payload.options || {});
    } else if (payload.kind === 'flyToCenter') {
      await orchestrator.seqFlyToCenter(el, payload.options || {});
    } else if (payload.kind === 'flyToDeckFade') {
      await orchestrator.seqFlyToDeckFade(el, payload.options || {});
    } else if (payload.kind === 'appearFromDeck') {
      await orchestrator.seqAppearFromDeckToEl(el, payload.options || {});
    } else {
      await orchestrator.seqPlayToCenterThenDeck(el, {});
    }
  } catch (_) {}
});

export default orchestrator;
