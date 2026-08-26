import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册全部最小内容
import { createRun, enterBattle, finishBattle } from '../src/core/run/runFlow.js';
import {
  REWARDS_PLACEHOLDER, spawnableCardPool, rollSkillChoices,
  spawnRewards, chooseSkillReward, isRewardsClaimed,
} from '../src/core/run/rewards.js';

describe('奖励卡池（RUN_DESIGN §2.1/§6.3 占位）', () => {
  it('卡池排除 S/Z 阶与 canSpawnAsReward=false', () => {
    const pool = spawnableCardPool();
    expect(pool.length).toBeGreaterThan(0);
    for (const def of pool) {
      expect(def.tier).not.toBe('S');
      expect(def.tier).not.toBe('Z');
      expect(def.canSpawnAsReward).not.toBe(false);
    }
  });

  it('3 选 1 候选：数量正确、不重复、全部来自卡池', () => {
    const run = createRun({ seed: 1 });
    const ids = rollSkillChoices(run);
    const poolIds = spawnableCardPool().map(d => d.id);
    expect(ids.length).toBe(REWARDS_PLACEHOLDER.skillChoiceCount);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(poolIds).toContain(id);
  });

  it('候选抽取确定性：同种子一致', () => {
    expect(rollSkillChoices(createRun({ seed: 9 }))).toEqual(rollSkillChoices(createRun({ seed: 9 })));
  });
});

describe('战后奖励生成与抉择', () => {
  const winFloor1 = (seed = 1) => {
    const run = createRun({ seed });
    enterBattle(run);
    finishBattle(run, 'victory');
    return run;
  };

  it('spawnRewards：金币入账 + 奖励结构完整且未抉择', () => {
    const run = createRun({ seed: 1 });
    const before = run.player.money;
    enterBattle(run);
    finishBattle(run, 'victory');
    expect(run.player.money).toBe(before + REWARDS_PLACEHOLDER.moneyPerBattle);
    expect(run.rewards.money).toBe(REWARDS_PLACEHOLDER.moneyPerBattle);
    expect(run.rewards.skillChoices.length).toBe(3);
    expect(run.rewards.chosenSkill).toBeUndefined();
    expect(isRewardsClaimed(run)).toBe(false);
  });

  it('领卡：候选入 deck，chosenSkill 记录 defId', () => {
    const run = winFloor1();
    const deckBefore = run.player.deck.length;
    const pick = run.rewards.skillChoices[1];
    chooseSkillReward(run, pick);
    expect(run.player.deck.length).toBe(deckBefore + 1);
    expect(run.player.deck.at(-1).defId).toBe(pick);
    expect(run.rewards.chosenSkill).toBe(pick);
    expect(isRewardsClaimed(run)).toBe(true);
  });

  it('跳过：不入 deck，chosenSkill 记为 null', () => {
    const run = winFloor1();
    const deckBefore = run.player.deck.length;
    chooseSkillReward(run, null);
    expect(run.player.deck.length).toBe(deckBefore);
    expect(run.rewards.chosenSkill).toBeNull();
    expect(isRewardsClaimed(run)).toBe(true);
  });

  it('非法候选与重复领取抛错', () => {
    const run = winFloor1();
    expect(() => chooseSkillReward(run, 'notACandidate')).toThrow(/不在奖励候选中/);
    chooseSkillReward(run, null);
    expect(() => chooseSkillReward(run, null)).toThrow(/已领取/);
  });

  it('奖励生成确定性：同种子逐层候选一致', () => {
    const a = winFloor1(42);
    const b = winFloor1(42);
    expect(a.rewards.skillChoices).toEqual(b.rewards.skillChoices);
  });
});
