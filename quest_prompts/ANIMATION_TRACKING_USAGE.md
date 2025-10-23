# 动画系统锚点跟踪使用指南

## 📋 概述

从现在开始，动画系统的状态转换遵循**显式控制**原则：
- ✅ 动画完成后**默认**进入 `idle` 状态
- ✅ 需要**显式调用**才能进入 `tracking` 状态
- ✅ 拖拽结束后**默认**进入 `idle` 状态

## 🎯 状态机规则

```
idle ──────────────> animating ──────────────> idle
  ^                      ^                       |
  |                      |                       |
  └──────────────────────┘                       |
                                                 |
idle <────────── tracking <─────────────────────┘
  ^                                   (需要显式调用)
  |
  └──── dragging ────> idle
```

### 状态说明

1. **idle** - 静止状态，元素保持当前位置
2. **animating** - 执行动画中
3. **tracking** - 跟踪锚点位置（自动平滑移动到锚点）
4. **dragging** - 拖拽中

## 🔧 API 使用

### 1. 播放动画（自动回到 idle）

```javascript
import { enqueueCardAnimation } from '../utils/animationHelpers.js';

// 卡牌动画完成后会自动回到 idle 状态（不会自动跟踪）
enqueueCardAnimation(cardId, {
  from: { anchor: 'deck', scale: 0.6, opacity: 0 },
  to: { scale: 1, opacity: 1 },
  duration: 500
}, { 
  waitTags: ['all'] 
});
```

### 2. 恢复锚点跟踪

```javascript
import { enqueueAnimatableElementResumeTracking } from '../utils/animationHelpers.js';

// 显式将元素切换到 tracking 状态
enqueueAnimatableElementResumeTracking(cardId, {
  duration: 300,      // 跟踪动画时长（可选，默认使用 animator 配置）
  ease: 'power1.out', // 缓动函数（可选）
  waitTags: ['all']   // 等待的 tags
});
```

### 3. 典型使用场景

#### 场景 A：卡牌抽取后自动归位

```javascript
// 1. 抽卡动画
const tag1 = enqueueCardAnimation(cardId, {
  from: { anchor: 'deck', scale: 0.6, opacity: 0 },
  to: { scale: 1, opacity: 1 },
  duration: 500
}, { waitTags: ['state'] });

// 2. 显式开启跟踪，让卡牌跟随手牌容器的布局变化
enqueueAnimatableElementResumeTracking(cardId, {
  duration: 300,
  waitTags: [tag1]  // 等待抽卡动画完成
});
```

#### 场景 B：卡牌使用后保持在中心位置

```javascript
// 使用技能时飞到中心
enqueueCardAnimation(cardId, {
  anchor: 'center',
  to: { scale: 1.2 },
  duration: 350
}, { waitTags: ['all'] });

// 动画结束后保持在 idle 状态，不会自动归位
// 如果需要归位，显式调用 resumeTracking
```

#### 场景 C：拖拽结束后恢复跟踪

```javascript
// 在拖拽处理逻辑中
function onDragEnd(cardId) {
  animator.stopDragging(cardId); // 结束拖拽 → idle 状态
  
  // 根据业务逻辑决定是否恢复跟踪
  if (shouldTrackAnchor) {
    enqueueAnimatableElementResumeTracking(cardId, {
      duration: 400,
      ease: 'elastic.out(1, 0.5)'
    });
  }
}
```

## 🎨 高级用法

### 批量恢复跟踪

```javascript
// 批量让手牌中的所有卡牌开始跟踪锚点
const cardIds = [1, 2, 3, 4, 5];
cardIds.forEach(id => {
  enqueueAnimatableElementResumeTracking(id, {
    duration: 300,
    waitTags: ['all']
  });
});
```

### 条件性跟踪

```javascript
// 根据状态决定是否跟踪
if (gameState.player.frontierSkills.includes(skill)) {
  // 手牌中的卡需要跟踪
  enqueueAnimatableElementResumeTracking(skill.uniqueID, {
    waitTags: ['all']
  });
} else {
  // 其他位置的卡保持静止
  // 不调用 resumeTracking，保持在 idle 状态
}
```

## ⚠️ 注意事项

1. **不会自动跟踪**：所有动画完成后都会回到 `idle`，不再自动进入 `tracking`
2. **显式控制**：需要跟踪时必须调用 `enqueueAnimatableElementResumeTracking`
3. **状态互斥**：调用 `resumeTracking` 会中断当前的动画（如果有）
4. **锚点必须存在**：元素必须有注册的锚点才能进入 tracking 状态
5. **全局开关**：`anchorTrackingEnabled` 为 `false` 时，`resumeTracking` 会失败

## 🔍 调试

### 检查元素状态

```javascript
// 在浏览器控制台中
window.__debugAnimator();

// 或者
const status = window.__animator.getStatus();
console.log(status);
```

### 状态字段说明

```javascript
{
  id: 123,
  state: 'idle',      // 当前状态：idle | tracking | animating | dragging
  hasAnchor: true,    // 是否有锚点
  hasTween: false,    // 是否有正在执行的动画
  isDragging: false   // 是否在拖拽
}
```

## 📚 完整示例

```javascript
import { 
  enqueueCardAnimation, 
  enqueueAnimatableElementResumeTracking,
  enqueueDelay 
} from '../utils/animationHelpers.js';

// 复杂的卡牌交互流程
async function playCardSequence(cardId) {
  // 1. 卡牌飞到中心
  const tag1 = enqueueCardAnimation(cardId, {
    anchor: 'center',
    to: { scale: 1.2 },
    duration: 350
  }, { waitTags: ['all'] });
  
  // 2. 停顿展示
  const tag2 = enqueueDelay(500, { waitTags: [tag1] });
  
  // 3. 执行技能效果动画（缩放跳动）
  const tag3 = enqueueCardAnimation(cardId, {
    to: { scale: 1.3 },
    duration: 200
  }, { waitTags: [tag2] });
  
  const tag4 = enqueueCardAnimation(cardId, {
    to: { scale: 1.2 },
    duration: 200
  }, { waitTags: [tag3] });
  
  // 4. 飞回牌库
  const tag5 = enqueueCardAnimation(cardId, {
    anchor: 'deck',
    to: { scale: 0.5, rotate: 20, opacity: 0 },
    duration: 400
  }, { waitTags: [tag4] });
  
  // 注意：整个序列结束后卡牌处于 idle 状态
  // 如果需要让它继续跟踪某个锚点，需要显式调用：
  // enqueueAnimatableElementResumeTracking(cardId, { waitTags: [tag5] });
}
```

## 🎯 迁移指南

### 旧代码（自动跟踪）

```javascript
// 旧：动画结束后自动开始跟踪
enqueueCardAnimation(id, { ... });
// 动画结束 → 自动进入 tracking 状态
```

### 新代码（显式跟踪）

```javascript
// 新：需要显式恢复跟踪
const tag = enqueueCardAnimation(id, { ... });
// 动画结束 → idle 状态

// 如果需要跟踪，显式调用
enqueueAnimatableElementResumeTracking(id, { 
  waitTags: [tag] 
});
```

## 📖 参考

- [animator.js](../src/utils/animator.js) - 核心动画引擎
- [animationHelpers.js](../src/utils/animationHelpers.js) - 动画指令封装
- [animationSequencer.js](../src/data/animationSequencer.js) - 动画队列调度器
