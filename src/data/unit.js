// filepath: d:\cb_6\hineven_wekyspire\wekyspire\src\data\unit.js
import { addEffect as addEffectToTarget, removeEffect as removeEffectFromTarget, applyHeal as applyHealToTarget } from './battleUtils.js'

// 基础作战单位抽象类（玩家/敌人公用）
export default class Unit {
  constructor() {
    this.type = 'unit';
    this.name = '';
    this.hp = 0; // 当前生命值
    this.maxHp = 0; // 最大生命值
    this.shield = 0; // 当前护盾
    this.baseAttack = 0; // 基础攻击力
    this.baseDefense = 0; // 基础防御力
    this.baseMagic = 0; // 基础灵能强度
    this.effects = {}; // 效果列表
  }

  // 计算属性（默认规则）
  get attack() {
    return this.baseAttack + (this.effects['力量'] || 0);
  }

  get defense() {
    return this.baseDefense + (this.effects['坚固'] || 0);
  }

  get magic() {
    return this.baseMagic + (this.effects['集中'] || 0);
  }

  // 添加效果（委托 battleUtils）
  addEffect(effectName, stacks = 1) {
    addEffectToTarget(this, effectName, stacks);
  }

  // 移除效果（委托 battleUtils）
  removeEffect(effectName, stacks = 1) {
    removeEffectFromTarget(this, effectName, stacks);
  }

  // 应用治疗（委托 battleUtils）
  applyHeal(heal) {
    applyHealToTarget(this, heal);
  }


  // 随机移除stacks层效果
  removeEffects(stacks) {
    const effectNames = Object.keys(this.effects);
    for (let i = 0; i < stacks; i++) {
      if (effectNames.length === 0) break;
      const randomIndex = Math.floor(Math.random() * effectNames.length);
      const effectName = effectNames[randomIndex];
      this.removeEffect(effectName, 1);
    }
  }

  // 随机移除负面效果
  // mode: 'random' 随机移除, 'highest-stack' 优先层数最高的
  // 'highest-stack-kind' 种类移除，优先层数最高种类
  // 'ramdom-kind' 种类移除，随机种类
  removeNegativeEffects(count, mode = 'random') {
    // TODO
  }


  clearNegativeEffects () {
    // TODO
  }
}
