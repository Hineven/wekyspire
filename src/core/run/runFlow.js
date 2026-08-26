import { createRunState } from '../state/runState.js';
import { createRng } from '../state/rng.js';
import { createBattle } from '../flow/battle.js';
import { getEnemyDefinition } from '../enemies/registry.js';
import { getAllyDefinition } from '../allies/registry.js';
import { spawnRewards, isRewardsClaimed } from './rewards.js';
import { ascensionReady } from './ascension.js';

// run 层流程：普通确定性状态机，不套结算指令树（RUN_DESIGN §6）。
// 阶段机：prep（战前准备/地图）→ battle → reward（战后固定奖励）→ room（奖励房）
//        → [ascension（训练达标时插入，§5.3）] → prep(下一层) → … → end
// 本文件只管阶段迁移与楼层表；奖励/房间内部逻辑在 rewards.js 与 rooms/ 内。

// ---- 塔结构（§1.1） ----
export const FLOORS_PER_CHAPTER = 11;               // 10 普通层 + 1 Boss 层
export const TOTAL_FLOORS = FLOORS_PER_CHAPTER * 4; // 44 层 = 4 章

export const isBossFloor = (floor) => floor % FLOORS_PER_CHAPTER === 0;
// 训练房固定 4N-3 层（1/5/9…41）；Boss 层优先级更高（33 层碰撞占位处理，细则见 §9）
export const isTrainingFloor = (floor) => !isBossFloor(floor) && floor % 4 === 1;
// Boss 战前一层必出营地保底（§4.3）
export const isPreBossFloor = (floor) => (floor + 1) % FLOORS_PER_CHAPTER === 0;

// 战斗种子派生：同 runSeed 同 floor 恒定，整局可复现（§6.1）
export function deriveBattleSeed(seed, floor) {
  let h = (seed ^ Math.imul(floor, 0x9E3779B9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45D9F3B) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// 奖励房派发（§1/§4）：打完 floor 层后进入的房间。
// 训练房/营地保底是固定规则，其余按 run rng 四选一（占位等权，权重细则见 §9）。
export function roomOfFloor(floor, rng) {
  if (isBossFloor(floor)) return null;   // Boss 层无奖励房（Boss 奖励=删卡，另行处理）
  if (isPreBossFloor(floor)) return 'camp'; // 保底营地优先（与训练层 21 碰撞时营地胜出，§9）
  if (isTrainingFloor(floor)) return 'training';
  return rng.pick(['slot', 'camp', 'event']);
}

// 遭遇生成（占位）：按 battleSeed 确定性编成。正式权重/敌人池在阶段 6 替换。
export function generateEncounter(run) {
  const rng = createRng(deriveBattleSeed(run.seed, run.floor));
  if (isBossFloor(run.floor)) {
    return ['pyro']; // 占位 Boss：复用现有敌人，正式 Boss 内容待补
  }
  const pool = ['slime', 'slime', 'pyro']; // 占位池：弱敌权重更高
  const count = run.floor >= 5 && rng.next() < 0.4 ? 2 : 1;
  return Array.from({ length: count }, () => rng.pick(pool));
}

// ---- 建局 ----
// profile：跨局持久内容（故事模式接缝 §6.4；单次游玩传空，行为不变）。
// totalFloors：塔高覆盖位（故事模式可变更塔结构；测试用）。
export function createRun({ seed = 1, profile = null, player = null, totalFloors = TOTAL_FLOORS } = {}) {
  const run = createRunState({ seed, profile, player });
  run.totalFloors = totalFloors;
  run.encounter = generateEncounter(run);
  return run;
}

// ---- 阶段迁移 ----

function expectStage(run, stage) {
  if (run.gameStage !== stage) {
    throw new Error(`run 阶段不符：期望 '${stage}'，实际 '${run.gameStage}'（floor=${run.floor}）`);
  }
}

// prep → battle（战前准备完成，进入本层战斗）
export function enterBattle(run) {
  expectStage(run, 'prep');
  run.gameStage = 'battle';
  return run;
}

// 按当前 run 装配战斗单位与种子。单一事实源：headless（createRunBattle）与
// 真实游戏（runController → createBridge）共用，瑞米出战/种子派生规则改一处即可。
export function assembleBattle(run) {
  return {
    enemies: run.encounter.map(id => getEnemyDefinition(id).createUnit()),
    allies: run.remi.drivenOff ? [] : [getAllyDefinition('remi').createUnit()],
    seed: deriveBattleSeed(run.seed, run.floor),
  };
}

// 按当前遭遇装配战斗（战斗种子 = derive(runSeed, floor)；瑞米被打跑则不出战）
export function createRunBattle(run, { presenter = null, config = {} } = {}) {
  expectStage(run, 'battle');
  const { enemies, allies, seed } = assembleBattle(run);
  return createBattle({ runState: run, enemies, allies, seed, presenter, config });
}

// 战斗终局回写：胜利 → reward（生成战后固定奖励）；失败 → end(defeat)。
// battle 传入时同步瑞米状态：HP 归零 = 被打跑（§3），之后不再出战直至营地找回。
export function finishBattle(run, verdict, battle = null) {
  expectStage(run, 'battle');
  const remi = battle?.battleState.allies.find(a => a.defId === 'remi');
  if (remi?.isDead()) run.remi.drivenOff = true;
  if (verdict === 'victory') {
    if (isBossFloor(run.floor)) run.pendingCardRemoval += 1; // Boss 奖励：删卡机会（§2.1）
    run.gameStage = 'reward';
    spawnRewards(run);
  } else {
    run.gameStage = 'end';
    run.result = 'defeat';
  }
  return run;
}

// reward 阶段完成（奖励领取逻辑在 rewards.js；未抉择完奖励不允许推进）
export function completeRewards(run) {
  expectStage(run, 'reward');
  if (!isRewardsClaimed(run)) throw new Error('战后奖励尚未领取，不能离开 reward 阶段');
  run.rewards = null;
  run.currentRoom = roomOfFloor(run.floor, run.rng);
  if (run.currentRoom) {
    run.gameStage = 'room';
    return run;
  }
  return advanceFloor(run); // Boss 层无奖励房，直接推进
}

// room 阶段完成（房间内部逻辑在 rooms/，本函数只迁移阶段）。
// 离开训练房时训练次数达标 → 直接进入进阶事件（§4.1/§5.3，不再延后）。
export function completeRoom(run) {
  expectStage(run, 'room');
  const room = run.currentRoom;
  run.currentRoom = null;
  run.roomData = null;
  if (room === 'training' && ascensionReady(run)) {
    run.gameStage = 'ascension';
    return run;
  }
  return advanceFloor(run);
}

// 进入下一层：登顶 → end(victory)；否则回 prep 并生成新遭遇
export function advanceFloor(run) {
  run.floor += 1;
  if (run.floor > run.totalFloors) {
    run.gameStage = 'end';
    run.result = 'victory';
    return run;
  }
  run.gameStage = 'prep';
  run.encounter = generateEncounter(run);
  return run;
}
