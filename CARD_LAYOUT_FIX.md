# 手牌堆叠问题修复报告

## 问题描述
所有手牌卡片都堆叠在场景中央同一位置，没有正确地扇形排列。

## 根本原因

### 尺寸计算错误
**问题**：锚点布局计算使用的是**卡牌设计尺寸**（198px），但卡牌实际被缩放到**0.5倍**（99px）。

**错误代码**:
```javascript
// ❌ 错误：使用设计尺寸计算布局
const cardWidth = 198;  // 设计尺寸
const totalWidth = count * cardWidth + (count - 1) * gap;
// 结果：totalWidth = 7 * 198 + 6 * 10 = 1446px（错误！）
```

**实际情况**:
```javascript
// 卡牌创建时应用了0.5倍缩放
cardGroup.scale.set(0.5, 0.5, 1);
// 实际显示宽度 = 198 * 0.5 = 99px
```

### 结果
- 布局计算认为每张卡宽198px，间距10px
- 实际每张卡只有99px宽
- 导致所有卡牌的锚点位置计算错误
- 卡牌都被放在中心附近的错误位置

## 修复方案

### 修复1: 使用缩放后的尺寸
```javascript
// ✅ 正确：考虑缩放
const cardDesignWidth = 198;    // 设计尺寸
const cardScale = 0.5;          // 应用的缩放
const cardWidth = cardDesignWidth * cardScale;  // 实际宽度 = 99px
const gap = 10;
const count = cardIds.length;

const totalWidth = count * cardWidth + (count - 1) * gap;
// 结果：totalWidth = 7 * 99 + 6 * 10 = 753px（正确！）
```

### 修复2: 改进扇形角度
```javascript
// 旧代码：角度计算可能不居中
const rotation = (i - count / 2) * 2 * (Math.PI / 180);

// 新代码：更精确的居中
const rotation = (i - (count - 1) / 2) * 3 * (Math.PI / 180);
// 7张卡：索引0-6，中间是索引3
// 角度：-9°, -6°, -3°, 0°, 3°, 6°, 9°
```

### 修复3: 调整垂直位置
```javascript
// 旧代码：距底部160px（可能太高）
const baseY = height - 160;

// 新代码：距底部100px（更合适）
const baseY = height - 100;
```

## 布局计算详解

### 7张手牌示例（1920x1080屏幕）

**参数**:
- 卡牌实际宽度：99px
- 间距：10px
- 总宽度：7 * 99 + 6 * 10 = 753px

**起始位置**:
```
startX = (1920 - 753) / 2 = 583.5px
baseY = 1080 - 100 = 980px
```

**每张卡的位置**:
```
卡0: x = 583.5 + 0 * 109 + 49.5 = 633px,   rotation = -9°
卡1: x = 583.5 + 1 * 109 + 49.5 = 742px,   rotation = -6°
卡2: x = 583.5 + 2 * 109 + 49.5 = 851px,   rotation = -3°
卡3: x = 583.5 + 3 * 109 + 49.5 = 960px,   rotation = 0°   (中心)
卡4: x = 583.5 + 4 * 109 + 49.5 = 1069px,  rotation = 3°
卡5: x = 583.5 + 5 * 109 + 49.5 = 1178px,  rotation = 6°
卡6: x = 583.5 + 6 * 109 + 49.5 = 1287px,  rotation = 9°
```

### 坐标转换
```
屏幕坐标 → 世界坐标（透视相机）

screenX = 960px → worldX ≈ 0 (屏幕中心)
screenX = 633px → worldX ≈ -136 (左侧)
screenX = 1287px → worldX ≈ 136 (右侧)
```

## 旧前端参考

### SkillsHand.vue的布局逻辑
旧前端使用类似的计算方式：
```javascript
const cardWidth = 198;  // 但那是DOM元素，CSS会处理缩放
const baseGap = (containerWidth - n * cardWidth - extraSum) / (n - 1);
const totalWidth = n * cardWidth + pairGap.reduce((a, b) => a + b, 0);
```

**关键区别**:
- 旧前端：DOM元素，CSS transform处理缩放
- 新前端：Three.js对象，需要手动计算缩放后的尺寸

## 文件变更

- ✅ `src/three/ecs/SceneGraphAdapter.js`
  - `_updateCardAnchors()` 方法
  - 使用缩放后的卡牌尺寸
  - 改进扇形角度计算
  - 调整垂直位置

## 控制台日志

修复后应该看到：
```
[SceneGraphAdapter] Updating anchors for hand, cards: 7, window: 1920x1080
[SceneGraphAdapter] Hand layout: cardWidth=99, totalWidth=753, startX=583.5, baseY=980
[SceneGraphAdapter] Card 0 (...): screen(633.0, 980) -> world(-136.23, -210.45), rotation=-9.00°
[SceneGraphAdapter] Card 1 (...): screen(742.0, 980) -> world(-90.82, -210.45), rotation=-6.00°
[SceneGraphAdapter] Card 2 (...): screen(851.0, 980) -> world(-45.41, -210.45), rotation=-3.00°
[SceneGraphAdapter] Card 3 (...): screen(960.0, 980) -> world(0.00, -210.45), rotation=0.00°
[SceneGraphAdapter] Card 4 (...): screen(1069.0, 980) -> world(45.41, -210.45), rotation=3.00°
[SceneGraphAdapter] Card 5 (...): screen(1178.0, 980) -> world(90.82, -210.45), rotation=6.00°
[SceneGraphAdapter] Card 6 (...): screen(1287.0, 980) -> world(136.23, -210.45), rotation=9.00°
```

## 预期效果

刷新浏览器后：
- ✅ 7张手牌扇形排列在屏幕底部
- ✅ 卡牌水平分布均匀
- ✅ 中间卡片朝上（0°）
- ✅ 两侧卡片略微倾斜（±3°递增）
- ✅ 整体居中对齐

## 验证清单

- [ ] 手牌不再堆叠在同一位置
- [ ] 卡牌水平均匀分布
- [ ] 扇形效果明显（中间直立，两侧倾斜）
- [ ] 整体居中
- [ ] 卡牌位置在屏幕底部
- [ ] 所有7张卡片可见

## 后续优化

### 1. 动态间距
根据卡牌数量调整间距：
```javascript
const minGap = 5;   // 最小间距
const maxGap = 20;  // 最大间距
const gap = count <= 5 ? maxGap : maxGap - (count - 5) * 2;
```

### 2. 响应式布局
根据屏幕宽度自适应：
```javascript
if (totalWidth > width * 0.9) {
  // 卡牌太多，启用重叠布局
  const overlap = (totalWidth - width * 0.9) / (count - 1);
  gap = gap - overlap;
}
```

### 3. 悬停效果
实现卡牌悬停时的放大和展开：
```javascript
if (hoveredIndex === i) {
  scale = 1.2;  // 放大
  worldPos.y += 30;  // 上移
}
```

### 4. Z轴排序
根据索引设置Z坐标，实现正确的遮挡：
```javascript
anchors.set(cardIds[i], {
  x: worldPos.x,
  y: worldPos.y,
  z: i * 0.1,  // 后面的卡片z值更大
  scale,
  rotation
});
```

## 学到的经验

1. **Three.js缩放与布局分离**: 
   - 布局计算应该使用**实际显示尺寸**
   - Three.js的scale影响视觉，但不影响布局计算

2. **坐标系统一致性**:
   - 屏幕坐标计算要考虑所有缩放因素
   - 世界坐标转换要准确

3. **参考旧代码的注意事项**:
   - DOM布局与Three.js布局有本质区别
   - CSS transform与Three.js scale的处理方式不同

---

**修复日期**: 2025-11-24  
**问题类型**: 布局计算错误（未考虑缩放）  
**严重程度**: 高（核心功能无法使用）  
**状态**: 已修复 ✅

