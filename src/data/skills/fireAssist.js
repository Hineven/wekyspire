// 火属辅助类技能

import Skill from '../skill.js';
import {launchAttack, dealDamage, gainShield, dropSkillCard, burnSkillCard} from '../battleUtils.js';
import { addBattleLog } from '../battleLogUtils.js';
import {enqueueDelay} from "../animationDispatcher";

// 不可控烈焰（C-）
// 丢弃冷却中的技能，自己和敌人各获得4层燃烧
export class FireEmpowered extends Skill {
  constructor() {
    super('不可控烈焰', 'fire', 1, 1, 1, 1);
    this.baseColdDownTurns = 2;
  }

  get selfStacks() {
    return 4;
  }

  get enemyStacks() {
    return Math.max(4 + 2 * this.power, 1);
  }

  use(player, enemy, stage) {
    if(stage === 0) {
      for(let skill of player.skills) {
        if(skill.remainingUses === 0) {
          dropSkillCard(player, skill.uniqueID);
          enqueueDelay(200);
        }
      }
      return false;
    } else if(stage === 1){
      player.addEffect('燃烧', this.selfStacks);
      return false;
    } else {
      enemy.addEffect('燃烧', this.enemyStacks);
      return true;
    }
  }

  regenerateDescription(player) {
    if (this.selfStacks === this.enemyStacks) {
      return `丢弃未冷却技能，获得并赋予${this.selfStacks}层/effect{燃烧}`;
    } else {
      return `丢弃未冷却技能，获得${this.selfStacks}层/effect{燃烧}，赋予${this.enemyStacks}层/effect{燃烧}`;
    }
  }
}

// 炽热诅咒（C+）
// 烧掉最近的卡，赋予敌人【7+灵能】层燃烧
export class ScorchingCurse extends Skill {
  constructor() {
    super('炽热诅咒', 'fire', 2, 1, 1, 1);
    this.subtitle = '炽热诅咒';
    this.baseColdDownTurns = 3;
  }

  get stacks() {
    return Math.max(7 + 2 * this.power, 1);
  }

  getClosestSkill(player) {
    let anySkill = null;
    let minDistance = Infinity;
    player.frontierSkills.forEach(skill => {
      if (skill !== this) {
        const distance = Math.abs(skill.getInBattleIndex(player) - this.getInBattleIndex(player));
        if (distance < minDistance) {
          minDistance = distance;
          anySkill = skill;
        }
      }
    });
    return anySkill;
  }

  getStacks(player) {
    return this.stacks + player.magic;
  }

  use(player, enemy, stage) {
    if(stage === 0) {
      const closestSkillID = this.getClosestSkill(player)?.uniqueID;
      burnSkillCard(player, closestSkillID, true);
      enqueueDelay(200);
      return false;
    } else {
      enemy.addEffect('燃烧', this.getStacks(player));
      return true;
    }
  }

  getDescription(player) {
    if(player) {
      return `/named{焚毁}/named{最近}的技能，赋予敌人${this.getStacks(player)}层/effect{燃烧}`;
    }
    return `/named{焚毁}/named{最近}的技能，赋予敌人【7+/named{灵能}】层/effect{燃烧}`;
  }
}

// 燃心决（A）
// 获得4层集中和1层燃心
export class DevotionCurse extends Skill {
  constructor() {
    super('燃心决', 'fire', 7, 0, 1, 1);
    this.subtitle = '烈焰焚心';
  }

  get stacks() {
    return Math.max(4 + 2 * this.power, 1);
  }

  use(player, enemy, stage) {
    if(stage === 0) {
        player.addEffect('集中', this.stacks);
        return false;
    } else {
        player.addEffect('燃心', 1);
        return true;
    }
  }

  getDescription(player) {
    return `获得${this.stacks}层/effect{集中}，1层/effect{燃心}`;
  }
}


// 同灭（B）
// 获得并赋予【12 + 3*灵能】层燃烧
export class DualExtinction extends Skill {
  constructor() {
    super('同灭', 'fire', 4, 2, 1, 1);
  }

  get stacks() {
    return Math.max(12 + 8 * this.power, 1);
  }

  getStacks(player) {
    return this.stacks + player.magic * 3;
  }

  use(player, enemy, stage) {
    if(stage === 0) {
      player.addEffect('燃烧', this.getStacks(player));
      return false;
    } else {
      enemy.addEffect('燃烧', this.getStacks(player));
      return true;
    }
  }

  getDescription(player) {
    if(player) {
      return `获得并赋予${this.getStacks(player)}层/effect{燃烧}`;
    }
    return `获得并赋予【${this.stacks} + 3*named{灵能}】层/effect{燃烧}`;
  }
}

// 暴怒（B）
// 获得1层暴怒
export class Rage extends Skill {
  constructor() {
    super('暴怒', 'buff', 5, 3, 1, 1);
  }

  get stacks() {
    return Math.max(1 + this.power, 1);
  }

  get burnStacks() {
    return -Math.min(-5 * this.power, 0);
  }

  use(player, enemy, stage) {
    if(stage === 0) {
        player.addEffect('暴怒', this.stacks);
        return this.power >= 0;
    } else {
        player.addEffect('燃烧', this.burnStacks);
        return true;
    }
  }

  getDescription(player) {
    if(this.power >= 0) {
        return `获得${this.stacks}层/effect{暴怒}`;
    } else {
        return `获得${this.stacks}层/effect{暴怒}，${this.burnStacks}层/effect{燃烧}`;
    }
  }
}

// 燃烧弹 (B-)
// 获得高燃弹药
export class FireDance extends Skill {
  constructor() {
    super('燃烧弹', 'boss-buff', 4, 2, 1, 1);
  }

  get burnStacks() {
    return -Math.max(0, this.power);
  }

  get stacks() {
    return 1 + this.power;
  }

  use (player, enemy, stage) {
    if(stage == 0) {
        player.addEffect('高燃弹药', this.stacks);
        return this.power >= 0;
    } else {
        player.addEffect('燃烧', this.burnStacks);
        return true;
    }
  }

  getDescription(player) {
    if(this.power < 0) {
        return `获得${this.burnStacks}层/effect{高燃弹药}和${this.stacks}层/effect{燃烧}`;
    }
    return `获得${this.stacks}层/effect{高燃弹药}`;
  }
}