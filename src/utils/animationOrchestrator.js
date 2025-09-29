// 全局动画编排器（DOM + GSAP）
// 职责：
// - 初始化 overlay/anchors/ghost 容器引用
// - 生成“幽灵”克隆元素并用 transform 动画
// - 仅通过 animateById 进行动画调度与 ghost 创建，其他路径不再创建 ghost

import frontendEventBus from '../frontendEventBus.js';
import gsap from 'gsap';
import { getCardEl } from './cardDomRegistry.js';

const defaultEase = 'power2.out';

const orchestrator = {
  overlayEl: null,
  centerAnchorEl: null,
  deckAnchorEl: null,
  ghostContainerEl: null,
  // 记录：按ID缓存ghost，确保连续指令可复用状态
  // id -> { ghost, baseRect, startEl }
  _ghostRegistry: new Map(),
  // 全局“时代戳”（reset代次）。当 resetAllGhosts 发生时用于屏蔽旧任务
  _epoch: 0,
  _bumpEpoch() { this._epoch++; return this._epoch; },
  // 排空模式：用于 resetAllGhosts 等待“之前提交”的动画自然结束
  _draining: false,
  _drainEpoch: null,

  // 公共步骤构建器：在不同入口（animateById/后端）共享
  buildSteps: {
    flyToCenter({ scale = 1.2, durationMs = 350, holdMs = 0 } = {}) {
      return [
        { toAnchor: 'center', scale, duration: durationMs, ease: defaultEase, holdMs }
      ];
    },
    centerThenDeck({ centerHoldMs = 350, totalMs = 900 } = {}) {
      const first = 350;
      const rest = Math.max(300, totalMs - first - centerHoldMs);
      return [
        { toAnchor: 'center', scale: 1.2, duration: first, ease: defaultEase, holdMs: centerHoldMs },
        { toAnchor: 'deck', scale: 0.5, rotate: 20, duration: rest, ease: 'power2.in' }
      ];
    },
    flyToDeckFade({ durationMs = 400 } = {}) {
      return [
        { toAnchor: 'deck', scale: 0.5, rotate: 20, duration: durationMs, ease: 'power2.in' },
        { opacity: 0, duration: 120 }
      ];
    },
    exhaustBurn({ durationMs = 500, scaleUp = 1.15 } = {}) {
      const t1 = Math.max(80, Math.floor(durationMs * 0.35));
      const t2 = Math.max(120, durationMs - t1);
      const emitCfg = { kind: 'burn', intervalMs: 70, burst: 10 };
      return [
        // 放大阶段，同时持续冒火星
        { scale: scaleUp, duration: t1, ease: defaultEase, emitParticles: emitCfg },
        // 淡出消亡阶段，同时继续冒火星
        { rotate: 0, opacity: 0, duration: t2, ease: 'power1.in', emitParticles: emitCfg }
      ];
    },
    appearFromDeck({ durationMs = 450 } = {}) {
      // 需配合 initialFromDeck=true 使用
      return [
        { toBase: true, scale: 1, opacity: 1, duration: durationMs, ease: defaultEase }
      ];
    }
  },

  init({ overlayEl, centerAnchorEl, deckAnchorEl, ghostContainerEl }) {
    this.overlayEl = overlayEl;
    this.centerAnchorEl = centerAnchorEl;
    this.deckAnchorEl = deckAnchorEl;
    this.ghostContainerEl = ghostContainerEl;
  },

  // 工具：测量/锚点/换算
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
      // 以下设置似乎会引起未知故障，先注释掉
      // width: `${startRect.width}px`,
      // height: `${startRect.height}px`,
      margin: '0',
      transformOrigin: 'center center',
      pointerEvents: 'none',
    });
    ghost.classList.add('animation-ghost');
    this.ghostContainerEl.appendChild(ghost);
    gsap.set(ghost, { x: 0, y: 0, force3D: true });
    // 保险：禁用克隆来的 CSS 动画，避免与 GSAP transform 冲突
    ghost.classList.remove('activating');
    ghost.style.animation = 'none';
    ghost.style.animationName = 'none';
    return ghost;
  },
  offsetsToPoint(startRect, point) {
    return {
      x: point.x - startRect.left - startRect.width / 2,
      y: point.y - startRect.top - startRect.height / 2
    };
  },

  // 粒子效果：在幽灵卡片中心附近发射燃烧火星
  _emitBurnParticles(ghost, { burst = 10 } = {}) {
    if (!ghost) return;
    try {
      const r = ghost.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const particles = [];
      for (let i = 0; i < burst; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const speed = 40 + Math.random() * 120;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const size = 5 + Math.random() * 5;
        const life = 800 + Math.random() * 600;
        const colorPick = Math.random();
        const color = colorPick < 0.5 ? '#cf1818' : (colorPick < 0.8 ? '#ffd166' : '#ff6f00');
        particles.push({
          x: cx + (Math.random() - 0.5) * (r.width),
          y: cy + (Math.random() - 0.5) * (r.height),
          vx,
          vy,
          color,
          life,
          gravity: 0,
          size,
          opacity: 1,
          zIndex: 6,
          drag: 0.05,
        });
      }
      frontendEventBus.emit('spawn-particles', particles);
    } catch (_) {}
  },

  // 内部：按ID确保存在ghost（仅 animateById 调用）
  _ensureGhostById(id, startEl, options = {}) {
    const { initialFromDeck = false, startScale = 0.6, fade = true, hideStart = true, killOnReuse = true, preGhostInvisible = false } = options;
    if (id !== null && id !== undefined && this._ghostRegistry.has(id)) {
      const entry = this._ghostRegistry.get(id);
      if (killOnReuse) { try { gsap.killTweensOf(entry.ghost); } catch (_) {} }
      return entry;
    }
    if (!startEl) return null;
    const baseRect = this.getRect(startEl);
    if (!baseRect) return null;
    const ghost = this.createGhostFromEl(startEl, baseRect);
    if (!ghost) return null;
    if (hideStart) { try { startEl.style.visibility = 'hidden'; } catch (_) {} }
    if (initialFromDeck) {
      const deck = this.getAnchorPoint('deck');
      const fromOffset = this.offsetsToPoint(baseRect, deck);
      gsap.set(ghost, { x: fromOffset.x, y: fromOffset.y, scale: startScale, autoAlpha: fade ? 0 : 1, force3D: true });
    } else {
      gsap.set(ghost, { x: 0, y: 0, scale: 1, autoAlpha: preGhostInvisible ? 0 : 1, force3D: true });
    }
    const entry = { ghost, baseRect, startEl };
    if (id !== null && id !== undefined) this._ghostRegistry.set(id, entry);
    return entry;
  },
  _cleanupGhostById(id, { restoreStart = false } = {}) {
    if (id === null || id === undefined) return;
    const entry = this._ghostRegistry.get(id);
    if (!entry) return;
    const { ghost, startEl } = entry;
    try { gsap.killTweensOf(ghost); } catch (_) {}
    try { ghost.remove(); } catch (_) {}
    if (restoreStart) { try { startEl.style.visibility = ''; } catch (_) {} }
    this._ghostRegistry.delete(id);
  },

  // ID版本：使用“已存在”的ghost执行 steps；本函数不创建 ghost
  async playCardSequenceById(startEl, id, steps = [], options = {}) {
    if (!this.overlayEl) return;
    const { hideStart = true, endMode = 'keep', scheduledEpoch, revealGhostOnStart = true } = options;
    // 排空期间：仅允许在 reset 调用前提交的动画继续执行
    if (this._draining) {
      if (scheduledEpoch !== this._drainEpoch) return;
    } else if (scheduledEpoch !== undefined && scheduledEpoch !== this._epoch) {
      return;
    }
    const entry = this._ghostRegistry.get(id);
    if (!entry) return; // 无可用ghost：无法执行该动画
    const { ghost, baseRect, startEl: registeredStartEl } = entry;

    // 开场处理：隐藏原DOM、显示ghost
    try {
      const originEl = startEl || registeredStartEl;
      if (hideStart && originEl) originEl.style.visibility = 'hidden';
    } catch (_) {}
    if (revealGhostOnStart) { try { gsap.set(ghost, { autoAlpha: 1 }); } catch (_) {} }

    try { gsap.killTweensOf(ghost); } catch (_) {}
    const tl = gsap.timeline();

    for (const step of steps) {
      // 自定义 lambda：在该处即时执行（插入到时间轴）
      if (typeof step.call === 'function') {
        tl.add(() => {
          try { step.call({ ghost, baseRect, orchestrator: this }); } catch (_) {}
        });
        // 支持 call 后的等待
        if (step.holdMs && step.holdMs > 0) tl.to(ghost, { x: '+=0', duration: step.holdMs / 1000, ease: 'none' });
        continue;
      }

      const { duration = 350, ease = defaultEase, holdMs = 0, emitParticles } = step;
      const props = {};
      if (step.toPoint) {
        const o = this.offsetsToPoint(baseRect, step.toPoint);
        props.x = o.x; props.y = o.y;
      } else if (step.toAnchor) {
        const p = this.getAnchorPoint(step.toAnchor);
        const o = this.offsetsToPoint(baseRect, p);
        props.x = o.x; props.y = o.y;
      } else if (step.delta) {
        props.x = `+=${step.delta.dx || 0}`;
        props.y = `+=${step.delta.dy || 0}`;
      } else if (step.toBase) {
        props.x = 0; props.y = 0;
      }
      if (typeof step.scale === 'number') props.scale = step.scale;
      if (typeof step.rotate === 'number') props.rotate = step.rotate;
      if (typeof step.opacity === 'number') props.autoAlpha = step.opacity;

      // 构建 tween，并在需要时添加 onUpdate 节流触发粒子
      if (emitParticles && emitParticles.kind === 'burn') {
        const interval = Math.max(30, emitParticles.intervalMs || 70);
        const burst = Math.max(3, emitParticles.burst || 8);
        let lastEmit = -1;
        tl.to(ghost, {
          ...props,
          duration: Math.max(0.001, duration / 1000),
          ease,
          onUpdate: function () {
            // this.time() 单位：秒 -> 毫秒
            const elapsed = this.time() * 1000;
            if (lastEmit < 0 || elapsed - lastEmit >= interval) {
              lastEmit = elapsed;
              try { orchestrator._emitBurnParticles(ghost, { burst }); } catch (_) {}
            }
          }
        });
      } else {
        tl.to(ghost, { ...props, duration: Math.max(0.001, duration / 1000), ease });
      }

      if (holdMs > 0) tl.to(ghost, { x: '+=0', duration: holdMs / 1000, ease: 'none' });
    }

    await new Promise(resolve => {
      tl.eventCallback('onComplete', () => { resolve(); });
      tl.play(0);
    });

    // 结束策略
    if (endMode === 'restore') this._cleanupGhostById(id, { restoreStart: true });
    else if (endMode === 'destroy') this._cleanupGhostById(id, { restoreStart: false });
    // keep: 保留ghost
  },

  // 重置所有ghost（例如切屏/退出战斗时）：排空队列 -> 清理 -> 关闭排空
  async resetAllGhosts({ restoreStart = true } = {}) {
    // 建立“排空屏障”：记录此刻的epoch，并立即推进到下一代，阻断之后提交的新动画
    const drainEpoch = this._epoch;
    this._draining = true;
    this._drainEpoch = drainEpoch;
    this._bumpEpoch();

    // 截取当前各ID队列的末尾promise，等待它们结算（表示“此刻之前提交”的动画都已完成”）
    const tails = Array.from(_idChains.values()).map(p => p.catch(() => {}));
    try { await Promise.all(tails); } catch (_) {}

    // 执行清理：注册表 + DOM 兜底
    for (const id of Array.from(this._ghostRegistry.keys())) {
      this._cleanupGhostById(id, { restoreStart });
    }
    try {
      if (this.ghostContainerEl) {
        const nodes = Array.from(this.ghostContainerEl.querySelectorAll('.animation-ghost'));
        for (const n of nodes) {
          try { gsap.killTweensOf(n); } catch (_) {}
          try { n.remove(); } catch (_) {}
        }
      }
    } catch (_) {}

    // 清空队列并关闭“排空模式”
    try { if (typeof _idChains?.clear === 'function') _idChains.clear(); } catch (_) {}
    this._draining = false;
    this._drainEpoch = null;
  },
};

// Helper to animate by id (backend-driven)
const _idChains = new Map();
async function animateById({ id, kind, options = {}, steps, hideStart }) {
  // 在入队前“抢先”克隆ghost，避免后续状态同步删除DOM后无法创建幽灵
  try {
    const preEl = getCardEl(id);
    if (preEl && orchestrator.overlayEl) {
      const preOpts = { hideStart: false, killOnReuse: false };
      if (kind === 'appearFromDeck') {
        preOpts.initialFromDeck = true;
        preOpts.startScale = (options && options.startScale) != null ? options.startScale : 0.6;
        preOpts.fade = (options && options.fade) != null ? options.fade : true;
      } else {
        preOpts.preGhostInvisible = true; // 预创建ghost保持不可见，避免双影
      }
      orchestrator._ensureGhostById(id, preEl, preOpts);
    }
  } catch (_) {}

  const scheduledEpoch = orchestrator._epoch;
  const run = async () => {
    // 排空期间：仅允许在 reset 调用前提交的动画继续执行；否则仅允许当前时代
    if (orchestrator._draining) {
      if (scheduledEpoch !== orchestrator._drainEpoch) return;
    } else if (scheduledEpoch !== orchestrator._epoch) {
      return;
    }
    const el = getCardEl(id) || null;

    // 自定义steps：直接执行到ghost（不创建）
    if (Array.isArray(steps) && steps.length) {
      await orchestrator.playCardSequenceById(el, id, steps, { scheduledEpoch, hideStart: hideStart !== false, ...(options || {}) });
      return;
    }

    // 预置序列：使用步骤构建器
    switch (kind) {
      case 'appearFromDeck': {
        const { durationMs = 450, startScale = 0.6, fade = true } = options || {};
        const built = orchestrator.buildSteps.appearFromDeck({ durationMs });
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: true, endMode: 'restore', initialFromDeck: true, startScale, fade });
        try { frontendEventBus.emit('card-appear-finished', { id }); } catch (_) {}
        break;
      }
      case 'centerThenDeck': {
        const built = orchestrator.buildSteps.centerThenDeck(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'destroy' });
        break;
      }
      case 'flyToCenter': {
        const built = orchestrator.buildSteps.flyToCenter(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'keep' });
        break;
      }
      case 'flyToDeckFade':
      case 'drop': {
        const built = orchestrator.buildSteps.flyToDeckFade(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'destroy' });
        break;
      }
      case 'exhaust':
      case 'burn': {
        const built = orchestrator.buildSteps.exhaustBurn(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'destroy' });
        break;
      }
      default: {
        const built = orchestrator.buildSteps.flyToCenter(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'keep' });
      }
    }
  };

  // 同一id动画排队（前序promise若拒绝也不阻塞后续）
  const prev = _idChains.get(id) || Promise.resolve();
  const safePrev = prev.catch(() => {});
  const next = safePrev.then(() => run());
  _idChains.set(id, next);
  next.finally(() => {
    if (_idChains.get(id) === next) _idChains.delete(id);
  });
  return next;
}

frontendEventBus.on('animate-card-by-id', async (payload = {}) => {
  try { await animateById(payload || {}); } catch (_) {}
});

frontendEventBus.on('clear-card-animations', () => {
  orchestrator.resetAllGhosts({ restoreStart: true });
});

export { animateById };
export default orchestrator;
