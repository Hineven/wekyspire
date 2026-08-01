import { getSkillDefinition } from './registry.js';
import { getAbilityDefinition } from '../abilities/registry.js';

// 技能上下文：技能定义的所有方法（use/canUse/describe/subscriptions/activated.*）
// 只接触 sctx = { ...ctx, self, def }，看不到定义外的世界。
export function makeSkillCtx(ctx, self) {
  return { ...ctx, self, def: getSkillDefinition(self.defId) };
}

// 可用性基础检查（充能/咏唱槽/自定义条件/费用），费用修正（PRE 订阅）在结算时作用于
// 消耗指令，canUse 与结算的费用一致性由"消耗走资源指令"保证（多扣已在结算内，少扣由
// canUse 兜底）。资源不足时进入能力裁决链：任一能力的 canUseSkill 钩子返回 true 即放行
// （突破极限"蓝量大于1时可超费使用"等），结算侧由资源指令的 clamp 兜底。
export function canUseSkill(ctx, self) {
  const def = getSkillDefinition(self.defId);
  if (self.remainingUses <= 0) return false;
  if (def.cardMode === 'chant'
      && ctx.battleState.chant.slots.length >= ctx.battleState.chant.capacity) return false;
  if (def.canUse && !def.canUse(makeSkillCtx(ctx, self))) return false;
  const manaOk = ctx.player.mana >= (def.cost?.mana ?? 0);
  const apOk = ctx.player.actionPoints >= (def.cost?.actionPoint ?? 0);
  if (manaOk && apOk) return true;
  for (const id of ctx.player.abilities ?? []) {
    const verdict = getAbilityDefinition(id).canUseSkill?.(makeSkillCtx(ctx, self), { manaOk, apOk });
    if (verdict === true) return true;
  }
  return false;
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

// ---- 卡牌进出战斗的生命周期元语 ----
// 一切"卡牌进入战斗"（起手构筑 / AddCard 造牌 / Transform 重绑定）都必须走 enterBattle，
// 否则新卡的常驻订阅不会注册、充能状态不受定义约束。leaveBattle 是其逆操作。

// 进入战斗：按 def 初始化充能（slowStart 起手 0 充能）+ 注册常驻订阅。
export function enterBattle(ctx, self) {
  const def = getSkillDefinition(self.defId);
  const slow = def.keywords?.includes('slowStart');
  const max = def.charges?.max ?? Infinity;
  self.remainingUses = slow ? 0 : max;
  self.currentCooldown = def.charges?.cooldownTurns ?? 0;
  self.isActivated = false;
  registerSkillSubscriptions(ctx, self);
  return self;
}

// 离开战斗（或转化时的换绑前奏）：注销该卡名下全部订阅（常驻 + activated 同 owner）。
export function leaveBattle(ctx, uniqueID) {
  ctx.kernel.removeSubscriptionsByOwner(uniqueID);
}
