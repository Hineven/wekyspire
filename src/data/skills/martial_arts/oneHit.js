
// 狠狠一击（D）（一击）
import Skill from "../../skill";
import {launchAttack} from "../../battleUtils";
import backendEventBus, {EventNames} from "../../../backendEventBus";

export class FinalStrike extends Skill {
  constructor(name = '狠狠一击', tier, damage = 18, powerMultiplier = 7, cardActivationColdDown = 0) {
    super(name, 'normal', tier, 0, 2, 1, '一击');
    this.baseColdDownTurns = 9; // 基础冷却时间
    this.baseSlowStart = true; // 慢启动
    this.baseDamage = damage; // 基础伤害
    this.powerMultiplier = powerMultiplier; // 每点力量增加的伤害
    this.cardActivationColdDown = 1;//cardActivationColdDown; // 卡牌激活冷却时间
    this.listener_ = () => {
      for (let i = 0; i < this.cardActivationColdDown; i++) {
        // ????
        // FIXME
        console.log(this.coldDownTurns, this.remainingUses, this.maxUses);
        if(this.canColdDown()) {
          this.coldDown();
        }
      }
    };
  }

  onEnterBattle() {
    super.onEnterBattle();
    backendEventBus.on(EventNames.Player.SKILL_USED, this.listener_);
  }
  onLeaveBattle() {
    super.onLeaveBattle();
    backendEventBus.off(EventNames.Player.SKILL_USED, this.listener_);
  }

  get damage () {
    return Math.max(8, this.baseDamage + this.powerMultiplier * this.power);
  }

  use (player, enemy, stage) {
    launchAttack(player, enemy, this.damage);
    return true;
  }

  regenerateDescription (player) {
    if(this.cardActivationColdDown > 0) {
      return `造成${this.damage + (player?.attack ?? 0)}点伤害，技能发动后冷却${this.cardActivationColdDown}次`;
    }
    return `造成${this.damage + (player?.attack ?? 0)}点伤害`;
  }
}

// 强击（C-）
// 造成27伤害
export class RendingFist extends FinalStrike {
  constructor() {
    super('强击', 1, 27, 11, 1);
    this.precessor = '狠狠一击';
  }
}

// 悍拳（B-）
// 造成40伤害
export class ViciousFist extends FinalStrike {
  constructor() {
    super('悍拳', 3, 40, 15, 1);
    this.precessor = '强击';
  }
}

// 崩拳（B+）
// 造成90伤害
export class CrashingFist extends FinalStrike {
  constructor() {
    super('崩拳', 5, 90, 20, 1);
    this.precessor = '悍拳';
  }
}