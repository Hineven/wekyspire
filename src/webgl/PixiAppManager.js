import * as PIXI from 'pixi.js';

/**
 * PixiAppManager - 全局 Pixi 单例与图层管理
 */
class PixiAppManager {
  static instance = null;

  /**
   * 初始化并挂载到容器
   * @param {HTMLElement} host - 挂载容器
   */
  static init(host) {
    if (this.instance) return this.instance;
    const app = new PIXI.Application({
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      powerPreference: 'high-performance'
    });
    host.appendChild(app.view);

    // 禁止拦截事件，让下方 DOM 可交互
    app.view.style.pointerEvents = 'none';
    app.stage.sortableChildren = true;

    // DPR 适配
    const onResize = () => {
      const res = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      app.renderer.resolution = res;
      app.renderer.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    onResize();

    const layers = new Map();
    const getLayer = (name, zIndex = 0) => {
      if (layers.has(name)) return layers.get(name);
      const c = new PIXI.Container();
      c.sortableChildren = true;
      c.zIndex = zIndex;
      app.stage.addChild(c);
      layers.set(name, c);
      return c;
    };

    this.instance = { app, PIXI, getLayer };
    return this.instance;
  }

  static get() {
    if (!this.instance) throw new Error('PixiAppManager not initialized');
    return this.instance;
  }
}

export default PixiAppManager;

