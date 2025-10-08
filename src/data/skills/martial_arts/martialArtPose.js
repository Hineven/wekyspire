// 武术姿态
// 格挡和格挡转换
import Skill from "../../skill";
import {drawSkillCard, launchAttack} from "../../battleUtils";
import {backendGameState} from "../../gameState";
import backendEventBus, {EventNames} from "../../../backendEventBus";
import {SkillTier} from "../../../utils/tierUtils";
import {modifiedNumberString} from "../../../utils/nameUtils";

// 防御准备（C-）（姿态）
// 回合开始获得格挡，最多1层
export class BasicDefensePose extends Skill {
  constructor(
    name = '防御准备', tier = SkillTier.C_PLUS,
    coldDown = 0, apCost = 3, maxStack = 1, stackRecovery = 1
) {
    super(name, 'normal', tier, 0, apCost, 1, '姿态');
    this.baseColdDownTurns = coldDown;
    this.maxStack = maxStack;
    this.cardMode = 'chant';
    this.stackRecovery = stackRecovery;
    this.listener_ = null;
    this.extra_func_ = null;
  }

  get actionPointCost() {
    return Math.max(super.actionPointCost - this.power, 0);
  }

  onEnable(player) {
    super.onEnable(player);
    this.listener_ = () => {
      const player = backendGameState.player.getModifiedPlayer();
      if(this.extra_func_) {
        this.extra_func_(player);
      }
      if((player.effects['格挡'] || 0) < this.maxStack) {
        const deltaStack = Math.min(this.stackRecovery, this.maxStack - (player.effects['格挡'] || 0));
        player.addEffect('格挡', deltaStack);
      }
    };
    backendEventBus.on(EventNames.Battle.PLAYER_TURN, this.listener_);
  }

  onDisable(player) {
    super.onDisable(player);
    if(this.listener_) {
      backendEventBus.off(EventNames.Battle.PLAYER_TURN, this.listener_);
      this.listener_ = null;
    }
  }

  // 重新生成技能描述
  regenerateDescription(player) {
    return `回合开始获得/effect{格挡}，最多${this.maxStack}层`;
  }
}

// 防御姿态（C+）（姿态）
// 不再是消耗卡
export class DefensePose extends BasicDefensePose {
  constructor() {
    super('防御姿态', SkillTier.C_PLUS, 3, 3, 1);
    this.precessor = '防御准备';
  }
}

// 守护姿态（B-）（姿态）
// 回合开始获得格挡，最多3层
export class GuardPose extends BasicDefensePose {
  constructor() {
    super('守护姿态', SkillTier.B_MINUS, 3, 3, 3);
    this.precessor = '防御姿态';
  }
}

// 格斗姿态（B）（姿态）
// 增加格斗层数的攻击
export class FightPose extends BasicDefensePose {
  constructor() {
    super('格斗姿态', SkillTier.B, 3, 2, 1);
    this.precessor = '防御姿态';
    this.modifier_ = null;
  }
  onEnable(player) {
    super.onEnable(player);
    this.modifier_ = (player) => {
      return new Proxy(player, {
        get(target, prop, receiver) {
          if(prop === 'attack') {
            return target[prop] + (target.effects['格挡'] || 0);
          }
        }
      });
    };
    player.addModifier(this.modifier_);
  }
  onDisable(player) {
    super.onDisable(player);
    if(this.modifier_) {
      player.removeModifier(this.modifier_);
      this.modifier_ = null;
    }
  }
  regenerateDescription(player) {
    return super.regenerateDescription(player) + '，提升格斗层数的攻击';
  }
}

// 武术姿态（A-）（姿态）
// 相比格斗姿态，ap变为0，基础冷却变为1
export class MartialArtPose extends FightPose {
  constructor() {
    super('武术姿态', SkillTier.A_MINUS, 1, 0, 1);
    this.precessor = '格斗姿态';
  }
}

// 龟缩姿态（B+）（姿态）
// 回合开始获得格挡，一次获得2层，最多5层，回合开始少抽1牌
export class TurtlePose extends BasicDefensePose {
  constructor(deltaDrawCardCount = 1) {
    super('龟缩姿态', SkillTier.B_PLUS, 3, 3, 5, 2);
    this.precessor = '守护姿态';
    this.modifier_ = null;
    this.deltaDrawCardCount = deltaDrawCardCount;
  }
  onEnable(player) {
    super.onEnable(player);
    this.modifier_ = (player) => {
      const self = this;
      return new Proxy(player, {
        get(target, prop) {
          if(prop === 'drawFrontierSkills') {
            return Math.max(target.drawFrontierSkills - self.deltaDrawCardCount, 0);
          }
          return target[prop];
        }
      });
    };
    player.addModifier(this.modifier_);
  }
  onDisable(player) {
    super.onDisable(player);
    if (this.modifier_) {
      player.removeModifier(this.modifier_);
      this.modifier_ = null;
    }
  }
  regenerateDescription(player) {
    return super.regenerateDescription(player) + `，回合开始抽牌${modifiedNumberString(-this.deltaDrawCardCount)}`;
  }
}

// 神龟姿态（A）（姿态）
// 相比龟缩姿态，少抽1牌变成多抽1牌
export class DivineTurtlePose extends TurtlePose {
  constructor() {
    super(-1);
    this.name = '神龟姿态';
    this.tier = SkillTier.A;
    this.precessor = '龟缩姿态';
  }
}