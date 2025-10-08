// 精准系列
// 高要求、高伤害

import Skill from "../../skill";
import {dealDamage, launchAttack} from "../../battleUtils";
import {enqueueDelay} from "../../animationInstructionHelpers";

// 精准一击（D）（精准）
// 此技能只有当此技能前方所有技能都可用时才可用，造成13伤害
export class PreciseAttack extends Skill {
  constructor(name = '精心一击', tier = 0, baseDamage = 13, powerMultiplier = 5, times = 1, directDamage = true) {
    super(name, 'normal', tier, 0, 2, 1, '精准');
    this.baseColdDownTurns = 1;
    this.baseDamage = baseDamage;
    this.powerMultiplier = powerMultiplier;
    this.times = times;
    this.directDamage = directDamage;
  }

  get damage () {
    return Math.max(this.baseDamage + this.powerMultiplier * this.power, 6);
  }

  getDamage(enemy) {
    return this.damage;
  }

  canUse (player) {
    const forwardSkills = player.frontierSkills.slice(0, this.getInBattleIndex(player));
    return super.canUse(player) && forwardSkills.every(skill => skill.canUse(player));
  }

  use(player, enemy) {
    for (let i = 0; i < this.times; i++) {
      if(!this.directDamage) launchAttack(player, enemy, this.getDamage(enemy));
      else dealDamage(player, enemy, this.getDamage(enemy));
      enqueueDelay(300);
    }
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    if(this.times > 1) {
      return `${this.times}次${this.damage + (player?.attack ?? 0)}伤害，/named{前方}牌可用时可用`;
    }
    return `${this.damage + (player?.attack ?? 0)}伤害，/named{前方}牌可用时可用`;
  }
}

// 精准一击（C-）（精准）
// 造成19伤害
export class PreciseSingleAttack extends PreciseAttack {
  constructor() {
    super('精心一击', 1, 19, 6, 1);
    this.precessor = null;
  }
}

// 精心二击（C+）（精心一击延伸卡）
// 造成11伤害2次
export class PreciseDoubleAttack extends PreciseAttack {
  constructor() {
    super('精心二击', 2, 11, 3, 2);
    this.precessor = '精心一击';
  }
}

// 掌击（B-）（精准一击延伸卡）
// 造成25伤害，抽一张卡
export class PalmStrike extends PreciseAttack {
  constructor() {
    super('掌击', 3, 25, 7, 1, false);
    this.precessor = '精准一击';
  }

  // 使用技能
  use(player, enemy) {
    super.use(player, enemy);
    player.drawCards(1);
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    if (player) {
      return `${this.damage + (player?.attack ?? 0)}伤害，抽1张牌，/named{前方}牌可用时可用`;
    }
    return `${this.damage}伤害，抽1张牌，/named{前方}牌可用时可用`;
  }
}

// 弱点攻击（B-）（精准）
// 造成23伤害，若敌人虚弱，伤害增16
export class WeakPointAttack extends PreciseAttack {
  constructor(name = '弱点攻击', tier = 3) {
    super(name, tier, 23, 8, 1);
    this.precessor = '精准一击';
  }

  get extraDamage() {
    return 16 + this.power * 4;
  }

  shouldApplyExtraDamage(enemy) {
    return enemy.effects['虚弱'] > 0;
  }

  getDamage(enemy) {
    let extraDamage = 0;
    if(this.shouldApplyExtraDamage(enemy)) {
      extraDamage = this.extraDamage;
    }
    return this.damage + extraDamage;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    if (player) {
      return `${this.damage + (player?.attack ?? 0)}伤害，敌人/named{虚弱}则伤害增${this.extraDamage}，/named{前方}牌可用时可用`;
    }
    return `${this.damage}伤害，敌人/named{虚弱}则伤害增${this.extraDamage}，/named{前方}牌可用时可用`;
  }
}

// 摘云手（B+）（精准）
// 造成23伤害2次，若敌人虚弱，伤害增16
export class CloudHandAttack extends WeakPointAttack {
  constructor() {
    super('摘云手', 5);
    this.times = 2;
    this.precessor = '弱点攻击';
  }
}

// 摘星手（A-）（精准）
// 造成23伤害3次，若敌人虚弱，伤害增16
export class StarHandAttack extends WeakPointAttack {
  constructor() {
    super('摘星手', 6);
    this.times = 3;
    this.precessor = '摘云手';
  }
}