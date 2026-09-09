import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { createRun, completeRoom } from '../src/core/run/runFlow.js';
import {
  ASCENSION_PLACEHOLDER, LEINO_DIMENSIONS, totalLeino, SEED_OFFERING,
  ascensionReady, chooseAscension, chooseAscensionAbility, chooseSeedCards,
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
  it('门槛曲线：首进阶 1 次训练（第 2 层），此后每 2 次训练 +1 级', () => {
    expect(ascensionReady(leaveTraining(0))).toBe(false);
    expect(ascensionReady(leaveTraining(1))).toBe(true); // 第 2 层训练房
    const second = leaveTraining(2);
    second.player.ascensionCount = 1;
    expect(ascensionReady(second)).toBe(false); // 第二次需 3 次训练
    second.player.trainingCount = 3;
    expect(ascensionReady(second)).toBe(true);
  });

  it('进阶次数封顶后不再触发', () => {
    const run = leaveTraining(99);
    run.player.ascensionCount = ASCENSION_PLACEHOLDER.maxAscensions; // 已达总次数封顶
    expect(ascensionReady(run)).toBe(false);
  });

  it('累计制门槛：进阶次数越多，所需训练次数越多', () => {
    const run = leaveTraining(1);
    run.player.ascensionCount = 3;
    expect(ascensionReady(run)).toBe(false); // 第 4 次需 7 次训练
    run.player.trainingCount = 7;
    expect(ascensionReady(run)).toBe(true);
  });
});

describe('进阶事件结算', () => {
  it('离开训练房达标 → 直接进入 ascension 阶段（无延后）', () => {
    const run = leaveTraining(1);
    completeRoom(run);
    expect(run.gameStage).toBe('ascension');
    expect(run.floor).toBe(1); // 楼层尚未推进
  });

  it('未达标 → 正常推进下一层', () => {
    const run = leaveTraining(0);
    completeRoom(run);
    expect(run.gameStage).toBe('prep');
    expect(run.floor).toBe(2);
  });

  it('选维度升级：等级+1、魏启上限提升、全恢复、推进下一层', () => {
    const run = leaveTraining(1);
    run.player.hp = 5;
    run.player.mana = 0;
    const maxManaBefore = run.player.maxMana;
    completeRoom(run);
    chooseAscension(run, 'fire');
    // 首次点亮灵脉 → 种子包九选三（选定后事件才收尾）
    expect(run.cardOffering).toBeTruthy();
    expect(run.cardOffering.cards.length).toBe(SEED_OFFERING.cards);
    const deckBefore = run.player.deck.length;
    chooseSeedCards(run, run.cardOffering.cards.slice(0, SEED_OFFERING.picks));
    expect(run.cardOffering).toBeNull();
    expect(run.player.deck.length).toBe(deckBefore + SEED_OFFERING.picks);
    expect(run.player.leino.fire).toBe(1);
    expect(totalLeino(run)).toBe(1);
    expect(run.player.ascensionCount).toBe(1);
    expect(run.player.maxMana).toBe(maxManaBefore + ASCENSION_PLACEHOLDER.manaGain);
    expect(run.player.mana).toBe(run.player.maxMana); // 全恢复（魏启）
    expect(run.player.hp).toBe(run.player.maxHp);     // 全恢复（生命）
    expect(run.gameStage).toBe('prep');
    expect(run.floor).toBe(2);
  });

  it('跳过进阶：体修隐藏等级 +1、不开种子包、灵脉不变、消耗一次进阶', () => {
    const run = leaveTraining(1);
    completeRoom(run);
    expect(run.gameStage).toBe('ascension');
    const manaBefore = run.player.maxMana;
    chooseAscension(run, null); // 跳过
    expect(run.player.bodyLevel).toBe(1);
    expect(run.cardOffering).toBeNull();     // 体修不给种子包
    expect(totalLeino(run)).toBe(0);         // 灵脉未动
    expect(run.player.ascensionCount).toBe(1);
    expect(run.player.maxMana).toBe(manaBefore + ASCENSION_PLACEHOLDER.manaGain);
    expect(run.gameStage).toBe('prep');
  });

  it('非法输入抛错：阶段不符/未知维度', () => {
    const run = createRun({ seed: 1 });
    expect(() => chooseAscension(run, 'fire')).toThrow(/阶段不符/);
    const asc = leaveTraining(1);
    completeRoom(asc);
    expect(() => chooseAscension(asc, 'water')).toThrow(/未知灵脉维度/);
    for (const d of LEINO_DIMENSIONS) expect(typeof asc.player.leino[d]).toBe('number');
  });

  it('能力授予占位：无待授予能力时直接调用 chooseAscensionAbility 抛错', () => {
    const run = createRun({ seed: 1 });
    expect(() => chooseAscensionAbility(run, 'x')).toThrow(/没有待授予的能力/);
  });
});
