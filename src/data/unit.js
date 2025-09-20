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
}
