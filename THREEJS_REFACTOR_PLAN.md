# 前端三维与文本渲染全面重构阶段性规划 (Three.js + Troika)

> 目标：以一次版本迭代在专用重构分支中完成从「Vue + DOM + Pixi 局部覆盖」到「Three.js 场景主导 + Troika 文本 + 少量 Vue HUD/Overlay」的体系化迁移；获得高阶图形能力（全屏后处理 Filter、粒子、平面/拟物光照、卡牌碎裂与扭曲、统一动画与特效调度），同时提升性能与可维护性。

---
## 0. 现状架构快速审视 (Baseline)

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
- 轻逻辑 HUD/Overlay：音频控制按钮、变更日志 (ChangeLog)、可能的玩家输入弹窗 / 简单消息框。它们对 3D 交互要求低，可继续保留 DOM。

---
## 1. 目标技术栈 & 架构蓝图

### 技术栈选型
- Three.js：主渲染场景，使用 WebGL2 / WebGPU (未来可选)；自定义渲染循环。
- Troika-Three-Text：高性能文本材质；支持曲面、抗锯齿、距离场；统一内外发光/描边。
- Post-processing：`three/examples/jsm/postprocessing` 或 `postprocessing` 库 + 自定义 Pass (扭曲、色调映射、Bloom、屏幕空间畸变、动态遮罩)。
- 粒子：
  - 简单：InstancedMesh + shader；
  - 高级：GPUComputationRenderer 或基于 transform feedback；
  - 特效库可自研或集成 `threlte/gsap` 组合。
- 动画：统一改为“指令/状态驱动 + 帧内调度”，使用：
  - 低频：GSAP/Custom Tween (保留)；
  - 高频批量：自写属性插值（对象池）。
- 状态 -> 视图：
  - 保留 displayGameState / backendGameState。
  - 新增 `SceneGraphAdapter`：将游戏实体（技能卡、敌人、玩家、粒子群、特效）映射为 Three.js Object3D。
- 事件桥接：继续使用 mitt；新增 `threeEventBus` 或复用 `frontendEventBus`，增加命名空间/前缀区分。

### 分层示意
```
[Game Logic / backendGameState]
          | (events)
[Display State] --(diff/adapter)--> [SceneGraphAdapter] --> [Three.js Scene]
                                                   |--> [PostProcessing Chain]
                                                   |--> [Particle Systems]
                                                   |--> [Troika Text Nodes]
[Vue HUD Overlays] (Audio / Changelog / Input Dialog)
```

---
## 2. 分阶段重构路线概览

| 阶段 | 名称 | 关键产物 | 风险等级 | 可回退性 |
|------|------|----------|----------|---------|
| P0 | 基线与抽象铺垫 | 目录结构、初始化骨架、适配层接口草稿 | 低 | 完全保留旧逻辑 |
| P1 | Three.js 核心舞台接入 | `ThreeRoot`、渲染循环、Resize、基本摄像机 | 低 | 可并行运行 Pixi |
| P2 | 场景实体抽象 (Card/Unit) | `SceneGraphAdapter`、实体生命周期 | 中 | DOM 仍保留 |
| P3 | 卡牌从 DOM->Three 迁移 (视觉) | CardMesh、材质系统、光照测试 | 高 | 回退到烘焙纹理 Pixi |
| P4 | 动画系统统一 | 新 `AnimationRuntime` 替换 animator 部分路径 | 高 | 暂时双写两套动画 |
| P5 | Troika 文本接入与文本迁移 | TextFactory、字体打包 & 缓存 | 中 | DOM 文本回退 |
| P6 | 粒子 & 特效体系 | ParticleEngine、EffectSpawner | 中 | 非关键逻辑可延后 |
| P7 | 后处理与屏幕特效 | Pass 管线 (Bloom/Distor/Lighting) | 中 | 可按能力逐步启用 |
| P8 | 性能优化 & 资源管线 | 纹理压缩、对象池、剔除、批处理 | 中 | 调优迭代 |
| P9 | 移除 Pixi + DOM 卡牌层 | 删除烘焙路径、清理观察者 | 高 | 一次性切换 |
| P10 | 收束与 QA | 回归测试、文档、指标对比 | 中 | 若性能差可部分回退 |

---
## 3. 阶段详细规划

### P0 基线与抽象铺垫
任务:
1. 创建 `src/three/` 目录：`core/ThreeRoot.js`, `adapters/SceneGraphAdapter.js`, `materials/`, `effects/`, `particles/`, `text/`。
2. 定义接口草稿：
   - `registerEntity(type, id, data)` / `updateEntity(id, data)` / `removeEntity(id)`。
   - `AnimationRuntime.enqueue({ targetId, track, from, to, easing, duration, tags })`。
3. 记录现有 animator / sequencer API -> 新接口映射表。
4. 不修改现有 Pixi 与 DOM，先跑空场景。
验收:
- ThreeRoot 可以 init & dispose，不干扰现有 UI。
- 文档：`THREEJS_REFACTOR_PLAN.md`（即本文件）。

### P1 接入 Three.js 核心舞台
任务:
1. ThreeRoot：
   - 创建 Renderer (WebGL2)、Scene、Camera (Orthographic for 2D card plane + Perspective for 3D 特效)。
   - 双摄像机或单摄像机 + 分层 (`scene.backgroundLayer`, `scene.mainLayer`).
2. Resize 处理：DPR 适配、viewport 尺寸更新。
3. 渲染循环：自定义 `tick(delta)`，与 Vue 生命周期解耦；控制器：`requestAnimationFrame` + 可暂停。
4. Debug：stats 面板 (optional)。
5. 暂存 PostProcessing 管线占位。
验收:
- 页面加载出现透明 canvas，不遮挡 DOM；F12 中可看到渲染循环日志。

### P2 场景实体抽象
任务:
1. 设计实体类型：`Card`, `Unit`, `ParticleEmitter`, `Effect`。
2. Card 基础结构：占位平面 (PlaneGeometry) + 占位材质。
3. `SceneGraphAdapter`:
   - 从 displayGameState.player.skills 构建 Card 实体。
   - Diff 算法：新建 / 更新（位置、可见性） / 删除。
4. 位置/布局：暂时沿用 DOM animator 产生的位置（通过 snapshot）→ 将 snapshot 映射为实体 transform；并验证精准对齐。
5. 建立数据绑定：
   - 监听 `frontendEventBus` 的 `card-content-updated` 等事件，暂不烘焙内容，仅更新占位颜色/标识。
验收:
- Three 场景中有与前端 DOM 等量卡牌占位方块，位置对齐误差 < 1px。

### P3 卡牌视觉迁移
任务:
1. 材质设计：
   - 基础卡框 + 前景图层 + 盾牌/元素图标 → 使用多贴图(UV)或多 Mesh 合并 Instanced；
   - 引入纹理打包器（预处理 png 到 atlas）。
2. 图层与深度：使用 z-index 逻辑映射为 `renderOrder` 或层级；实现 hover 提升。
3. 特效占位：Glow / Outline ShaderMaterial。
4. 临时策略：并行保留 DOM SkillCard；Three 中逐步启用真实材质，当某张卡被标记“migrated”时隐藏 DOM 对应元素。
5. 构建 `CardVisualState`：包含 (cost, rarity, highlight, disabled, cooldownProgress)。
验收:
- 至少 1 种卡牌在 Three 中完整渲染（包含文字占位）。
- 可手动切换某张卡牌 DOM/Three 视图 (debug flag)。

### P4 动画系统统一
任务:
1. 重新实现 animator 核心：`AnimationRuntime`：
   - 状态机 (idle / tracking / animating / dragging)。
   - tracking 使用插值缓动，去除 quickTo 依赖（可选保留 GSAP fallback）。
2. 替换 snapshot 流程：由 DOM → Three 变为 直接在实体 transform 上操作。
3. 桥接 `animationSequencer`：将 `animate-element` 转为对实体属性的 tween；`animate-element-effect` 转为特效组件激活。保持事件 ID 完成反馈。
4. 拖拽：Raycaster + pointer 交互拾取；从 DOM `mousedown` 改为 canvas 事件。
5. 渐进迁移：保留旧 animator 只处理尚未迁移的 DOM 元素；新 animator 处理 Three 实体。建立“来源路由”判断。
验收:
- 对迁移卡牌执行动画指令，无需 DOM snapshot；完成回调正常。

### P5 Troika 文本接入
任务:
1. 字体准备：中文/英文混排需要生成 SDF；建立字体打包与预加载；多权重策略或统一粗体合成。
2. 封装 `TextFactory.create({ text, style, layout })` 返回 Troika `Mesh`。
3. 卡牌文字层：名字、描述、数值（cost, AP）全部用 Troika；支持自动换行与宽度约束。
4. Tooltip & FloatingTooltip：原 DOM 方案 → Three 层 (可延后)。保留关键 UI DOM 以避免复杂输入法问题。
5. 性能：文本修改脏标记 → 延迟更新。批量更新时合并。
验收:
- 卡牌名称与费用使用 Troika，渲染清晰；文本更新延迟 < 100ms。

### P6 粒子 & 特效体系
任务:
1. 设计 `ParticleEngine`：
   - Emitter 描述：速率 / 生命周期 / 初速度分布 / 重力 / 拖拽 / 着色 / 淡入淡出。
   - 实现 CPU → InstancedMesh 初版；后续升级 GPU。 
2. 将现有 `spawn-particles` 事件映射到新的粒子系统；DOM 雪花改为 Three 粒子。
3. 特效：当前 `effects` (pulse/state/anim) 滤镜 → ShaderPass / 材质 uniforms；重写 `makeEffect(name)` 使其返回可附加的组件。
4. 卡牌特效（燃烧/冷却闪光）改写：使用自定义 Shader 或 Sprite+Additive。
验收:
- 至少实现雪花 + 释放技能两类粒子。
- 旧事件触发新粒子，无 DOM 元素参与。

### P7 后处理与屏幕空间特效
任务:
1. 引入 EffectComposer；Pass 顺序：Render → Bloom → Distortion → Vignette → FXAA。
2. 实现全屏扭曲（根据时间与事件触发 amplitude），可扩展为受技能影响的空间波动。
3. 添加光照测试：DirectionalLight + AmbientLight；卡牌简单法线贴图模拟压印效果。
4. 规划将来平面光照：使用自定义材质 + LightMap / 或延迟渲染简化版。
验收:
- 可动态调节 Bloom/Distortion；性能统计稳定。

### P8 性能与资源管线优化
任务:
1. 纹理：KTX2 压缩 (BasisU)；延迟加载非关键贴图；预热字体 glyph。
2. 对象池：粒子、特效、临时几何与材质重用。
3. 剔除：视口外或透明/不可见卡牌暂停更新；粒子系统超距销毁。
4. 动画批：多卡牌同步移动时合并缓动数据，减少 tween 实例。
5. Profile：GPU 时间、CPU 帧时间、内存占用对比旧版。
验收:
- 帧率 >= 58 FPS (目标 60) 在目标机器；内存无明显泄漏。

### P9 移除 Pixi 与 DOM 卡牌烘焙
任务:
1. 删除 `GamePixiOverlay.vue`、`BakeManager`、`domBake.js`、所有 `overlay:effect:*` 事件处理。
2. 移除 `AnimatableElementContainer` 中的 DOM 卡牌渲染与注册逻辑；残留的 MutationObserver/ResizeObserver 清理。
3. animator.js 淘汰或精简只保留全局锚点（若仍用于少量 DOM Overlay）。
4. renderers/effects 重写/替换为 Three 版；废弃 Pixi filters。
5. Vite 构建剔除 html2canvas, snapdom, pixi.js 依赖；更新包体积评估。
验收:
- 页面运行不再引入 Pixi；卡牌完全 Three 渲染；所有特效事件得到响应。

### P10 收束与 QA
任务:
1. 回归测试：战斗流程、休整、商店、技能使用、激活技能、点击/拖拽、提示、音效、输入控制。
2. 视觉对齐：与旧版截图差异比对（颜色/大小/动画时序）。
3. 性能基线报告：首帧时间、交互帧耗、内存快照、包大小。
4. 文档：开发者指南（如何新增一个卡牌特效/粒子/文本组件）。
5. 清理 TODO / FIXME 注释；标记后续拓展 (WebGPU, ECS)。
验收:
- 所有回归用例通过；性能指标达标；文档齐备。

---
## 4. 组件/模块迁移映射

| 现有组件/文件 | 新位置/替代 | 说明 |
|---------------|------------|------|
| GameBackgroundScreen (Pixi) | `three/effects/BackgroundPass.js` | 使用全屏 Quad + ShaderMaterial 或 PostProcess Pass |
| GamePixiOverlay | (淘汰) → CardMesh 集合 | 卡牌直接为 Object3D，不再烘焙 DOM |
| AnimatableElementContainer | `three/adapters/SceneGraphAdapter` | 注册/更新卡牌实体；DOM wrapper 移除 |
| animator.js | `three/animation/AnimationRuntime.js` | 状态机 + tween/插值；锚点策略延续 |
| renderers/effects/* | `three/effects/` + shader | 按 kind 重写：state/pulse/anim 对应材质或后处理参数 |
| ParticleEffectManager (DOM) | `three/particles/ParticleEngine.js` | 实体发射器管理 |
| FloatingTooltip / FloatingCardTooltip | (阶段性) → Troika Text + Sprite 背景 | 可延后保留 DOM |
| html2canvas / snapdom | 移除 | 不再烘焙 DOM |
| AudioControllerScreen / Changelog | 保留 Vue DOM | 与 Three 层平行 |

---
## 5. 动画与指令迁移设计

### 当前指令流
`animationSequencer.enqueueInstruction` → 在 `start` 回调里 emit front-end events → animator.js / Pixi overlay 响应 → 完成后 emit 'animation-instruction-finished'.

### 新模型
```
Sequencer → AnimationRuntime.enqueue(tweenSpec) → AnimationRuntime 内部管理时间线 → onComplete → Sequencer.finish(id)
```
- 仍保留事件桥接（兼容未迁移指令）。
- 特效指令：`effect:add` → `EffectManager.attach(id, effectSpec)` → effectSpec 管理 uniforms 生命周期。

### 状态机转换
- tracking：实体带有 `targetAnchor`，每帧插值或缓动；支持在 anchor 更新时平滑微调。
- animating：占用该实体的主通道；阻塞 tracking。
- dragging：鼠标拾取 → 暂停 tracking → 更新 transform；释放后平滑回归。

---
## 6. Troika 文本迁移策略

1. 字体构建：使用 `msdf-gen` 或 offline 工具生成中文子集；策略：常用汉字 + 技能描述扩展；后续动态补字。
2. TextFactory：缓存材质与 GlyphAtlas；多行布局由 Troika 内部支持，设置 `maxWidth`。
3. 描边/高亮：统一由 shader uniforms 控制，减少多个 DOM span。 
4. 更新策略：技能描述变化时标记脏，集中在一帧末尾刷新。
5. 性能：避免频繁销毁/新建 Mesh；复用对象池；可采用 `textMesh.visible=false` 代替移除。

---
## 7. 粒子与特效管线概述

### 粒子
- 数据结构：`ParticleEmitter { shape, rate, burst, life, material, update(delta) }`。
- 渲染：InstancedMesh 更新 instanceMatrix 与颜色数据；GPU 优化阶段使用纹理缓冲+着色器计算。

### 卡牌特效
- 状态效果 (disabled/highlight)：材质多通道 (baseColor + overlayColor + grayscale toggle)。
- 脉冲效果 (cooldown/flash)：使用时间 uniform 在材质中驱动 emissive/intensity。
- 动画效果 (hit/burn)：hit = scale/rotation jitter + shader flash；burn = dissolve shader（噪声纹理 + alpha clip）。

### 全屏效果
- Bloom：后处理 Pass；
- Distortion：屏幕空间 uv 扭曲；
- Vignette / Grain：轻量 fragment 叠加；

---
## 8. 性能监控与指标

| 指标 | 旧架构目标值 | 新架构期望值 |
|------|--------------|--------------|
| 首次交互可用 (FMP) | ~1.5s | ≤1.2s |
| 平均帧时间 | ~20ms | ≤16.7ms (60FPS) |
| 低端机纹理内存 | 不可控 (DOM 烘焙) | 控制在 < 120MB |
| 粒子峰值 | ~200 简单 DOM | ≥2000 GPU/Instanced |
| 包体积 (生产) | baseline | - 减少 Pixi/html2canvas 依赖 |

监控工具：
- 自定义 Stats Overlay (CPU/GPU/DrawCalls)。
- 定期打印 `SceneGraphAdapter` 实体数量与对象池命中率。

---
## 9. 风险与缓解

| 风险 | 描述 | 缓解策略 |
|------|------|----------|
| 中文字体体积过大 | 全字库 MSDF 过重 | 子集提取 + 动态补字 + 分层缓存 |
| 动画指令竞态 | 新旧 Animator 双写产生冲突 | 设定迁移标记 `source=three`，Sequencer 路由至对应运行时 |
| 拖拽拾取精度 | Canvas 事件与对象拾取不稳定 | 使用 Raycaster + 屏幕空间 bounding 合并判定 |
| 粒子性能 | CPU 粒子导致掉帧 | 尽早引入 Instanced，逐步 GPU 化 |
| 迁移跨度大 | 一次性替换失败风险高 | 保持阶段性启用开关 (feature flags) |
| 文本排版差异 | DOM 与 Troika 换行/内边距不同 | 校准 lineHeight / anchor 偏移表；提供兼容模式参数 |

---
## 10. 回退策略与 Feature Flag

- `ENABLE_THREE_SCENE`：主场景启用/禁用。
- `ENABLE_THREE_CARDS`：卡牌视觉是否使用 Three。
- `ENABLE_TROIKA_TEXT`：文字是否切换到 Troika。
- `ENABLE_THREE_PARTICLES`：粒子系统开关。
- `ENABLE_POSTPROCESSING`：后处理启用/关闭。

所有改动在阶段性合并时与这些 flag 绑定；出现重大问题可在分支中快速关闭。最终 P9 前清理。

---
## 11. 交付物与文档结构规划

新增文档：
- `docs/architecture/three-root.md`：ThreeRoot 初始化与销毁流程。
- `docs/animation/runtime.md`：AnimationRuntime API 与状态机说明。
- `docs/effects/card-effects.md`：卡牌特效设计与 shader 参数。
- `docs/text/troika.md`：字体构建与 TextFactory 规范。
- `docs/perf/metrics.md`：性能指标与监控脚本。

---
## 12. 下一步立即行动 (P0→P1 Sprint 列表)

短期执行清单：
1. 建立 `src/three/` 目录与骨架文件 (空实现)。
2. ThreeRoot 初始化：渲染器/场景/摄像机/循环。挂载在 `GameApp` 中 Pixi 背景之上或替换它。暂不移除 Pixi。
3. 提供最小 `registerEntity` 与 `updateLoop` 日志输出。
4. 添加 Feature Flag (例如全局变量或环境变量)。
5. 编写开发者指南：如何启用/禁用 Three 场景。

完成后再进入 P2。

---
## 13. 成功判定 (Definition of Done)

最终版本：
- 不依赖 Pixi/html2canvas/snapdom；卡牌、粒子、全屏特效、文本全部由 Three + Troika 驱动。
- 游戏所有核心交互（战斗、技能使用、休整购买、能力选择）功能与旧版无功能偏差。
- 新增视觉能力：至少 1 个自定义卡牌碎裂/燃烧 dissolve shader；1 个全屏扭曲；1 个粒子爆发效果。
- 性能基线达到预期（主机与低端机指标）。
- 文档完整，可支持新增技能卡特效无需阅读旧 DOM/Pixi 代码。

---
## 14. 参考与后续拓展

后续可探索：
- WebGPU 渲染路径（R3F 或原生 three-gpu 支持）。
- ECS 框架（bitecs）重构 SceneGraphAdapter 内部数据结构。
- GPU 粒子：Compute Shader / transform feedback。
- 动态阴影 / SSAO / SSGI 用于更沉浸的光照表现。

---
**附注**：本计划为“单次版本重构”设计，但强烈建议在执行中仍通过 feature flags 与阶段合并维持代码库可运行，避免巨大 PR 难以审阅与回退。若时间风险上升，可将卡牌材质高级特效 / dissolve / 粒子 GPU 化列入后续版本。

---
> 最终请在开始 P1 前创建骨架并添加 Feature Flag，随后以小步合并验证渲染循环稳定性。祝重构顺利！

