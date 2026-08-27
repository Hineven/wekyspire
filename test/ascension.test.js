import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { createRun, completeRoom } from '../src/core/run/runFlow.js';
import {
  ASCENSION_PLACEHOLDER, LEINO_DIMENSIONS, totalLeino,
  ascensionReady, chooseAscension, chooseAscensionAbility,
} from '../src/core/run/ascension.js';

// 构造"刚离开训练房"的 run：floor 1 训练房，手动设置训练次数
const leaveTraining = (trainings) => {
  const run = createRun({ seed: 1 });
  run.gameStage = 'room';
  run.currentRoom = 'training';
  run.player.trainingCount = trainings;
  return run;
};

describe('进阶触发判定（RUN_DESIGN §5.3）', () => {
  it(`训练次数达到 ${(ASCENSION_PLACEHOLDER.trainingsPerLevel)} 才触发`, () => {
    expect(ascensionReady(leaveTraining(ASCENSION_PLACEHOLDER.trainingsPerLevel - 1))).toBe(false);
    expect(ascensionReady(leaveTraining(ASCENSION_PLACEHOLDER.trainingsPerLevel))).toBe(true);
  });

  it('灵脉总和封顶后不再触发', () => {
    const run = leaveTraining(99);
    run.player.leino = { fire: 3, wood: 1, air: 1, body: 1 }; // 总和 6 = 封顶
    expect(ascensionReady(run)).toBe(false);
  });

  it('累计制门槛：第 2 次进阶需 2 倍训练次数', () => {
    const run = leaveTraining(ASCENSION_PLACEHOLDER.trainingsPerLevel);
    run.player.ascensionCount = 1;
    expect(ascensionReady(run)).toBe(false);
    run.player.trainingCount = ASCENSION_PLACEHOLDER.trainingsPerLevel * 2;
    expect(ascensionReady(run)).toBe(true);
  });
});

describe('进阶事件结算', () => {
  it('离开训练房达标 → 直接进入 ascension 阶段（无延后）', () => {
    const run = leaveTraining(ASCENSION_PLACEHOLDER.trainingsPerLevel);
    completeRoom(run);
    expect(run.gameStage).toBe('ascension');
    expect(run.floor).toBe(1); // 楼层尚未推进
  });

  it('未达标 → 正常推进下一层', () => {
    const run = leaveTraining(1);
    completeRoom(run);
    expect(run.gameStage).toBe('prep');
    expect(run.floor).toBe(2);
  });

  it('选维度升级：等级+1、魏启上限提升、全恢复、推进下一层', () => {
    const run = leaveTraining(ASCENSION_PLACEHOLDER.trainingsPerLevel);
    run.player.hp = 5;
    run.player.mana = 0;
    const maxManaBefore = run.player.maxMana;
    completeRoom(run);
    chooseAscension(run, 'wood');
    expect(run.player.leino.wood).toBe(1);
    expect(totalLeino(run)).toBe(1);
    expect(run.player.ascensionCount).toBe(1);
    expect(run.player.maxMana).toBe(maxManaBefore + ASCENSION_PLACEHOLDER.manaGain);
    expect(run.player.mana).toBe(run.player.maxMana); // 全恢复（魏启）
    expect(run.player.hp).toBe(run.player.maxHp);     // 全恢复（生命）
    expect(run.gameStage).toBe('prep');
    expect(run.floor).toBe(2);
  });

  it('非法输入抛错：阶段不符/未知维度', () => {
    const run = createRun({ seed: 1 });
    expect(() => chooseAscension(run, 'fire')).toThrow(/阶段不符/);
    const asc = leaveTraining(3);
    completeRoom(asc);
    expect(() => chooseAscension(asc, 'water')).toThrow(/未知灵脉维度/);
    for (const d of LEINO_DIMENSIONS) expect(typeof asc.player.leino[d]).toBe('number');
  });

  it('能力授予占位：无待授予能力时直接调用 chooseAscensionAbility 抛错', () => {
    const run = createRun({ seed: 1 });
    expect(() => chooseAscensionAbility(run, 'x')).toThrow(/没有待授予的能力/);
  });
});
