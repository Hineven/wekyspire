import { allSkills } from '../skills/registry.js';
import { createSkillRuntime } from '../state/skillRuntime.js';

// 战后固定奖励（RUN_DESIGN §1）：金币 + 技能牌 3 选 1。
// 占位实现：金币固定、卡池 = 全部可 spawn 技能等权随机；
// 等阶门禁/灵脉相性权重/金币经济数值见 §9 留坑，后续替换。

export const REWARDS_PLACEHOLDER = {
  moneyPerBattle: 10,
  skillChoiceCount: 3,
};

// 奖励卡池（占位）：排除 S（事件投放）与 Z（诅咒）；
// 正式 spawn 元数据（canSpawnAsReward/spawnWeight/灵脉相性）见 §6.3，届时替换本函数。
export function spawnableCardPool() {
  return allSkills().filter(def =>
    def.canSpawnAsReward !== false && def.tier !== 'S' && def.tier !== 'Z');
}

// 抽 3 选 1 候选（走 run rng，确定性；不重复）
export function rollSkillChoices(run, count = REWARDS_PLACEHOLDER.skillChoiceCount) {
  const remaining = spawnableCardPool();
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
