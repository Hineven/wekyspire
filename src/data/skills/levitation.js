import Skill from '../skill';
// 空系浮空系列技能
// 提供高额闪避，支付攻击手段


// 浮空I
// 浮空，获得3层/effect{闪避}'
export class FloatingI extends Skill {
  constructor() {
    super('浮空I', 'magic', 3, 1, 1, 1, "浮空");
    this.baseColdDownTurns = 5;
  }

  get stacks() {
    return Math.max(3 + this.power, 1);
  }

  use(player, enemy) {
    player.addEffect('闪避', this.stacks);
    return true;
  }

  regenerateDescription(player) {
    return `浮空，获得${this.stacks}层/effect{闪避}`;
  }
}