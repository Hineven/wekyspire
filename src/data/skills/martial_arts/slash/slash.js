// 斩类攻击技能
import Skill from "@data/skill";
// 替换：使用指令式 helpers
import {
  createAndSubmitLambda,
  createAndSubmitLaunchAttack,
  createAndSubmitSkillCoolDown
} from '@data/battleInstructionHelpers.js';
import backendEventBus, {EventNames} from "@/backendEventBus";
import {SkillTier} from "@/utils/tierUtils";

// 斩（C-）
export class BasicSlash extends Skill {
  constructor(name = '斩', tier = SkillTier.C_MINUS, damage = 35, powerMultiplier = 19, coldDown = 5, cardForegroundColdDownDecay = 1, series = 0) {
    super(name, 'normal', tier, 0, 2, 1, '斩');
    this.baseColdDownTurns = coldDown; // 基础冷却时间
    this.baseSlowStart = true; // 慢启动
    this.baseDamage = damage; // 基础伤害
    this.powerMultiplier = powerMultiplier; // 每点力量增加的伤害
    this.baseCardForegroundColdDownDecay = cardForegroundColdDownDecay; // 卡牌激活冷却时间
    this.listener_ = null;
    // 反转模式：由“拔刀术”等效果设置；true 时，改为“在牌库中则失去冷却”
    this.reverseMode = this.reverseMode || false;
    this.unlocks = 0;
  }

  get cardForegroundColdDownDecay() {
    if(this.unlocks >= 6) return 999;
    return this.baseCardForegroundColdDownDecay + this.unlocks;
  }

  onEnterBattle(player) {
    super.onEnterBattle(player);
    this.listener_ = () => {
      const uid = this.uniqueID;
      const inFrontier = player.frontierSkills.findIndex(skill => skill.uniqueID === uid) !== -1;
      const inBackup = player.backupSkills.findIndex(skill => skill.uniqueID === uid) !== -1;
      const shouldDecay = this.reverseMode ? inBackup : inFrontier;
      if (shouldDecay) {
        createAndSubmitSkillCoolDown(this, -this.cardForegroundColdDownDecay);
      }
    };
    backendEventBus.on(EventNames.Battle.POST_PLAYER_TURN_END, this.listener_);
  }

  onLeaveBattle(player) {
    super.onLeaveBattle(player);
    if (this.listener_) {
      backendEventBus.off(EventNames.Battle.POST_PLAYER_TURN_END, this.listener_);
      this.listener_ = null;
    }
  }

  get damage () {
    const base = Math.max(8, this.baseDamage + this.powerMultiplier * this.power);
    return Math.floor(base * Math.pow(1.8, this.unlocks));
  }

  use (player, enemy, stage, ctx) {
    createAndSubmitLaunchAttack(player, enemy, this.damage, ctx?.parentInstruction ?? null);
    createAndSubmitLambda(()=>{this.unlock();}, 'unlock slash skill', ctx?.parentInstruction ?? null);
    return true;
  }

  unlock() {
    this.unlocks ++;
    if(this.unlocks === 1) {
      this.name = '裂石斩';
      this.tier = Math.max(this.tier, SkillTier.B_MINUS);
    } else if(this.unlocks === 2) {
      this.name = '削金斩';
      this.tier = Math.max(this.tier, SkillTier.B_PLUS);
    } else if(this.unlocks === 3) {
      this.name = '摧山斩';
      this.tier = Math.max(this.tier, SkillTier.A_MINUS);
    } else if(this.unlocks === 4) {
      this.name = '分海斩';
      this.tier = Math.max(this.tier, SkillTier.A);
    } else if(this.unlocks === 5) {
      this.name = '开天斩';
      this.tier = Math.max(this.tier, SkillTier.A_PLUS);
    } else if(this.unlocks >= 6) {
      this.name = '断神斩';
      this.tier = Math.max(this.tier, SkillTier.S);
    }
  }

  regenerateDescription(player) {
    if(this.unlocks >= 6) {
      if(this.remainingUses === 0) {
        return `回合结束在手牌中则损失所有冷却进度`;
      }
      return `/italic{消灭}`;
    } else {
      const decayDesc = this.cardForegroundColdDownDecay > 0 ?
        (this.reverseMode
        ? `，回合结束在牌库中则失去${this.cardForegroundColdDownDecay}冷却`
        : `，回合结束在手中则失去${this.cardForegroundColdDownDecay}冷却`) : '';
      return `${this.damage + (player?.attack ?? 0)}伤害，/named{进阶}${decayDesc}`;
    }
  }
}

// 蓄力斩（C+)
export class ChargedSlash extends BasicSlash {
  constructor() {
    super('蓄力斩', SkillTier.C_PLUS, 35, 19, 5, 0);
    this.precessor = '斩';
  }
}
// 奋力斩（B）
export class StriveSlash extends BasicSlash {
  constructor() {
    super('奋力斩', SkillTier.B, 58, 32, 4, 0);
    this.precessor = '蓄力斩';
  }
}
// 极力斩（A-）
export class VigorSlash extends BasicSlash {
  constructor() {
    super('极力斩', SkillTier.A_MINUS, 95, 58, 4, 0);
    this.precessor = '奋力斩';
  }
}
