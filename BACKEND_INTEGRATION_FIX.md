# 接入后端游戏流程 - 修复报告

## 问题回顾
之前在前端（ThreejsScreen.vue）中手动创建测试数据（技能卡、敌人等），这**违背了前后端分离的架构原则**，也导致数据结构不一致。

## 架构理解

### 前后端分离模式

```
后端（game.js, battle.js等）
├── 管理游戏逻辑和状态
├── 通过backendEventBus发送事件
├── 写入backendGameState
└── 自动同步到displayGameState

前端（ThreejsScreen等）
├── 监听displayGameState（响应式）
├── 渲染Three.js场景
└── 不应该直接创建游戏数据
```

### 数据流

```
用户操作/游戏事件
    ↓
backendEventBus.emit(GAME_START)
    ↓
game.js - startGame()
    ├── 创建初始技能（通过SkillManager）
    ├── 写入backendGameState
    └── 触发ENTER_BATTLE_STAGE
        ↓
battle.js - enterBattleStage()
    ├── 生成敌人（通过EnemyFactory）
    ├── 克隆技能到战斗数组
    ├── 写入backendGameState
    └── 自动同步到displayGameState
        ↓
Vue watch触发
    ↓
SceneGraphAdapter响应
    ↓
创建Three.js实体（卡牌、面板等）
```

## 正确的游戏启动流程

### 后端初始化（game.js）

```javascript
function startGame() {
  // 1. 触发对话事件
  dialogues.triggerBeforeGameStart();

  // 2. 通过SkillManager创建初始技能
  const initialSkill1 = SkillManager.getInstance().createSkill('肾上腺素激增');
  const initialSkill2 = SkillManager.getInstance().createSkill('斩');
  const initialSkill3 = SkillManager.getInstance().createSkill('拳');
  // ...

  // 3. 写入后端状态
  backendGameState.player.cultivatedSkills = [skill1, skill2, ...];

  // 4. 触发战斗阶段
  backendEventBus.emit(EventNames.Game.ENTER_BATTLE_STAGE);
}
```

### 战斗初始化（battle.js）

```javascript
export function enterBattleStage() {
  // 1. 生成敌人
  generateEnemy(gameState);
  
  // 2. 切换游戏状态
  gameState.gameStage = 'battle';
  
  // 3. 触发战斗开始
  backendEventBus.emit(EventNames.Battle.BATTLE_START);
}

async function startBattle() {
  // 1. 克隆技能到战斗数组
  gameState.player.skills = gameState.player.cultivatedSkills
    .filter(skill => skill !== null)
    .map(skill => cloneSkill(skill));
  
  // 2. 初始化牌库
  gameState.player.backupSkills = [...gameState.player.skills];
  gameState.player.frontierSkills = [];
  gameState.player.burntSkills = [];
  
  // 3. 抽初始手牌
  createAndSubmitDrawSkillCard(modPlayer, drawCount);
  await runGlobalExecutor();
}
```

### 前端响应（SceneGraphAdapter）

```javascript
// watch自动触发
watch(
  () => displayGameState.player.skills.map(s => s.uniqueID),
  (newIds, oldIds) => {
    this._syncCards('hand', newIds, oldIds);
  }
);

// 或在init时主动同步
if (displayGameState.player.skills.length > 0) {
  const handIds = displayGameState.player.skills.map(s => s.uniqueID);
  this._syncCards('hand', handIds, []);
}
```

## 修复内容

### 修复1: 移除手动测试数据
**文件**: `src/components/global/ThreejsScreen.vue`

**移除**:
- `initializeTestData()` 函数
- 手动创建的技能对象
- 手动创建的敌人对象
- 手动设置的效果对象

**原因**: 
- 数据结构不完整（缺少Skill类的方法）
- 破坏前后端分离
- 导致逻辑混乱

### 修复2: 触发后端游戏流程
**文件**: `src/components/global/ThreejsScreen.vue`

**新增**:
```javascript
import backendEventBus, { EventNames } from '../../backendEventBus.js';

onMounted(() => {
  // ...初始化Three.js系统...
  
  // 触发游戏开始（后端会自动创建技能、敌人等）
  setTimeout(() => {
    console.log('[ThreejsScreen] Triggering GAME_START event');
    backendEventBus.emit(EventNames.Game.GAME_START);
  }, 100);
});
```

**说明**:
- 通过事件总线触发游戏开始
- 延迟100ms确保Three.js系统准备好
- 后端会自动创建正确的Skill实例
- 后端会自动生成敌人
- 数据自动同步到displayGameState

## 数据对比

### 错误方式（手动创建）

```javascript
// ❌ 错误：在前端手动创建
const testSkills = [
  {
    uniqueID: 'test-skill-1',
    name: '拳',
    tier: 1,
    description: '...',
    // 缺少Skill类的方法！
  }
];
displayGameState.player.skills = testSkills;
```

**问题**:
- 不是Skill类实例，缺少方法（use, regenerateDescription等）
- uniqueID格式可能不正确
- 没有经过SkillManager注册
- 破坏了数据的一致性

### 正确方式（后端创建）

```javascript
// ✅ 正确：通过后端创建
const skill = SkillManager.getInstance().createSkill('拳');
// skill是完整的Skill类实例
// 包含所有方法：use(), regenerateDescription(), onBattleStart()等
```

**优势**:
- 完整的Skill类实例
- uniqueID自动生成（正确格式）
- 经过SkillManager注册和管理
- 数据结构一致

## 正确的技能数据结构

### Skill类实例包含

```javascript
class Skill {
  constructor(name, type, tier, manaCost, actionPointsCost, cooldown, precessor) {
    this.uniqueID = generateUniqueID(); // 自动生成
    this.name = name;
    this.type = type; // 'normal' | 'activated'
    this.tier = tier;
    this.costs = { mana: manaCost, actionPoints: actionPointsCost };
    this.cooldown = cooldown;
    this.currentCooldown = 0;
    this.power = 0;
    // ...
  }
  
  // 方法
  use(player, enemy, stage, ctx) { /* ... */ }
  regenerateDescription(player) { /* ... */ }
  onBattleStart() { /* ... */ }
  onEnterBattle(player) { /* ... */ }
  // ...
}
```

### 前端可以安全访问的属性

```javascript
const skill = displayGameState.player.skills[0];

// ✅ 可以访问
skill.uniqueID
skill.name
skill.subtitle
skill.tier
skill.description
skill.costs.mana
skill.costs.actionPoints
skill.features
skill.power

// ⚠️ 方法调用应该通过后端事件
// 不要在前端直接调用 skill.use()
```

## 后端事件总览

### 游戏流程事件

```javascript
// 游戏开始
EventNames.Game.GAME_START

// 进入战斗
EventNames.Game.ENTER_BATTLE_STAGE
EventNames.Battle.BATTLE_START

// 玩家回合
EventNames.Battle.PLAYER_TURN
EventNames.Battle.PLAYER_TURN_END

// 使用技能
EventNames.Battle.USE_SKILL

// 战斗结束
EventNames.Battle.BATTLE_VICTORY
EventNames.Game.POST_BATTLE

// 进入休整
EventNames.Game.ENTER_REST_STAGE
```

### 前端应该监听的事件

前端主要通过**watch监听displayGameState**，而不是直接监听事件：

```javascript
// ✅ 推荐：监听响应式状态
watch(() => displayGameState.player.skills, ...)
watch(() => displayGameState.enemy, ...)
watch(() => displayGameState.gameStage, ...)

// ⚠️ 特殊情况：动画指令等
// 可以监听特定的前端事件
frontendEventBus.on('animation:complete', ...)
```

## 验证方法

### 控制台日志

刷新浏览器后应该看到：

```
[ThreejsScreen] Triggering GAME_START event
[SkillManager] Creating skill: 肾上腺素激增
[SkillManager] Creating skill: 斩
[SkillManager] Creating skill: 拳
...
[Battle] Starting battle with cultivated skills: [...]
[Battle] 战斗 #1 开始！
[Battle] 遭遇了 史莱姆！
[SceneGraphAdapter] Updating anchors for hand, cards: 7
[SceneGraphAdapter] Card created: skill_xxxx
...
```

### 数据验证

```javascript
// 在控制台检查
console.log(displayGameState.player.skills);
// 应该看到完整的Skill实例数组

console.log(displayGameState.player.skills[0].use);
// 应该是一个函数，不是undefined
```

## 学到的教训

1. **尊重架构设计**: 前后端分离有其原因，不要随意破坏
2. **使用正确的API**: 通过SkillManager/EnemyFactory创建数据
3. **事件驱动**: 通过backendEventBus触发流程
4. **响应式优先**: 监听displayGameState，不要手动同步
5. **类实例 vs 普通对象**: Skill是类实例，包含方法和逻辑

## 相关文件

- ✅ `src/components/global/ThreejsScreen.vue` - 移除手动数据，触发事件
- ✅ `src/game.js` - 游戏流程入口
- ✅ `src/data/battle.js` - 战斗逻辑
- ✅ `src/data/skillManager.js` - 技能管理
- ✅ `src/data/enemyFactory.js` - 敌人生成

## 下一步

现在游戏会按照正确的流程启动：
1. Three.js系统初始化
2. 触发GAME_START事件
3. 后端创建初始技能（肾上腺素激增、斩、拳、盾等）
4. 进入战斗阶段
5. 生成敌人
6. 克隆技能到战斗数组
7. 抽初始手牌
8. 前端响应并渲染

**所有数据都是真实的后端数据，不是假数据！**

---

**修复日期**: 2025-11-24  
**问题类型**: 架构违规（前端直接创建游戏数据）  
**严重程度**: 高（破坏前后端分离原则）  
**状态**: 已修复 ✅

