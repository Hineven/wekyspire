import { upgradePlayerTier } from "./player.js";

// 能力抽象类
export class Ability {
  constructor(name, description, tier, spawnWeight = 1) {
    this.name = name; // 能力名称
    this.description = description; // 能力描述
    this.tier = tier || 1; // 能力等级，默认为1
    this.spawnWeight = spawnWeight; // 能力生成权重，默认为1
    // 为每个实例生成唯一ID（用于动画同步与列表key）
    this.uniqueID = Math.random().toString(36).substring(2, 10);
  }
  // 应用能力效果
  apply(player) {
    // 子类需要实现具体逻辑
  }

  onBattleStart(player) {
    // 子类可选择实现具体逻辑
  }
}
