import { allSkills } from '../skills/registry.js';
import { createSkillRuntime } from '../state/skillRuntime.js';

// 战后奖励（RUN_DESIGN §1 + 2026-09 卡包化）：
//   金币固定入账 → 玩家选一个**卡包**（体修包恒开，其余维度需该维度灵脉等级 ≥1）
//   → 包内技能 3 选 1（或跳过）。
//
// 等阶门禁按**该体系自己的等级**（专精昂贵是设计意图，用户 2026-09 定调）：
//   灵脉包看 leino[维度]，体修包看隐藏的 player.bodyLevel（跳过进阶时 +1）；
//   0 级 → 只出 D/C；1 级 → 解锁 B；2 级 → 解锁 A。
// 通用包（汲取/魏启罐/激发/杂技）**不可直接选择**：以 COMMON_INJECT 概率混入任意卡包，
// 并有保底计数（每 pity 次开包必出一次）；「保证其价值」= 池内存在 C 以上卡时剔除 D。
// S（事件投放）与 Z（诅咒）恒不入池；canSpawnAsReward=false 的衍生牌不入池。
// 木/空灵脉内容待实装：其卡包在池子为空时自动隐藏（见 availablePacks）。

export const REWARDS_PLACEHOLDER = {
  moneyPerBattle: 10,
  skillChoiceCount: 3,
};

const TIER_RANK = { D: 0, C: 1, B: 2, A: 3 };
export const TIER_UNLOCK_LEINO = { B: 1, A: 2 }; // 该维度灵脉等级 → 解锁等阶

// ---- 卡包（维度）定义：id 与 player.leino 的键同名 ----
export const PACKS = Object.freeze({
  body: Object.freeze({ id: 'body', name: '体修', desc: '基础卡组演变而来，恒可用' }),
  fire: Object.freeze({ id: 'fire', name: '火灵脉', desc: '爆发与燃烧' }),
  wood: Object.freeze({ id: 'wood', name: '木灵脉', desc: '恢复与中毒（内容待实装）' }),
  air: Object.freeze({ id: 'air', name: '空灵脉', desc: '闪避与增强（内容待实装）' }),
  common: Object.freeze({ id: 'common', name: '通用', desc: '跨体系资源与功能卡（随机混入各卡包）' }),
});

// 通用卡注入：概率 + 保底计数（run.commonPity 累计未注入次数，达 pity 必注入）
export const COMMON_INJECT = Object.freeze({ chance: 0.3, pity: 4 });

// 卡定义归属的卡包：显式 pack 字段优先（通用灰卡标 'common'），否则按 type 归维度
export function packOf(def) {
  if (def?.pack) return def.pack;
  if (def?.type === 'fire') return 'fire';
  if (def?.type === 'wood') return 'wood';
  if (def?.type === 'air') return 'air';
  return 'body';
}

// 卡包等级：体修看隐藏的 player.bodyLevel（跳过进阶 +1），灵脉看 leino[维度]
export function packLevel(run, packId) {
  if (packId === 'body') return run?.player?.bodyLevel ?? 0;
  return run?.player?.leino?.[packId] ?? 0;
}

// 某卡包当前可见的最高等阶（按该体系自己的等级）
export function maxRewardTier(run, packId = 'body') {
  const lv = packLevel(run, packId);
  if (lv >= TIER_UNLOCK_LEINO.A) return 'A';
  if (lv >= TIER_UNLOCK_LEINO.B) return 'B';
  return 'C';
}

// 单包卡池：包归属 + 该体系等阶门禁 + 排除 S/Z 与 canSpawnAsReward=false。
// capTier 可覆写门禁（通用注入跟随所开卡包的上限）。
export function packCardPool(run, packId = 'body', capTier = null) {
  const cap = TIER_RANK[capTier ?? maxRewardTier(run, packId)];
  return allSkills().filter(def =>
    packOf(def) === packId
    && def.canSpawnAsReward !== false && def.tier !== 'S' && def.tier !== 'Z'
    && (TIER_RANK[def.tier] ?? Infinity) <= cap);
}

// 通用注入池：跟随所开卡包门禁。门禁达 B 以上时剔除 D 级通用卡（后期 D 卡是废牌，
// 「出现即有价值」）；门禁仍为 C 时保留 D（纯化/魏启罐在前期是好牌）。
export function commonPool(run, capTier) {
  const cap = capTier ?? 'C';
  const pool = packCardPool(run, 'common', cap);
  if (TIER_RANK[cap] >= TIER_RANK.B) {
    const valued = pool.filter(def => TIER_RANK[def.tier] >= TIER_RANK.C);
    return valued.length ? valued : pool;
  }
  return pool;
}

// 可开卡包：体修恒开；灵脉需 leino ≥ 1 且已有可出内容（木/空待实装自动隐藏）。
// 通用包不在列表中——它只以注入形式出现。
export function availablePacks(run) {
  const out = [PACKS.body];
  for (const id of ['fire', 'wood', 'air']) {
    if ((run?.player?.leino?.[id] ?? 0) >= 1 && packCardPool(run, id).length > 0) out.push(PACKS[id]);
  }
  return out;
}

// 全量可出卡池（所有可开卡包并集；兼容旧调用与「整池」类断言）
export function spawnableCardPool(run = null) {
  const seen = new Set();
  const out = [];
  for (const pack of availablePacks(run)) {
    for (const def of packCardPool(run, pack.id)) {
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      out.push(def);
    }
  }
  return out;
}

// 包内抽 3 选 1 候选（走 run rng，确定性；不重复）
export function rollSkillChoices(run, packId = 'body', count = REWARDS_PLACEHOLDER.skillChoiceCount) {
  const remaining = packCardPool(run, packId);
  const picks = [];
  while (picks.length < count && remaining.length) {
    const i = run.rng.int(0, remaining.length - 1); // 需 splice 去重故手取下标；与 rng.pick 同消耗
    picks.push(remaining.splice(i, 1)[0]);
  }
  return picks.map(def => def.id);
}

// 进入 reward 阶段：金币自动入账 + 列出可选卡包；只有一个包时自动开包（少一步点击）
export function spawnRewards(run) {
  run.player.money += REWARDS_PLACEHOLDER.moneyPerBattle;
  const packs = availablePacks(run).map(p => p.id);
  run.rewards = {
    money: REWARDS_PLACEHOLDER.moneyPerBattle,
    packs,                 // 可选卡包 id 列表
    packId: null,          // 已选卡包（选后不可改）
    skillChoices: [],      // 开包后的 3 选 1 候选
    chosenSkill: undefined, // undefined = 未抉择；null = 跳过；defId = 已领取
  };
  if (packs.length === 1) chooseRewardPack(run, packs[0]);
  return run;
}

// 通用注入（三选一共享）：按概率/保底把一张候选替换为通用卡，返回 { injected, slot }。
// capTier = 本次抽取所用的等阶门禁（跟随所开卡包/最高已解锁卡包）。
export function injectCommon(run, choices, capTier) {
  const pity = run.commonPity ?? 0;
  const inject = pity + 1 >= COMMON_INJECT.pity || run.rng.next() < COMMON_INJECT.chance;
  if (!inject) {
    run.commonPity = pity + 1;
    return { injected: false, slot: -1 };
  }
  run.commonPity = 0;
  const pool = commonPool(run, capTier).filter(def => !choices.includes(def.id));
  if (!pool.length) return { injected: false, slot: -1 };
  const slot = run.rng.int(0, choices.length - 1);
  choices[slot] = pool[run.rng.int(0, pool.length - 1)].id;
  return { injected: true, slot };
}

// 开包：选定卡包 → 抽出包内 3 选 1 候选 → 按概率/保底混入一张通用卡。
export function chooseRewardPack(run, packId) {
  const rw = run.rewards;
  if (!rw) throw new Error('奖励不存在');
  if (rw.chosenSkill !== undefined) throw new Error('奖励已领取');
  if (rw.packId) throw new Error(`卡包已选择：${rw.packId}`);
  if (!rw.packs.includes(packId)) throw new Error(`卡包不可选：${packId}`);
  rw.packId = packId;

  const choices = rollSkillChoices(run, packId);
  const { injected, slot } = injectCommon(run, choices, maxRewardTier(run, packId));
  rw.commonInjected = injected;
  rw.commonSlot = slot;
  rw.skillChoices = choices;
  return run;
}

// 训练房抓牌：从**所有已解锁卡包的并集**抽 3（各包按各自门禁），并同样注入通用卡。
// 门禁取已解锁卡包中的最高档，供通用池筛选。
export function rollTrainingChoices(run, count = REWARDS_PLACEHOLDER.skillChoiceCount) {
  const remaining = [...spawnableCardPool(run)];
  const picks = [];
  while (picks.length < count && remaining.length) {
    const i = run.rng.int(0, remaining.length - 1);
    picks.push(remaining.splice(i, 1)[0].id); // 先取 id：注入会原地替换元素
  }
  const caps = availablePacks(run).map(p => TIER_RANK[maxRewardTier(run, p.id)]);
  const capTier = Object.keys(TIER_RANK).find(t => TIER_RANK[t] === Math.max(...caps)) ?? 'C';
  injectCommon(run, picks, capTier); // 训练抓牌不展示通用角标，注入结果直接生效
  return picks;
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
