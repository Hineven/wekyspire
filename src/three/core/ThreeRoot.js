/**
 * ThreeRoot - Three.js渲染核心
 *
 * 职责：
 * - 管理Scene、Camera、Renderer
 * - 提供统一渲染循环入口
 * - 管理后处理管线PassStack
 * - 处理视口变化与DPI适配
 */

import * as THREE from 'three';
import { getAnimationRuntime } from '../ecs/systems/AnimationRuntime.js';
import PassStack from './PassStack.js';

class ThreeRoot {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.passStack = null;
    this.renderCallbacks = [];
    this.isRunning = false;
    this.lastTime = 0;
    this.hostElement = null;

    // 性能监控
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.fps = 0;
  }

  /**
   * 初始化并挂载到DOM容器
   * @param {HTMLElement} hostElement - 挂载容器
   * @param {Object} options - 配置选项
   */
  init(hostElement, options = {}) {
    this.hostElement = hostElement;

    const {
      fov = 50,
      near = 0.1,
      far = 2000,
      cameraZ = 100,
      backgroundColor = 0x000000,
      backgroundAlpha = 0
    } = options;

    // 创建Scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // 透明背景，后续通过后处理管线设置

    // 创建Camera（透视相机）
    const aspect = hostElement.clientWidth / hostElement.clientHeight;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.z = cameraZ;

    // 创建Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: true
    });

    // 设置DPR（限制最大为2避免性能问题）
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(hostElement.clientWidth, hostElement.clientHeight);

    // 启用阴影（可选）
    this.renderer.shadowMap.enabled = false; // 初期关闭，需要时再开启
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 挂载Canvas
    hostElement.appendChild(this.renderer.domElement);

    // 创建后处理管线
    this.passStack = new PassStack(this.renderer, this.scene, this.camera);

    // 监听窗口变化
    this._onWindowResize = this._handleWindowResize.bind(this);
    window.addEventListener('resize', this._onWindowResize);

    console.log('[ThreeRoot] Initialized', {
      size: { width: hostElement.clientWidth, height: hostElement.clientHeight },
      dpr,
      camera: { fov, aspect, position: this.camera.position }
    });

    // 启动渲染循环
    this.start();

    return this;
  }

  /**
   * 启动渲染循环
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastFpsTime = this.lastTime;
    this._renderLoop();
    console.log('[ThreeRoot] Render loop started');
  }

  /**
   * 停止渲染循环
   */
  stop() {
    this.isRunning = false;
    console.log('[ThreeRoot] Render loop stopped');
  }

  /**
   * 渲染循环主函数
   */
  _renderLoop() {
    if (!this.isRunning) return;

    requestAnimationFrame(() => this._renderLoop());

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // 更新FPS
    this.frameCount++;
    if (currentTime - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = currentTime;
    }

    // 更新动画系统（deltaTime转换为秒）
    const animationRuntime = getAnimationRuntime();
    if (animationRuntime.isInitialized) {
      animationRuntime.update(deltaTime / 1000);
    }

    // 执行渲染回调（ECS系统更新）
    for (const callback of this.renderCallbacks) {
      callback(deltaTime);
    }

    // 后处理渲染或直接渲染
    if (this.passStack && this.passStack.hasActivePasses()) {
      this.passStack.render(deltaTime);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * 添加渲染回调
   * @param {Function} callback - 回调函数，接收deltaTime参数
   */
  addRenderCallback(callback) {
    if (typeof callback !== 'function') {
      console.warn('[ThreeRoot] addRenderCallback: callback is not a function');
      return;
    }
    this.renderCallbacks.push(callback);
  }

  /**
   * 移除渲染回调
   * @param {Function} callback - 要移除的回调函数
   */
  removeRenderCallback(callback) {
    const index = this.renderCallbacks.indexOf(callback);
    if (index > -1) {
      this.renderCallbacks.splice(index, 1);
    }
  }

  /**
   * 处理窗口大小变化
   */
  _handleWindowResize() {
    if (!this.hostElement) return;

    const width = this.hostElement.clientWidth;
    const height = this.hostElement.clientHeight;

    // 更新相机
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // 更新渲染器
    this.renderer.setSize(width, height);

    // 更新后处理管线
    if (this.passStack) {
      this.passStack.setSize(width, height);
    }

    console.log('[ThreeRoot] Window resized:', { width, height });
  }

  /**
   * 获取Scene
   */
  getScene() {
    return this.scene;
  }

  /**
   * 获取Camera
   */
  getCamera() {
    return this.camera;
  }

  /**
   * 获取Renderer
   */
  getRenderer() {
    return this.renderer;
  }

  /**
   * 获取PassStack
   */
  getPassStack() {
    return this.passStack;
  }

  /**
   * 获取当前FPS
   */
  getFPS() {
    return this.fps;
  }

  /**
   * 清理资源
   */
  dispose() {
    this.stop();

    // 移除事件监听
    window.removeEventListener('resize', this._onWindowResize);

    // 清理后处理管线
    if (this.passStack) {
      this.passStack.dispose();
      this.passStack = null;
    }

    // 清理场景
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      this.scene.clear();
      this.scene = null;
    }

    // 清理渲染器
    if (this.renderer) {
      if (this.hostElement && this.renderer.domElement.parentNode === this.hostElement) {
        this.hostElement.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }

    // 清理回调
    this.renderCallbacks = [];

    this.camera = null;
    this.hostElement = null;

    console.log('[ThreeRoot] Disposed');
  }
}

// 单例模式
let threeRootInstance = null;

export function getThreeRoot() {
  if (!threeRootInstance) {
    threeRootInstance = new ThreeRoot();
  }
  return threeRootInstance;
}

export default ThreeRoot;

