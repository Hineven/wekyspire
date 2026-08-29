import { allSkills } from '../skills/registry.js';
import { createSkillRuntime } from '../state/skillRuntime.js';
import { totalLeino } from './ascension.js';

// 战后固定奖励（RUN_DESIGN §1）：金币 + 技能牌 3 选 1。
// 占位实现：金币固定；灵脉相性权重/金币经济数值见 §9 留坑，后续替换。

export const REWARDS_PLACEHOLDER = {
  moneyPerBattle: 10,
  skillChoiceCount: 3,
};

// ---- 等阶门禁（灵脉等级 → 奖励卡池可见的最高等阶）----
// 进阶是卡池升格的钥匙：未进阶只出 D/C，进阶 1 次解锁 B，2 次解锁 A；
// S（事件投放）与 Z（诅咒）恒不入池。训练房固定 4N-3 层、每访必计次，
// 首进阶约在第 1 章末、第二次约在第 3 章——与章内强度递进对轴。
const TIER_RANK = { D: 0, C: 1, B: 2, A: 3 };
export const TIER_UNLOCK_LEINO = { B: 1, A: 2 }; // 解锁所需灵脉总等级

export function maxRewardTier(run) {
  const leino = run ? totalLeino(run) : 0;
  if (leino >= TIER_UNLOCK_LEINO.A) return 'A';
  if (leino >= TIER_UNLOCK_LEINO.B) return 'B';
  return 'C';
}

// 奖励卡池：等阶门禁 + 排除 S/Z 与 canSpawnAsReward=false（衍生牌等）。
// run 缺省视作未进阶（最保守门禁）；spawnWeight/灵脉相性权重见 §6.3 留坑。
export function spawnableCardPool(run = null) {
  const cap = TIER_RANK[maxRewardTier(run)];
  return allSkills().filter(def =>
    def.canSpawnAsReward !== false && def.tier !== 'S' && def.tier !== 'Z'
    && (TIER_RANK[def.tier] ?? Infinity) <= cap);
}

// 抽 3 选 1 候选（走 run rng，确定性；不重复）
export function rollSkillChoices(run, count = REWARDS_PLACEHOLDER.skillChoiceCount) {
  const remaining = spawnableCardPool(run);
  const picks = [];
  while (picks.length < count && remaining.length) {
    const i = run.rng.int(0, remaining.length - 1); // 需 splice 去重故手取下标；与 rng.pick 同消耗
    picks.push(remaining.splice(i, 1)[0]);
  }
  return picks.map(def => def.id);
}

// 进入 reward 阶段时生成奖励：金币自动入账，技能候选待玩家抉择
export function spawnRewards(run) {
  run.player.money += REWARDS_PLACEHOLDER.moneyPerBattle;
  run.rewards = {
    money: REWARDS_PLACEHOLDER.moneyPerBattle,
    skillChoices: rollSkillChoices(run),
    chosenSkill: undefined, // undefined = 未抉择；null = 跳过；defId = 已领取
  };
  return run;
}

// 抉择：从候选中领一张（defId）或跳过（null）
export function chooseSkillReward(run, defId = null) {
  const rw = run.rewards;
  if (!rw || rw.chosenSkill !== undefined) throw new Error('奖励不存在或已领取');
  if (defId !== null) {
    if (!rw.skillChoices.includes(defId)) throw new Error(`技能不在奖励候选中：${defId}`);
    run.player.deck.push(createSkillRuntime(defId));
  }
  rw.chosenSkill = defId;
  return run;
}

export function isRewardsClaimed(run) {
  return !run.rewards || run.rewards.chosenSkill !== undefined;
}
