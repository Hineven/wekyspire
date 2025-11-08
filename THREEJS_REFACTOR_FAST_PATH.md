# 无回退 / 一次性极速重构方案 (Big-Bang Fast Path)

> 前提：一次性版本更新内完成迁移；允许重构期功能残缺；不保留 Pixi 与 DOM 卡牌/烘焙；目标是最快搭建 Three.js + Troika 的长期健康基础。

## 总体思路
一次性切断旧链路：删除 Pixi/DOM-烘焙/双轨动画，建立极简 Three 场景 + 轻量 ECS/数据层，直连动画、文本、粒子与特效。优先达成“可显示 + 可交互 + 可扩展”的骨架，样式与高级表现最后补。

## 快速阶段 (压缩版)
| 阶段 | 目标 | 时间盒 | 关键产物 | 立即删掉 |
|------|------|--------|----------|----------|
| F0  | 根场景+渲染循环+输入 | 0.5 天 | ThreeRoot + 主循环 | — |
| F1  | ECS/数据结构+实体注册 | 1 天 | EntityStore + CardEntity | animator.js, BakeManager, domBake |
| F2  | 卡牌几何+贴图+简材质 | 1 天 | Atlas 打包脚本/基础 Shader | Pixi 依赖, GamePixiOverlay.vue |
| F3  | Troika 文本 (名/费) | 0.5 天 | TextFactory+字体子集 | DOM SkillCard 可见部分 |
| F4  | 输入/拖拽 (Raycaster) | 0.5 天 | PointerController | DOM 拖拽逻辑 |
| F5  | 动画/指令统一 | 1 天 | AnimationRuntime(tween池) | 旧 animate-element 事件处理（改路由） |
| F6  | 粒子引擎(Instanced) | 1 天 | ParticleEngine+Emit API | DOM 粒子 / spawn-particles DOM handlers |
| F7  | 基础特效 | 1 天 | Shader uniforms & effect registry | Pixi filters / renderers/effects/* |
| F8  | 后处理管线 | 0.5 天 | Composer+PassStack | GameBackgroundScreen.vue (Pixi) |
| F9  | HUD 复位 | 0.5 天 | OverlayLayer 抽象 | 与卡牌相关 DOM |
| F10 | 收束/回填 | 1-2 天 | 最小战斗循环 | 旧死代码 |

总工期预估：8–9 天净开发（视复杂度浮动）。

## 删除清单（Day 1 物理删除）
- src/webgl/PixiAppManager.js
- src/webgl/BakeManager.js
- src/webgl/domBake.js
- src/components/global/GamePixiOverlay.vue
- src/components/global/AnimatableElementContainer.vue（直接移除或留空壳）
- src/renderers/effects/*（全部改写为 Three 版）
- 依赖移除：pixi.js、html2canvas、@zumer/snapdom
- 旧效果 Watcher：disabledEffectWatcher.js、cooldownEffectWatcher.js（逻辑迁入新 EffectSystem）

## 新目录结构（目标）
```
src/three/
  core/ThreeRoot.js
  core/PassStack.js
  ecs/EntityStore.js
  ecs/components/Card.js
  ecs/components/Unit.js
  ecs/systems/AnimationRuntime.js
  ecs/systems/EffectSystem.js
  ecs/systems/ParticleSystem.js
  materials/CardMaterial.js
  materials/Effects/*
  particles/emitters/BasicEmitter.js
  text/TextFactory.js
  shaders/card/* (card base, glow, dissolve)
  shaders/post/* (bloom, distor, vignette)
```

## 实体与系统（简化 ECS）
- Components: Transform, CardVisual, TextLabel, Cooldown, Highlight, Disabled, ParticleEmitter。
- Systems 每帧：AnimationRuntime → EffectSystem → ParticleSystem → Render。

## 动画策略（去 GSAP，内置 tween 池）
- addTween({ entity, prop: 'position.x', from, to, duration, ease })。
- 对象池 + 帧内线性扫描；并行动画合并为批函数，减少分配与回调成本。

## Dissolve/Burn Shader 要点
- 噪声纹理 + 进度 uProgress 控制 discard；边缘发光叠加；uTime 驱动闪烁/扰动。

## 中文文本快速占位策略
1. 第一步：英文/数字优先；中文先用位图贴图（离线导出 PNG）。
2. 第二步：常用汉字 3-5k MSDF；缺字异步补齐。
3. TextFactory.ensureGlyphs(text) 管理延迟加载与替换。

## 输入/拖拽重写
- Canvas 监听 pointerdown/move/up；Raycaster 拾取卡牌；更新 Transform；释放触发后端事件（不做 DOM fallback）。

## 粒子系统速成
- CPU 版：positions/velocities/life 数组 + InstancedMesh；后续换 GPUCompute。
- API: emitBurst(type, center, count, options)。

## 事件映射（快速改造）
- animate-element → AnimationRuntime.enqueue
- overlay:effect:add → EffectSystem.attach(entity, effectName, opts)
- spawn-particles → ParticleSystem.emitBurst
- card-drag-* → 内部 PointerController 处理，不再透传 animator

## 快捷校验（烟雾测试）
- DevSceneBootstrap：创建 5 张卡+往返 tween+每 2 秒粒子爆发+切换一张卡燃烧；目视稳定且内存无上升。

## 性能优先级（Big-Bang 下）
1. 先减少依赖与对象创建；
2. renderer.setAnimationLoop + clock.getDelta；
3. Geometry/Material 对象池；
4. 调试阶段关闭后处理，最后接入。

## 风险（无回退取舍）
- 开发中断：在重构分支上高频 push；
- 文本可读性：临时位图过渡；
- 特效短缺：后期集中补齐；
- 自研 tween bug：写 3 个核心单测（线性/倒序/重入）。

## Day 1 操作清单（可直接执行）
1. 删除上文列出的文件与依赖；新增 three、troika-three-text。
2. 新建 three/core/ThreeRoot.js，并在 GameApp.vue 挂载（绝对定位 canvas）。
3. 新建 EntityStore，渲染一个红色平面当卡牌。
4. 写最小 tween 管线驱动 position.x 往返。
5. 提交：feat(three): big-bang skeleton。

## ThreeRoot 最小伪代码
```js
export class ThreeRoot {
  constructor({ domParent }) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.scene = new Scene();
    this.camera = new OrthographicCamera(0, window.innerWidth, window.innerHeight, 0, -1000, 1000);
    domParent.appendChild(this.renderer.domElement);
    this._loop = this._loop.bind(this);
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }
  _loop(t){
    const dt = t - this._last; this._last = t;
    // update systems...
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}
```

## 成功判定（Big-Bang 版）
- 旧渲染/动画相关文件已删除；`grep -i pixi` 为空；
- 可显示 Three 卡牌，支持拖拽与使用事件；
- 至少 1 个特效 + 1 个动画 + 1 个粒子工作；
- Troika 正常显示卡名；
- 包体积减少（移除 Pixi/html2canvas/snapdom）。

## 下一步
在 F5 之前不优化材质外观；先打通数据/指令/交互，再集中补光照/后处理/特效，避免返工。

