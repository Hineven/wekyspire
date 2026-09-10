# 遗物第二批（新机制）实施计划

> 状态：**待实施**。第一批（31 件，无新机制）已上线，见 `src/core/content/relics.js`。
> 本文件是第二批（RELICS.md 中剩 17 件「需要新机制」）的实施台账：每件遗物 → 需要的引擎能力 → 落地口径。
> 引擎现状由只读调研确认（结论写在每条的「机制」行），不要凭印象改。

## 一、机制现状总览（调研结论）

| 需要的能力 | 现状 | 结论 |
| --- | --- | --- |
| 生成卡（加入手牌 / 洗入牌库） | `AddCardInstruction({ defId, toZone, index })`，`toZone:'hand'`、`index:'random'` | **现成**（`cards.js:129-151`，内容侧范式 `bladeSkills.js:207` 洗碎铁） |
| 负面效果免疫 | 效果定义有 `type:'buff'|'debuff'`；PRE veto `AddEffectInstruction` | **现成**（范式 `effects.js` 的 dodge/stall veto） |
| 受伤后钩子 | `DealDamageInstruction` + `phase:'post'`，`instr.result.dealt` | **现成**（大锤已是此写法） |
| 战斗结束钩子 | `PostBattleInstruction` + `phase:'post'`，react 里 `c.kernel.verdict` | **现成**（无独立「胜利」指令，用 verdict 判） |
| 打空手牌钩子 | `UseSkillInstruction` POST + `c.battleState.zones.hand.length === 0` | **现成**（奥薇邦妮已用） |
| 结算期选牌（从牌库/手牌自选） | `AwaitPlayerInputInstruction` + `requestDeckSelection`/`selectHandCard` + `respondInput` | **机制现成**，但**没有「遗物上下文发起输入请求」的先例**（现有输入请求全部出自技能 `use` 分段）→ 胚胎/原初拟态基质要试点，先写最小回归 |
| 战斗级数值上限修正（本场 maxMana / maxHandSize / maxActionPoints ±） | **无读轨修正层**：`maxMana/maxHandSize/maxActionPoints` 是 `Player` 裸字段，各消费点直接读 | **需范式**：直写字段 + `PostBattleInstruction` POST + `window:'once'` 回滚（内容侧已有先例：燃元、膨胀） |
| 易伤（受伤增加） | 效果表里**没有**「易伤」；EFFECTS.md 定义的 **伤残**＝「所有来源伤害增加层数层」 | **口径重复**：战术目镜/埃文斯冠冕的「易伤」按**伤残同口径**落地，并在代码注释标注待用户定名 |
| 脆弱 / 伤残 | 效果表里**都没有**（SLOT_MACHINE 的恶魔 roll 需要） | **需新增两个效果定义**（口径 EFFECTS.md 已给：脆弱＝获得护盾量 −层数；伤残＝受伤 +层数） |

## 二、逐件落地口径（17 件）

### A. 纯现成能力，无引擎改动（8 件）

| 遗物 | 稀有度/槽 | 效果 | 落地口径 |
| --- | --- | --- | --- |
| 澈晶石 | B/1 | 回合开始时若魏启为 0 则 +1 魏启 | `TurnStartInstruction` POST + filter `c.player.mana === 0` → `GainManaInstruction` |
| 谐振弹 | B/2 | **非 Boss 战**开始时随机赋予一敌人晕眩 1 | `PreBattleInstruction`/`onBattleStart` + 非 Boss 判定（`isBossFloor(run.floor)`）+ 随机取一敌 → `AddEffectInstruction('stun',1)` |
| 埃文斯冠冕 | S/2 | 战斗开始：对所有敌人 4 点**固定伤害** + 虚弱 2 | 群伤范式（飞镖的 `dartVolley`）+ `fixed:true`；虚弱 2 走 `AddEffectInstruction('weaken',2)` |
| 冉晶石 | A/3 | 每回合开始：+1 魏启，并对**所有单位** 1 点固定伤害 | `TurnStartInstruction` POST → `GainManaInstruction` + 群伤（含玩家自身；自伤不吃闪避） |
| 黑晶剑残片 | A/1 | 战斗开始 +力量 2；每回合开始你受 2 伤害 | `onBattleStart` → `AddEffectInstruction('strength',2)`；`TurnStartInstruction` POST → `DealDamageInstruction({target: player, amount: 2})`（**不走 fixed**：这是真受伤，受防御/护盾影响？→ 待定，见 §三-2） |
| 霜雪胸针 | S/1 | 每场战斗一次：生命降至一半以下时 +力量 3 +格挡 3 | `DealDamageInstruction` POST + `filter: !used && c.player.hp*2 <= c.player.maxHp` → 力量 3 + `GainShieldInstruction(3)`；`used` 旗标放 `subscriptions` 工厂闭包（每场战斗重建 = 每场一次） |
| 皇晶石 | B/非槽位 | 每场战斗胜利后额外 +4 金币 | `PostBattleInstruction` POST + `c.kernel.verdict === 'victory'` → `c.runState.player.money += 4` |
| 古书序章 | B/3 | 战斗开始：抽 1；**本场**手牌上限 +1 | `onBattleStart`：`DrawCardsInstruction(1)` + 直写 `player.maxHandSize += 1`，挂 `PostBattleInstruction` once 回滚 |

### B. 纯现成能力 + 需要新增卡牌定义（4 件）

| 遗物 | 稀有度/槽 | 效果 | 落地口径 |
| --- | --- | --- | --- |
| 阿罗那 III | C/1 | 战斗开始把 1 张〈速射〉加入手牌 | `AddCardInstruction({defId:'rapidFire', toZone:'hand'})`；**新增卡**〈速射〉：0AP 3伤 消耗 |
| 黑火 H-3 | B/1 | 战斗开始把 1 张〈点射〉洗入牌库 | `AddCardInstruction({defId:'pointShot', index:'random'})`；**新增卡**〈点射〉：5伤 抽1 |
| 祈祷制度 | A/1 | 战斗开始把 1 张〈压制射击〉洗入牌库 | 同上；**新增卡**〈压制射击〉：1AP 15群伤 短暂 |
| 低语苍鹰 Z | S/1 | 战斗开始把 1 张〈贯穿射击〉洗入牌库 | 同上；**新增卡**〈贯穿射击〉：1AP 18穿透伤 抽1 冷却3 |

> 4 张衍生卡都是**不可获取**的衍生牌（不进卡包/训练抓牌/商店），只由遗物生成。要确认卡包门禁与 `pack` 归属：按现有衍生牌惯例（如碎铁）走「无卡包/不入池」；卡面 `describe` 只写效果语言。

### C. 战斗级数值修正（3 件，需要新范式但无引擎障碍）

| 遗物 | 稀有度/槽 | 效果 | 落地口径 |
| --- | --- | --- | --- |
| 微型 AWFD | A/1 | 战斗开始 +1 魏启；**本场**魏启上限 +1 | `onBattleStart`：`GainManaInstruction(1)` + 直写 `player.maxMana += 1` + PostBattle once 回滚 |
| 海神戟 | A/2 | 前 3 回合手牌上限 −1；第 4 回合开始 +力量 5 | `onBattleStart` 直写 `maxHandSize -= 1`；`TurnStartInstruction` POST 在 `turn.count === 4` 时 `maxHandSize += 1` 并 +力量 5；PostBattle once 兜底回滚（防中途结束残留） |
| 植入式魏启罐（已上线，仅核对） | C/1 | 战斗开始 +1 魏启**上限**（不恢复） | 已实装 ✓ 无需改动 |

### D. 需要新效果定义（2 件）

| 遗物 | 稀有度/槽 | 效果 | 落地口径 |
| --- | --- | --- | --- |
| 老旧的战术目镜 | C/1 | 战斗开始随机赋予一敌人**易伤 1** | 需「易伤」；按 EFFECTS.md 的**伤残**同口径落地（受伤 +层数）。**先新增 `maim`（伤残）效果定义**，战术目镜复用它（描述沿用 RELICS.md 的「易伤」并在注释标注待定名） |
| 界尘 | A/1 | 战斗开始后免疫**第一次**负面效果赋予 | `AddEffectInstruction` **PRE veto** + `type==='debuff'` + 闭包 `used` 旗标（范式同 dodge） |

### E. 需要新交互/机制（2 件，风险最高）

| 遗物 | 稀有度/槽 | 效果 | 落地口径 / 风险 |
| --- | --- | --- | --- |
| 胚胎 | S/1 | 战斗开始时**寻找 1**（从牌库中找 1 张牌自选抽取） | 组合 `AwaitPlayerInputInstruction({request:{kind:'selectDeckCard',...}})` + `AddCardInstruction(toZone:'hand')`。**风险**：遗物 `onBattleStart` 在 `PreBattleInstruction` 内提交输入请求，`startBattle` 会停在 WAIT——机制上可行但**无先例**；须先写最小回归（headless 与 RunDriver 的自动应答都要过） |
| 原初拟态基质 | A/3 | 每场战斗一次：复制你手牌中的一张牌 | 同上传入 `selectHandCard` 请求 + 复制（`AddCardInstruction({defId: 选中卡.defId, toZone:'hand'})`）+ 每场一次闭包旗标。风险同上（第二种输入请求形态） |

### F. 不实装（1 件）

| 遗物 | 原因 |
| --- | --- |
| 阿瓦凡 | 仅故事模式的「神剑」事件获得，且认主瑞米后需要**瑞米动作：模仿玩家打出的最后一张卡**——依赖尚未实装的瑞米行动与跨轮回状态，等故事模式主线一起做 |

## 三、实施顺序与待定问题

**顺序（每步都可独立提交、可试玩）**
1. **C 组（战斗级上限修正）**：先把「直写 + PostBattle once 回滚」范式固化成一个小工具（`battleScopedStat(ctx, field, delta)` 之类），微型 AWFD / 海神戟 / 古书序章 三件一起上。
2. **A 组（8 件纯现成）**：澈晶石 / 谐振弹 / 埃文斯冠冕 / 冉晶石 / 黑晶剑残片 / 霜雪胸针 / 皇晶石（+已上线的核对）。
3. **B 组（4 件 + 4 张衍生卡）**：新增衍生卡定义 + 卡面文案，走 `AddCardInstruction`。
4. **D 组（新旧效果）**：新增 `脆弱`/`伤残` 效果定义（口径 EFFECTS.md 已给，恶魔 roll 也要用），战术目镜 / 界尘 落地。
5. **E 组（两件输入交互）**：先写最小回归验证「遗物发起输入请求」，再上胚胎 / 原初拟态基质。
6. 全组完成后：`npm test` + 批量 headless 试玩（第 3 轮）+ RELICS.md 的实装状态标注。

**待定问题（实施中遇到再定，不阻塞开工）**
1. **易伤 vs 伤残**：EFFECTS.md 只有「伤残＝受伤 +层数」，RELICS.md 的「易伤」没有定义——当前按同口径落地。若两者应不同（如易伤＝受到攻击伤害 ×1.5），需补 EFFECTS.md 定义。
2. **黑晶剑残片的「每回合受 2 伤害」**：是否走 `fixed:true`（不吃护盾）还是普通伤害（吃防御/护盾）？文档只说「受 2 伤害」。**倾向普通伤害**（可与护盾交互，符合「黑晶剑很痛但护盾能挡」的直觉）；实施时先按普通伤害，记为可调点。
3. **衍生卡的获取口径**：4 张射击衍生卡是否允许被其他途径（老虎机/商店）产出？倾向**完全不可获取**（只由遗物生成），与碎铁同口径。
4. **战斗级上限修正的残留风险**：`maxHandSize/maxMana` 直写在「中途退出战斗」等非常规路径下可能残留一回合；现有内容（燃元/膨胀）已有同样风险，先沿用同范式，不做额外加固。
