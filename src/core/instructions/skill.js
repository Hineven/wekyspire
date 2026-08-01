import BattleInstruction from '../kernel/BattleInstruction.js';
import { moveCard } from '../state/battleState.js';
import { getSkillDefinition } from '../skills/registry.js';
import { makeSkillCtx } from '../skills/helpers.js';
import { ConsumeManaInstruction, ConsumeActionPointsInstruction } from './resources.js';

// 使用技能：三阶段。
//   stage 0: 播报 + 提交 ConsumeSkillResourcesInstruction（费用/充能）
//   stage 1: 提交 ActivateSkillInstruction（执行 def.use，可多阶段）；
//            targetUniqueID（玩家指定目标）在此解析为存活单位 → sctx.target，
//            结算时才解析——点击到结算之间目标可能已死亡（解析失败落 null，走默认选靶）
//   stage 2: history.played++ + 收尾 zone 迁移（咏唱→chantSlot / 消耗→burnt / 否则→discard）
//            + 离场播报（cardBurnt/cardMoved）——离场动画因此成为 sequencer 节拍，
//            串行队列天然保证"发动 → 效果 → 离场"的播放次序
// costOverride: { mana?, actionPoint? } 费用覆写——嵌套出牌（万变拳"0AP 打出任意手牌"）
// 由技能逻辑直接提交 UseSkillInstruction，不经 playerUseSkill 的可用性检查。
export class UseSkillInstruction extends BattleInstruction {
  constructor({ skill, costOverride = null, targetUniqueID = null }, opts = {}) {   // skill = skillRuntime
    super(opts);
    this.skill = skill;
    this.costOverride = costOverride;
    this.targetUniqueID = targetUniqueID;
  }

  execute(ctx) {
    const sctx = makeSkillCtx(ctx, this.skill);
    switch (this._stage) {
      case 0:
        ctx.presenter?.skillUsed?.({ skill: this.skill, def: sctx.def });
        ctx.kernel.submitInstruction(
          new ConsumeSkillResourcesInstruction({ skill: this.skill, costOverride: this.costOverride }), this);
        return false;
      case 1:
        ctx.kernel.submitInstruction(new ActivateSkillInstruction({
          skill: this.skill,
          target: this.targetUniqueID ? findAliveUnit(ctx, this.targetUniqueID) : null,
        }), this);
        return false;
      default: {
        ctx.battleState.history.turn.played += 1;
        ctx.battleState.history.battle.played += 1;

        const def = sctx.def;
        if (def.cardMode === 'chant') {
          moveCard(ctx.battleState, this.skill.uniqueID, 'chantSlot');
          this.skill.isActivated = true;
          def.activated?.onEnable?.(sctx);
          // 注册咏唱订阅（owner = 卡牌，手动停止时按 owner 批量注销）
          for (const sub of def.activated?.subscriptions?.(sctx) ?? []) {
            ctx.kernel.addSubscription({ window: 'battle', ...sub, owner: this.skill.uniqueID });
          }
          ctx.presenter?.chantStarted?.({ skill: this.skill });
        } else if (def.keywords?.includes('exhaust')) {
          moveCard(ctx.battleState, this.skill.uniqueID, 'burnt');
          ctx.presenter?.cardBurnt?.({ card: this.skill });
        } else {
          moveCard(ctx.battleState, this.skill.uniqueID, 'discard');
          ctx.presenter?.cardMoved?.({ card: this.skill, toZone: 'discard' });
        }
        return true;
      }
    }
  }
}

// 资源消耗：费用不直接扣，而是提交资源指令——费用修正（PRE 订阅）因此对技能费用生效。
// costOverride 覆写定义费用（嵌套出牌的费用豁免）；充能消耗不受影响。
export class ConsumeSkillResourcesInstruction extends BattleInstruction {
  constructor({ skill, costOverride = null }, opts = {}) {
    super(opts);
    this.skill = skill;
    this.costOverride = costOverride;
  }

  execute(ctx) {
    const def = getSkillDefinition(this.skill.defId);
    if (this._stage === 0) {
      const mana = this.costOverride?.mana ?? def.cost?.mana ?? 0;
      const ap = this.costOverride?.actionPoint ?? def.cost?.actionPoint ?? 0;
      if (mana > 0) ctx.kernel.submitInstruction(new ConsumeManaInstruction({ amount: mana }), this);
      if (ap > 0) ctx.kernel.submitInstruction(new ConsumeActionPointsInstruction({ amount: ap }), this);
      return false;
    }
    // 消耗一次充能，并按需启动冷却计时
    this.skill.remainingUses -= 1;
    const max = def.charges?.max ?? Infinity;
    const cd = def.charges?.cooldownTurns ?? 0;
    if (cd > 0 && this.skill.remainingUses < max && this.skill.currentCooldown === 0) {
      this.skill.currentCooldown = cd;
    }
    return true;
  }
}

// 激活技能：执行 def.use(sctx, stage)。def.use 返回 false 则推进其自有 stage 计数，
// 支持多阶段技能（选牌、二段结算等）。
// target：玩家指定的目标单位（存活校验已在提交前完成；可为 null——技能走默认选靶）。
export class ActivateSkillInstruction extends BattleInstruction {
  constructor({ skill, target = null }, opts = {}) {
    super(opts);
    this.skill = skill;
    this.target = target;
    this._skillStage = 0;
  }

  execute(ctx) {
    const sctx = makeSkillCtx(ctx, this.skill);
    sctx.target = this.target;
    const done = sctx.def.use ? sctx.def.use(sctx, this._skillStage) : true;
    if (done === false) {
      this._skillStage += 1;
      return false;
    }
    return true;
  }
}

// 玩家指定目标的白名单解析：全场存活单位（敌/友/玩家），找不到或已死亡 → null
function findAliveUnit(ctx, uniqueID) {
  const all = [...ctx.battleState.enemies, ...ctx.battleState.allies, ctx.player];
  const unit = all.find(u => u.uniqueID === uniqueID);
  return unit && !unit.isDead() ? unit : null;
}

// 手动停止咏唱：onDisable → 按 owner 注销订阅 → 离槽进弃牌堆。
// keywords 含 'anchored' 的咏唱无法撤下（燃心决等）。
export class ManualStopChantInstruction extends BattleInstruction {
  constructor({ uniqueID }, opts = {}) {
    super(opts);
    this.uniqueID = uniqueID;
  }

  execute(ctx) {
    const skill = ctx.battleState.chant.slots.find(s => s.uniqueID === this.uniqueID);
    if (!skill) return true;
    const sctx = makeSkillCtx(ctx, skill);
    if (sctx.def.keywords?.includes('anchored')) {
      ctx.presenter?.chantStopFailed?.({ skill, reason: 'anchored' });
      return true;
    }
    sctx.def.activated?.onDisable?.(sctx, 'manual');
    skill.isActivated = false;
    ctx.kernel.removeSubscriptionsByOwner(skill.uniqueID);
    moveCard(ctx.battleState, skill.uniqueID, 'discard');
    ctx.presenter?.chantStopped?.({ skill, reason: 'manual' });
    return true;
  }
}

// 回合开始推进冷却：仅冷却 def.cooldownZones（默认 hand/deck）内的技能——
// 位置敏感冷却（如"仅在牌库中冷却"）通过 cooldownZones: ['deck'] 表达。
export class SkillCooldownInstruction extends BattleInstruction {
  execute(ctx) {
    for (const [zoneName, arr] of Object.entries(ctx.battleState.zones)) {
      for (const skill of arr) {
        const def = getSkillDefinition(skill.defId);
        const zones = def.cooldownZones ?? ['hand', 'deck'];
        if (!zones.includes(zoneName)) continue;
        const max = def.charges?.max ?? Infinity;
        const cd = def.charges?.cooldownTurns ?? 0;
        if (cd === 0 || skill.remainingUses >= max || skill.currentCooldown <= 0) continue;
        skill.currentCooldown -= 1;
        if (skill.currentCooldown === 0) {
          skill.remainingUses = Math.min(skill.remainingUses + 1, max);
          if (skill.remainingUses < max) skill.currentCooldown = cd; // 继续下一段充能
        }
        ctx.presenter?.cooldownTick?.({ skill });
      }
    }
    return true;
  }
}
