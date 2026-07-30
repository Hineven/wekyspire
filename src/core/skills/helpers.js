import { getSkillDefinition } from './registry.js';

// 技能上下文：技能定义的所有方法（use/canUse/describe/subscriptions/activated.*）
// 只接触 sctx = { ...ctx, self, def }，看不到定义外的世界。
export function makeSkillCtx(ctx, self) {
  return { ...ctx, self, def: getSkillDefinition(self.defId) };
}

// 可用性基础检查（费用/充能/咏唱槽），def.canUse 是技能自定义附加条件。
// 注意：这里按基础费用检查；费用修正（PRE 订阅）在结算时作用于消耗指令，
// canUse 与结算的费用一致性由"消耗走资源指令"保证（多扣已在结算内，少扣由 canUse 兜底）。
export function canUseSkill(ctx, self) {
  const def = getSkillDefinition(self.defId);
  if (self.remainingUses <= 0) return false;
  if (ctx.player.mana < (def.cost?.mana ?? 0)) return false;
  if (ctx.player.actionPoints < (def.cost?.actionPoint ?? 0)) return false;
  if (def.cardMode === 'chant'
      && ctx.battleState.chant.slots.length >= ctx.battleState.chant.capacity) return false;
  return def.canUse ? def.canUse(makeSkillCtx(ctx, self)) : true;
}

// 注册技能常驻订阅（触发器）。战斗开始时对每张技能调用一次（window:'battle'），
// zone 限定写在订阅 filter 里（匹配时查 zoneOf），卡牌换 zone 无需重新注册。
export function registerSkillSubscriptions(ctx, self) {
  const def = getSkillDefinition(self.defId);
  if (!def.subscriptions) return [];
  const sctx = makeSkillCtx(ctx, self);
  return def.subscriptions(sctx).map(sub =>
    ctx.kernel.addSubscription({ window: 'battle', ...sub, owner: self.uniqueID })
  );
}
