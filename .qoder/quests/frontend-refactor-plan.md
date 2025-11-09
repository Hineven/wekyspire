# 前端Three.js全面重构工程设计文档

## 一、重构目标与范围

### 1.1 核心目标

将现有的「Vue + DOM + Pixi局部覆盖」双层渲染架构，重构为「Three.js场景主导 + Troika文本 + 少量Vue HUD」的统一渲染体系，实现以下目标：

- **渲染统一化**：所有游戏视觉元素（卡牌、面板、特效、粒子）迁移至Three.js场景，消除DOM与Pixi双层同步的复杂性
- **高级图形能力**：支持全屏后处理（辉光、扭曲、景深、体积光）、3D卡牌变换、粒子系统、统一光照
- **文本渲染升级**：使用Troika-Three-Text实现高性能中文渲染，支持曲面贴合、统一抗锯齿与发光
- **性能提升**：消除频繁DOM测量与html2canvas烘焙开销，降低GC压力
- **可维护性增强**：建立清晰的ECS数据层与渲染层分离，统一动画与特效调度

### 1.2 重构范围

#### 需要完全迁移的模块
- **卡牌系统**：`AnimatableElementContainer` → Three.js Object3D + ECS
- **状态面板**：`PlayerStatusPanel`、`EnemyStatusPanel` → Three.js UI组件
- **特效系统**：`renderers/effects/*` → Three.js材质与Shader
- **粒子系统**：`ParticleEffectManager` → InstancedMesh粒子引擎
- **动画系统**：移除GSAP依赖，内置Tween池，保留`animator.js`核心抽象
- **背景渲染**：`GameBackgroundScreen` → Three.js后处理管线

#### 需要保留的Vue层（最小集合）
- **对话系统**：`DialogScreen`（对话框）
- **音频控制**：`AudioControllerScreen`（音频按钮overlay）
- **变更日志**：changelog相关组件

#### 需要迁移至Three.js的元素（分阶段实施）
- **第一阶段（当前重构）**：核心战斗元素（卡牌、面板、粒子、特效）
- **第二阶段（后续重构）**：
  - `FloatingTooltip`、`FloatingCardTooltip` → Three.js舞台元素（3D浮动面板）
  - `CutsceneScreen` → Three.js场景过场动画
  - `MessagePopupScreen` → Three.js弹窗元素
  - `PlayerInputController` → 集成至InputSystem
  - `BattleLogPanel` → Three.js文本滚动面板
  - `ActionPanel`按钮 → Three.js可交互按钮元素

#### 核心抽象保留与迁移
- **保留**：`animationSequencer`（动画指令队列）、`frontendEventBus`（事件总线）、`displayGameState`（响应式状态）
- **迁移**：`animator.js`的状态管理与锚点跟踪逻辑迁移至Three.js场景
- **移除**：`BakeManager`、`domBake`、`PixiAppManager`、`GamePixiOverlay`

## 二、技术栈与架构设计

### 2.1 技术栈选型

| 技术 | 用途 | 版本要求 |
|------|------|---------|
| Three.js | 核心渲染引擎 | ^0.160.0 |
| Troika-Three-Text | 高性能文本渲染 | ^0.49.0 |
| postprocessing | 后处理管线 | ^6.34.0 |
| mitt | 事件总线（已有） | 现有版本 |
| Vue 3 | HUD层框架（保留） | 现有版本 |

### 2.2 架构分层设计

```
┌────────────────────────────────────────────────────────────┐
│              Vue HUD Overlay (最小集合)                     │
│         (Dialog/AudioButton/Changelog ONLY)               │
└────────────────────────────────────────────────────────────┘
                            ↓ 事件桥接
┌────────────────────────────────────────────────────────────┐
│                   Frontend Event Bus (mitt)                │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│              Animation Sequencer (指令队列)                 │
└────────────────────────────────────────────────────────────┘
                            ↓ 动画指令
┌────────────────────────────────────────────────────────────┐
│                  Display Game State (Vue响应式)             │
└────────────────────────────────────────────────────────────┘
                            ↓ 数据绑定
┌────────────────────────────────────────────────────────────┐
│               Scene Graph Adapter (ECS数据层)               │
│  - EntityStore: 实体注册表                                  │
│  - Component系统: CardVisual/UnitPanel/Particle/Effect     │
│  - System系统: AnimationRuntime/EffectSystem/ParticleSystem│
└────────────────────────────────────────────────────────────┘
                            ↓ 场景构建
┌────────────────────────────────────────────────────────────┐
│                   Three.js Rendering                       │
│  - Scene: 主渲染场景                                        │
│  - Troika Text: 文本节点                                    │
│  - InstancedMesh: 粒子系统                                  │
│  - Custom Materials: 卡牌/特效材质                          │
│  - Post-Processing: Bloom/Distort/Vignette                │
└────────────────────────────────────────────────────────────┘
```

### 2.3 目录结构设计

新增目录结构（位于`src/three/`）：

```
src/three/
├── core/
│   ├── ThreeRoot.js              # 核心渲染根，管理Scene/Camera/Renderer/循环
│   ├── PassStack.js              # 后处理管线管理器
│   └── ViewportManager.js        # 视口与DPI适配
├── ecs/
│   ├── EntityStore.js            # 实体注册表（ECS核心）
│   ├── SceneGraphAdapter.js      # displayGameState → Three.js场景映射适配器
│   ├── components/
│   │   ├── CardVisualComponent.js         # 卡牌视觉组件
│   │   ├── UnitPanelComponent.js          # 单位面板组件
│   │   ├── ParticleComponent.js           # 粒子组件
│   │   ├── BarComponent.js                # 血条/魔力条/行动点条基类
│   │   ├── HealthBarComponent.js          # 血量条组件
│   │   ├── ManaBarComponent.js            # 魔力条组件
│   │   ├── ActionPointsBarComponent.js    # 行动点条组件
│   │   ├── EffectIconComponent.js         # 效果图标组件
│   │   ├── EffectDisplayBarComponent.js   # 效果图标容器组件
│   │   ├── ColoredTextComponent.js        # 彩色文本组件
│   │   ├── NamedEntityComponent.js        # 命名实体组件
│   │   ├── PlayerBasicStatsComponent.js   # 玩家基础信息组件
│   │   ├── CostIconsComponent.js          # 费用图标组件
│   │   ├── TitleTextComponent.js          # 卡牌标题文本组件
│   │   ├── FeaturesComponent.js           # 技能特性图标组件
│   │   ├── DeckIconEntity.js              # 牌库图标实体
│   │   ├── BurntIconEntity.js             # 焚毁堆图标实体
│   │   └── CardIconComponent.js           # 通用卡牌图标组件
│   └── systems/
│       ├── AnimationRuntime.js   # 动画运行时系统（Tween池、状态机）
│       ├── EffectSystem.js       # 特效系统（Shader特效管理）
│       ├── ParticleSystem.js     # 粒子系统（粒子引擎调度）
│       └── InputSystem.js        # 输入系统（Raycaster拾取、拖拽）
├── materials/
│   ├── CardMaterial.js           # 卡牌基础材质
│   ├── BarMaterial.js            # 进度条材质（渐变填充）
│   ├── effects/
│   │   ├── DissolveEffect.js     # 溶解特效材质
│   │   ├── BurnEffect.js         # 焚毁特效材质
│   │   ├── HighlightEffect.js    # 高亮特效材质
│   │   ├── FlashEffect.js        # 闪光特效材质
│   │   └── CooldownEffect.js     # 冷却特效材质
│   └── shaders/
│       ├── card/
│       │   ├── card.vert.glsl    # 卡牌顶点着色器
│       │   └── card.frag.glsl    # 卡牌片段着色器
│       ├── bar/
│       │   ├── bar.vert.glsl     # 进度条顶点着色器
│       │   └── bar.frag.glsl     # 进度条片段着色器（渐变）
│       ├── effects/
│       │   ├── dissolve.frag.glsl    # 溶解片段着色器
│       │   ├── burn.frag.glsl        # 焚毁片段着色器
│       │   ├── cooldown.frag.glsl    # 冷却片段着色器
│       │   └── flash.frag.glsl       # 闪光片段着色器
│       └── post/
│           ├── bloom.frag.glsl   # 辉光后处理着色器
│           ├── vignette.frag.glsl # 暗角后处理着色器
│           └── distort.frag.glsl # 扭曲后处理着色器
├── particles/
│   ├── ParticleEngine.js         # 粒子引擎核心（InstancedMesh管理）
│   └── emitters/
│       ├── BasicEmitter.js       # 基础粒子发射器
│       ├── BurstEmitter.js       # 爆发粒子发射器
│       └── TrailEmitter.js       # 拖尾粒子发射器
├── text/
│   ├── TextFactory.js            # Troika文本工厂
│   ├── FontManager.js            # 字体管理（MSDF字体、中文子集）
│   └── ColoredTextParser.js      # 彩色文本解析器（{color}标记）
├── entities/
│   ├── CardEntity.js             # 卡牌实体构造器
│   ├── PlayerPanelEntity.js      # 玩家面板实体构造器
│   └── EnemyPanelEntity.js       # 敌人面板实体构造器
├── utils/
│   ├── CoordinateConverter.js    # 坐标转换工具（屏幕↔世界）
│   └── LayoutCalculator.js       # 布局计算工具（手牌扇形、锚点）
└── passes/
    ├── BloomPass.js              # 辉光后处理Pass
    ├── VignettePass.js           # 暗角后处理Pass
    ├── DistortionPass.js         # 扭曲后处理Pass
    └── BackgroundPass.js         # 背景渲染Pass
```

## 三、核心模块重构设计

### 3.1 ThreeRoot - 渲染核心

**职责**：
- 管理Three.js的Scene、Camera、Renderer
- 提供统一渲染循环入口
- 管理后处理管线PassStack
- 处理视口变化与DPI适配

**关键接口**：
```
ThreeRoot
  - init(hostElement): 初始化并挂载到DOM容器
  - getScene(): 获取主场景
  - getCamera(): 获取相机
  - addRenderCallback(fn): 注册渲染回调
  - dispose(): 清理资源
```

**设计要点**：
- 使用PerspectiveCamera，默认FOV 50，支持正交投影切换
- Renderer配置：antialias, premultipliedAlpha, alpha: true
- DPR自适应：Math.min(window.devicePixelRatio, 2)
- 渲染循环使用requestAnimationFrame，每帧按顺序调用：EntitySystems → PostProcessing → Render

### 3.2 SceneGraphAdapter - 数据到场景的映射层

**职责**：
- 监听`displayGameState`的变化
- 创建/更新/销毁对应的Three.js Object3D
- 维护实体ID与Object3D的映射关系
- 管理锚点坐标系统(全局锚点、容器锚点)

**关键映射逻辑**：

| displayGameState数据 | Three.js实体 | Component类型 |
|---------------------|--------------|--------------|  
| player.skills (手牌/激活) | CardEntity | CardVisualComponent + ColoredTextComponent |
| player (状态面板) | UnitPanelEntity | UnitPanelComponent + BarComponent + EffectIconComponent |
| enemy (敌人面板) | UnitPanelEntity | UnitPanelComponent + BarComponent + EffectIconComponent |
| 粒子发射事件 | ParticleEmitter | ParticleComponent |

**生命周期管理**：
- **创建时机**：displayGameState中实体首次出现（如技能加入手牌）
- **更新时机**：响应式数据变化时同步更新Component属性
- **销毁时机**：实体从displayGameState移除（如技能离开战场）

**动画锚点映射**：
- 将原`animator.js`的锚点概念迁移至SceneGraphAdapter
- 锚点不再是DOM元素，而是Three.js世界坐标
- 使用`updateAnchors(containerKey, anchorsMap)`更新锚点布局
- 提供全局锚点(如`deckAnchor`、`centerAnchor`)和容器锚点(如手牌槽位)

### 3.3 EntityStore - 实体注册表

**职责**：
- 管理所有游戏实体（卡牌、面板、粒子、UI元素）
- 提供实体CRUD接口
- 维护实体的Component集合

**数据结构**：
```
Entity {
  id: string,                      # 唯一标识（对应displayGameState中的uniqueID）
  type: 'card' | 'panel' | 'particle' | 'ui',
  object3D: THREE.Object3D,        # 场景节点
  components: Map<ComponentType, Component>,
  state: 'idle' | 'tracking' | 'animating' | 'dragging',
  anchor: { x, y, z, scale, rotation }  # 目标锚点
}
```

**关键接口**：
```
EntityStore
  - register(id, type, object3D): 注册实体
  - unregister(id): 注销实体
  - getEntity(id): 获取实体
  - addComponent(id, componentType, componentData): 添加组件
  - updateComponent(id, componentType, updates): 更新组件
  - getEntitiesByType(type): 按类型查询实体
```

### 3.4 AnimationRuntime - 统一动画系统

**职责**：
- 替代GSAP，提供内置Tween池
- 执行`animationSequencer`派发的动画指令
- 管理动画状态（idle/tracking/animating/dragging）

**核心抽象保留**：
- **状态机**：保留`animator.js`的四状态模型（idle/tracking/animating/dragging）
- **锚点跟踪**：tracking状态下，实体平滑跟随锚点变化（使用自定义插值而非quickTo）
- **指令动画**：animating状态下，执行from/to动画并在结束后回归idle

**Tween池设计**：
- 预分配100个Tween对象，避免频繁创建销毁
- 每个Tween包含：target, prop, from, to, duration, ease, callbacks
- 支持的属性：position.x/y/z, scale.x/y/z, rotation, opacity
- 缓动函数：内置linear/easeInOut/easeOut等常用曲线

**动画指令处理流程**：
1. `animationSequencer`发出`animation-instruction-finished`事件
2. AnimationRuntime监听`animate-element`事件
3. 解析指令payload（id, from, to, anchor, duration, ease）
4. 获取Entity，切换到animating状态
5. 从Tween池分配Tween，设置参数并启动
6. 动画结束时释放Tween，切换回idle状态，发出完成事件

**锚点跟踪实现**：
- tracking状态下，每帧检查anchor是否变化
- 若变化，更新Tween目标值（无需重新创建Tween）
- 使用自定义插值函数平滑过渡，默认300ms

### 3.5 卡牌系统重构

#### 3.5.1 卡牌视觉表示

**从DOM到Three.js的转变**：
- **旧实现**：DOM中渲染`SkillCard.vue`，通过`domBake.js`转为Pixi纹理，叠加滤镜
- **新实现**：直接构建Three.js Mesh，使用CardMaterial + Troika文本节点

**卡牌Mesh结构**：
```
CardEntity (THREE.Group)
├── Background (Plane Mesh, CardMaterial)
├── TitleText (Troika Text)
├── DescriptionText (Troika Text)
├── CostIcons (Sprite Group)
├── TierBadge (Sprite)
└── EffectOverlay (Plane Mesh, 特效材质)
```

**材质设计**：
- **CardMaterial**：基于ShaderMaterial，支持渐变背景、边框、升级徽章
- **Uniforms**：uTierColor, uBorderColor, uTime（用于闪烁）
- **纹理**：背景图纹理通过TextureLoader预加载，存储在材质中

**布局计算**：
- 卡牌尺寸：198x266像素（原DOM尺寸）
- 文本排版：使用Troika的anchorX/anchorY居中对齐
- 图标位置：通过偏移量手动定位（费用图标、等阶标签）

#### 3.5.2 卡牌内容组件迁移

**SkillCard子组件映射**：

| 旧组件 | 新实现 | 技术方案 |
|-------|--------|---------|
| SkillCosts | CostIconsComponent | Sprite图标 + 数字Text |
| SkillMeta (名称/副标题) | TitleTextComponent | Troika Text多行 |
| ColoredText (描述) | ColoredTextComponent | 自定义解析器 + 彩色文本段 |
| SkillFeaturesAndUses | FeaturesComponent | Sprite图标 + 数字Text |

**ColoredTextComponent设计**：
- 解析`{red}文本{/red}`格式标记
- 为每段文本创建独立Troika Text节点
- 动态计算布局，实现换行与对齐

#### 3.5.3 卡牌特效迁移

**旧特效系统（Pixi Filters）**：
- `state:disabled`：灰度滤镜
- `state:highlight`：发光滤镜
- `pulse:cooldown`：冷却脉冲
- `pulse:flash`：闪光脉冲
- `pulse:burn`：焚毁溶解
- `anim:hit`：命中震动

**新特效系统（Three.js Materials）**：

| 特效类型 | 实现方案 |
|---------|---------|
| disabled | CardMaterial添加uDisabled uniform，片段着色器转灰度 |
| highlight | 后处理Bloom通道 + Mesh.layers标记 |
| cooldown | Shader动画：uCooldownProgress控制遮罩旋转 |
| flash | Shader动画：uFlashIntensity控制发光强度 |
| burn | Dissolve Shader：噪声纹理 + uBurnProgress + 边缘发光 |

**EffectSystem设计**：
- 维护effectsById映射表（entityId → Effect[]）
- 每帧调用effect.update(deltaTime)
- 完成后移除Effect并销毁相关资源
- 通过事件监听`overlay:effect:add/remove/interrupt`

### 3.6 状态面板重构

#### 3.6.1 PlayerStatusPanel迁移

**旧实现组成**：
- `PlayerBasicStats`：名称、等阶、金钱
- `ManaBar`：魔力条
- `ActionPointsBar`：行动点条
- `EffectDisplayBar`：效果图标列表
- `HealthBar`：血量条

**新实现结构**：
```
PlayerPanelEntity (THREE.Group)
├── BackgroundPlane (带边框的Quad)
├── BasicStatsText (Troika Text Group)
├── ManaBarComponent (BarComponent实例)
├── ActionPointsBarComponent (BarComponent实例)
├── EffectIconsContainer (Sprite Grid)
└── HealthBarComponent (BarComponent实例)
```

**BarComponent设计**：
- 可复用的血条/魔力条/行动点条组件
- 包含背景条、填充条、数值文本
- 支持平滑过渡动画（通过AnimationRuntime）
- Shader实现渐变填充（生命值：绿到红，魔力：蓝色）

**EffectIconComponent设计**：
- 每个效果一个Sprite + Text组合
- Sprite纹理从effectDescriptions映射表加载emoji/icon
- 动态更新数值文本（层数变化时触发stat-bump动画）

**布局策略**：
- 面板尺寸：300x252像素（保持旧布局）
- 组件垂直堆叠，间距通过偏移量控制
- 使用THREE.Group的position控制整体位置（锚定到屏幕右上角）

#### 3.6.2 EnemyStatusPanel迁移

**特殊组件**：
- **敌人头像**：使用TextureLoader加载avatarUrl为纹理，应用到PlaneGeometry
- **意图栏（IntentionBar）**：Sprite图标 + Text组合，悬浮在头像底部
- **信息按钮与悬浮框**：保留为Vue HUD组件（通过FloatingTooltip）

**结构设计**：
```
EnemyPanelEntity (THREE.Group)
├── BackgroundPlane
├── AvatarPlane (Texture: enemy.avatarUrl)
├── IntentionIcons (Sprite Group)
├── BasicStatsText (name, subtitle, attack, defense)
├── EffectIconsContainer
└── HealthBarComponent
```

#### 3.6.3 BattleScreen整体布局

**旧布局逻辑**：
- CSS Flexbox实现顶部面板左右对齐
- BattleLogPanel、ActionPanel绝对定位

**新布局逻辑**：
- PlayerPanel锚定到屏幕右上角（世界坐标转换）
- EnemyPanel锚定到屏幕左上角
- 两面板之间gap: 20px（通过世界坐标计算）
- BattleLogPanel、ActionPanel保留为Vue HUD（覆盖在Three.js场景之上）

**坐标转换**：
- 屏幕空间坐标（像素） → NDC坐标 → 世界坐标
- Camera使用正交投影或透视投影+固定距离
- 提供`screenToWorld(x, y)`工具函数

### 3.7 粒子系统重构

#### 3.7.1 从DOM到GPU粒子

**旧实现（ParticleEffectManager.vue）**：
- 每个粒子一个DOM div元素
- 通过Vue样式绑定更新position/opacity/size
- CPU逐粒子更新物理模拟

**新实现（ParticleEngine）**：
- 使用InstancedMesh批量渲染粒子
- CPU版本：positions/velocities/life数组 + 每帧更新
- 未来可升级为GPUComputationRenderer

**ParticleEngine设计**：
```
ParticleEngine
  - emitBurst(type, center, count, options): 爆发发射
  - emitContinuous(type, center, rate, options): 持续发射
  - update(deltaTime): 更新粒子状态
  - render(): 批量渲染（由ThreeRoot调用）
```

**粒子属性**：
- 位置：position (x, y, z)
- 速度：velocity (vx, vy, vz)
- 生命周期：life (剩余毫秒)
- 物理：gravity, drag, customForce
- 视觉：size, opacity, color, rotation

**粒子类型**：
- **basic**：简单圆点，颜色可配置
- **burst**：爆发粒子（如升级金色粒子）
- **trail**：拖尾粒子（如卡牌飞行轨迹）

**事件桥接**：
- 监听`spawn-particles`事件（保持旧API兼容）
- 将particles数组参数转换为emitBurst调用

#### 3.7.2 粒子材质设计

**InstancedMesh材质**：
- 基于PointsMaterial或ShaderMaterial
- Vertex Shader：根据实例ID读取位置/缩放/颜色
- Fragment Shader：渲染圆形或纹理

**优化策略**：
- 对象池复用粒子实例，避免频繁分配
- 最大粒子数限制：1000（超出时移除最老的粒子）
- 每帧批量更新InstancedBufferAttribute

### 3.8 文本渲染系统

#### 3.8.1 Troika-Three-Text集成

**TextFactory职责**：
- 创建Troika Text节点
- 管理字体加载与MSDF子集
- 提供统一文本样式接口

**中文字体策略**：
- **初期**：使用3000-5000常用汉字MSDF字体（预生成）
- **兜底**：缺字时降级为位图纹理（离线生成PNG Atlas）
- **动态补充**：`ensureGlyphs(text)`异步加载缺失字符

**TextFactory接口**：
```
TextFactory
  - createText(text, style): 创建文本节点
  - updateText(textObj, newText): 更新文本内容
  - setFont(fontName, fontData): 设置字体
  - ensureGlyphs(text): 确保字形可用
```

**样式参数**：
- fontSize, color, align, anchorX, anchorY
- outlineWidth, outlineColor（描边）
- maxWidth（自动换行）

#### 3.8.2 ColoredText迁移

**旧实现（ColoredText.vue）**：
- 解析`{color}文本{/color}`标记
- 渲染为多个`<span>`元素

**新实现（ColoredTextComponent）**：
- ColoredTextParser解析标记，生成段落数组
- 每段创建独立Troika Text节点
- 计算布局实现行内排列与换行

**解析器设计**：
```
parseColoredText(text) → [
  { text: '造成', color: '#000000' },
  { text: '10', color: 'red' },
  { text: '点伤害', color: '#000000' }
]
```

**布局算法**：
- 逐段渲染，累计宽度
- 超过maxWidth时换行（重置x偏移，增加y偏移）
- 支持居中对齐（计算行宽后调整x偏移）

### 3.9 输入系统重构

#### 3.9.1 拖拽系统迁移

**旧实现（AnimatableElementContainer）**：
- DOM元素监听mousedown/mousemove/mouseup
- 通过frontendEventBus发出card-drag-*事件
- animator处理拖拽状态切换

**新实现（InputSystem）**：
- Canvas元素监听pointerdown/pointermove/pointerup
- 使用Raycaster拾取卡牌Mesh
- 更新Entity.object3D.position实现拖拽

**Raycaster拾取流程**：
1. 鼠标事件转为NDC坐标
2. Raycaster.setFromCamera(mouse, camera)
3. Raycaster.intersectObjects(cards, true)
4. 获取第一个相交的Object3D
5. 查询EntityStore获取Entity

**拖拽状态管理**：
- pointerdown：Entity切换到dragging状态
- pointermove：更新Entity.object3D.position（限制在屏幕范围内）
- pointerup：Entity切换到idle状态，触发后端事件（card-drag-end）

**拖拽视觉反馈**：
- 拖拽时卡牌scale增大（1.0 → 1.1）
- 添加阴影效果（Mesh.castShadow = true）

#### 3.9.2 悬停系统

**功能**：
- 卡牌悬停时显示FloatingCardTooltip（保留Vue HUD）
- 悬停时卡牌轻微上浮（translateY: -2px）

**实现**：
- Raycaster每帧检测鼠标位置
- 当相交对象变化时，发出card-hover/card-leave事件
- Vue HUD监听事件显示/隐藏Tooltip

### 3.10 后处理管线

#### 3.10.1 PassStack设计

**职责**：
- 管理后处理Pass序列
- 提供Pass的动态添加/移除
- 支持Pass参数实时调整

**内置Pass**：
- **BloomPass**：辉光效果，应用于高亮卡牌与特效
- **VignettePass**：边缘暗角
- **DistortionPass**：屏幕扭曲（用于特殊效果）
- **FXAAPass**：抗锯齿

**PassStack接口**：
```
PassStack
  - addPass(pass, priority): 添加Pass（priority控制顺序）
  - removePass(name): 移除Pass
  - getPass(name): 获取Pass实例
  - setEnabled(name, enabled): 启用/禁用Pass
  - render(deltaTime): 执行渲染
```

#### 3.10.2 全屏背景迁移

**旧实现（GameBackgroundScreen.vue）**：
- Pixi全屏Quad + 着色器（渐变背景）

**新实现**：
- Three.js Scene.background设为渐变纹理或Shader材质
- 或添加全屏BackgroundPass（后处理中渲染）

**着色器复用**：
- 保留原有的着色器逻辑（渐变色、时间动画）
- 转换为Three.js ShaderMaterial语法

## 四、界面（Screen）与子组件重构策略

### 4.1 BattleScreen重构

**旧组件结构**：
```
BattleScreen (Vue)
├── EnemyStatusPanel (Vue)
├── PlayerStatusPanel (Vue)
├── BattleLogPanel (Vue)
└── ActionPanel (Vue)
    ├── ActivatedSkillsBar (Vue)
    ├── SkillsHand (Vue)
    ├── DeckIcon (Vue)
    └── BurntSkillsIcon (Vue)
```

**新组件结构**：
```
BattleScreen (Three.js Scene + 最小Vue HUD)
├── Three.js Scene
│   ├── EnemyPanelEntity (Three.js Group)
│   ├── PlayerPanelEntity (Three.js Group)
│   ├── CardEntities (动态手牌与激活技能)
│   ├── BattleLogPanelEntity (TODO: 阶段2 - 暂保留Vue)
│   ├── ActionButtonEntities (TODO: 阶段2 - 暂保留Vue)
│   └── TooltipEntity (TODO: 阶段2 - 暂保留Vue)
└── Vue HUD Overlay (最小集合)
    ├── DialogScreen (对话框)
    ├── AudioControllerScreen (音频按钮)
    └── Changelog (变更日志)
```

**当前阶段临时保留Vue的组件**（标记为待迁移）：
- `BattleLogPanel` - 战斗日志（TODO: 阶段2迁移为Three.js文本滚动面板）
- `ActionPanel`按钮 - 操作按钮（TODO: 阶段2迁移为Three.js可交互按钮）
- `CardsDisplayOverlayPanel` - 卡牌列表覆盖（TODO: 阶段2迁移为Three.js面板）
- `FloatingTooltip` - 浮动提示（TODO: 阶段2迁移为Three.js 3D面板）
- `FloatingCardTooltip` - 卡牌提示（TODO: 阶段2迁移为Three.js 3D面板）

**迁移策略**：
- **完全迁移（阶段1）**：EnemyStatusPanel、PlayerStatusPanel → Three.js面板实体
- **临时保留Vue（标记TODO）**：
  - ActionPanel按钮 → **TODO: 阶段2** 迁移为Three.js可交互按钮元素
  - BattleLogPanel → **TODO: 阶段2** 迁移为Three.js文本滚动面板（类似RPG游戏的3D战斗日志）
  - FloatingTooltip/FloatingCardTooltip → **TODO: 阶段2** 迁移为Three.js 3D浮动面板（带深度感的舞台元素）
  - CardsDisplayOverlayPanel → **TODO: 阶段2** 迁移为Three.js卡牌展示面板
- **永久保留Vue（最小HUD）**：DialogScreen、AudioControllerScreen、Changelog

**锚点管理**：
- `deck`锚点：由DeckIcon（Vue组件）的位置提供，通过`screenToWorld`转换后设置到SceneGraphAdapter
- `hand`锚点：手牌槽位布局由Three.js计算，传递给EntityStore

### 4.2 RestScreen重构

**旧组件结构**：
```
RestScreen (Vue)
├── MoneyRewardPanel (Vue)
├── BreakthroughRewardPanel (Vue)
├── SkillRewardPanel (Vue)
├── UpgradeRewardPanel (Vue)
├── ShopPanel (Vue)
├── PlayerStatusPanel (Vue)
└── RestControlPanel (Vue)
```

**新组件结构**：
```
RestScreen (Three.js Scene + 最小Vue HUD)
├── Three.js Scene
│   ├── PlayerPanelEntity (Three.js Group)
│   ├── RewardPanelEntities (TODO: 阶段2 - 暂保留Vue)
│   ├── ShopPanelEntity (TODO: 阶段2 - 暂保留Vue)
│   └── SkillCardPreviewEntities (阶段1实现)
└── Vue HUD Overlay (最小集合)
    ├── DialogScreen (对话框)
    ├── AudioControllerScreen (音频按钮)
    └── Changelog (变更日志)
```

**当前阶段临时保留Vue的组件**（标记为待迁移）：
- `MoneyRewardPanel` → **TODO: 阶段2** - Three.js奖励面板元素
- `BreakthroughRewardPanel` → **TODO: 阶段2** - Three.js突破面板元素
- `SkillRewardPanel` → **TODO: 阶段2** - Three.js技能奖励面板（卡片已在阶段1迁移）
- `UpgradeRewardPanel` → **TODO: 阶段2** - Three.js升级面板
- `ShopPanel` → **TODO: 阶段2** - Three.js商店面板
- `RestControlPanel` → **TODO: 阶段2** - Three.js控制按钮

**迁移策略**：
- **完全迁移（阶段1）**：
  - PlayerStatusPanel → Three.js面板实体（复用battle的实现）
  - 技能卡片preview → Three.js CardEntity（preview模式）
- **临时保留Vue（标记TODO）**：
  - 所有奖励面板 → **TODO: 阶段2** 迁移为Three.js舞台元素（3D面板带过渡动画）
  - 按钮与控制面板 → **TODO: 阶段2** 迁移为Three.js可交互元素
- **永久保留Vue（最小HUD）**：DialogScreen、AudioControllerScreen、Changelog

**技能卡片preview模式**：
- 在Three.js场景中渲染预览卡牌
- 禁用拖拽与部分交互
- 点击时发出事件，由Vue层处理逻辑

### 4.3 StartScreen与EndScreen

**策略**：
- **完全保留Vue实现**
- 这些界面以文本与按钮为主，DOM渲染更合适
- 不涉及复杂动画与特效，迁移收益低

### 4.4 全局组件处理

#### 保留为Vue HUD的组件（仅最小集合）：
- `AudioControllerScreen`（音频按钮）
- `DialogScreen`（对话框）
- changelog相关组件

#### 需迁移至Three.js但暂不实施的组件（标记为TODO）：
- `FloatingTooltip` → **TODO: 阶段2** - Three.js 3D浮动面板
- `FloatingCardTooltip` → **TODO: 阶段2** - Three.js卡牌详情面板
- `CutsceneScreen` → **TODO: 阶段2** - Three.js过场动画场景
- `MessagePopupScreen` → **TODO: 阶段2** - Three.js弹窗元素
- `PlayerInputController` → **TODO: 阶段2** - 集成至InputSystem
- `BattleLogPanel` → **TODO: 阶段2** - Three.js文本滚动面板
- `ActionPanel`按钮部分 → **TODO: 阶段2** - Three.js可交互按钮
- `AnimationAnchors` → **删除**（由SceneGraphAdapter提供世界坐标锚点）

#### 当前阶段移除的组件：
- `AnimatableElementContainer`：功能迁移至EntityStore
- `GamePixiOverlay`：完全由Three.js替代
- `GameBackgroundScreen`：迁移至Three.js Scene.background或后处理
- `AnimationAnchors`：由SceneGraphAdapter替代

#### UI组件完整迁移清单（按功能分类）：

**基础文本与内容组件（阶段1迁移）**：
- `ColoredText.vue` → ColoredTextComponent（Three.js Troika多色文本）
- `NamedEntity.vue` → NamedEntityComponent（Three.js Troika文本 + tooltip交互）

**数值条与指示器组件（阶段1迁移）**：
- `BarPoint.vue` → BarComponent（Three.js进度条基类）
- `HealthBar.vue` → HealthBarComponent（继承BarComponent）
- `ManaBar.vue` → ManaBarComponent（继承BarComponent）
- `ActionPointsBar.vue` → ActionPointsBarComponent（继承BarComponent）

**效果与状态组件（阶段1迁移）**：
- `EffectIcon.vue` → EffectIconComponent（Three.js Sprite图标 + 文本）
- `EffectDisplayBar.vue` → EffectDisplayBarComponent（EffectIcon容器）
- `HurtAnimationWrapper.vue` → 集成至Entity动画系统（Shader闪烁 + 粒子）

**面板子组件（阶段1迁移）**：
- `PlayerBasicStats.vue` → PlayerBasicStatsComponent（Three.js文本组）

**卡牌子组件（阶段1迁移）**：
- `SkillCard.vue` → CardEntity主体
- `skillCard/SkillCosts.vue` → CostIconsComponent（Sprite + Text）
- `skillCard/SkillMeta.vue` → TitleTextComponent（Troika多行文本）
- `skillCard/SkillFeaturesAndUses.vue` → FeaturesComponent（Sprite + Text）
- `SkillCardAnimationOverlay.vue` → 集成至CardEntity的特效层

**卡牌容器与图标（阶段1迁移）**：
- `DeckIcon.vue` → DeckIconEntity（Three.js Sprite + 文本）
- `BurntSkillsIcon.vue` → BurntIconEntity（Three.js Sprite + 文本）
- `CardIcon.vue` → CardIconComponent（通用卡牌图标组件）

**战斗界面子组件（阶段1迁移）**：
- `SkillsHand.vue` → 集成至EntityStore的锚点布局系统
- `ActivatedSkillsBar.vue` → 集成至EntityStore的激活技能布局

**调试与工具组件**：
- `ArenaDebugScreen.vue` → 保留Vue（开发工具，非游戏内容）

## 五、动画指令与事件桥接

### 7.1 animationSequencer集成

**保持不变的部分**：
- 指令队列机制（tags, waitTags, durationMs, start回调）
- `animation-instruction-finished`事件通知
- 前后端事件总线分离

**AnimationRuntime的桥接职责**：
1. 监听`animate-element`事件（由animationSequencer的start回调发出）
2. 解析payload，创建Tween
3. 执行动画
4. 完成后发出`animation-instruction-finished`

**示例指令流程**（抽卡动画）：
```
1. 后端Instruction: DrawOneSkillCardInstruction
   → start回调发出: frontendEventBus.emit('animate-element', { 
       id: skillID, 
       from: { anchor: 'deck' }, 
       to: { anchor: 'hand' }, 
       duration: 300 
     })

2. AnimationRuntime监听到事件
   → 获取Entity
   → 从EntityStore查找anchor坐标
   → 创建Tween: position.x/y从deck坐标到hand坐标
   → 启动动画

3. 动画结束
   → AnimationRuntime发出: frontendEventBus.emit('animation-instruction-finished', { id: instructionId })
   → animationSequencer标记指令完成，执行下一条
```

### 7.2 事件映射表

**保持兼容的事件**（继续使用frontendEventBus）：

| 事件名 | 发出者 | 监听者 | 用途 |
|-------|-------|-------|------|
| animate-element | animationSequencer | AnimationRuntime | 执行元素动画 |
| animate-element-effect | animationSequencer | EffectSystem | 执行特效动画 |
| animate-element-to-anchor | animationSequencer | AnimationRuntime | 动画到锚点 |
| enter-element-tracking | animationSequencer | AnimationRuntime | 进入跟踪状态 |
| enter-element-idle | animationSequencer | AnimationRuntime | 进入待命状态 |
| enter-element-dragging | InputSystem | AnimationRuntime | 进入拖拽状态 |
| spawn-particles | 各系统 | ParticleSystem | 生成粒子 |
| tooltip:show/move/hide | UI组件 | FloatingTooltip (Vue临时/TODO阶段2) | 提示框 |
| card-hover/card-leave | InputSystem | FloatingCardTooltip (Vue临时/TODO阶段2) | 卡牌悬停 |
| add-battle-log | 战斗系统 | BattleLogPanel (Vue临时/TODO阶段2) | 战斗日志 |
| disable-controls/enable-controls | 指令系统 | ActionPanel (Vue临时/TODO阶段2) | 控制面板禁用 |

**废弃的事件**：
| 事件名 | 原因 |
|-------|------|
| overlay:effect:add/remove/interrupt | Pixi特效系统专用，由EffectSystem内部处理替代 |
| card-content-updated | DOM烘焙专用，Three.js直接更新无需此事件 |

### 7.3 animator.js抽象迁移

**保留的核心抽象**：
- **状态机**：idle/tracking/animating/dragging四状态模型
- **锚点系统**：containerAnchors + globalAnchors
- **适配器模式**：card/unit-panel适配器（迁移至Component类型）

**迁移后的实现位置**：
- 状态机 → AnimationRuntime.updateState(entityId, newState)
- 锚点系统 → SceneGraphAdapter.updateAnchors(containerKey, anchorsMap)
- 适配器模式 → EntityStore的Component系统

**animator.js处理策略**：
- **保留文件**：作为过渡期兼容层，逐步废弃
- **工程实施时参考**：开发者可查看旧实现中的状态转换逻辑、锚点计算方法

## 六、完整组件迁移映射表

### 6.1 阶段1迁移组件（核心战斗元素）

#### 全局基础组件
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| ColoredText.vue | ColoredTextComponent | F2.2 | Troika多色文本段落 |
| NamedEntity.vue | NamedEntityComponent | F2.2 | Troika文本 + tooltip交互 |
| BarPoint.vue | BarComponent | F2.2 | Plane Mesh + 进度条Shader |
| HealthBar.vue | HealthBarComponent | F3.1 | 继承BarComponent |
| ManaBar.vue | ManaBarComponent | F3.1 | 继承BarComponent |
| ActionPointsBar.vue | ActionPointsBarComponent | F3.1 | 继承BarComponent |
| EffectIcon.vue | EffectIconComponent | F2.2 | Sprite图标 + 文本 |
| EffectDisplayBar.vue | EffectDisplayBarComponent | F3.1 | EffectIcon容器组 |
| PlayerBasicStats.vue | PlayerBasicStatsComponent | F3.1 | Troika文本组 |
| HurtAnimationWrapper.vue | 集成至Entity动画系统 | F7 | Shader闪烁 + 粒子发射 |

#### 卡牌组件
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| SkillCard.vue | CardEntity | F3.2 | Group包含多子节点 |
| skillCard/SkillCosts.vue | CostIconsComponent | F3.2 | Sprite图标 + 数字Text |
| skillCard/SkillMeta.vue | TitleTextComponent | F3.2 | Troika多行文本 |
| skillCard/SkillFeaturesAndUses.vue | FeaturesComponent | F3.2 | Sprite图标组 + Text |
| SkillCardAnimationOverlay.vue | CardEntity特效层 | F7 | Shader特效材质 |
| DeckIcon.vue | DeckIconEntity | F3.2 | Sprite + 数字Text |
| BurntSkillsIcon.vue | BurntIconEntity | F3.2 | Sprite + 数字Text |
| CardIcon.vue | CardIconComponent | F3.2 | 通用卡牌图标组件 |

#### 战斗界面组件
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| PlayerStatusPanel.vue | PlayerPanelEntity | F3.1 | Group包含多子组件 |
| EnemyStatusPanel.vue | EnemyPanelEntity | F3.1 | Group包含多子组件 |
| SkillsHand.vue | EntityStore锚点布局 | F3.2 | 手牌锚点计算系统 |
| ActivatedSkillsBar.vue | EntityStore激活技能布局 | F3.2 | 激活技能锚点系统 |

#### 核心渲染与容器
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| AnimatableElementContainer.vue | EntityStore | F1 | ECS实体管理 |
| GamePixiOverlay.vue | 删除 | F3.2 | 完全由Three.js替代 |
| GameBackgroundScreen.vue | Scene.background或BackgroundPass | F8 | 后处理Pass |
| AnimationAnchors.vue | SceneGraphAdapter | F1 | 世界坐标锚点系统 |
| ParticleEffectManager.vue | ParticleSystem | F6 | InstancedMesh粒子 |

### 6.2 阶段2迁移组件（UI元素全面Three.js化）

#### 全局交互组件
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| FloatingTooltip.vue | TooltipEntity | Beyond | 3D浮动面板 + 深度感 |
| FloatingCardTooltip.vue | CardTooltipEntity | Beyond | 3D卡牌详情面板 |
| PlayerInputController.vue | 集成至InputSystem | Beyond | Raycaster + 事件系统 |

#### 战斗界面UI
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| BattleLogPanel.vue | BattleLogEntity | Beyond | 3D文本滚动面板 |
| ActionPanel.vue | ActionButtonEntities | Beyond | 3D可交互按钮组 |
| CardsDisplayOverlayPanel.vue | CardDisplayEntity | Beyond | 3D卡牌展示面板 |

#### 休整界面UI
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| MoneyRewardPanel.vue | MoneyRewardEntity | Beyond | 3D金币面板 + 粒子 |
| BreakthroughRewardPanel.vue | BreakthroughEntity | Beyond | 3D突破效果面板 |
| SkillRewardPanel.vue | SkillRewardEntity | Beyond | 3D技能选择舞台 |
| UpgradeRewardPanel.vue | UpgradeRewardEntity | Beyond | 3D升级舞台 |
| ShopPanel.vue | ShopSceneEntity | Beyond | 3D商店场景 |
| RestControlPanel.vue | RestButtonEntities | Beyond | 3D控制按钮组 |
| PreparationPanel.vue | PreparationEntity | Beyond | 3D技能排序面板 |
| SkillSelectionPanel.vue | SkillSelectionEntity | Beyond | 3D技能替换面板 |
| AbilityRewardPanel.vue | AbilityRewardEntity | Beyond | 3D能力奖励面板 |

#### 消息与过场
| 旧组件（Vue） | 新实现（Three.js） | 迁移阶段 | 技术方案 |
|--------------|-------------------|---------|----------|
| MessagePopupScreen.vue | MessagePopupEntity | Beyond | 3D弹窗 + 入场动画 |
| CutsceneScreen.vue | CutsceneScene | Beyond | Camera运镜场景 |

### 6.3 永久保留Vue组件（最小HUD）

| 组件 | 保留原因 | 说明 |
|------|---------|------|
| DialogScreen.vue | 对话框 | 文本密集型，DOM更适合 |
| AudioControllerScreen.vue | 音频按钮 | 简单HUD，无需3D化 |
| ChangeLog.vue | 变更日志 | 文本列表，DOM更适合 |
| StartScreen.vue | 开始界面 | 文本按钮为主，DOM更灵活 |
| EndScreen.vue | 结束界面 | 文本按钮为主，DOM更灵活 |
| ArenaDebugScreen.vue | 调试工具 | 开发工具，非游戏内容 |

### 6.4 特殊组件处理说明

**HurtAnimationWrapper特殊迁移方案**：
- **受伤震动**：集成至AnimationRuntime的shake动画
- **受伤闪烁**：通过Entity的Shader uniform（uHurtIntensity）实现
- **闪避效果**：通过AnimationRuntime的swing动画
- **治疗绿光**：通过叠加半透明Green Plane实现
- **死亡爆炸**：通过ParticleSystem发射粒子序列
- **伤害数字**：通过ParticleSystem发射文本粒子（复用旧逻辑）

**SkillsHand与ActivatedSkillsBar迁移方案**：
- 不创建独立组件，而是作为SceneGraphAdapter的布局计算逻辑
- `calculateHandAnchors()`：手牌扇形布局算法
- `calculateActivatedAnchors()`：激活技能水平布局算法
- 通过EntityStore.updateAnchors()更新卡牌锚点

**AnimationAnchors迁移方案**：
- 原组件提供DOM元素作为锚点
- 新系统中锚点直接为世界坐标
- SceneGraphAdapter负责计算并维护锚点坐标
- 保留`centerAnchor`、`deckAnchor`等全局锚点概念

## 八、工程实施阶段划分

### 阶段F0：根场景与渲染循环（1天）
- 创建`src/three/core/ThreeRoot.js`
- 初始化Scene/Camera/Renderer，挂载到`GameApp.vue`
- 实现基础渲染循环与DPI适配
- 集成PassStack（空管线）

### 阶段F1：ECS数据结构与实体注册（1天）
- 创建`EntityStore.js`
- 实现Entity注册/注销/查询
- 创建SceneGraphAdapter，监听displayGameState
- 删除：`AnimatableElementContainer.vue`、`BakeManager.js`、`domBake.js`

### 阶段F2.1：Troika文本系统（1天）
- 集成Troika-Three-Text
- 实现TextFactory与FontManager
- 加载中文MSDF字体（3000常用字子集）
- 创建ColoredTextComponent与解析器

### 阶段F2.2：内容组件迁移（1天）
- 迁移ColoredText → ColoredTextComponent
- 迁移BarPoint → BarComponent
- 迁移EffectIcon → EffectIconComponent
- 迁移FloatingTooltip逻辑（保留Vue，但坐标转换）

### 阶段F3.1：面板系统（1.5天）
- 迁移PlayerStatusPanel → PlayerPanelEntity
- 迁移EnemyStatusPanel → EnemyPanelEntity
- 实现面板锚点定位（屏幕坐标转世界坐标）
- 删除：DOM版`PlayerStatusPanel.vue`、`EnemyStatusPanel.vue`（移入deprecated）

### 阶段F3.2：卡牌系统（2天）
- 实现CardMaterial与基础Shader
- 构建CardEntity（Mesh + Troika Text）
- 迁移SkillCard子组件（CostIcons/Meta/Features）
- 测试卡牌渲染与布局
- 删除：`GamePixiOverlay.vue`、Pixi依赖

### 阶段F4：输入与拖拽（1天）
- 实现InputSystem（Raycaster拾取）
- 实现拖拽逻辑（pointerdown/move/up）
- 实现悬停检测（card-hover事件）
- 删除：DOM拖拽逻辑

### 阶段F5：动画系统统一（1.5天）
- 实现AnimationRuntime（Tween池）
- 桥接animationSequencer事件
- 实现tracking状态（锚点跟踪）
- 实现animating状态（指令动画）
- 删除：GSAP依赖，旧animate-element处理器

### 阶段F6：粒子引擎（1天）
- 实现ParticleEngine（InstancedMesh）
- 实现BasicEmitter与BurstEmitter
- 桥接spawn-particles事件
- 删除：`ParticleEffectManager.vue`（DOM粒子）

### 阶段F7：特效系统（1天）
- 实现EffectSystem
- 迁移disabled/highlight/cooldown/flash特效（Shader版）
- 实现burn溶解效果（Dissolve Shader）
- 删除：`renderers/effects/*`（Pixi版）

### 阶段F8：后处理管线（1天）
- 实现BloomPass/VignettePass/FXAAPass
- 迁移GameBackgroundScreen（Scene.background或Pass）
- 删除：`GameBackgroundScreen.vue`（Pixi版）

### 阶段F9：Vue HUD最小化（0.5天）
- 调整GameApp.vue，仅保留最小Vue HUD集合（Dialog/AudioButton/Changelog）
- 确保Vue HUD正确覆盖在Three.js之上
- 清理无用的Pixi/DOM组件引用
- **标记待迁移组件**：为BattleLogPanel、ActionPanel按钮、FloatingTooltip等添加TODO注释，说明阶段2需迁移

### 阶段F10：收束与回填（1天）
- 测试最小战斗循环
- 修复发现的Bug
- 清理deprecated代码
- 文档更新

**总计：约8-9个工作日**

### 阶段Beyond（第二重构阶段）：UI元素全面Three.js化（后续独立项目）

**目标**：将所有临时保留的Vue组件迁移为Three.js舞台元素，实现完全的3D渲染体系。

**待迁移元素清单**：

1. **提示系统** → Three.js 3D浮动面板
   - `FloatingTooltip` → 带深度感的悬浮提示面板
   - `FloatingCardTooltip` → 3D卡牌详情展示面板
   - 支持3D空间定位、视角跟随、景深效果

2. **战斗UI元素** → Three.js交互舞台元素
   - `BattleLogPanel` → 3D文本滚动面板（类似RPG的战斗日志）
   - `ActionPanel`按钮 → 可交互的3D按钮元素（悬停/点击效果）
   - `CardsDisplayOverlayPanel` → 3D卡牌展示面板（牌库/坟地查看）

3. **休整UI元素** → Three.js奖励舞台
   - `MoneyRewardPanel` → 3D金币奖励面板（粒子特效）
   - `BreakthroughRewardPanel` → 3D突破效果面板
   - `SkillRewardPanel` → 3D技能选择舞台（卡片已在阶段1迁移）
   - `UpgradeRewardPanel` → 3D升级舞台
   - `ShopPanel` → 3D商店场景（商品陈列）
   - `RestControlPanel` → 3D控制按钮组
   - `PreparationPanel` → 3D技能排序面板
   - `SkillSelectionPanel` → 3D技能替换选择面板
   - `AbilityRewardPanel` → 3D能力奖励面板（如存在）

4. **消息系统** → Three.js剧场元素
   - `MessagePopupScreen` → 3D弹窗元素（带入场/出场动画）
   - `CutsceneScreen` → Three.js过场动画场景（相机运镜）

5. **输入系统集成**
   - `PlayerInputController` → 完全集成至Three.js InputSystem
   - 异步输入处理迁移至Three.js事件系统

**技术方案要点**：
- **3D面板系统**：使用Plane Mesh + Troika Text + 交互层
- **深度感设计**：利用Z轴分层、景深效果、视差滚动
- **过渡动画**：Camera运镜、元素淡入淡出、3D变换
- **交互反馈**：Raycaster拾取、悬停高亮、点击动画

**工期预估**：5-7个工作日（作为独立重构阶段）

**详细组件映射**：参见「六、6.2 阶段2迁移组件」章节

## 九、关键技术细节

### 9.1 坐标系统转换

**屏幕坐标 → 世界坐标**：
```
function screenToWorld(x, y, z = 0) {
  const vector = new THREE.Vector3(
    (x / window.innerWidth) * 2 - 1,
    -(y / window.innerHeight) * 2 + 1,
    z
  );
  vector.unproject(camera);
  return vector;
}
```

**世界坐标 → 屏幕坐标**（用于Vue HUD定位）：
```
function worldToScreen(worldPos) {
  const vector = worldPos.clone();
  vector.project(camera);
  return {
    x: (vector.x + 1) / 2 * window.innerWidth,
    y: -(vector.y - 1) / 2 * window.innerHeight
  };
}
```

### 9.2 锚点布局算法

**手牌布局示例**（扇形排列）：
```
function calculateHandAnchors(cardCount, containerWidth) {
  const anchors = new Map();
  const cardWidth = 198;
  const gap = 10;
  const totalWidth = cardCount * cardWidth + (cardCount - 1) * gap;
  const startX = (containerWidth - totalWidth) / 2;
  
  for (let i = 0; i < cardCount; i++) {
    const x = startX + i * (cardWidth + gap) + cardWidth / 2;
    const y = window.innerHeight - 150; // 底部150px
    const rotation = (i - cardCount / 2) * 2; // 扇形角度
    anchors.set(cardIds[i], { x, y, scale: 1, rotation });
  }
  
  return anchors;
}
```

### 9.3 Shader模板

**CardMaterial基础Shader**：
```
// card.vert.glsl
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// card.frag.glsl
uniform vec3 uTierColor;
uniform vec3 uBorderColor;
uniform float uDisabled;
varying vec2 vUv;

void main() {
  vec3 color = uTierColor;
  
  // 边框
  float borderWidth = 0.02;
  if (vUv.x < borderWidth || vUv.x > 1.0 - borderWidth ||
      vUv.y < borderWidth || vUv.y > 1.0 - borderWidth) {
    color = uBorderColor;
  }
  
  // 禁用状态灰度
  if (uDisabled > 0.5) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = vec3(gray);
  }
  
  gl_FragColor = vec4(color, 1.0);
}
```

**Dissolve Effect Shader**：
```
uniform float uBurnProgress; // 0.0 ~ 1.0
uniform sampler2D uNoiseTexture;
uniform vec3 uEdgeColor;

void main() {
  float noise = texture2D(uNoiseTexture, vUv).r;
  float threshold = uBurnProgress;
  
  // 溶解边缘
  float edgeWidth = 0.05;
  float edge = smoothstep(threshold - edgeWidth, threshold, noise);
  
  // 溶解区域discard
  if (noise < threshold - edgeWidth) {
    discard;
  }
  
  vec3 finalColor = mix(uEdgeColor, baseColor, edge);
  gl_FragColor = vec4(finalColor, 1.0);
}
```

### 9.4 性能优化建议

**对象池**：
- Tween对象池（100个预分配）
- 粒子实例池（1000个最大）
- Geometry/Material缓存（避免重复创建）

**批量渲染**：
- 相同材质的卡牌合并为InstancedMesh
- 粒子使用InstancedMesh批量渲染
- 文本节点尽量复用字形纹理

**延迟销毁**：
- 资源销毁延迟2帧（避免渲染中途销毁）
- 纹理/Geometry引用计数管理

**LOD策略**：
- 远离相机的面板降低渲染质量
- 粒子数量根据性能动态调整

## 十、依赖变更与清理

### 10.1 新增依赖

需在`package.json`中添加：
```
{
  "dependencies": {
    "three": "^0.160.0",
    "troika-three-text": "^0.49.0",
    "postprocessing": "^6.34.0"
  }
}
```

安装命令：`npm install three@^0.160.0 troika-three-text@^0.49.0 postprocessing@^6.34.0`

### 10.2 移除依赖

```

```

### 10.3 文件清理清单

**完全删除**：
- `src/webgl/PixiAppManager.js`
- `src/webgl/BakeManager.js`
- `src/webgl/domBake.js`
- `src/renderers/effects/*`（整个目录）
- `src/deprecatedFrontend/renderers/cooldownEffectWatcher.js`
- `src/deprecatedFrontend/renderers/disabledEffectWatcher.js`

**完全删除（阶段F1-F8）**：
- `src/webgl/PixiAppManager.js`
- `src/webgl/BakeManager.js`
- `src/webgl/domBake.js`
- `src/renderers/effects/*`（整个目录）

**移入deprecated（阶段1完成后）**：

*核心容器与渲染*：
- `AnimatableElementContainer.vue`
- `GamePixiOverlay.vue`
- `GameBackgroundScreen.vue`
- `AnimationAnchors.vue`
- `ParticleEffectManager.vue`

*面板组件*：
- `PlayerStatusPanel.vue`
- `EnemyStatusPanel.vue`

*基础UI组件*（已迁移至Three.js）：
- `ColoredText.vue`
- `NamedEntity.vue`
- `BarPoint.vue`
- `HealthBar.vue`
- `ManaBar.vue`
- `ActionPointsBar.vue`
- `EffectIcon.vue`
- `EffectDisplayBar.vue`
- `HurtAnimationWrapper.vue`
- `PlayerBasicStats.vue`

*卡牌相关*：
- `SkillCard.vue`
- `skillCard/SkillCosts.vue`
- `skillCard/SkillMeta.vue`
- `skillCard/SkillFeaturesAndUses.vue`
- `SkillCardAnimationOverlay.vue`
- `DeckIcon.vue`
- `BurntSkillsIcon.vue`
- `CardIcon.vue`

*战斗布局*：
- `SkillsHand.vue`
- `ActivatedSkillsBar.vue`
- `BattleScreen.vue`（保留作为参考，逻辑已迁移）

**标记为TODO（暂保留，待阶段2迁移）**：
在以下文件顶部添加TODO注释：
```
// TODO: [阶段2重构] 此组件需迁移为Three.js舞台元素
// 迁移方案：见 frontend-refactor-plan.md 的「阶段Beyond」章节
```

需标记的文件：
- `src/components/global/FloatingTooltip.vue`
- `src/components/global/FloatingCardTooltip.vue`
- `src/components/battle/BattleLogPanel.vue`
- `src/components/battle/ActionPanel.vue`
- `src/components/battle/CardsDisplayOverlayPanel.vue`
- `src/components/end/MessagePopupScreen.vue`
- `src/components/end/CutsceneScreen.vue`
- `src/components/global/PlayerInputController.vue`
- `src/components/rest/MoneyRewardPanel.vue`
- `src/components/rest/BreakthroughRewardPanel.vue`
- `src/components/rest/SkillRewardPanel.vue`
- `src/components/rest/UpgradeRewardPanel.vue`
- `src/components/rest/ShopPanel.vue`
- `src/components/rest/RestControlPanel.vue`

**保留但需修改**：
- `src/utils/animator.js`：保留作为参考，注释标记为"Legacy, use AnimationRuntime instead"
- `src/GameApp.vue`：移除Pixi组件引用，添加ThreeRoot挂载点

## 十一、工程实施参考资料

### 11.1 旧实现参考点

开发者在实施时可参考以下旧实现中的关键逻辑：

**状态转换逻辑**：
- 参考`src/utils/animator.js`的`enterTracking`/`enterDragging`/`enterIdle`方法
- 理解四状态模型的转换条件与副作用

**锚点计算**：
- 参考`src/deprecatedFrontend/components/battle/SkillsHand.vue`的`updateAnchors`方法
- 了解手牌扇形布局算法

**特效实现**：
- 参考`src/deprecatedFrontend/renderers/effects/pulse/burn.js`的Pixi滤镜逻辑
- 转换为Three.js Shader时保持相同的视觉效果

**动画指令处理**：
- 参考`src/data/animationInstructionHelpers.js`中的动画指令构造
- 保持指令参数格式兼容

### 11.2 关键抽象理解

**animationSequencer抽象**：
- 理解指令队列的tags/waitTags并发控制机制
- 掌握`animation-instruction-finished`事件的触发时机
- 保持start回调中事件发射的格式

**displayGameState响应式**：
- 理解Vue的reactive如何驱动视图更新
- SceneGraphAdapter需使用watch监听变化
- 避免直接修改displayGameState（由后端同步）

**frontendEventBus事件总线**：
- 理解事件名称的命名规范（功能:动作 格式）
- 保持事件payload格式兼容（避免破坏现有监听器）
- 新增事件需在设计文档中补充说明

### 11.3 渐进式迁移策略

**阶段验证点**：
- F0-F1完成后：能看到空场景与控制台输出实体注册日志
- F2完成后：能看到文本渲染（测试用"Hello World"）
- F3完成后：能看到状态面板（静态布局）
- F5完成后：能看到卡牌从牌库飞入手牌的动画
- F8完成后：能看到完整战斗画面与特效

**回退机制**：
- 保留deprecated文件夹中的旧实现
- 若关键功能无法在阶段内完成，可临时回退使用旧组件
- 最终清理时再统一删除deprecated

## 十二、附录：Mermaid架构图

### 12.1 整体架构流程

```
graph TB
    A[Backend Game State] -->|动画指令| B[Animation Sequencer]
    B -->|事件| C[Frontend Event Bus]
    C -->|动画事件| D[Animation Runtime]
    C -->|特效事件| E[Effect System]
    C -->|粒子事件| F[Particle System]
    
    G[Display Game State] -->|响应式监听| H[Scene Graph Adapter]
    H -->|创建/更新| I[Entity Store]
    I -->|注册实体| J[Three.js Scene]
    
    D -->|Tween更新| I
    E -->|材质更新| I
    F -->|粒子更新| I
    
    J -->|渲染| K[Post Processing]
    K -->|输出| L[Canvas]
    
    M[Vue HUD] -->|覆盖| L
    N[Input System] -->|Raycaster拾取| I
    N -->|事件| C
```

### 12.2 卡牌渲染流程

```
sequenceDiagram
    participant DS as DisplayGameState
    participant SGA as SceneGraphAdapter
    participant ES as EntityStore
    participant TF as TextFactory
    participant Scene as Three.js Scene
    
    DS->>SGA: player.skills变化
    SGA->>ES: register(skillID, 'card', object3D)
    ES->>TF: createText(skill.name)
    TF-->>ES: Troika Text节点
    ES->>ES: 构建CardEntity（Mesh+Text）
    ES->>Scene: scene.add(cardEntity)
    Scene->>Scene: 每帧渲染
```

### 12.3 动画指令执行流程

```
sequenceDiagram
    participant BE as Backend
    participant AS as AnimationSequencer
    participant FEB as FrontendEventBus
    participant AR as AnimationRuntime
    participant ES as EntityStore
    
    BE->>AS: enqueueInstruction(DrawCard)
    AS->>AS: start回调执行
    AS->>FEB: emit('animate-element', {...})
    FEB->>AR: 监听到事件
    AR->>ES: getEntity(id)
    AR->>AR: 创建Tween（deck→hand）
    AR->>AR: 每帧更新position
    AR->>AR: 动画完成
    AR->>FEB: emit('animation-instruction-finished')
    FEB->>AS: 监听到完成
    AS->>AS: finish指令，执行下一条
```

---

**文档版本**：v1.0  
**最后更新**：当前时间  
**设计负责人**：Qoder AI  
**工程周期预估**：8-9个工作日（不含测试与优化）
