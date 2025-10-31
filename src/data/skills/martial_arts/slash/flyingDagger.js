import Skill from '@data/skill';
import {SkillTier} from '@/utils/tierUtils';
import { createAndSubmitLaunchAttack, createAndSubmitDropSkillCard } from '@data/battleInstructionHelpers.js';

// 飞刀（C-）（单卡）
// 攻击并丢弃相邻牌，需要前后都有牌
export class FlyingDagger extends Skill {
  constructor() {
    super('飞刀', 'normal', SkillTier.C_PLUS, 0, 1, 1);
    this.baseColdDownTurns = 1;
  }

  get damage () {
    return Math.max(16 + 7 * this.power, 5);
  }

  canUse(player) {
    if (super.canUse(player)) {
      const index = this.getInBattleIndex(player);
      if (index > 0 && index < player.frontierSkills.length - 1) {
        return true;
      }
    }
    return false;
  }

  use(player, enemy, stage, ctx) {
    createAndSubmitLaunchAttack(player, enemy, this.damage, ctx?.parentInstruction ?? null);
    const idx = this.getInBattleIndex(player);
    const leftSkill = player.frontierSkills[idx - 1];
    if (leftSkill) {
      createAndSubmitDropSkillCard(player, leftSkill.uniqueID, -1, ctx?.parentInstruction ?? null);
    }
    const rightSkill = player.frontierSkills[idx + 1];
    if (rightSkill) {
      createAndSubmitDropSkillCard(player, rightSkill.uniqueID, -1, ctx?.parentInstruction ?? null);
    }
    return true;
  }

  regenerateDescription(player) {
    return `${this.damage + (player?.attack ?? 0)}伤害，丢弃两侧卡，发动需两侧有卡`;
  }
}