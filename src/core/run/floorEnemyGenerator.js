// floorEnemyGenerator：按楼层生成遭遇编成（run 层，确定性）。
// 职责：
//   1. 分段敌人池（章内楼层带决定可用敌人——机制复杂度随层数递进解锁）；
//   2. 强度缩放：HP 倍率与攻击面板加成随楼层抬升（全体敌人走「基数+attack」
//      同源算式，这里只改面板，行为定义零感知）；
//   3. 编成规模：仅开局教学层单挑，此后双敌为主、逐章引入三敌；
//   4. Boss 层：单只 Boss（当前占位燃焰术士）吃独立强化倍率。
// 确定性：编成与缩放全部由 deriveBattleSeed(run.seed, floor) 派生 rng 驱动，
// 同 seed 同 floor 恒定（回放/测试可复现）。

import { createRng } from '../state/rng.js';
import { getEnemyDefinition } from '../enemies/registry.js';
import { deriveBattleSeed, isBossFloor, FLOORS_PER_CHAPTER, TOTAL_FLOORS } from './runFlow.js';

// ---- 池配置：分段（按章内楼段，1..44 → band 0..3）----
// band = min(3, floorToBand)：第 N 章新敌入池，旧敌保留（杂鱼稀释 + 机制位递进）
const BAND_POOLS = [
  // 第 1 章（1-11）：基础机制（攻防循环 / 荆棘 / 虚弱）
  ['slime', 'hedgehog', 'wraith'],
  // 第 2 章（12-22）：+ 滚雪球 / 汲血节奏
  ['slime', 'hedgehog', 'wraith', 'shadowblade', 'nightbat'],
  // 第 3 章（23-33）：+ 防御压迫
  ['hedgehog', 'wraith', 'shadowblade', 'nightbat', 'rockshell'],
  // 第 4 章（34-44）：全池高压
  ['slime', 'shadowblade', 'nightbat', 'rockshell', 'gargoyle'],
];
// Boss 层占位（正式 Boss 内容待补）：燃焰术士吃 Boss 强化
const BOSS_ID = 'pyro';

// ---- 强度缩放曲线 ----
// HP 倍率：每层 +6%，封顶 ×4（44 层 ≈ 3.5×；每章约 ×2，与卡组成长节奏对轴）
const hpMultOf = (floor) => Math.min(1 + 0.06 * (floor - 1), 4);
// 攻击加成：每 8 层 +1（44 层 +5）——慢于 HP：玩家 HP 也在长，避免早期被秒杀线碾压
const attackBonusOf = (floor) => Math.floor((floor - 1) / 8);
// Boss 强化：HP 再 ×2.2，攻击额外 +3（单只扛整场）
const BOSS_HP_MULT = 2.2;
const BOSS_ATTACK_BONUS = 3;

// 编成规模：仅第 1 层保教学单挑，此后双敌为主、逐章引入三敌（早期单怪速杀
// 压力不足，多敌战斗才是读意图/分摊伤害的主场——对齐玩家反馈 2026-08）
function pickCount(rng, floor) {
  const roll = rng.next();
  if (floor === 1) return 1;                                   // 开局教学：恒单敌
  if (floor <= 3) return roll < 0.5 ? 2 : 1;                   // 第 1 章前段：双敌参半
  if (floor <= 10) return roll < 0.8 ? 2 : 1;                  // 第 1 章主体：双敌为主
  if (floor <= 24) return roll < 0.15 ? 3 : roll < 0.85 ? 2 : 1; // 第 2-3 章：偶发三敌
  return roll < 0.3 ? 3 : roll < 0.8 ? 2 : 1;                  // 第 4 章：2-3 只为主
}

export function bandOfFloor(floor) {
  return Math.min(BAND_POOLS.length - 1, Math.floor((floor - 1) / FLOORS_PER_CHAPTER));
}

/** 楼层强度参数（测试/调试直读口）。 */
export function enemyScaling(floor, { boss = false } = {}) {
  const base = { hpMult: hpMultOf(floor), attackBonus: attackBonusOf(floor) };
  if (!boss) return base;
  return { hpMult: base.hpMult * BOSS_HP_MULT, attackBonus: base.attackBonus + BOSS_ATTACK_BONUS };
}

/** 就地缩放一只已创建的敌人（HP 倍率 + 攻击面板加成）。 */
function scaleUnit(unit, { hpMult, attackBonus }) {
  unit.maxHp = Math.max(1, Math.round(unit.maxHp * hpMult));
  unit.hp = unit.maxHp;
  if (attackBonus > 0) unit.attack += attackBonus;
  return unit;
}

/**
 * 生成一层遭遇：返回**可序列化描述符**数组（run.encounter 落此，存档/回放安全）：
 *   { defId, maxHp, attack }——attack 为绝对面板（基数 0 + 楼层加成）。
 * Boss 层恒单 Boss；普通层从分段池抽取。
 */
export function generateEncounter(run) {
  const floor = Math.min(Math.max(1, run.floor), TOTAL_FLOORS);
  const rng = createRng(deriveBattleSeed(run.seed, floor) ^ 0x5EED); // 与旧 encounter 派生错开
  if (isBossFloor(floor)) {
    return [descriptorOf(BOSS_ID, enemyScaling(floor, { boss: true }))];
  }
  const pool = BAND_POOLS[bandOfFloor(floor)];
  const count = pickCount(rng, floor);
  return Array.from({ length: count }, () => descriptorOf(rng.pick(pool), enemyScaling(floor)));
}

/** 描述符 = defId + 缩放后的终值（createUnit 产出基准值，就地缩放后取数）。 */
function descriptorOf(defId, scaling) {
  const unit = getEnemyDefinition(defId).createUnit();
  scaleUnit(unit, scaling);
  return { defId, maxHp: unit.maxHp, attack: unit.attack };
}

/** 描述符/裸 id → 敌人实例（战斗装配用；裸 id 兼容测试直塞 ['slime'] 的旧写法）。 */
export function spawnEnemy(entry) {
  if (typeof entry === 'string') return getEnemyDefinition(entry).createUnit();
  const unit = getEnemyDefinition(entry.defId).createUnit();
  unit.maxHp = entry.maxHp ?? unit.maxHp;
  unit.hp = unit.maxHp;
  if (entry.attack != null) unit.attack = entry.attack;
  return unit;
}
