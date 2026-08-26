import { advanceFloor } from './runFlow.js';

// 进阶事件（RUN_DESIGN §5.3）：离开训练房时训练次数达标 → 直接进入（无延后、无随机性）。
// 内容：选一条主维度升级 + 恢复全部状态 + 魏启上限提升 +（达标时）能力授予。
// 门槛数值全部占位（§9 留坑），授予池当前最小化为空。

export const LEINO_DIMENSIONS = ['fire', 'wood', 'air', 'body']; // 四主维度（§5.1）

export const ASCENSION_PLACEHOLDER = {
  trainingsPerLevel: 3, // 每次进阶所需训练次数（累计制：第 N 次进阶需 N*3 次训练）
  maxTotalLeino: 6,     // 四主维度等级总和封顶（§5.1 数值锚点）
  manaGain: 1,          // 每次进阶魏启上限提升量
};

export function totalLeino(run) {
  const l = run.player.leino;
  return l.fire + l.wood + l.air + l.body;
}

// 触发判定（离开训练房时调用）：训练次数达到下一次进阶门槛且未封顶
export function ascensionReady(run) {
  const count = run.player.ascensionCount;
  return totalLeino(run) < ASCENSION_PLACEHOLDER.maxTotalLeino
    && run.player.trainingCount >= (count + 1) * ASCENSION_PLACEHOLDER.trainingsPerLevel;
}

// 能力授予候选（占位）：授予池最小化为空；达标标准与池内容见 §9，后续替换。
export function abilityOffering(_run) {
  return [];
}

// 选择一条主维度升级，结算进阶事件
export function chooseAscension(run, dimension) {
  if (run.gameStage !== 'ascension') {
    throw new Error(`run 阶段不符：期望 'ascension'，实际 '${run.gameStage}'`);
  }
  if (!LEINO_DIMENSIONS.includes(dimension)) throw new Error(`未知灵脉维度：${dimension}`);
  if (totalLeino(run) >= ASCENSION_PLACEHOLDER.maxTotalLeino) throw new Error('灵脉总等级已封顶');

  run.player.leino[dimension] += 1;
  run.player.ascensionCount += 1;
  run.player.maxMana += ASCENSION_PLACEHOLDER.manaGain; // 魏启上限提升
  run.player.mana = run.player.maxMana;                 // 全恢复（魏启）
  run.player.hp = run.player.maxHp;                     // 全恢复（生命）

  const offering = abilityOffering(run);
  if (offering.length) {
    run.ascensionOffer = offering; // 有待选能力 → 留一步授予抉择
    return run;
  }
  return completeAscension(run);
}

// 能力授予抉择（offering 为空时不会被调用；null = 跳过）
export function chooseAscensionAbility(run, abilityId = null) {
  if (!run.ascensionOffer) throw new Error('当前没有待授予的能力');
  if (abilityId !== null) {
    if (!run.ascensionOffer.includes(abilityId)) throw new Error(`能力不在授予候选中：${abilityId}`);
    run.player.abilities.push(abilityId);
  }
  run.ascensionOffer = null;
  return completeAscension(run);
}

// 进阶事件结束 → 推进到下一层 prep（advanceFloor 内部处理登顶终局）
function completeAscension(run) {
  return advanceFloor(run);
}
