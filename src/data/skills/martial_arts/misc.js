// 一些单卡

import Skill from '../../skill.js';
import {launchAttack, dealDamage, gainShield, drawSkillCard, dropSkillCard, burnSkillCard, discoverSkillCard} from '../../battleUtils.js';
import {signedNumberString, signedNumberStringW0} from "../../../utils/nameUtils";

// 莽撞攻击（D）（莽撞攻击）
export class CarelessPunch extends Skill {
  constructor() {
    super('莽撞攻击', 'normal', 0, 0, 1, 1);
    this.baseColdDownTurns = 1;
  }

  get coldDownTurns() {
    return Math.max(super.coldDownTurns - this.power, 0);
  }

  // 使用技能
  use(player, enemy, stage) {
    if(stage === 0) {
      launchAttack(player, enemy, 10);
      return false;
    } else {
      dealDamage(player, player, 3);
      return true;
    }
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    if(player) {
      const damage = 10 + (player?.attack ?? 0);
      return `造成${damage}点伤害，受3伤害`;
    }
    return `造成10点伤害，受3伤害`;
  }
}

// 快速打击（C-）（单卡）
// 同时消耗相邻技能充能进行攻击
export class SpeedyPunch extends Skill {
  constructor() {
    super('快速打击', 'normal', 2, 0, 1, 1);
    this.baseColdDownTurns = 1;
  }

  get damage () {
    return Math.max(16 + 7 * this.power, 5);
  }

  canUse (player) {
    // 看看左边技能有没有充能
    const leftSkill = player.frontierSkills[this.getInBattleIndex(player) - 1];
    const leftHaveUses = leftSkill?.remainingUses > 0;
    // 看看右边技能有没有充能
    const rightSkill = player.frontierSkills[this.getInBattleIndex(player) + 1];
    const rightHaveUses = rightSkill?.remainingUses > 0;
    return super.canUse(player) && (leftHaveUses || rightHaveUses);
  }

  // 使用技能
  use(player, enemy, stage) {
    // 看看左边技能有没有充能
    const leftSkill = player.frontierSkills[this.getInBattleIndex(player) - 1];
    const leftHaveUses = leftSkill?.remainingUses > 0;
    // 看看右边技能有没有充能
    const rightSkill = player.frontierSkills[this.getInBattleIndex(player) + 1];
    const rightHaveUses = rightSkill?.remainingUses > 0;
    if(leftHaveUses) {
      leftSkill.consumeUses();
    } else if(rightHaveUses) {
      rightSkill.consumeUses();
    }
    launchAttack(player, enemy, this.damage);
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `造成${this.damage + (player?.attack ?? 0)}点伤害，消耗/named{相邻}技能1充能，优先左侧`;
  }
}

// 重击（D）（重击）
// 消耗2行动点，赋予易伤1，但仅产生4伤害
export class PowerPunch extends Skill {
  constructor() {
    super('重击', 'normal', 0, 0, 2, 1, '重击');
    this.baseColdDownTurns = 2;
  }

  get damage () {
    return 4 + 3 * this.power;
  }

  // 使用技能
  use(player, enemy, stage) {
    if(stage === 0) {
      const atkPassThroughDamage = launchAttack(player, enemy, this.damage).passThoughDamage;
      if(atkPassThroughDamage > 0) return false;
      return true;
    } else {
      enemy.addEffect('易伤', 2);
      return true;
    }
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `造成${this.damage + (player?.attack ?? 0)}点伤害，赋予/effect{易伤}2`;
  }
}

// 狡黠打击（D）（单卡）
// 造成6伤害，将最左侧牌置入牌堆顶
export class CunningPunch extends Skill {
  constructor() {
    super('狡黠打击', 'normal', 0, 0, 1, 1);
    this.baseColdDownTurns = 2;
  }
  get damage() {
    return Math.max(6 + 3 * this.power, 4);
  }
  use(player, enemy, stage) {
    if(stage === 0) {
      launchAttack(player, enemy, this.damage);
      return false;
    } else {
      if(player.skills.length > 1) {
        const leftSkill = player.skills[0];
        dropSkillCard(player, skillID, 0);
      }
      return true;
    }
  }
}