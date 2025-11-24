``# Three.js Frontend Refactor - Progress Tracking

## 已完成阶段 (Completed Phases)

### ✅ F0: 根场景与渲染循环 (Root Scene and Render Loop)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `ThreeRoot.js` - Three.js渲染核心
  - Scene/Camera/Renderer管理
  - 渲染循环与DPR适配
  - FPS监控
- [x] 创建 `PassStack.js` - 后处理管线管理器
  - EffectComposer集成
  - Pass动态添加/移除
  - 优先级排序
- [x] 创建 `ViewportManager.js` - 视口与坐标管理
  - 屏幕坐标↔世界坐标转换
  - Raycaster创建工具
- [x] 创建 `ThreejsScreen.vue` - Three.js场景容器组件
- [x] 集成到 `GameApp.vue`

### ✅ F1: ECS数据结构与实体注册 (ECS Data Structure)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `EntityStore.js` - 实体注册表
  - Entity数据结构 (id, type, object3D, components, state, anchor)
  - 实体CRUD操作
  - 按类型查询
  - 锚点系统（global + containers）
  - 延迟销毁机制
- [x] 创建 `SceneGraphAdapter.js` - 数据到场景映射适配器
  - 监听displayGameState变化
  - 手牌/激活技能同步
  - 锚点布局计算（手牌扇形、激活技能水平）
  - 玩家/敌人面板更新（占位）
- [x] 集成到ThreejsScreen生命周期

### ✅ F2.1: Troika文本系统 (Text System)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `TextFactory.js` - 文本工厂
  - 创建/更新文本节点
  - 统一样式应用
  - 彩色文本段落支持
- [x] 创建 `ColoredTextParser.js` - 彩色文本解析器
  - 解析{color}标记
  - 颜色映射表
- [x] 创建 `CoordinateConverter.js` - 坐标转换工具

### ✅ F2.2: 内容组件迁移 (Content Components)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `ColoredTextComponent.js` - 彩色文本组件
- [x] 创建 `BarComponent.js` - 进度条基类
- [x] 创建 `EffectIconComponent.js` - 效果图标组件
- [x] 测试文本渲染

### ✅ F3.1: 面板系统 (Panel System)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `PlayerPanelEntity.js` - 玩家状态面板
- [x] 创建 `EnemyPanelEntity.js` - 敌人状态面板
- [x] 创建 `HealthBarComponent.js` - 生命值条
- [x] 创建 `ManaBarComponent.js` - 魔力条
- [x] 创建 `ActionPointsBarComponent.js` - 行动点条
- [x] 创建 `EffectDisplayBarComponent.js` - 效果图标容器
- [x] 集成到SceneGraphAdapter
- [x] 实现面板锚点定位

### ✅ F3.2: 卡牌系统 (Card System)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `CardMaterial.js` 和基础Shader - 卡牌材质与等阶颜色
- [x] 创建 `CardEntity.js` - 完整卡牌实体构造器
- [x] 创建 `DeckIconEntity.js` - 牌库图标
- [x] 创建 `GraveyardIconEntity.js` - 墓地图标
- [x] 集成到SceneGraphAdapter的卡牌同步逻辑
- [x] 卡牌自动创建和布局

### ✅ F5: 动画系统统一 (Animation Runtime)
**状态**: 已完成
**日期**: 2025-11-24

完成内容:
- [x] 创建 `AnimationRuntime.js` - 动画运行时系统
  - Tween类实现（替代GSAP）
  - 支持moveTo、fadeIn/Out、scale动画
  - 锚点跟踪系统（tracking状态）
  - 桥接animationSequencer事件
- [x] 集成到ThreeRoot渲染循环
- [x] 集成到ThreejsScreen生命周期

### ⏳ F6: 粒子引擎 (Particle System)
预计工期: 1.5天

待办事项:
- [ ] 创建 `AnimationRuntime.js`
- [ ] 实现Tween对象池
- [ ] 实现四状态机 (idle/tracking/animating/dragging)
- [ ] 桥接animationSequencer事件
- [ ] 删除GSAP依赖

### ⏳ F6: 粒子引擎 (Particle System)
预计工期: 1天

待办事项:
- [ ] 创建 `ParticleEngine.js`
- [ ] 实现InstancedMesh粒子渲染
- [ ] 创建 `BasicEmitter.js`
- [ ] 创建 `BurstEmitter.js`
- [ ] 桥接spawn-particles事件
- [ ] 移入deprecated: ParticleEffectManager.vue

### ⏳ F7: 特效系统 (Effect System)
预计工期: 1天

待办事项:
- [ ] 创建 `EffectSystem.js`
- [ ] 创建特效Shader (disabled/highlight/cooldown/flash/burn)
- [ ] 创建 `BurnEffect.js` (溶解效果)
- [ ] 创建 `HighlightEffect.js`
- [ ] 创建 `CooldownEffect.js`
- [ ] 删除: renderers/effects/*

### ⏳ F8: 后处理管线 (Post-processing)
预计工期: 1天

待办事项:
- [ ] 创建 `BloomPass.js`
- [ ] 创建 `VignettePass.js`
- [ ] 创建 `FXAAPass.js`
- [ ] 迁移GameBackgroundScreen (Scene.background)
- [ ] 移入deprecated: GameBackgroundScreen.vue

### ⏳ F9: Vue HUD最小化 (Vue HUD Minimization)
预计工期: 0.5天

待办事项:
- [ ] 清理GameApp.vue，移除Pixi组件引用
- [ ] 标记待迁移组件 (TODO注释)
  - [ ] BattleLogPanel.vue
  - [ ] ActionPanel.vue
  - [ ] FloatingTooltip.vue
  - [ ] FloatingCardTooltip.vue
  - [ ] CardsDisplayOverlayPanel.vue
  - [ ] 其他休整界面组件
- [ ] 确保Vue HUD正确覆盖

### ⏳ F10: 收束与回填 (Testing & Polish)
预计工期: 1天

待办事项:
- [ ] 测试最小战斗循环
- [ ] 修复发现的Bug
- [ ] 性能优化
- [ ] 清理deprecated代码
- [ ] 更新文档

---

## 技术债务 (Technical Debt)

### 已知问题
1. **文本宽度计算**: ColoredTextComponent的偏移计算需要等待Troika sync完成
2. **锚点精度**: 手牌扇形布局可能需要微调角度和间距
3. **性能监控**: 需要添加详细的性能分析工具

### 改进建议
1. 添加Entity状态机可视化调试工具
2. 实现Component热重载机制
3. 优化TextFactory的对象池策略

---

## 架构决策记录 (Architecture Decision Records)

### ADR-001: 使用单例模式管理全局系统
**决策**: ThreeRoot, EntityStore, SceneGraphAdapter使用单例模式
**理由**: 确保全局唯一性，避免重复初始化
**影响**: 需要手动管理生命周期，测试时需要重置单例

### ADR-002: 延迟2帧销毁实体
**决策**: 实体销毁时延迟2帧（~32ms）再清理资源
**理由**: 避免渲染循环中途销毁导致崩溃
**影响**: 资源释放略有延迟，但提高稳定性

### ADR-003: 锚点系统分为global和containers
**决策**: 全局锚点（deck, center）与容器锚点（hand, activated）分离
**理由**: 不同布局逻辑，便于独立管理
**影响**: 布局更新需要分别处理两类锚点

---

## 文件清单 (File Checklist)

### 已创建文件
- [x] src/three/core/ThreeRoot.js
- [x] src/three/core/PassStack.js
- [x] src/three/core/ViewportManager.js
- [x] src/three/ecs/EntityStore.js
- [x] src/three/ecs/SceneGraphAdapter.js
- [x] src/three/ecs/components/ColoredTextComponent.js
- [x] src/three/ecs/components/BarComponent.js
- [x] src/three/ecs/components/EffectIconComponent.js
- [x] src/three/ecs/components/HealthBarComponent.js
- [x] src/three/ecs/components/ManaBarComponent.js
- [x] src/three/ecs/components/ActionPointsBarComponent.js
- [x] src/three/ecs/components/EffectDisplayBarComponent.js
- [x] src/three/ecs/systems/InputSystem.js
- [x] src/three/ecs/systems/AnimationRuntime.js
- [x] src/three/entities/PlayerPanelEntity.js
- [x] src/three/entities/EnemyPanelEntity.js
- [x] src/three/entities/CardEntity.js
- [x] src/three/entities/DeckIconEntity.js
- [x] src/three/entities/GraveyardIconEntity.js
- [x] src/three/materials/CardMaterial.js
- [x] src/three/text/TextFactory.js
- [x] src/three/text/ColoredTextParser.js
- [x] src/three/utils/CoordinateConverter.js
- [x] src/components/global/ThreejsScreen.vue
- [x] REFACTOR_PROGRESS.md
- [x] REFACTOR_SUMMARY.md

### 待创建文件（F2.2-F10）
见各阶段的待办事项

---

## 测试计划 (Test Plan)

### 阶段验证点
- [x] F0-F1: 能看到空场景与控制台实体注册日志 ✅
- [x] F2: 能看到文本渲染测试 ✅
- [x] F3.1: 能看到状态面板静态布局 ✅
- [x] F3.2: 能看到卡牌渲染与布局 ✅
- [x] F4: 能拖拽卡牌并看到视觉反馈 ✅
- [x] F5: 动画系统就绪，支持Tween和锚点跟踪 ✅
- [ ] F6: 能看到粒子效果
- [ ] F8: 能看到完整战斗画面与特效

---

**最后更新**: 2025-11-24
**当前进度**: F5完成，F6待实施
**预计完成时间**: F10结束（约2-3个工作日）
**已完成阶段**: F0, F1, F2.1, F2.2, F3.1, F3.2, F4, F5 ✅ (8/10阶段，80%)

