# 休息阶段房间的 PCG 方法设计（2026-09-11）

> 状态：**方法定稿 + 第一间房（赌厅 `casino`）已实现**，视觉在 `restGallery.html` 迭代中。
> 主流程接线（runController 切场景 + 面板叠加/锚点对位）**下一阶段**做。
> 相关契约：`SCENE_PROP_WORKFLOW.md`（道具生产管线）、`SCENE_PCG_CATALOG.md`（红线摆放法）、
> `SLOT_MACHINE.md`（老虎机/银行机玩法）、`THREE_UI_MIGRATION.md`（面板 Three 化）。

## 1. 目标

休息阶段（奖励房）目前是**纯 UI 覆盖塔楼/战场背景**。本次把休息房也纳入既有 PCG 配方范式：
同一个 `composeRoom(recipeId, seed)` 产出房间几何，由前端按 room 类型切换场景
（战斗房 → 现有四阶段配方；休息房 → 新配方族），面板仍走 `panelSnapshot` + `dispatchPanelIntent`
（UI 是覆盖层，不塞进 3D）。

第一间房是**老虎机 + 银行机同处的赌厅**（`SLOT_MACHINE.md`：二者成对出现），配方 id `casino`。
古尔帕斯之店（35 层）与售货机层是后续同类房间，走同一套方法。

## 2. 休息房配方与战斗房配方的差异（方法层）

| 维度 | 战斗房（fortress/palace/manor/library/boss） | 休息房（casino/…） |
| --- | --- | --- |
| 构图约束 | **中景留空**：战线走廊（`battleLine`/`slots` keepout）不许摆件，保证单位站位与瞄准可读 | 无战线约束；改为**视觉焦点带**（中景偏上放核心设施）+ **UI 安全区**（画面下方留给面板，密度压到最低） |
| 核心物件 | 无（房型是背景） | **交互设施**（老虎机/银行机/柜台）——固定落位、朝向相机、体量放大（`guaranteed` + `scale`） |
| 交互契约 | 无 | 配方声明 `anchors`（设施位置/朝向 + UI 安全区比例），随 `getRoomScene` 下发 |
| 布光 | 月光/火把主导（有窗有光束） | **无窗室内**：月光几乎为零，亮度交给**设施自发光灯池**（`lamp` 通道，见 §3）与少量烛台 |
| 相机 | 战斗机位 | 暂与战斗**同一机位**（不另设）；后续如需贴脸看机器再加 `cam` 字段 |

**不变量（沿用生产线铁律）**：只住 Stage 层、无纹理/外部模型、颜色只走 `palette` token、
`composeRoom` 仍是「配方声明要什么 + 红线法决定怎么摆」的单一实现。

## 3. 新增机制

### 3.1 `lamp` 通道（自发光体 → 无火焰点光池）

- 既有 `lightSource`/`fire` 标签会生成**点光 + 火焰粒子**（火把/烛台语义）。
  机器不该冒火，故新增 `lamp` 标签：`composeRoom` 收集 `lampAnchors`（含 `guaranteed` 定点件），
  `lighting.createLighting(key, fireAnchors, lampAnchors)` 为其生成**点光池**（不生成火焰、不投影、无闪烁）。
- 处方字段：`preset.lamp = { color, base, dist, cap }`（缺省则不生成任何灯池——旧配方零影响）。
- 资产侧职责：机器自带 `unlit` 族发光面（转轮窗/屏幕/灯牌），并声明 `lamp` 标签。

### 3.2 `guaranteed` 支持 `scale`

构图定点件原先固定 `scale=1`，而休息房的核心设施需要放大（相机不动靠体量撑场面）。
`{ id, x, z, ry, scale }` 现在会同时作用到几何与红线占位（`claim` 按缩放后的 footprint）。

### 3.3 交互锚点契约（`anchors`）

```js
// presets.js 的休息房配方
anchors: {
  slot:    { x: -12.5, z: -44, ry: 0.14 },   // 设施：世界坐标 + 朝向
  bank:    { x:  12.5, z: -44, ry: -0.14 },
  counter: { x: 0,     z: -47, ry: 0 },
  uiSafe:  { bottomRatio: 0.42 },            // UI 安全区：屏幕下缘起的比例
}
```

`getRoomScene(recipeId, seed)` 现在把 `anchors` 一并返回（战斗房为 `undefined`，行为不变）。
主流程接线阶段据此做三件事：① 3D 侧把机器高亮/脉冲与面板按钮对应（点击机器 = 触发同一 intent）；
② 面板布局避开 `uiSafe` 带；③ 相机/取景沿用战斗参数（必要时后续加 `cam` 覆盖）。

## 4. 赌厅 `casino` 配方（第一间房）

- 房间：`room.scale 0.86`（空间收缩、背墙拉近）、地面平整（机器/桌椅要站得稳，地形特征全关）、
  无窗室内（`wall.windows: []`，只留一道高窄缝）。
- 布光：`casino` 预设——环境光压到 `hemi 0.78 / fill 0.09`，月光 0.2（无窗），
  **机器灯池 `lamp.base 4600 / dist 150` 当主角**，火位少而集中（`fire.cap 6`）。
- 构图：`guaranteed` = 老虎机(-12.5,-44) + 银行机(12.5,-44) + 柜台(0,-47) + 两凳 + 两钱箱 +
  两张赌桌（±27,-50，各两凳）+ 两张地毯（机器前的"赌位"）；机器 1.35 倍放大。
- 撒布：家具/居室权重高（桌椅镜帘），中景 `density 0.34`，**前景带压到 0.04–0.05（UI 安全区）**；
  撒印以金币为主（`coinScatter`，`count 22`）。

## 5. 迭代流程（视觉门）

```bash
npm run dev
# 休息房陈列页（含 UI 安全区带 + 锚点标记）
open http://localhost:5177/restGallery.html?recipe=casino&seed=demo
```

- 旋钮：`?seed=` 换布局 ｜ `?ui=0|0.55` 安全区比例 ｜ `?anchors=0` 关锚点标记 ｜
  `?orbit=1` 鼠标自由旋转/缩放 ｜ `?nocomposer=1` 关体积光 ｜
  布光同 roomGallery：`?hemi=&moon=&fill=&ba=&bb=&glow=&glowd=&cf=&cfd=&fire=&fired=&lamp=&lampd=`
  ——**调参先在页面 A/B，定数再焙进 `presets.js`/`lighting.js`**。
- 契约门（headless）：`test/roomPcg.test.js`（确定性/keepout/不重叠/契约）+ `test/sceneProps.test.js`
  （道具契约按 fs 自动发现）；新增配方与道具都会被自动纳管。

## 6. 已知待办（下一阶段）

1. **主流程接线**：`runController` 在 `gameStage === 'room'` 且 room 类型有休息房配方时切到该 PCG 场景
   （复用 `getScene('pcg:casino', seed)`），并让 `MapStage` 的面板叠加在同一 canvas 上；
   `restRecipeFor(roomType)` 已备好映射（`slot → casino`）。
2. **机器可点**：按 `anchors` 注册 Pickable，点老虎机 = 打开/聚焦转轮面板，点银行机 = 聚焦存取款区。
3. **更多休息房**：售货机层（`vending` 房）、古尔帕斯之店（`gurpas` 房，35 层固定）——同方法换配方。
4. **视觉继续**：机器体量与可读性、赌桌区细节（筹码/酒杯/账本）、地毯与地面撒印数量、
   `uiSafe` 比例与面板实际高度对齐后再定稿。
