# CardEntity描述文本渲染错误修复

## 错误信息
```
Uncaught (in promise) TypeError: segment.text is undefined
_createDescription CardEntity.js:133
_build CardEntity.js:47
```

## 问题原因

### 数据格式不匹配
CardEntity的`_createDescription()`方法使用旧的段落格式，期望所有段落都有`segment.text`属性，但ColoredTextParser已经更新为支持多种类型的段落：

**旧的期望格式**（CardEntity）:
```javascript
[
  { text: '文本', color: 0xffffff },
  { text: '红色文本', color: 0xff0000 }
]
```

**新的实际格式**（ColoredTextParser）:
```javascript
[
  { type: 'text', text: '文本', color: 0xffffff },
  { type: 'color', text: '红色', color: 0xff0000 },
  { type: 'effect', effectName: '燃烧' },  // 没有text属性！
  { type: 'named', entityName: '魏启' },   // 没有text属性！
  { type: 'skill', skillName: '拳' }        // 没有text属性！
]
```

### 错误的处理逻辑
```javascript
// ❌ 旧代码：假设所有segment都有text属性
for (const segment of segments) {
  const text = this.textFactory.createText(segment.text, {  // 当segment是effect/named/skill时会出错！
    fontSize: 14,
    color: segment.color,
    // ...
  });
}
```

## 修复方案

### 使用ColoredTextComponent
CardEntity不应该自己解析和渲染彩色文本，而应该使用专门的`ColoredTextComponent`，它已经正确处理了所有类型的段落（文本、颜色、图标等）。

### 修复前
```javascript
_createDescription() {
  const description = this.skillData.description || '';
  
  // 解析彩色文本
  const segments = parseColoredText(description);
  const descGroup = new THREE.Group();
  
  let offsetY = 0;
  for (const segment of segments) {
    // ❌ 错误：segment可能没有text属性
    const text = this.textFactory.createText(segment.text, {
      fontSize: 14,
      color: segment.color,
      anchorX: 'left',
      anchorY: 'top',
      maxWidth: 170
    });
    text.position.set(-85, offsetY, 0);
    descGroup.add(text);
    
    if (segment.text.length > 15) {
      offsetY -= 20;
    }
  }
  
  descGroup.position.set(0, 50, 0.1);
  this.group.add(descGroup);
  this.components.descGroup = descGroup;
}
```

### 修复后
```javascript
_createDescription() {
  const description = this.skillData.description || '';
  
  // ✅ 使用ColoredTextComponent处理描述文本
  const coloredTextComponent = new ColoredTextComponent(description, {
    fontSize: 12,
    maxWidth: 170,
    iconSize: 12,
    lineHeight: 1.4
  });
  
  const descGroup = coloredTextComponent.getObject3D();
  descGroup.position.set(-85, 50, 0.1);
  this.group.add(descGroup);
  this.components.descGroup = descGroup;
  this.components.coloredText = coloredTextComponent;
}
```

## 优势

### 1. 正确处理所有类型
ColoredTextComponent能正确处理：
- ✅ 普通文本
- ✅ 彩色文本（{red}文本{/red}）
- ✅ 效果图标（/effect{燃烧}）
- ✅ 命名实体（/named{魏启}）
- ✅ 技能引用（/skill{拳}）

### 2. 自动布局
- 自动换行
- 文本和图标混排
- 正确计算位置

### 3. 资源管理
- 统一的dispose机制
- 图标纹理自动清理

### 4. 代码复用
- 不重复实现解析逻辑
- 使用经过测试的组件

## 测试数据

卡牌描述现在可以包含：

```javascript
// 纯文本
description: '造成6点伤害'

// 彩色文本
description: '造成{red}6{/red}点伤害'

// 带效果图标
description: '造成{red}12{/red}点伤害，提升敌人/effect{燃烧}层数伤害'

// 带命名实体
description: '消耗1/named{行动}，获得{blue}3{/blue}点/named{魏启}'

// 混合使用
description: '/named{咏唱}：每回合获得{green}2{/green}点/effect{护盾}'
```

## 文件变更

- ✅ `src/three/entities/CardEntity.js`
  - 导入ColoredTextComponent
  - 移除parseColoredText导入
  - 重写_createDescription方法
  - 添加coloredText组件到components

## 相关组件

### ColoredTextComponent
**功能**: 解析和渲染彩色文本及图标
**位置**: `src/three/ecs/components/ColoredTextComponent.js`
**用途**: 
- 卡牌描述
- 效果描述
- 对话文本
- 任何需要彩色文本和图标的地方

### ColoredTextParser
**功能**: 解析文本标记
**位置**: `src/three/text/ColoredTextParser.js`
**返回格式**:
```javascript
[
  { type: 'text', text: '...', color: 0xffffff },
  { type: 'color', text: '...', color: 0xff0000 },
  { type: 'effect', effectName: '...' },
  { type: 'named', entityName: '...' },
  { type: 'skill', skillName: '...', powerDelta: 0 }
]
```

## 验证清单

刷新浏览器后，检查：
- [ ] 卡牌正常渲染，无错误
- [ ] 描述文本显示正确
- [ ] 彩色文本颜色正确
- [ ] 效果图标显示（如🔥、⚔️等）
- [ ] 命名实体图标显示（如💧、⏳等）
- [ ] 文本和图标正确混排
- [ ] 自动换行正常工作

## 后续优化

1. **字体大小调整**: 当前描述文字为12px，可能需要根据卡牌大小调整
2. **行间距优化**: lineHeight设为1.4，可能需要微调
3. **图标大小**: iconSize设为12，与文字大小匹配
4. **位置微调**: descGroup位置可能需要根据实际效果调整

---

**修复日期**: 2025-11-24  
**错误类型**: 数据格式不匹配  
**严重程度**: 高（导致卡牌渲染失败）  
**状态**: 已修复 ✅

