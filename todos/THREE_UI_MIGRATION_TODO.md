# 待办 · 休息阶段 UI Three 化（P3 及顺延项）

> 上位文档：`quest_prompts/THREE_UI_MIGRATION.md`（本文件只记**还没做**的部分，进度见其 §7）。
> 现状：P0 管道 / P1 原语 / P2 四个面板（prep·reward·ascension·room）**已完成**并删除对应 Vue 组件。
> 本文件其余条目全部**未开始**。

---

## 0. 阻塞前提

**P3 整体被美术资源卡住**（2026-09-10 用户确认）。下面的「正式表现」类任务在素材到位前不做——
当前一律是占位（纯色板 / 色块 / 文本 icon），用户已认可这个阶段的功能性。

---

## 1. P3 收尾（等美术）

| # | 任务 | 入口 / 现状 |
|---|---|---|
| 1.1 | **占位素材替换清单**：房间图标（现 emoji：🏋️⛺🎰❓）、灵脉维度字槽（现文字：炎/木/风/武）、「已选取」打勾徽标（现程序化绘制）、老虎机转轮（现 🎰 字牌摇摆） | `stage/panels/index.js` 的 `ROOM_META` / `DIM_META`；`objects/CheckBadgeObject.js`；`objects/SlotRollObject.js` |
| 1.2 | **面板内卡面的美术管线对齐**：卡面已走战场同源烘焙（`richtext/cardFaceDefaults.js`），素材到位后无需改动，只需确认系列装饰/魏启水晶素材命中 | `stage/richtext/cardFaceDefaults.js` |
| 1.3 | **渐进揭示**：奖励入账、训练候选、种子包揭示的分拍演出（当前是一次性重绘，无过渡） | `MapStage._renderPanel` → 可在 `PanelObject.setWidgets` 前后插入 sequencer 分拍 |
| 1.4 | **正式特效接入**：面板出现/消失的转场、勾选反馈、拉杆的力反馈等 | 演出统一走 run sequencer（`runController.js` 的 `runSequencer`，跨塔楼/房间/战斗共享） |
| 1.5 | 面板出现/消失的转场 | 同上；当前是瞬切（`setPanel` 直接装/卸） |

---

## 2. 顺延项（阻塞于各自的「消费者」或后续功能）

| # | 任务 | 阻塞于 | 现状 / 入口 |
|---|---|---|---|
| 2.1 | ~~`ScrollListObject`~~ **已落地**（实现为 `objects/CardScrollPickerObject.js`：全屏选卡界面 = 背板 + 标题 + 竖向滚动卡阵 + 滚动条 + 返回/确认；滚出可视带的卡置 invisible，靠 Picker 的 visibleUp 守卫天然不可命中，因此**不需要裁剪遮罩**） | — | 首个消费者是营地/训练场的「升级一张卡」（2026-09-10 完成） |
| 2.2 | **删卡界面** | 需要一个「多选 + 确认」的入口 | `run.pendingCardRemoval` **目前在整个 shell 没有任何 UI**（Boss 奖励只累加计数：`runFlow.js:96`、存档 `saves.js:42`）。`CardScrollPickerObject` 已支持 `multi/picks`（多选 + 目标张数），可直接复用 |
| 2.3 | **商店面板** | 商店功能本身（近期与 relic 一起做） | 原语已按裁决**预留**商店形态（瓦片 + 列表 + 按钮可拼）；房间调度目前只有 `slot\|camp\|event\|training`（`runFlow.js`） |
| 2.4 | **面板文本的富文本热区** | 出现第一个需要它的面板文案 | `TextBlockObject` 目前**只做纯文本**（不带 `hitRegions`）；卡面内的 `/named` `/effect` `/card` 热区已自动打通（走 CardObject + Picker），但**面板行文本里**的术语暂不可悬浮。补法：复用 `richtext/texture.js` 的 `renderRichTextBlock`（它已产 hitRegions）+ Picker 的 token 通道 |
| 2.5 | **观战端渲染真实房间画面** | 有需求时 | 观战页只加载 BattleStage，非战斗阶段用自研 moment 卡汇总（迁移前就如此，**不是回归**）。若要看到真实房间：中继需传「面板状态 + MapStage」，并复用 `core/run/panelSnapshot.js`（放 core 已为此留好同源入口） |

---

## 3. 明确不做（有意取舍，非遗漏）

| 项 | 结论 |
|---|---|
| **可访问性（焦点/键盘/语义）** | **显式放弃**：Three 面板没有 DOM `<button>` 的焦点与语义。单人游戏、无键盘导航需求；若日后需要，须在 Stage 侧重造焦点模型（迁移文档 §5.3） |
| 跨层通用件（`GameMenu` 的 checkbox、`MenuDialog` 的输入框、`CutsceneOverlay`） | **保持 Vue**：表单/输入在 Three 里是纯亏；权威计划也把「菜单/弹窗/对话」划给 Vue |
| `EndPanel`（幕间）、`BattleHud`（战斗日志）、`TooltipOverlay` + `CardFacePreview` | **保持 Vue**：正是 `THREE_REFACTOR_PLAN` §0 划给 Vue 的部分 |

---

## 4. 迁移过程中记下、但属于**别的工作流**的欠账

> 这些不是本次迁移的 TODO，而是迁移过程中暴露/顺带发现的，放在这里避免遗失。

| # | 事项 | 来源 |
|---|---|---|
| 4.1 | **遗物系统缺的结构性能力**：槽位「权重」语义（`cost` 0/1/2/3 + Σ≤3）、稀有度（C/B/A/S）、`onAcquire`（拾起时）、`applyRunModifiers` 调用点（现声明未接线）、获取层（商店/抽取权重/灵脉门禁/Boss 掉落/事件分支） | 遗物扩容评估（`battle_gameplay/RELICS.md` 是用户侧设计稿） |
| 4.2 | 「占用 0 槽」与「非槽位式遗物」是否两类不同概念——**待用户拍板** | 同上 |
| 4.3 | `塞西莉亚之恩赐` 目前**没有 `cost`/`rarity` 字段**（槽位层未建，故不占槽） | 同理，等 4.1 |
| 4.4 | 面板本地交互态口径已定型（勾选留舞台、确认才上行），若后续有其他面板需要「本地多选/本地编辑」，沿用 `MapStage._panelUi` 模式 | 本次迁移（ascension 落地时定型） |
