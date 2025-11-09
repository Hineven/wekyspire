# 前端三维与文本渲染全面重构设计文档

## 一、当前前端架构现状分析

### 1.1 整体技术栈

当前前端采用 Vue 3 + Pixi.js 双层渲染架构：

**核心依赖**
- Vue 3：主框架，路由与状态管理
- Pixi.js v7：WebGL 渲染层（背景着色器 + 卡牌烘焙贴图）
- GSAP：DOM 元素动画与补间
- html2canvas / @zumer/snapdom：DOM 到 Texture 的烘焙
- mitt：事件总线（frontendEventBus、backendEventBus）

**主要目录结构**
```
src/
├── GameApp.vue                           # 游戏根容器
├── deprecatedFrontend/components/        # 待重构的前端组件
│   ├── battle/                          # 战斗界面组件
│   │   ├── BattleScreen.vue             # 战斗主屏幕
│   │   ├── ActionPanel.vue              # 操作面板（手牌区、按钮）
│   │   ├── ActivatedSkillsBar.vue       # 已激活技能栏
│   │   ├── BattleLogPanel.vue           # 战斗日志
│   │   ├── CardsDisplayOverlayPanel.vue # 卡牌列表覆盖层
│   │   ├── EnemyStatusPanel.vue         # 敌人状态面板
│   │   └── SkillsHand.vue               # 手牌展示
│   ├── rest/                            # 休整界面组件
│   │   ├── RestScreen.vue               # 休整主屏幕
│   │   ├── AbilityRewardPanel.vue       # 能力奖励面板
│   │   ├── BreakthroughRewardPanel.vue  # 突破奖励面板
│   │   ├── MoneyRewardPanel.vue         # 金钱奖励面板
│   │   ├── PreparationPanel.vue         # 准备面板
│   │   ├── RestControlPanel.vue         # 休整控制面板
│   │   ├── ShopPanel.vue                # 商店面板
│   │   ├── SkillRewardPanel.vue         # 技能奖励面板
│   │   ├── SkillSelectionPanel.vue      # 技能选择面板
│   │   └── UpgradeRewardPanel.vue       # 升级奖励面板
│   ├── end/                             # 结束界面组件
│   │   ├── CutsceneScreen.vue           # 过场动画
│   │   ├── DialogScreen.vue             # 对话界面
│   │   ├── EndScreen.vue                # 结束界面
│   │   └── MessagePopupScreen.vue       # 消息弹窗
│   ├── start/                           # 开始界面组件（2个文件）
│   └── global/                          # 全局通用组件（27个文件）
│       ├── AnimatableElementContainer.vue  # 可动画元素容器（DOM卡牌）
│       ├── GamePixiOverlay.vue             # Pixi 卡牌覆盖层
│       ├── GameBackgroundScreen.vue        # Pixi 全屏背景着色器
│       ├── PlayerStatusPanel.vue           # 玩家状态面板
│       ├── EffectIcon.vue                  # 效果图标
│       ├── EffectDisplayBar.vue            # 效果显示栏
│       ├── BarPoint.vue                    # 条状点（法力、行动点）
│       ├── ColoredText.vue                 # 彩色文本组件
│       ├── SkillCard.vue                   # 技能卡牌
│       ├── FloatingTooltip.vue             # 悬浮提示框
│       ├── FloatingCardTooltip.vue         # 卡牌悬浮提示
│       ├── ParticleEffectManager.vue       # 粒子效果管理器
│       ├── AudioControllerScreen.vue       # 音频控制
│       ├── PlayerInputController.vue       # 玩家输入控制器
│       ├── AnimationAnchors.vue            # 动画锚点
│       ├── DeckIcon.vue                    # 牌库图标
│       ├── BurntSkillsIcon.vue             # 坟地图标
│       ├── CardIcon.vue                    # 卡牌图标
│       ├── NamedEntity.vue                 # 命名实体
│       ├── HealthBar.vue                   # 生命条
│       ├── ManaBar.vue                     # 法力条
│       ├── ActionPointsBar.vue             # 行动点条
│       ├── PlayerBasicStats.vue            # 玩家基础属性
│       ├── HurtAnimationWrapper.vue        # 受伤动画包装器
│       └── SkillCardAnimationOverlay.vue   # 技能卡动画覆盖层
├── webgl/
│   ├── PixiAppManager.js               # Pixi 单例管理器
│   ├── BakeManager.js                  # DOM->Texture 烘焙队列
│   └── domBake.js                      # 烘焙实现（html2canvas/snapdom）
├── utils/
│   ├── animator.js                     # 动画编排器（GSAP + 锚点跟踪）
│   ├── animationHelpers.js             # 动画辅助函数
│   ├── interactionHandler.js           # 交互处理器
│   └── particleHelper.js               # 粒子辅助函数
├── data/
│   ├── animationSequencer.js           # 动画序列调度器
│   └── animationInstructionHelpers.js  # 动画指令辅助函数
├── renderers/effects/                  # Pixi 特效渲染器（state/pulse/anim）
└── frontendEventBus.js                 # 前端事件总线
```

### 1.2 渲染层次结构

**GameApp.vue 组件层级**（从底层到顶层）
1. **GameBackgroundScreen**（z=0）- Pixi 全屏背景着色器
2. **游戏阶段屏幕**（根据 gameStage 条件渲染）
   - StartScreen（开始界面）
   - BattleScreen（战斗界面）
   - RestScreen（休整界面）
   - EndScreen（结束界面）
3. **DialogScreen** - 对话界面
4. **CutsceneScreen** - 过场动画
5. **AudioControllerScreen** - 音频控制
6. **ParticleEffectManager** - DOM 粒子管理器
7. **MessagePopupScreen** - 消息弹窗
8. **AnimationAnchors** - 动画锚点生成器
9. **FloatingTooltip** - 全局悬浮提示（文字/效果）
10. **FloatingCardTooltip** - 卡牌悬浮提示
11. **AnimatableElementContainer**（z=100）- DOM 卡牌容器
12. **GamePixiOverlay**（z=1100）- Pixi 卡牌烘焙贴图层
13. **PlayerInputController** - 全局玩家输入控制器

### 1.3 卡牌渲染双轨机制

**DOM 轨**（AnimatableElementContainer）
- 管理所有技能卡的 DOM 实例（SkillCard.vue）
- 使用 `animator.js` 注册为可动画元素
- 监听 MutationObserver 和 ResizeObserver 检测内容变化
- 提供鼠标交互（mousedown/hover/leave/click）
- 应用 `.pixi-hidden` 类使 DOM 不可见（filter: opacity(0)）

**Pixi 轨**（GamePixiOverlay）
- 每帧通过 `BakeManager` 将 DOM 卡牌烘焙为 Pixi.Texture
- 创建 Pixi.Sprite 并同步 `animator` 提供的 transform 快照
- 应用 Pixi Filters 实现特效（state/pulse/anim effects）
- 管理纹理生命周期（deferred destruction）

**同步流程**
1. AnimatableElementContainer 注册卡牌到 animator
2. 内容变化触发 `card-content-updated` 事件
3. GamePixiOverlay 接收事件，enqueue 烘焙任务
4. BakeManager 串行执行 DOM->Texture 转换
5. 每帧 ticker 中同步 animator 的 transform snapshot 到 Sprite
6. Pixi Sprite 渲染，DOM 层被 opacity(0) 隐藏

### 1.4 动画系统架构

**animator.js 核心职责**
- 管理可动画元素的 DOM 注册表（id -> element + adapter + state）
- 维护元素状态：`idle` | `tracking` | `animating` | `dragging`
- 提供锚点系统：容器锚点（手牌、已激活技能）+ 全局锚点（center、deck、burnt）
- 执行动画指令：
  - `animate(payload)` - from/to 补间动画
  - `animateEffect(payload)` - 纯特效动画（向 Pixi Overlay 发信号）
  - `enterTracking(id)` - 进入锚点跟踪状态（使用 GSAP quickTo）
  - `enterDragging(id)` - 进入拖拽状态
  - `enterIdle(id)` - 回归待命状态
- 使用 GSAP 进行 DOM transform 补间
- 适配器机制：CardAdapter、UnitPanelAdapter

**animationSequencer 指令调度**
- 维护动画指令队列（FIFO）
- 支持串行指令（带 instructionId，等待 `animation-instruction-finished`）
- 支持并行指令（无 instructionId，立即执行）
- 通过 frontendEventBus 发送 `animate-element`、`animate-element-effect` 等事件

**事件总线桥接**
- `frontendEventBus.emit('animate-element', payload)` → animator.animate
- `frontendEventBus.emit('overlay:effect:add', payload)` → GamePixiOverlay._addEffect
- `frontendEventBus.emit('spawn-particles', particles)` → ParticleEffectManager

### 1.5 特效系统架构

**renderers/effects/ 目录**
- `makeEffect(name, options)` 工厂函数**renderers/effects/ 目录**
