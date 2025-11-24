/**
 * PassStack - 后处理管线管理器
 *
 * 职责：
 * - 管理后处理Pass序列
 * - 提供Pass的动态添加/移除
 * - 支持Pass参数实时调整
 */

import { EffectComposer } from 'postprocessing';
import { RenderPass } from 'postprocessing';

class PassStack {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // 创建EffectComposer
    this.composer = new EffectComposer(renderer);

    // 添加基础RenderPass
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Pass注册表 { name: { pass, priority, enabled } }
    this.passes = new Map();

    console.log('[PassStack] Initialized');
  }

  /**
   * 添加Pass
   * @param {string} name - Pass名称（唯一标识）
   * @param {Pass} pass - Pass实例
   * @param {number} priority - 优先级（越小越靠前，默认100）
   * @param {boolean} enabled - 是否启用（默认true）
   */
  addPass(name, pass, priority = 100, enabled = true) {
    if (this.passes.has(name)) {
      console.warn(`[PassStack] Pass "${name}" already exists, replacing...`);
      this.removePass(name);
    }

    // 注册Pass
    this.passes.set(name, { pass, priority, enabled });

    // 重新排序并添加到composer
    this._rebuildComposer();

    console.log(`[PassStack] Added pass "${name}" with priority ${priority}`);
  }

  /**
   * 移除Pass
   * @param {string} name - Pass名称
   */
  removePass(name) {
    const passInfo = this.passes.get(name);
    if (!passInfo) {
      console.warn(`[PassStack] Pass "${name}" not found`);
      return;
    }

    // 从composer移除
    this.composer.removePass(passInfo.pass);

    // 清理资源
    if (passInfo.pass.dispose) {
      passInfo.pass.dispose();
    }

    // 从注册表移除
    this.passes.delete(name);

    console.log(`[PassStack] Removed pass "${name}"`);
  }

  /**
   * 获取Pass实例
   * @param {string} name - Pass名称
   * @returns {Pass|null}
   */
  getPass(name) {
    const passInfo = this.passes.get(name);
    return passInfo ? passInfo.pass : null;
  }

  /**
   * 启用/禁用Pass
   * @param {string} name - Pass名称
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(name, enabled) {
    const passInfo = this.passes.get(name);
    if (!passInfo) {
      console.warn(`[PassStack] Pass "${name}" not found`);
      return;
    }

    passInfo.enabled = enabled;
    passInfo.pass.enabled = enabled;

    console.log(`[PassStack] Pass "${name}" ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 检查是否有激活的Pass
   */
  hasActivePasses() {
    for (const [name, info] of this.passes) {
      if (info.enabled) {
        return true;
      }
    }
    return false;
  }

  /**
   * 重建Composer（根据priority排序）
   */
  _rebuildComposer() {
    // 清空所有Pass（除了基础RenderPass）
    while (this.composer.passes.length > 1) {
      this.composer.removePass(this.composer.passes[1]);
    }

    // 按priority排序
    const sortedPasses = Array.from(this.passes.entries())
      .sort((a, b) => a[1].priority - b[1].priority);

    // 重新添加Pass
    for (const [name, info] of sortedPasses) {
      info.pass.enabled = info.enabled;
      this.composer.addPass(info.pass);
    }
  }

  /**
   * 设置大小
   */
  setSize(width, height) {
    this.composer.setSize(width, height);
  }

  /**
   * 渲染
   */
  render(deltaTime) {
    this.composer.render(deltaTime / 1000); // EffectComposer expects seconds
  }

  /**
   * 清理资源
   */
  dispose() {
    // 清理所有Pass
    for (const [name, info] of this.passes) {
      if (info.pass.dispose) {
        info.pass.dispose();
      }
    }
    this.passes.clear();

    // 清理Composer
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }

    console.log('[PassStack] Disposed');
  }
}

export default PassStack;

