import Skill from "../../skill";
import { createAndSubmitLaunchAttack, createAndSubmitDrawSkillCard } from "../../battleInstructionHelpers.js";

// 敏捷打击（D）（敏捷打击）
// 连续攻击，造成伤害则抽牌
export class AgilePunch extends Skill {
  constructor(name = '敏捷打击', tier = 1, damage = 4, powerMultiplier = 3, times = 1, drawCardCount = 1) {
    super(name, 'normal', tier, 0, 1, 1, '敏捷打击');
    this.baseColdDownTurns = 2;
    this.powerMultiplier = powerMultiplier;
    this.baseDamage = damage;
    this.times = times;
    this.drawCardCount = drawCardCount;
  }

  get coldDownTurns() {
    return Math.max(super.coldDownTurns - this.power, 1);
  }

  get damage() {
    return Math.max(this.baseDamage + this.powerMultiplier * this.power, 4);
  }

  // 多阶段：每两阶段完成一次“打击+按需抽牌”
  use(player, enemy, stage, ctx) {
    if (!ctx.hits) ctx.hits = 0;
    if (ctx.hits >= this.times) return true;

    if (!ctx.phase || ctx.phase === 'attack') {
      // 阶段A：攻击
      const inst = createAndSubmitLaunchAttack(player, enemy, this.damage, ctx?.parentInstruction ?? null);
      ctx.lastAttackInst = inst;
      ctx.phase = 'draw';
      return false;
    } else {
      // 阶段B：根据命中决定抽牌
      const result = ctx.lastAttackInst?.attackResult;
      if (result && result.passThoughDamage > 0 && this.drawCardCount > 0) {
        createAndSubmitDrawSkillCard(player, this.drawCardCount, ctx?.parentInstruction ?? null);
      }
      ctx.hits += 1;
      ctx.phase = 'attack';
      return ctx.hits >= this.times;
    }
  }

  regenerateDescription(player) {
    const desc =  `造成${this.damage + (player?.attack ?? 0)}点伤害，造成伤害则抽牌`;
    if(this.times > 1) return `${desc}，重复${this.times - 1}次`;
    return desc;
  }
}

// 敏捷连击（C+）（敏捷打击）
// 攻击两次
export class AgileDoublePunch extends AgilePunch {
  constructor() {
    super('敏捷连击', 2, 5, 4, 2);
    this.precessor = '敏捷打击';
  }
}

// 疾风连击（B）（敏捷打击）
// 攻击三次
export class AgileTriplePunch extends AgilePunch {
  constructor() {
    super('疾风连击', 4, 6, 5, 3);
    this.precessor = '敏捷连击';
  }
}

// 全神击（A-）（敏捷打击）
// 攻击一次，抽3张牌
export class AgileAllPunch extends AgilePunch {
  constructor() {
    super('全神击', 6, 44, 6, 1, 3);
    this.precessor = '疾风连击';
  }
}

// 闪电连击（B+）（敏捷打击）
// 攻击三次，每次抽2张牌
export class AgileLightningPunch extends AgilePunch {
  constructor() {
    super('闪电连击', 5, 6, 6, 3, 2);
    this.precessor = '疾风连击';
  }
}

// 光速连击（A）（敏捷打击）
// 攻击六次
export class ThunderFist extends AgilePunch {
  constructor() {
    super('光速连击', 7, 10, 7, 6);
    this.precessor = '疾风连击';
  }
}