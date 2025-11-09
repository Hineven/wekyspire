# 前端三维与文本渲染全面重构阶段性规划 (Three.js + Troika)

> 目标：以一次版本迭代在专用重构分支中完成从「Vue + DOM + Pixi 局部覆盖」到「Three.js 场景主导 + Troika 文本 + 少量 Vue HUD/Overlay」的体系化迁移；获得高阶图形能力（全屏后处理 Filter、粒子、平面/拟物光照、卡牌碎裂与扭曲、统一动画与特效调度），同时提升性能与可维护性。

---
## 现状架构快速审视 (Baseline)

### 组成
- Vue 作为主框架，路由仅两页：`GameApp` / `DebugApp`。
- 游戏根界面 `GameApp.vue` 组合多层 DOM：Start/Battle/Rest/End 屏 + 对话 + Cutscene + AudioController + 粒子 + Tooltip + AnimatableElementContainer + Pixi Overlay 等。
- 图形：
    - Pixi 用于：
        1. 全屏背景着色器(`GameBackgroundScreen`)。
        2. 卡牌“烘焙后”的贴图层 (`GamePixiOverlay`)，通过 `BakeManager` + `snapdom/html2canvas` 将 DOM SkillCard 克隆为 Texture 再加滤镜特效。
    - DOM 层直接渲染卡牌、状态面板、日志等。
- 动画：
    - `animator.js` 管理 DOM 元素（卡牌/面板）定位与状态：tracking/animating/dragging；使用 GSAP；通过 `getTransformsSnapshotByAdapter('card')` 每帧提供几何快照给 Pixi overlay 对齐。
    - 特效脉冲/滤镜：`renderers/effects` 内多种 state/pulse/anim effect，注入 Pixi.Sprite filters。
    - 指令级动画队列：`animationSequencer` + mitt 事件总线（frontendEventBus）。
- 事件系统：
    - `frontendEventBus` 控制动画、特效、UI 提示、音效播放、粒子生成。
    - `backendEventBus` 驱动逻辑与玩家输入。
- 粒子：当前 DOM 粒子（简单样式对象）通过事件 `spawn-particles` 分发，后续有意迁移到 WebGL。
- 文本：大量普通 DOM 文本 & 中文，未来需统一 Troika Text (MSDF 或 SDF 字形)。

### 痛点
1. 双层渲染（DOM + Pixi 烘焙）导致：尺寸、更新、滤镜、销毁路径复杂（MutationObserver/ResizeObserver/Bake 队列）。
2. 卡牌与特效动画在 DOM 与 Pixi 之间分裂；需同步 transform snapshot，难以做 3D/扭曲/光照。
3. 全屏高级后处理（屏幕扭曲、辉光、景深、体积光、粒子叠加）受 Pixi 限制；需要更灵活的 Three.js 管线与可组合 Pass。
4. 文本未来需要 3D 布局、曲面贴合、统一抗锯齿与发光；当前 DOM 不易做批量优化。
5. 性能：频繁 DOM 测量 + html2canvas/snapdom 烘焙开销大；滤镜 filter 重建与纹理销毁路径复杂，GC 压力高。

### 保留的 Vue 层
- 全局的轻逻辑 HUD/Overlay：音频控制按钮、变更日志 (ChangeLog)、可能的玩家输入弹窗、当前的对话系统。它们对高级图形和特效滤镜动画交互要求低，可继续保留 DOM。
- **其余所有**内容完全移动至 Three.js 场景与 ECS 体系！

---
## 目标技术栈 & 架构蓝图

### 技术栈选型
- Three.js：主渲染场景，使用 WebGL2 / WebGPU (未来可选)；自定义渲染循环。
- Troika-Three-Text：高性能文本材质；支持曲面、抗锯齿、距离场；统一内外发光/描边。
- Post-processing：`three/examples/jsm/postprocessing` 或 `postprocessing` 库 + 自定义 Pass (扭曲、色调映射、Bloom、屏幕空间畸变、动态遮罩)。
- 粒子：
    - 简单：InstancedMesh + shader；
    - 高级：GPUComputationRenderer 或基于 transform feedback；
    - 特效库可自研或集成 `threlte/gsap` 组合。
- 动画：统一改为“指令/状态驱动 + 帧内调度”，使用：
    - 通用：Custom Tween，部分逻辑可借鉴原有的 animator.js 思路，但动画Tween和插值不再依赖GSAP，需要自行编写。
    - 特殊：由 Object 3D 组件自行监听前端事件总线和管理。
- 状态 -> 视图：
    - 保留 displayGameState。
    - 新增 `SceneGraphAdapter`：将游戏实体（技能卡、敌人、玩家、粒子群、特效）映射为 Three.js Object3D。
      - 迁移`AnimatableElementContainer`中部分逻辑至此。
- 事件桥接：继续使用 mitt；复用 `frontendEventBus`。

### 分层示意
```
[Game Logic / backendGameState]
          | (animation instructions)
[AnimationSequencer]
          | (events)
[displayGameState] --(diff/adapter)--> [SceneGraphAdapter] --> [Three.js Scene]
                                                   |--> [PostProcessing Chain]
                                                   |--> [Particle Systems]
                                                   |--> [Troika Text Nodes]
[Vue HUD Overlays] (Audio / Changelog / Input / Dialog)
```

---
# 无回退 / 一次性极速重构方案 (Big-Bang Fast Path)

> 前提：一次性版本更新内完成迁移；允许重构期功能残缺；不保留 Pixi 与 DOM 卡牌/烘焙；目标是最快搭建 Three.js + Troika 的长期健康基础。

## 总体思路
一次性切断旧链路：删除 Pixi/DOM-烘焙/双轨动画，建立极简 Three 场景 + 轻量 ECS/数据层，直连动画、文本、粒子与特效。优先达成“可显示 + 可交互 + 可扩展”的骨架，样式与高级表现最后补。

## 阶段规划

| 阶段     | 目标                                              | 关键产物                                                          | 立即删掉                                             |
|--------|-------------------------------------------------|---------------------------------------------------------------|--------------------------------------------------|
| F0     | 根场景+渲染循环+输入                                     | ThreeRoot + 主循环                                               | —                                                |
| F1     | ECS/数据结构+实体注册                                   | EntityStore + CardEntity                                      | AnimatableElementContainer, BakeManager, domBake |
| F2.1   | Troika 文本                                       | TextFactory+字体子集                                              | DOM SkillCard 可见部分                               |
| F2.2   | 迁移内容组件                                          | ColoredText、BarPoint、EffectIcon、Tooltip等内容组件（用于为渲染卡牌、面板等提供支持） | BarPoint、EffectIcon、FloatingTooltip等             |
| F3.1   | 迁移可动画的面板                                        | PlayerPanel等Component                                         | PlayerStatusPanel、EnemyStatusPanel等              |
| F3.2   | 卡牌（几何+贴图+简材质）                                   | Atlas 打包脚本/基础 Shader                                          | Pixi 依赖, GamePixiOverlay.vue                     |
| F4     | 输入/拖拽 (Raycaster)                               | PointerController                                             | DOM 拖拽逻辑                                         |
| F5     | 动画/指令统一                                         | AnimationRuntime(tween池)                                      | 旧 animate-element 事件处理（改路由）                      |
| F6     | 粒子引擎(Instanced)                                 | ParticleEngine+Emit API                                       | DOM 粒子 / spawn-particles DOM handlers            |
| F7     | 基础特效                                            | Shader uniforms & effect registry                             | Pixi filters / renderers/effects/*               |
| F8     | 后处理管线                                           | Composer+PassStack                                            | GameBackgroundScreen.vue (Pixi)                  |
| F9     | Vue HUD 复位                                      | OverlayLayer 抽象                                               | 与卡牌相关 DOM                                        |
| F10    | 收束/回填                                           | 最小战斗循环                                                        | 旧死代码                                             |
| Beyond | 继续迁移RestStage、StartScreen等非战斗阶段（stage = battle）的前端能力 | ...                                                           | ...                                              |

总工期预估：8–9 天净开发（视复杂度浮动）。

## 删除清单
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
  ecs/components/UI/*（内容组件）
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

## 动画策略（去除 GSAP，迁移animator逻辑，内置 tween 池）
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

## 事件映射
- animate-element → AnimationRuntime.enqueue
- overlay:effect:add → EffectSystem.attach(entity, effectName, opts)
- spawn-particles → ParticleSystem.emitBurst
- card-drag-* → 仍然透传 animator

