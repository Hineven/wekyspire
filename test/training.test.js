import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册全部最小内容
import { registerSkill } from '../src/core/skills/registry.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { createRun } from '../src/core/run/runFlow.js';
import { promotionTargets, canPromoteRuntime, promoteCard } from '../src/core/run/promotion.js';
import {
  trainingMode, upgradableCards, trainUpgrade, trainDrawChoices, trainDraw,
} from '../src/core/run/rooms/training.js';
import { RunDriver } from '../src/core/run/runDriver.js';

// 测试用晋升链（本文件独立模块注册表，不污染其他用例）
const noop = { use: () => true, describe: () => '测试卡' };
registerSkill({ id: 'testBase', name: '测试基卡', type: 'normal', tier: 'D', series: 'test',
  cost: { mana: 0, actionPoint: 1 }, charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', promotesTo: 'testUp', ...noop });
registerSkill({ id: 'testUp', name: '测试升卡', type: 'normal', tier: 'C', series: 'test',
  cost: { mana: 0, actionPoint: 1 }, charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', ...noop });
registerSkill({ id: 'testForkA', name: '分叉A', type: 'normal', tier: 'C', series: 'test',
  cost: { mana: 0, actionPoint: 1 }, charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', ...noop });
registerSkill({ id: 'testForkB', name: '分叉B', type: 'normal', tier: 'C', series: 'test',
  cost: { mana: 0, actionPoint: 1 }, charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', ...noop });
registerSkill({ id: 'testFork', name: '分叉基卡', type: 'normal', tier: 'D', series: 'test',
  cost: { mana: 0, actionPoint: 1 }, charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', promotesTo: ['testForkA', 'testForkB'], ...noop });
registerSkill({ id: 'testDead', name: '目标缺省卡', type: 'normal', tier: 'D', series: 'test',
  cost: { mana: 0, actionPoint: 1 }, charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', promotesTo: 'notRegisteredYet', ...noop });

describe('promotesTo 晋升机制（RUN_DESIGN §6.2）', () => {
  it('无 promotesTo / 目标未注册 → 不可升级', () => {
    expect(promotionTargets({ id: 'punch' })).toEqual([]);
    expect(canPromoteRuntime(createSkillRuntime('punch'))).toBe(false);
    expect(canPromoteRuntime(createSkillRuntime('testDead'))).toBe(false); // 目标内容缺省 → 跳过
  });

  it('晋升：换绑 defId + uniqueID 不变 + 记一次训练', () => {
    const run = createRun({ seed: 1 });
    const rt = createSkillRuntime('testBase');
    run.player.deck.push(rt);
    trainUpgrade(run, rt.uniqueID);
    expect(rt.defId).toBe('testUp');
    expect(run.player.deck.at(-1).uniqueID).toBe(rt.uniqueID);
    expect(run.player.trainingCount).toBe(1);
  });

  it('分叉晋升：缺省取首个，指定 targetId 走对应分支；非法目标抛错', () => {
    const run = createRun({ seed: 1 });
    const a = createSkillRuntime('testFork');
    const b = createSkillRuntime('testFork');
    run.player.deck.push(a, b);
    promoteCard(run, a.uniqueID);
    expect(a.defId).toBe('testForkA');
    promoteCard(run, b.uniqueID, 'testForkB');
    expect(b.defId).toBe('testForkB');
    expect(() => promoteCard(run, b.uniqueID, 'testUp')).toThrow(/不是.*可用晋升目标/);
  });

  it('无可升级目标时 trainUpgrade 抛错（调用方先查 trainingMode）', () => {
    const run = createRun({ seed: 1 });
    const rt = createSkillRuntime('testDead');
    run.player.deck.push(rt);
    expect(() => trainUpgrade(run, rt.uniqueID)).toThrow(/无法升级/);
  });
});

describe('训练场免费流程（§4.1）', () => {
  it('有可升级卡 → upgrade 模式', () => {
    const run = createRun({ seed: 1 });
    run.player.deck.push(createSkillRuntime('testBase'));
    expect(trainingMode(run)).toBe('upgrade');
    expect(upgradableCards(run).length).toBe(1);
  });

  it('无可升级卡 → draw 模式：3 选 1 抓牌可领取或跳过', () => {
    const run = createRun({ seed: 2 }); // 初始卡组均无 promotesTo
    expect(trainingMode(run)).toBe('draw');

    const choices = trainDrawChoices(run);
    expect(choices.length).toBe(3);
    expect(() => trainDraw(run, 'notAChoice')).toThrow(/不在抓牌候选中/);
    const before = run.player.deck.length;
    trainDraw(run, choices[0]);
    expect(run.player.deck.length).toBe(before + 1);
    expect(run.player.deck.at(-1).defId).toBe(choices[0]);
    expect(run.player.trainingCount).toBe(1);
    expect(run.roomData).toBeNull(); // 抉择后清理
  });

  it('抓牌跳过：不入 deck 也记一次训练；未 roll 候选直接抓牌抛错', () => {
    const run = createRun({ seed: 2 });
    expect(() => trainDraw(run, null)).toThrow(/尚未生成抓牌候选/);
    trainDrawChoices(run);
    const before = run.player.deck.length;
    trainDraw(run, null);
    expect(run.player.deck.length).toBe(before);
    expect(run.player.trainingCount).toBe(1);
  });
});

describe('RunDriver 训练房缺省行为', () => {
  it('整局中每个训练房都被缺省处理，trainingCount 与训练房数一致', () => {
    const d = new RunDriver({ seed: 7, totalFloors: 11 }).start();
    d.runToEnd();
    const trainingRooms = d.history.filter(h => h.room === 'training').length;
    expect(trainingRooms).toBeGreaterThan(0);
    expect(d.run.player.trainingCount).toBe(trainingRooms);
  });
});
