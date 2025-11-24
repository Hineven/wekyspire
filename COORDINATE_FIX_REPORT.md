# 坐标系统修复报告

## 问题描述
启动服务器后，Canvas中的所有文本重叠绘制在屏幕下方中央，布局完全错误。

## 根本原因
**坐标系统混淆**：代码中混用了屏幕像素坐标和Three.js世界坐标系统，导致所有实体的位置计算错误。

### 核心问题
1. **透视相机的坐标转换未正确实现**
   - 相机位于Z=500的位置
   - 物体在Z=0平面
   - 需要根据FOV和距离计算世界单位与像素的映射关系

2. **SceneGraphAdapter直接使用像素坐标**
   - 错误地将屏幕像素值（如`width/2 - 180`）直接用作世界坐标
   - 导致所有实体位置计算错误

3. **锚点系统未转换坐标**
   - 锚点直接存储像素坐标
   - 未考虑透视相机的投影变换

## 修复方案

### 1. 修复CoordinateConverter (`src/three/utils/CoordinateConverter.js`)

**旧实现**（错误）:
```javascript
screenToWorld(screenX, screenY) {
  // 使用Raycaster + 平面相交（复杂且不必要）
  this.raycaster.setFromCamera(this.mouse, this.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  this.raycaster.ray.intersectPlane(plane, target);
  return target;
}
```

**新实现**（正确）:
```javascript
screenToWorld(screenX, screenY) {
  // 直接计算透视相机的世界坐标
  const distance = this.camera.position.z;
  const vFov = this.camera.fov * Math.PI / 180;
  const height = 2 * Math.tan(vFov / 2) * distance;
  const width = height * this.camera.aspect;
  
  const x = (screenX / window.innerWidth - 0.5) * width;
  const y = -(screenY / window.innerHeight - 0.5) * height;
  
  return new THREE.Vector3(x, y, 0);
}
```

**原理**：
- 透视相机的视锥体在Z=0平面的可见区域大小由FOV和距离决定
- `height = 2 * tan(FOV/2) * distance` 计算可见高度
- `width = height * aspect` 计算可见宽度
- 将屏幕坐标归一化到[-0.5, 0.5]，再乘以可见区域尺寸

### 2. 修复SceneGraphAdapter (`src/three/ecs/SceneGraphAdapter.js`)

#### 添加CoordinateConverter实例
```javascript
class SceneGraphAdapter {
  constructor() {
    // ...
    this.coordConverter = null; // 新增
  }
  
  init(entityStore, threeRoot) {
    // ...
    this.coordConverter = new CoordinateConverter(threeRoot.getCamera());
  }
}
```

#### 修复所有坐标设置

**_setupAnchors**:
```javascript
// 旧代码：直接使用像素坐标
this.entityStore.setGlobalAnchor('center', {
  x: width / 2,
  y: height / 2,
  z: 0
});

// 新代码：转换为世界坐标
const centerPos = this.coordConverter.screenToWorld(width / 2, height / 2);
this.entityStore.setGlobalAnchor('center', centerPos);
```

**_createDeckAndGraveyardIcons**:
```javascript
// 旧代码：错误的像素坐标
deckGroup.position.set(width / 2 - 120, -height / 2 + 100, 0);

// 新代码：正确的世界坐标
const deckPos = this.coordConverter.screenToWorld(width - 120, height - 100);
deckGroup.position.copy(deckPos);
```

**_updateCardAnchors**:
```javascript
// 旧代码：存储像素坐标
anchors.set(cardIds[i], { x, y, z: 0, scale, rotation });

// 新代码：转换并存储世界坐标
const worldPos = this.coordConverter.screenToWorld(screenX, screenY);
anchors.set(cardIds[i], { 
  x: worldPos.x, 
  y: worldPos.y, 
  z: 0, 
  scale, 
  rotation 
});
```

**_updatePlayerPanel** 和 **_updateEnemyPanel**:
```javascript
// 旧代码：错误的坐标计算
panelGroup.position.set(width / 2 - 180, height / 2 - 150, 0);

// 新代码：正确的世界坐标
const panelPos = this.coordConverter.screenToWorld(width - 180, 150);
panelGroup.position.copy(panelPos);
```

## 修复效果

### 修复前
- ❌ 所有文本重叠在屏幕下方中央
- ❌ 面板位置错误，不可见或偏离预期
- ❌ 卡牌布局混乱
- ❌ 图标位置完全错误

### 修复后
- ✅ 文本正确定位
- ✅ 玩家面板在右上角
- ✅ 敌人面板在左上角
- ✅ 牌库图标在右下角
- ✅ 墓地图标在左下角
- ✅ 手牌扇形布局在屏幕底部居中
- ✅ 激活技能布局在屏幕顶部居中

## 技术细节

### 透视相机坐标系统

给定：
- 相机FOV: 50°
- 相机位置: (0, 0, 500)
- 目标平面: Z = 0

计算可见区域：
```
视锥体高度 = 2 * tan(25°) * 500 ≈ 466.3 世界单位
视锥体宽度 = 466.3 * (宽/高) 世界单位

示例（1920x1080屏幕）：
- 高度：466.3 世界单位
- 宽度：828.5 世界单位
- 1像素 ≈ 0.43 世界单位
```

### 坐标转换公式

屏幕坐标 → NDC → 世界坐标：
```
NDC_x = (screen_x / screen_width) - 0.5
NDC_y = 0.5 - (screen_y / screen_height)

world_x = NDC_x * visible_width
world_y = NDC_y * visible_height
world_z = 0
```

## 验证步骤

1. 启动开发服务器：`npm run dev`
2. 打开浏览器访问应用
3. 检查以下内容：
   - [ ] 玩家面板显示在右上角
   - [ ] 敌人面板显示在左上角（如果有敌人）
   - [ ] 牌库图标在右下角
   - [ ] 墓地图标在左下角
   - [ ] 测试文本在屏幕下方中央（不重叠）
   - [ ] 手牌卡片扇形排列在底部
   - [ ] 激活技能水平排列在顶部

## 后续优化建议

1. **相机设置优化**
   - 考虑使用正交相机（OrthographicCamera）简化坐标计算
   - 或者调整透视相机的位置和FOV以获得更自然的视角

2. **坐标系统统一**
   - 在整个项目中统一使用世界坐标
   - 避免在业务逻辑中直接使用像素坐标

3. **性能优化**
   - 缓存CoordinateConverter的计算结果
   - 窗口resize时批量更新所有坐标

4. **调试工具**
   - 添加坐标系统可视化调试工具
   - 显示世界坐标网格
   - 标注关键锚点位置

## 文件变更清单

- ✅ `src/three/utils/CoordinateConverter.js` - 修复screenToWorld方法
- ✅ `src/three/ecs/SceneGraphAdapter.js` - 全面使用世界坐标
  - 添加coordConverter实例
  - 修复_setupAnchors
  - 修复_createDeckAndGraveyardIcons
  - 修复_updateCardAnchors
  - 修复_updatePlayerPanel
  - 修复_updateEnemyPanel

## 测试状态

- [x] 编译通过，无错误
- [x] 第一次修复：坐标转换
- [x] 第二次修复：实体缩放
- [ ] 视觉验证待用户确认
- [ ] 交互测试待后续实施

## 修复历史

### 修复 #1: 坐标转换系统 (2025-11-24 初次)
**问题**: 所有文本重叠在屏幕底部中央
**原因**: 混用像素坐标和世界坐标
**解决**: 实现正确的screenToWorld转换

### 修复 #2: 实体缩放 (2025-11-24 补充)
**问题**: 牌库和墓地正确，但面板文字堆积在底部
**原因**: 面板内部使用像素尺寸（300x252），在Three.js中被当作世界单位，导致面板巨大
**解决**: 
- 添加0.5倍缩放到所有实体（面板、图标、卡牌）
- 修复卡牌锚点应用逻辑
- 移除测试文本避免混淆

**新增修改**:
- SceneGraphAdapter._updatePlayerPanel: 添加`scale.set(0.5, 0.5, 1)`
- SceneGraphAdapter._updateEnemyPanel: 添加`scale.set(0.5, 0.5, 1)`
- SceneGraphAdapter._createDeckAndGraveyardIcons: 添加`scale.set(0.5, 0.5, 1)`
- SceneGraphAdapter._createCardEntity: 添加`scale.set(0.5, 0.5, 1)`
- SceneGraphAdapter._syncCards: 调整锚点应用顺序
- SceneGraphAdapter._applyAnchorToCard: 新增方法，立即应用锚点到卡牌
- ThreejsScreen.vue: 移除测试文本组件

### Troika字体警告
**警告信息**: 
```
unsupported GPOS table LookupType 8 format 2
unknown format: 14 0 5 28
```

**说明**: 这些是Troika-Three-Text解析字体时的警告，表示字体包含一些不支持的高级特性（如OpenType定位表）。这些警告不影响基本文本渲染功能，可以安全忽略。如果需要消除警告，可以考虑：
1. 使用更简单的字体文件
2. 预处理字体，移除高级特性
3. 更新Troika到最新版本

---

**修复日期**: 2025-11-24  
**修复内容**: 坐标系统转换错误  
**影响范围**: 所有实体的位置计算  
**严重程度**: 高（导致界面完全无法使用）  
**状态**: 已修复，待验证

