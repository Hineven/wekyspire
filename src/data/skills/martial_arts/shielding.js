// 护盾系列技能
// 还有一些小单卡
import Skill from '../../skill.js';
import { launchAttack, dealDamage, gainShield } from '../../battleUtils.js';
import {SkillTier} from "../../../utils/tierUtils";
import {backendGameState} from "../../gameState";
import backendEventBus, {EventNames} from "../../../backendEventBus";

// 盾（D）（护盾系列）
export class BasicShielding extends Skill {
  constructor(name = '盾', tier = SkillTier.D, apCost = 1,
              shieldAmount = 5, powerMultiplier = 3, blockAmount = 0) {
    super(name, 'normal', tier, 0, apCost, 1, '盾');
    this.baseColdDownTurns = 1;
    this.blockAmount = blockAmount; // 格挡量
    this.shieldAmount = shieldAmount;
    this.powerMultipler = powerMultiplier;
  }

  get shield() {
    return Math.max(this.shieldAmount + this.powerMultipler * this.power, 3);
  }

  // 使用技能
  use(player, enemy) {
    gainShield(player, player, this.shield);
    if(this.blockAmount > 0) {
      player.addEffect('格挡', this.blockAmount);
    }
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `获得${this.shield}/named{护盾}${this.blockAmount > 0 ? `、${this.blockAmount}层/named{格挡}` : ''}`;
  }
}

// 坚固盾（C-）（护盾系列）
// 提升护盾量
export class SolidShielding extends BasicShielding {
  constructor() {
    super('坚固盾', SkillTier.C_MINUS, 1, 8, 4);
    this.precessor = '盾';
  }
}

// 强化盾（C+）（护盾系列）
// 额外获得1格挡
export class EnhancedShielding extends BasicShielding {
  constructor() {
    super('强化盾', SkillTier.C_PLUS, 1, 8, 4, 1);
    this.precessor = '坚固盾';
  }
}

// 紧急护盾（C+）（单卡）
// 获得11点护盾，每次使用后，冷却时间增1
export class EmergencyShield extends Skill {

  constructor(name = '紧急护盾', tier = SkillTier.C_PLUS) {
    super(name, 'normal', tier, 0, 1, 1);
    this.baseColdDownTurns = 2;
    this.extraColdDownTurns = 0; // 额外冷却时间
  }

  get coldDownTurns () {
    return this.extraColdDownTurns + Math.max(super.coldDownTurns - this.power, 1);
  }

  get shield() {
    return 11;
  }

  // 使用技能
  use(player, enemy) {
    gainShield(player, player, this.shield);
    this.extraColdDownTurns += 1;
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `获得${this.shield}/named{护盾}，使用后/named{冷却}时间增1`;
  }
}

// 持续警戒（C+）（单卡）
// 咏唱：回合开始时，获得警戒
export class SustainedVigilance extends Skill {
  constructor(name = '持续警戒', tier = SkillTier.C_PLUS) {
    super(name, 'normal', tier, 0, 1, 1);
    this.baseColdDownTurns = 3;
    this.cardMode = 'chant';
    this.listener_ = null;
  }

  get coldDownTurns () {
    return Math.max(super.coldDownTurns - this.power, 1);
  }

  onEnable(player) {
    super.onEnable(player);
    this.listener_ = () => {
      const player = backendGameState.player.getModifiedPlayer();
      player.addEffect('警戒', 1);
    };
    backendEventBus.on(EventNames.Battle.PLAYER_TURN, this.listener_);
  }

  onDisable(player) {
    super.onDisable(player);
    if (this.listener_) {
      backendEventBus.off(EventNames.Battle.PLAYER_TURN, this.listener_);
      this.listener_ = null;
    }
  }
}

// 固化护盾（C+）（单卡）
// 每有7护盾，获得1格挡
export class SolidifyShield extends Skill {
  constructor(name = '固化护盾', tier = SkillTier.C_PLUS) {
    super(name, 'normal', tier, 0, 1, 1);
  }

  get factor() {
    return Math.max(7 - this.power, 4);
  }

  use(player, enemy) {
    const shieldAmount = player.shield;
    if (shieldAmount > 0) {
      const blockAmount = Math.floor(shieldAmount / this.factor);
      if (blockAmount > 0) {
        player.addEffect('格挡', blockAmount);
      }
    }
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `每有${this.factor}护盾获得1层/named{格挡}`;
  }
}

// 护盾猛击（B-）（单卡）
// 造成护盾量的伤害
export class ShieldBash extends Skill {
  constructor(name = '护盾猛击', tier = SkillTier.B_MINUS) {
    super(name, 'normal', tier, 0, 1, 1);
    this.baseColdDownTurns = 3;
  }

  use(player, enemy) {
    const shieldAmount = player.shield;
    if (shieldAmount > 0) {
      launchAttack(player, enemy, shieldAmount);
    }
    return true;
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `造成你当前护盾值${player?.shield ?? ''}点伤害`;
  }
}