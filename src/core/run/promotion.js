import { getSkillDefinition, hasSkill } from '../skills/registry.js';
import { createSkillRuntime } from '../state/skillRuntime.js';

// 局外卡牌升级（晋升）：RUN_DESIGN §6.2。
// 机制 = 换绑 deck 内 runtime 的 defId + 重置运行时状态（充能/冷却/激活）。
// 卡定义契约：`promotesTo: defId | [defIds]`（支持分叉；分叉抉择由调用方传入，
// 缺省取第一个可用目标）。取代旧 precessor 逆链。

// 某定义当前可用的晋升目标（内容缺省/未注册的目标自动跳过，§9 内容留坑）
export function promotionTargets(def) {
  if (!def?.promotesTo) return [];
  const ids = Array.isArray(def.promotesTo) ? def.promotesTo : [def.promotesTo];
  return ids.filter(hasSkill);
}

// deck 内某张 runtime 是否可升级
export function canPromoteRuntime(runtime) {
  return promotionTargets(getSkillDefinition(runtime.defId)).length > 0;
}

// 晋升 deck 内一张卡。targetId 可选（分叉时指定）；无可用目标返回 null（调用方决定跳过）。
// uniqueID 保持不变（牌面身份稳定），其余运行时状态按新定义重置。
export function promoteCard(run, uniqueID, targetId = null) {
  const runtime = run.player.deck.find(s => s.uniqueID === uniqueID);
  if (!runtime) throw new Error(`卡组中不存在该卡：${uniqueID}`);
  const targets = promotionTargets(getSkillDefinition(runtime.defId));
  if (targetId !== null && !targets.includes(targetId)) {
    throw new Error(`'${targetId}' 不是 '${runtime.defId}' 的可用晋升目标`);
  }
  const next = targetId ?? targets[0];
  if (!next) return null; // 晋升目标内容缺省 → 跳过（占位）
  Object.assign(runtime, createSkillRuntime(next), { uniqueID: runtime.uniqueID });
  return runtime;
}
