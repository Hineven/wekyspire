// 全局卡牌动画编排器（DOM + GSAP）
// 仅管理“卡牌相关”的复杂动画，不负责其它类型动画。
// 特性：
// - 对每一张卡片（按 uniqueID）维护一个“异步动画播放队列”：
//   同一张卡的动画指令会按顺序串行执行，不会相互打断；不同卡片的动画可并发播放。
// - 通过 animateById 进行动画调度与 ghost 创建，其他路径不再创建 ghost。

import frontendEventBus from '../frontendEventBus.js';
import gsap from 'gsap';
import { getCardEl } from './cardDomRegistry.js';

/*
通用卡牌转移动画事件机制（新增）
---------------------------------
为支持“卡牌在多个前端容器之间转移”且保持松耦合，新增以下事件：
  card-transfer-start
  card-transfer-end

事件在 orchestrator 内部于每次 animateById 任务真正开始前/完成后发射。
载荷（payload）结构：
{
  id: <number|string>,            // 卡牌唯一ID
  kind: <string>,                 // 动画种类（appearFromAnchor / centerThenDeck / flyToDeckFade / exhaust ...）
  type: <string>,                 // 语义化转移类型（如 'appear' / 'move' / 'focus' / 'exhaust' 等，具体由调用方或自动推断）
  from: <string|undefined>,       // 来源容器标识（可选）
  to: <string|undefined>,         // 目标容器标识（可选）
  token: <string>,                // 唯一标记（如果调用方未提供将自动生成）
  phase: 'start' | 'end'          // 事件阶段
}

当前仅在 kind === 'appearFromAnchor' 且调用方未提供 transfer 时自动生成：
  { type: 'appear', from: options.anchor || 'deck', to: options.toContainer || 'skills-hand' }

调用方也可在触发 'animate-card-by-id' 时传入自定义 transfer 对象，以覆盖/补充以上字段。

容器组件（如 SkillsHand）应监听 card-transfer-end，匹配自身 containerKey === payload.to 后再执行显示/状态更新，避免硬编码某个旧事件名。
*/

const defaultEase = 'power2.out';

const orchestrator = {
  overlayEl: null,
  centerAnchorEl: null,
  deckAnchorEl: null,
  ghostContainerEl: null,
  // 记录：按ID缓存ghost，确保连续指令可复用状态
  // id -> { ghost, baseRect, startEl }
  _ghostRegistry: new Map(),
  // 管理在中心展示的卡片ID列表（按加入顺序）
  _centerIds: [],
  _layoutCenterDurationMs: 220,
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
    exhaustBurn({ durationMs = 500, scaleUp = 1.15, particle = {} } = {}) {
      // particle: { intervalMs, burst, particleConfig }
      const t1 = Math.max(80, Math.floor(durationMs * 0.35));
      const t2 = Math.max(120, durationMs - t1);
      const emitCfg = {
        intervalMs: particle.intervalMs ?? 70,
        burst: particle.burst ?? 10,
        particleConfig: {
          colors: (particle.particleConfig && particle.particleConfig.colors) || ['#cf1818', '#ffd166', '#ff6f00'],
          size: (particle.particleConfig && particle.particleConfig.size) || [5, 10],
          speed: (particle.particleConfig && particle.particleConfig.speed) || [40, 160],
            // life: ms
          life: (particle.particleConfig && particle.particleConfig.life) || [800, 1400],
          gravity: (particle.particleConfig && particle.particleConfig.gravity) ?? 0,
          drag: (particle.particleConfig && particle.particleConfig.drag) || [0.05, 0.05],
          zIndex: (particle.particleConfig && particle.particleConfig.zIndex) ?? 6,
          spread: (particle.particleConfig && particle.particleConfig.spread) || 1
        }
      };
      return [
        // 放大阶段，同时持续冒粒子
        { scale: scaleUp, duration: t1, ease: defaultEase, emitParticles: emitCfg },
        // 淡出阶段
        { rotate: 0, opacity: 0, duration: t2, ease: 'power1.in', emitParticles: emitCfg }
      ];
    },
    appearFromAnchor({ durationMs = 300 } = {}) {
      // 需配合 initialFromAnchor 使用
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
    try {
      window.addEventListener('resize', () => { try { this._layoutCenter(); } catch (_) {} }, { passive: true });
    } catch (_) {}
  },
  // 中心管理：注册/移除/清空
  _addToCenter(id) {
    if (id == null) return;
    if (!this._centerIds.includes(id)) this._centerIds.push(id);
    this._layoutCenter();
  },
  _removeFromCenter(id) {
    if (id == null) return;
    const idx = this._centerIds.indexOf(id);
    if (idx >= 0) {
      this._centerIds.splice(idx, 1);
      this._layoutCenter();
    }
  },
  _clearCenter() {
    if (this._centerIds.length > 0) {
      this._centerIds.splice(0, this._centerIds.length);
    }
  },
  // 根据 centerAnchor 对 _centerIds 的幽灵进行横向排布
  _layoutCenter() {
    try {
      if (!this._centerIds.length) return;
      const count = this._centerIds.length;
      const anchor = this.getAnchorPoint('center');
      const gap = 220; // 卡片横向间隔
      const half = (count - 1) / 2;
      for (let i = 0; i < count; i++) {
        const id = this._centerIds[i];
        const entry = this._ghostRegistry.get(id);
        if (!entry) continue;
        const { ghost, baseRect } = entry;
        const targetPoint = { x: anchor.x + (i - half) * gap, y: anchor.y };
        const o = this.offsetsToPoint(baseRect, targetPoint);
        try {
          gsap.to(ghost, { x: o.x, y: o.y, scale: 1.2, duration: Math.max(0.001, this._layoutCenterDurationMs / 1000), ease: defaultEase });
          ghost.style.zIndex = String(100 + i);
        } catch (_) {}
      }
    } catch (_) {}
  },

  // 工具：测量/锚点/换算
  getRect(el) { return el?.getBoundingClientRect?.() || null; },
  getAnchor(nameOrEl) {
    if (!nameOrEl) return null;
    if (typeof nameOrEl === 'string') {
      if (nameOrEl === 'center') return this.centerAnchorEl;
      if (nameOrEl === 'deck') return this.deckAnchorEl;
      if (nameOrEl === 'activated') return this.activatedAnchorEl;
      return null;
    }
    return nameOrEl;
  },
  getAnchorPoint(nameOrEl) {
    if (!nameOrEl) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    if (typeof nameOrEl === 'object' && typeof nameOrEl.x === 'number' && typeof nameOrEl.y === 'number') {
      return { x: nameOrEl.x, y: nameOrEl.y };
    }
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
      margin: '0',
      transformOrigin: 'center center',
      pointerEvents: 'none',
    });
    ghost.classList.add('animation-ghost');
    this.ghostContainerEl.appendChild(ghost);
    gsap.set(ghost, { x: 0, y: 0, force3D: true });
    // 禁用克隆来的 CSS 动画，避免与 GSAP transform 冲突
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

  // 通用粒子发射（基于配置）
  _emitParticles(ghost, { burst = 10, particleConfig = {} } = {}) {
    if (!ghost) return;
    try {
      const r = ghost.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const cfg = particleConfig || {};
      const colors = cfg.colors || ['#cf1818', '#ffd166', '#ff6f00'];
      const sizeRange = cfg.size || [5, 10];
      const speedRange = cfg.speed || [40, 160];
      const lifeRange = cfg.life || [800, 1400];
      const dragRange = cfg.drag || [0.05, 0.05];
      const gravity = cfg.gravity ?? 0;
      const spread = cfg.spread || 1; // 乘以卡片宽高
      const zIndex = cfg.zIndex ?? 6;
      const particles = [];
      for (let i = 0; i < burst; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
        const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);
        const color = colors[Math.floor(Math.random() * colors.length)] || '#ffffff';
        const drag = dragRange[0] + Math.random() * (dragRange[1] - dragRange[0]);
        particles.push({
          x: cx + (Math.random() - 0.5) * (r.width * spread),
          y: cy + (Math.random() - 0.5) * (r.height * spread),
          vx, vy, color, life, gravity, size, opacity: 1, zIndex, drag,
        });
      }
      frontendEventBus.emit('spawn-particles', particles);
    } catch (_) {}
  },

  // 内部：按ID确保存在ghost（仅 animateById 调用）
  _ensureGhostById(id, startEl, options = {}) {
    const { initialFromAnchor = null, startScale = 0.6, fade = true, hideStart = true, killOnReuse = true, preGhostInvisible = false } = options;
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
    if (initialFromAnchor) {
      const anchorPoint = this.getAnchorPoint(initialFromAnchor);
      const fromOffset = this.offsetsToPoint(baseRect, anchorPoint);
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

  // 使用“已存在”的ghost执行 steps；本函数不创建 ghost
  async playCardSequenceById(startEl, id, steps = [], options = {}) {
    if (!this.overlayEl) return;
    const { hideStart = true, endMode = 'keep', scheduledEpoch, revealGhostOnStart = true } = options;
    if (this._draining) {
      if (scheduledEpoch !== this._drainEpoch) return;
    } else if (scheduledEpoch !== undefined && scheduledEpoch !== this._epoch) {
      return;
    }
    let entry = this._ghostRegistry.get(id);
    if (!entry) {
      console.warn("[cardAnimationOrchestrator] 无法执行动画：找不到幽灵", id, startEl, steps, options);
      return;
    }

    const { ghost, baseRect, startEl: registeredStartEl } = entry;

    try {
      const originEl = startEl || registeredStartEl;
      if (hideStart && originEl && originEl.style.visibility !== 'hidden') originEl.style.visibility = 'hidden';
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
      if (emitParticles) {
        const interval = Math.max(10, emitParticles.intervalMs || 70);
        const burst = Math.max(1, emitParticles.burst || 8);
        let lastEmit = -1;
        tl.to(ghost, {
          ...props,
            duration: Math.max(0.001, duration / 1000),
          ease,
          onUpdate: () => {
            const elapsed = tl.time() * 1000; // timeline time in ms
            if (lastEmit < 0 || elapsed - lastEmit >= interval) {
              lastEmit = elapsed;
              try { orchestrator._emitParticles(ghost, { burst, particleConfig: emitParticles.particleConfig }); } catch (_) {}
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
  },

  // 重置所有ghost
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

    // 清空中心展示列表
    try { this._clearCenter(); } catch (_) {}

    // 清空队列并关闭“排空模式”
    try { if (typeof _idChains?.clear === 'function') _idChains.clear(); } catch (_) {}
    this._draining = false;
    this._drainEpoch = null;
  },
};

// Helper to animate by id (backend-driven)
const _idChains = new Map();
async function animateById({ id, kind, options = {}, steps, hideStart, completionToken, transfer }) {
  // 预创建 ghost
  try {
    const preEl = getCardEl(id);
    if (preEl && orchestrator.overlayEl) {
      const preOpts = { hideStart: false, killOnReuse: false };
      if (kind === 'appearFromAnchor') {
        preOpts.initialFromAnchor = options.anchor || 'deck';
        preOpts.startScale = (options && options.startScale) != null ? options.startScale : 0.6;
        preOpts.fade = (options && options.fade) != null ? options.fade : true;
      } else {
        preOpts.preGhostInvisible = true;
      }
      orchestrator._ensureGhostById(id, preEl, preOpts);
    }
  } catch (_) {}

  // 若调用方未提供 transfer 且是 appearFromAnchor，自动生成一份基础转移描述
  if (!transfer && kind === 'appearFromAnchor') {
    transfer = {
      type: 'appear',
      from: options.anchor || 'deck',
      to: options.toContainer || 'skills-hand'
    };
  }
  // 生成 token（可由外部预先提供）
  if (transfer) {
    if (!transfer.token) transfer.token = `${Date.now()}-${id}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const scheduledEpoch = orchestrator._epoch;
  const run = async () => {
    if (orchestrator._draining) {
      if (scheduledEpoch !== orchestrator._drainEpoch) {
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
        return;
      }
    } else if (scheduledEpoch !== orchestrator._epoch) {
      if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
      return;
    }
    const el = getCardEl(id) || null;

    // 通用：在真正开始播放前发出转移动画开始事件
    if (transfer) {
      try { frontendEventBus.emit('card-transfer-start', { id, kind, ...transfer, phase: 'start' }); } catch (_) {}
    }

    const emitEnd = (extra = {}) => {
      if (transfer) {
        try { frontendEventBus.emit('card-transfer-end', { id, kind, ...transfer, phase: 'end', ...extra }); } catch (_) {}
      }
    };

    if (Array.isArray(steps) && steps.length) {
      await orchestrator.playCardSequenceById(el, id, steps, { scheduledEpoch, hideStart: hideStart !== false, ...(options || {}) });
      emitEnd();
      if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
      return;
    }

    switch (kind) {
      case 'appearFromAnchor': {
        const { durationMs = 300, startScale = 0.6, fade = true } = options || {};
        const built = orchestrator.buildSteps.appearFromAnchor({ durationMs });
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: true, endMode: 'restore', initialFromAnchor: (options.anchor || 'deck'), startScale, fade });
        // 兼容旧事件（将在后续版本废弃）
        try { frontendEventBus.emit('card-appear-finished', { id }); } catch (_) {}
        emitEnd();
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
        break;
      }
      case 'centerThenDeck': {
        const built = orchestrator.buildSteps.centerThenDeck(options || {});
        try { orchestrator._removeFromCenter(id); } catch (_) {}
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'destroy' });
        emitEnd();
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
        break;
      }
      case 'flyToCenter': {
        const built = orchestrator.buildSteps.flyToCenter(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'keep' });
        try { orchestrator._addToCenter(id); } catch (_) {}
        emitEnd();
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
        break;
      }
      case 'flyToDeckFade':
      case 'drop': {
        const built = orchestrator.buildSteps.flyToDeckFade(options || {});
        try { orchestrator._removeFromCenter(id); } catch (_) {}
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'destroy' });
        emitEnd();
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
        break;
      }
      case 'exhaust':
      case 'burn': { // burn 兼容旧名称
        const built = orchestrator.buildSteps.exhaustBurn(options || {});
        try { orchestrator._removeFromCenter(id); } catch (_) {}
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'destroy' });
        emitEnd();
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
        break;
      }
      default: {
        const built = orchestrator.buildSteps.flyToCenter(options || {});
        await orchestrator.playCardSequenceById(el, id, built, { scheduledEpoch, hideStart: hideStart !== false, endMode: 'keep' });
        try { orchestrator._addToCenter(id); } catch (_) {}
        emitEnd();
        if (completionToken) try { frontendEventBus.emit('animation-card-by-id-finished', { token: completionToken }); } catch (_) {}
      }
    }
  };
  const prev = _idChains.get(id) || Promise.resolve();
  const safePrev = prev.catch(() => {});
  const next = safePrev.then(() => run());
  _idChains.set(id, next);
  next.finally(() => { if (_idChains.get(id) === next) _idChains.delete(id); });
  return next;
}

frontendEventBus.on('animate-card-by-id', async (payload = {}) => { try { await animateById(payload || {}); } catch (_) {} });
frontendEventBus.on('clear-card-animations', () => { orchestrator.resetAllGhosts({ restoreStart: true }); try { orchestrator._clearCenter(); } catch (_) {} });
export { animateById }; export default orchestrator;
