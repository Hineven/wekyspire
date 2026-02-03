// 商品抽象类
class Item {
  constructor(name, description, price, tier = 1, spawnWeight = 1, alwaysPresent = false, stock = Infinity) {
    this.name = name; // 商品名称
    this.description = description; // 商品描述
    this.tier = tier || 1; // 商品等阶，默认为1
    // 为每个实例生成一个唯一ID（用于动画同步与列表key）
    this.uniqueID = Math.random().toString(36).substring(2, 10);
  }
  // 购买商品效果
}

export { Item, RestoreHealth, RestoreMana, SkillSlot }