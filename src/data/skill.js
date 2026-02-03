import animationSequencer from './animation_sequencing/animationSequencer.js';
import {enqueueDelay, enqueueState} from "./animation_sequencing/animationInstructionHelpers.js";

class SkillUseContext {
  constructor() {
    this.stage = 0; // 技能使用阶段
    this.power = 0; // 技能威能（效用值），用于决定技能发动的威力。
  }
};

// 技能抽象类
class Skill {
  constructor(name, type, tier,
    baseManaCost, baseDurationCost,
    skillSeriesName = undefined) {
    this.name = name; // 技能名称
    this.type = type; // 技能所属灵脉。特别地：'universal'（无属性）,'curse'（负面效果）
    this.tier = tier; // 技能等阶
    // 随机生成一个唯一ID。
    this.uniqueID = Math.random().toString(36).substring(2, 10);
    this.subtitle = ''; // 副标题，仅少量特殊技能拥有此条目
    this.baseManaCost = baseManaCost || 0; // 魏启消耗
    this.baseDurationCost = baseDurationCost || 0; // 脉位耐久消耗
    this.skillSeriesName = skillSeriesName || name; // 技能系列名称
  }

  // 战斗开始时调用，用于初始化技能
  onBattleStart() {
    if(!this.slowStart) {
      this.remainingUses = this.maxUses;
      this.remainingColdDownTurns = this.coldDownTurns;
    } else {
      // 冷启动卡牌必须等待冷却后才能发动！
      this.remainingUses = 0;
      this.remainingColdDownTurns = this.coldDownTurns;
    }
    // 默认实现，子类可以重写
  }

  // 此卡进入战斗时调用
  onEnterBattle (user, acupoint) {
    // 默认实现，子类可以重写
  }

  // 此卡离开战斗时调用
  onLeaveBattle (user, acupoint) {
    // 默认实现，子类可以重写
  }

  // 使用技能
  // 此方法会被调用多次，直到返回值是bool类型
  // @param {Character} user: 玩家对象
  // @param {Character} destination: 目标对象
  // @param {SkillUseContext} ctx: 上下文对象，包含当前回合的所有信息，也可以在use被多次调用时（多阶段技能）传递状态。
  // @return {boolean} 如果返回true，表示技能使用完成，否者，ctx中stage增加一，反复调用此技能。
  use(user, destination, ctx) {
    return true;
  }

  consumeResources (user) {
    user.consumeActionPoints(this.actionPointCost);
    user.consumeMana(this.manaCost);
    this.consumeUses()
  }

  // 生成技能效用文字描述（根据玩家状态计算具体数值）
  getDescription(user, power) {
    // 默认实现，子类可以重写
    return '';
  }
}

export default Skill;