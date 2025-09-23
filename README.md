# 魏启尖塔

这是一个使用Vite构建，基于Vue 3框架，使用Javascript和HTML的单人肉鸽文字冒险型网页小游戏。
## 数据说明

### 敌人

敌人由`enemyFactory.js`生成，根据战斗场次数决定强度和类型。

### 技能

技能系统由`skillManager.js`管理，技能定义在`skills/`目录下。

### 能力

能力系统由`abilityManager.js`管理，能力定义在`abilities/`目录下。

### 效果

效果系统现在直接集成在Player和Enemy对象中，通过addEffect/removeEffect方法管理效果。
状态修正型效果通过对象的getter实现，例如：

```javascript
get attack() {
  return this.baseAttack + (this.effects['力量'] || 0);
}
```

## 功能特性

- 回合制战斗系统
- 技能系统
- 敌人生成系统
- 奖励和商店系统
- 多种游戏界面

## 开发指南

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 游戏规则

玩家将扮演一个灵御（能使用魏启这种神奇能量的战士），随着游戏进行，不断击败越来越强大的敌人，并在每场战斗后收集金钱、获得技能、升级能力、恢复状态、购买物品、触发随机事件等，攀升到尖塔的高处并击败最终敌人。
