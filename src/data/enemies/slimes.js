// 示例敌人：火史莱姆
// 继承自Enemy类，实现构造函数和act方法

import { launchAttack } from '../battleUtils.js';
import Enemy from '../enemy.js';
import { addEnemyActionLog } from '../battleLogUtils.js';

class FireSlime extends Enemy {
  constructor(battleIntensity) {
    // 调用父类构造函数，传入基础属性
    super('火史莱姆', 
      13 + Math.floor(5 * battleIntensity),
       6 + Math.floor(battleIntensity * 0.6),
        1, 
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.burnDamage = 3; // 燃烧伤害
    this.description = "一只史莱姆，但它为什么在冒火？";
  }
  
  calculateDamage(attack, player) {
    return attack;
  }

  // 敌人行动方法
  act(player) {
    // 火史莱姆有50%概率使用普通攻击，50%概率使用燃烧攻击
    if (Math.random() < 0.5) {
      // 普通攻击
      const damage = this.calculateDamage(this.attack, player);
      addEnemyActionLog(`${this.name}冲击！`);
      launchAttack(this, player, damage);
    } else {
      // 燃烧攻击：造成伤害并附加燃烧效果
      const damage = this.calculateDamage(this.magic, player);
      addEnemyActionLog(`${this.name} 使用了燃烧攻击！`);
      const result = launchAttack(this, player, damage);
      if(result.passThoughDamage > 0) player.addEffect('燃烧', 4);
    }
  }
}

export { FireSlime };