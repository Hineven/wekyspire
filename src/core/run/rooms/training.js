import { promoteCard, canPromoteRuntime } from '../promotion.js';
import { rollSkillChoices } from '../rewards.js';
import { createSkillRuntime } from '../../state/skillRuntime.js';

// 训练场（RUN_DESIGN §4.1）：进阶主途径，固定出现在 4N-3 层（楼层表见 runFlow）。
// 免费：选并升级一张卡；若无可升级卡牌，改为可选的抓牌（可跳过）。
// 每次训练累计 trainingCount；离开训练房时达标 → 直接进入进阶事件（§5.3，阶段4 接线）。

export const TRAINING_PLACEHOLDER = {
  paidRepeatMax: 3,  // 消费训练：花钱 3选1 D级卡 + 升级一张，最多重复次数（占位未实现，§9）
};

export function upgradableCards(run) {
  return run.player.deck.filter(canPromoteRuntime);
}

// 本次训练的免费模式：有可升级卡 → 'upgrade'；否则 → 'draw'
export function trainingMode(run) {
  return upgradableCards(run).length ? 'upgrade' : 'draw';
}

// 免费升级一张卡（晋升 defId），记一次训练
export function trainUpgrade(run, uniqueID, targetId = null) {
  const result = promoteCard(run, uniqueID, targetId);
  if (!result) throw new Error('该卡暂无可用晋升目标，无法升级');
  run.player.trainingCount += 1;
  return run;
}

// 抓牌分支：先 roll 候选（存 run.roomData 待抉择），再 trainDraw 领取或跳过
export function trainDrawChoices(run) {
  run.roomData = { drawChoices: rollSkillChoices(run) };
  return run.roomData.drawChoices;
}

export function trainDraw(run, defId = null) {
  const choices = run.roomData?.drawChoices;
  if (!choices) throw new Error('尚未生成抓牌候选（先调用 trainDrawChoices）');
  if (defId !== null) {
    if (!choices.includes(defId)) throw new Error(`技能不在抓牌候选中：${defId}`);
    run.player.deck.push(createSkillRuntime(defId));
  }
  run.roomData = null;
  run.player.trainingCount += 1;
  return run;
}
