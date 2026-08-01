// StageManager（§4.1）：单全屏 canvas 的 three.js 舞台总管。
// 世界坐标约定：屏幕高度 = 100 世界单位，原点在屏幕中心，y 向上，x 向右。
// 布局一律用世界坐标计算；resize 只改相机视锥，不动任何场景对象。
// 相机选 OrthographicCamera（2.5D 牌桌要的是稳定比例，透视畸变只会添乱）。
// 显示假设：游玩分辨率固定 16:9（1920x1080，世界宽 ≈177.8），不做其它比例适配。

import * as THREE from 'three';

export const WORLD_HEIGHT = 100;

// 世界内 z 分层（renderOrder 约定，数值即约定本身，勿散写魔法数）
export const Z_LAYERS = Object.freeze({
  BACKGROUND: 0,
  TABLE: 10,
  HAND_CARD: 20,     // 手牌在 LayoutEngine 里另有 10+i 的局部 z（挂到 HAND_CARD 层组内）
  UNIT: 30,
  PARTICLE: 40,
  EFFECT: 50,
});

export class StageManager {
  /**
   * @param {object} options
   *   worldHeight: number = 100
   *   createRenderer: ({canvas}) => renderer-like   缺省 new THREE.WebGLRenderer（浏览器）；
   *     单测注入假 renderer（{ render(){}, setSize(){}, dispose(){} }）
   */
  constructor(options = {}) {
    this._worldHeight = options.worldHeight || WORLD_HEIGHT;
    this._createRenderer = options.createRenderer || (({ canvas }) => new THREE.WebGLRenderer({ canvas, antialias: true }));
    this._renderer = null;
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this._camera.position.z = 100;
    this._stage = null;         // 当前场景包装：{ name, scene, onEnter?, onExit? }
    this._running = false;
    this._rafId = null;
    this._viewWidth = 0;
    this._viewHeight = 0;
    this._clock = null;         // start 时创建（node 无 performance 场景注入）
    this._tickHandlers = new Set(); // 每帧回调（粒子系统等）：fn(dtSeconds)
  }

  /** 注册每帧回调，返回注销函数。 */
  onTick(fn) {
    this._tickHandlers.add(fn);
    return () => this._tickHandlers.delete(fn);
  }

  get camera() { return this._camera; }
  get stage() { return this._stage; }
  get worldHeight() { return this._worldHeight; }
  get worldWidth() { return this._viewHeight > 0 ? this._worldHeight * (this._viewWidth / this._viewHeight) : 0; }

  attach(canvas) {
    this._renderer = this._createRenderer({ canvas });
    return this;
  }

  resize(width, height) {
    this._viewWidth = width;
    this._viewHeight = height;
    const halfH = this._worldHeight / 2;
    const halfW = halfH * (width / height);
    this._camera.left = -halfW;
    this._camera.right = halfW;
    this._camera.top = halfH;
    this._camera.bottom = -halfH;
    this._camera.updateProjectionMatrix();
    this._renderer?.setSize?.(width, height);
  }

  /** 屏幕像素 → 世界坐标（Picker 用）。 */
  screenToWorld(px, py) {
    const halfH = this._worldHeight / 2;
    const halfW = halfH * (this._viewWidth / this._viewHeight);
    return {
      x: (px / this._viewWidth) * 2 * halfW - halfW,
      y: halfH - (py / this._viewHeight) * 2 * halfH,
    };
  }

  /**
   * 场景切换。stage: { name, scene: THREE.Scene, onEnter?(manager), onExit?(manager) }
   */
  setStage(stage) {
    if (this._stage === stage) return;
    this._stage?.onExit?.(this);
    this._stage = stage;
    this._stage?.onEnter?.(this);
  }

  start() {
    if (this._running || !this._renderer) return;
    this._running = true;
    this._clock = new THREE.Clock();
    const tick = () => {
      if (!this._running) return;
      const dt = Math.min(this._clock.getDelta(), 0.1); // 掉帧保护：单帧最多推进 100ms
      for (const fn of this._tickHandlers) fn(dt);
      if (this._stage) this._renderer.render(this._stage.scene, this._camera);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stop() {
    this._running = false;
    if (this._rafId != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  dispose() {
    this.stop();
    this._renderer?.dispose?.();
    this._renderer = null;
  }
}
