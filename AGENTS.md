# AGENTS.md — 魏启尖塔（weiqi-chaos）

> 面向 AI 编码代理的项目导览。项目注释与文档主语言为**中文**，新代码与文档请沿用中文注释。

## 项目概览

**魏启尖塔**是一个单人 Roguelike 卡牌战斗网页游戏：玩家扮演「灵御」，沿 44 层塔（4 章 × 10 普通层 + 1 Boss 层）线性爬塔（无岔路），在「战斗 → 战后奖励 → 奖励房（老虎机/训练场/营地/事件）→ 战前准备」的循环中成长。两种模式：无尽模式与故事模式（存档隔离）。

纯前端 SPA，无自建后端；产物是静态站点，部署到 GitHub Pages。

## 技术栈与配置

- **构建**：Vite 4 + `@vitejs/plugin-vue`（`vite.config.js`）。路径别名：`@` → `src/`、`@assets` → `src/assets`、`@data` → `src/data`（后者目前不存在）。`base` 由环境变量 `VITE_BASE` 控制（CI 部署时注入），缺省 `./`。dev 端口 **5177**。
- **框架**：Vue 3（组合式 API，`<script setup>`）+ vue-router + mitt（事件总线）。
- **渲染**：Three.js（共享单个全屏 `<canvas>`）+ GSAP（补间动画）。
- **测试**：Vitest 4（默认 node 环境，无 jsdom 配置）。
- 入口：`index.html` → `src/shell/main.js`（Vue 应用）。`src/debug/main.js` 是遗留的战斗调试冒烟页，非正式入口。

## 常用命令

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器（localhost:5177）
npm test           # = vitest run，52 个测试文件 / 372 用例（截至 2026-08 全绿）
npm run build      # 产出 dist/
npm run preview    # 本地预览构建产物
```

项目约定：**不要**用 dev 服务器代替测试来「验证编译错误」——改完跑 `npm test` 即可，浏览器行为由用户验收。

## 部署

`.github/workflows/main.yml`：push 到 `master` 分支触发，`npm ci` → `VITE_BASE=<pages base_path> npm run build` → 部署 `dist/` 到 GitHub Pages。仓库根目录的 `dist/` 是构建产物，不要手改。

## 架构：四层单向依赖

依赖方向严格单向：`Shell → Stage → Bridge → Core`。**Core 不得 import 上层**；Core 的表现诉求只走 `ctx.presenter` 注入（headless 用 `createNullPresenter`，测试用 `createRecordingPresenter`）。

```
src/
├── core/        # 纯逻辑层：环境无关、纯对象（禁 Vue reactive）、可序列化
├── bridge/      # Core ↔ 前端的协议层：双事件总线 + 动画队列 + 状态投影
├── stage/       # Three.js 表现层：StageManager / 场景 / 对象 / 动画
└── shell/       # Vue 薄壳：场景编排、面板 UI、存档、设置、cutscene
```

### 三个场景层级（详见 README.md）

由 `src/shell/App.vue` 编排（`phase` / `gameStage`）：

1. **菜单层**：纯 Vue（StartScreen / GameMenu / EndPanel / 全局 toast）。
2. **大世界层（塔楼层）**：`MapStage`（Three.js 夜空+塔楼）+ PrepPanel/RoomPanel/AscensionPanel 等 Vue 面板叠加。
3. **战斗层（房间层）**：`BattleStage`（Three.js 战场）+ BattleHud/RewardPanel 叠加。

MapStage 与 BattleStage 共享同一 canvas，由 `StageManager` 切换。run 的 `gameStage`（prep/battle/reward/room/ascension/end）决定叠加哪些面板。对话与幕间转场由 `shell/overlay/CutsceneOverlay.vue` 跨层渲染。

### Core（`src/core/`）

- **`kernel/`** — 结算内核：`BattleKernel` 是「指令树 DFS 泵 + 订阅注册表 + 取消三动词（veto/abort/inspect）」。订阅 `{when, phase('pre'|'post'), filter, window('battle'|'turn'|'once'), priority, react, owner}`。铁律：POST 反应作为已完成节点的子节点提交；被 veto 的节点不触发任何 POST；取消入口只在内核。
- **`instructions/`** — 指令族：`BattleInstruction` 三返回值 `true/false/WAIT`，payload 白名单（`setPayload` 越界抛错）。combat / resources / effects / cards / skill / turn / battleRoot / input / aiAct。
- **`state/`** — 纯对象状态：`Unit`（hp/shield/effects/`getStat` 读轨/`uniqueID`/side）、`Player`（run 级，跨战斗存活）、`AIUnit→Enemy/Ally`、`runState`/`battleState` 两层拆分、zones（hand/deck/discard/burnt + chant 槽）、种子 rng、`skillRuntime`（定义/运行时分离）。
- **`flow/battle.js`** — 战斗装配：`createBattle/startBattle/playerUseSkill/playerEndTurn/respondInput`。终局 abort 的是 TurnLoop 而非根节点，战后清理在树内执行。
- **`run/`** — run 层状态机：`runFlow.js`（createRun/enterBattle/finishBattle/advanceFloor…）、`runDriver.js`（headless 整局 SDK）、rewards / ascension / prep、rooms/（camp、event、slotMachine、training）。
- **注册表** — `registryFactory.js` 的 `createRegistry` 工厂产出同构注册表：skills/、abilities/、enemies/、allies/、relics/、effects/。内容是纯静态定义，由 `content/index.js` **显式 import 登记**（不用 `import.meta.glob`）。
- **`content/`** — 最小内容实现（技能/体修卡组/敌人/能力/遗物/效果/盟友）。技能设计意图见 **`skills/SKILL_DESIGN_PRINCIPLES.md`**（等阶 D→C→B→A，S/Z 阶梯外；升阶=局外 Transform；powerUp 养成轴已废弃）。
- **`sdk/driver.js`** — `BattleDriver`：headless 声明式战斗装配 + 链式出牌 + `runToEnd`，测试与批量验证用。
- **`anim/sequencer.js`** — `AnimationSequencer`：演出指令队列，Shell 侧单协程消费，跨场景共享同一队列定序。

### Bridge（`src/bridge/`）

`createBridge` 把 Core 战斗接到协议事件流：两条 mitt 总线（backendBus/frontendBus）+ AnimationSequencer + presenter 翻译层 + 状态投影（标脏 + 拉取缓存，`projection.js`）+ 意图层（`intents.js`）+ 结算期输入仲裁（`interactionHandler.js`）+ run 级显示状态权威 `DisplayModel`（`displayModel.js`）。事件名集中在 `events.js`（`EventNames`）。队列排空时自动补一次状态同步兜底。

### Stage（`src/stage/`）

Three.js 表现层：`StageManager`（舞台切换/resize/渲染循环）、`stages/`（MapStage、BattleStage）、`scenes/`（skydome、dungeon3D、volumetricMoon 等场景件）、`objects/`（CardObject、UnitObject、ZonePileObject、TargetingArrowObject 等）、`richtext/`（卡面富文本解析/排版/纹理）、`animator/`、`layout/`、`picker/`（拾取）、`particles/`、`art/`（立绘/卡图缓存 unitArt·cardArtCache、战斗预取 preload、全量清单 assetManifest——`src/assets` 下位图经 import.meta.glob 自动入册，进网页统一预载并 warm 进共享缓存）。

### Shell（`src/shell/`）

- `App.vue` — 三层场景编排 + canvas 生命周期 + 全局 toast（`provide('showMenuPopup')`）。
- `runController.js` — run 层唯一编排器：Vue 薄壳与 core run 状态机之间的唯一通道；run 经 `reactive()` 暴露；读档恢复逻辑在此（存档语义=prep 检查点）。
- `saves.js` — 存档（两模式隔离）；`settings.js`、`audio.js`、`tooltip.js`；`components/`（各阶段 Vue 面板，含顶层加载门 AssetLoadingScreen——美术预载完成前挡住开始界面）、`overlay/`（cutscene 播放器与脚本）。

## 测试

- 全部测试在 `test/*.test.js`，Vitest 直接跑，无 setup 文件。命名按主题（kernel / battle / fireVein / runFlow / cardFace …）。
- 战斗类测试用 headless SDK（`BattleDriver` / `RunDriver`）驱动真实结算，不 mock Core；断言依赖注册表内容时先 `import '../src/core/content/index.js'` 触发登记。
- **测试范围方针**：只测后端结算逻辑、程序骨干逻辑（gameflow/路由/状态机）与基础设施逻辑（资源加载卸载、订阅退订、前端绘制同步竞态、几何绕序回归等）。**前端视觉样式（布局/颜色/淡入淡出曲线/脉动等）不写测试**——改动即炸、维护纯属浪费；浏览器视觉由用户验收。
- 加新技能/敌人/遗物等内容时：定义进 `src/core/content/*` 并在 `content/index.js` 登记，同时补对应 `test/*.test.js`。
- `tmp/` 目录是 Playwright 截图等一次性产物，无需维护。

## 代码约定（踩坑备忘，源自 handoffs/ 与 .trae/rules）

- 编辑前先读文件，不破坏无关逻辑；重构时删除废弃旧代码（含 CSS、未用函数）。
- 可抽离的共用逻辑尽量抽离，避免重复。
- Core 状态只放 id/slug + 标量（可序列化），定义引用一律经注册表反查。
- 牌库顶 = 数组 index 0；牌的 zone 不显式存储，用 `zoneOf/moveCard` 反查，数组是唯一事实源。
- 伤害/面板修正三段式：`amount = 基础值 + getStat(面板)` → `payload = PRE 修饰流水线(amount)` → `execute(payload)`（固定公式：减防御→护盾吸收→minHp 地板）。PRE 流水线顺序敏感（priority 降序 + 注册序），不做固定乘区。
- 效果订阅由 `AddEffectInstruction` 在首次获得时挂载（owner=`effect:{unit}:{effect}`），层数扣尽注销；技能订阅战斗开始注册一次，zone 限定写 filter；咏唱订阅 owner=卡牌。
- 卡牌计数器放 `skillRuntime`，不藏闭包；技能算伤害与 `describe` 显式读 `getStat`（同源不漂移）。
- 卡面描述双轨：`describe`（应用前，无战斗上下文）/ `battleDescribe`（结算中，数字按实时局面）。
- 注意：`.trae/rules/project_rules.md` 中关于 `backendGameState/displayGameState`、`animationSequencer.js` 的描述是**旧架构**残留——现行架构见本文件与 README（Bridge + projection + EventNames），以代码为准。

## 权威设计文档

- `README.md` — 场景层级总纲与数据系统说明。
- `quest_prompts/` — 重构与玩法设计文档：`THREE_REFACTOR_PLAN.md`（重构权威依据）、`RUN_DESIGN.md`（run 层玩法循环）、`STAGE_DESIGN.md`、`NEW_BACKEND_LOGIC.md`、各体系卡牌提案。
- `src/core/skills/SKILL_DESIGN_PRINCIPLES.md` — 技能体系设计意图，各体系「已验证/已敲定」状态在此标注。
- `handoffs/` — 历史交接记录（含大量关键约定，但注意核对时效）。

## 安全注意事项

- `tools/seedream/` 是美术素材生成管线（Python，火山引擎方舟 API）：`ARK_API_KEY` 经环境变量传入，**不要**把密钥写进代码或提交。
- 存档存于浏览器 localStorage（`saves.js`），不涉及服务端凭据。
- 仓库无后端、无数据库；不要引入新的网络请求或远程依赖而不说明理由。
