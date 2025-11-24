# ColoredText增强功能文档

## 概述
ColoredTextComponent现在支持嵌入效果图标（EffectIcon）和命名实体图标（NamedEntity），与旧版Vue实现功能对齐。

## 支持的标记格式

### 1. 彩色文本

**旧格式**（兼容）:
```
{red}红色文本{/red}
{blue}蓝色文本{/blue}
```

**新格式**:
```
/red{红色文本}
/blue{蓝色文本}
```

**支持的颜色**:
red, blue, green, yellow, white, gray, orange, purple, black, cyan, magenta, gold, silver

### 2. 效果图标

**格式**:
```
/effect{效果名}
```

**示例**:
```
获得3/effect{力量}
造成/effect{燃烧}伤害
移除敌人的/effect{护盾}
```

**效果**:
- 显示效果的图标emoji（如🔥、⚔️等）
- 使用effectDescription.js中定义的颜色
- 图标大小为fontSize（可配置）

### 3. 命名实体图标

**格式**:
```
/named{实体名}
```

**示例**:
```
消耗1/named{魏启}
提升/named{攻击}和/named{防御}
获得/named{金钱}
```

**效果**:
- 显示实体的图标emoji（如💧、⚔️等）
- 使用namedEntities.js中定义的颜色
- 图标大小为fontSize（可配置）

### 4. 技能图标（待完善）

**格式**:
```
/skill{技能名}
/skill{技能名+N}  # 带能量增益
/skill{技能名-N}  # 带能量减益
```

**示例**:
```
/skill{拳}
/skill{爆拳+2}
```

**当前实现**:
- 暂时显示为文本：`[技能名+N]`
- 使用金色高亮
- 未来可以实现真正的技能卡片预览

## 实现原理

### ColoredTextParser.js
- 使用正则表达式匹配所有标记类型
- 按位置排序所有匹配，避免嵌套冲突
- 返回统一的段落数组格式：
  ```javascript
  [
    { type: 'text', text: '普通文本', color: 0xffffff },
    { type: 'color', text: '彩色文本', color: 0xff0000 },
    { type: 'effect', effectName: '力量' },
    { type: 'named', entityName: '魏启' },
    { type: 'skill', skillName: '拳', powerDelta: 0 }
  ]
  ```

### ColoredTextComponent.js
- 遍历段落数组，为每种类型创建对应的Three.js对象
- **文本段落**: 使用Troika Text
- **效果图标**: 使用Canvas绘制emoji + Sprite
- **命名实体图标**: 使用Canvas绘制emoji + Sprite
- **技能图标**: 暂时使用文本，未来可升级为卡片预览

### 图标创建流程

#### _createEffectIcon(effectName, size)
1. 从effectDescriptions获取效果信息
2. 创建32x32 Canvas
3. 绘制背景色（效果颜色）
4. 绘制emoji图标
5. 转换为THREE.CanvasTexture
6. 创建Sprite并设置大小

#### _createNamedEntityIcon(entityName, size)
1. 从namedEntities获取实体信息
2. 创建32x32 Canvas
3. 绘制背景色（实体颜色）
4. 绘制emoji图标
5. 转换为THREE.CanvasTexture
6. 创建Sprite并设置大小

## 配置选项

```javascript
new ColoredTextComponent(text, {
  fontSize: 14,        // 文本字体大小
  iconSize: 16,        // 内联图标大小（默认与fontSize接近）
  maxWidth: 180,       // 最大宽度
  lineHeight: 1.2,     // 行高
  align: 'left'        // 对齐方式
});
```

## 使用示例

### 卡牌描述
```javascript
{
  description: '造成{red}12{/red}点伤害，提升敌人/effect{燃烧}层数伤害'
}
```

### 效果描述
```javascript
{
  description: '回合开始时，获得/named{闪避}，受伤则层数减1'
}
```

### 技能描述
```javascript
{
  description: '/named{咏唱}：每回合获得{green}2{/green}点/effect{护盾}'
}
```

## 测试数据

当前测试卡牌已更新：

### 直拳 (2阶)
```
描述: 造成{red}8{/red}点伤害，消耗1/named{行动}
```

### 猛拳 (3阶)
```
描述: 造成{red}10{/red}点伤害，获得1/effect{力量}
```

### 爆拳 (4阶)
```
描述: 造成{red}12{/red}点伤害，提升敌人/effect{燃烧}层数伤害
```

### 武学架式 (激活技能)
```
描述: /named{咏唱}：每回合获得{green}2{/green}点/effect{护盾}
```

## 数据源

### effectDescriptions.js
定义了所有效果的信息：
```javascript
{
  '力量': {
    name: '力量',
    icon: '⚔️',
    color: '#FF4500',
    description: '造成伤害时，提升层数点伤害'
  },
  '燃烧': {
    name: '燃烧',
    icon: '🔥',
    color: '#FF5555',
    description: '回合开始时，受到层数点伤害，层数减1'
  },
  // ...
}
```

### namedEntities.js
定义了所有命名实体的信息：
```javascript
{
  '魏启': {
    icon: '💧',
    color: 'purple',
    description: '魏启是这个世界的基础能量'
  },
  '行动': {
    icon: '⏳',
    color: 'gold',
    description: '行动点用于施放技能'
  },
  // ...
}
```

## 性能考虑

### Canvas缓存
- 每次创建图标都会生成新的Canvas和Texture
- 未来可以实现图标缓存机制，复用相同的纹理

### 内存管理
- dispose()方法正确清理所有Canvas和Texture资源
- userData存储引用，便于清理

### 布局计算
- 文本宽度通过Troika异步计算
- 图标宽度固定，计算简单
- 自动换行逻辑处理图标和文本

## 未来优化

### 1. 图标纹理缓存
```javascript
class IconTextureCache {
  static cache = new Map();
  
  static getEffectTexture(effectName) {
    if (!cache.has(effectName)) {
      // 创建并缓存
    }
    return cache.get(effectName);
  }
}
```

### 2. 技能卡片预览
- 鼠标悬停显示完整卡片
- 实现小型卡片渲染
- 支持能量变化显示

### 3. 动画效果
- 效果图标闪烁动画
- 数值变化时的高亮
- 过渡效果

### 4. 交互功能
- 点击图标查看详细说明
- 悬停显示tooltip
- 与FloatingTooltip集成

## 与旧版对比

| 特性 | 旧版Vue | 新版Three.js | 状态 |
|------|---------|-------------|------|
| 彩色文本 | ✅ | ✅ | 完成 |
| 效果图标 | ✅ | ✅ | 完成 |
| 命名实体 | ✅ | ✅ | 完成 |
| 技能图标 | ✅ | 🟡 | 基础实现 |
| Tooltip | ✅ | ❌ | 待实现 |
| 动画 | ✅ | ❌ | 待实现 |
| 交互 | ✅ | ❌ | 待实现 |

## 验证方法

1. 刷新浏览器
2. 查看手牌卡片描述
3. 应该看到：
   - **直拳**: "行动"图标（⏳）
   - **猛拳**: "力量"图标（⚔️）
   - **爆拳**: "燃烧"图标（🔥）
   - **武学架式**: "咏唱"和"护盾"图标

4. 检查图标：
   - 大小合适
   - 颜色正确
   - 位置对齐
   - 不遮挡文字

---

**实现日期**: 2025-11-24  
**作者**: GitHub Copilot  
**状态**: 已完成 ✅  
**参考**: deprecatedFrontend/components/global/ColoredText.vue

