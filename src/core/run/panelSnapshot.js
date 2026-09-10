// 休息阶段面板状态投影：run → 可序列化快照（本次 UI 迁移的**唯一数据下行通道**）。
//
// 为什么是 core 纯函数而不是写在 Shell 的 runController 里：
//   ① 红线——Stage 层不得自行拉取 run 状态；快照由编排器推入（MapStage.setPanel），
//      Stage 只消费纯数据；
//   ② 观战中继（tools/broadcast.mjs）经 tools/playSession.mjs 的 freshState 直驱 Core、
//      **不经过 Shell 的 runController**——投影放 Shell 则中继永远拿不到，只能自行
//      重抄一遍推导，产生第二事实源。放 core 则中继可同源复用。
//
// 本文件不含任何表现字段：播放进度等纯演出状态（老虎机 spin 速度/位置）留在 Stage，
// 只有「影响决策与游戏逻辑流程」的东西才进快照（用户 2026-09 定）。
//
// 增量约定：面板逐个迁移，每迁一个在此加一个分支；未迁移的 stage 返回 null，
// 宿主据此**不装配** Three 面板（对应 Vue 面板仍在渲染）。

import { getEnemyDefinition } from '../enemies/registry.js';
import { getRelicDefinition } from '../relics/registry.js';
import { getSkillDefinition } from '../skills/registry.js';
import { cardViewFromDef } from '../skills/cardView.js';
import { isBossFloor, FLOORS_PER_CHAPTER } from './runFlow.js';
import { PACKS } from './rewards.js';

/**
 * 当前阶段的面板快照；无可呈现面板时返回 null。
 * @param {object} run runState
 * @returns {null | {kind: string, ...}}
 */
export function panelSnapshot(run) {
  if (!run) return null;
  switch (run.gameStage) {
    case 'prep': return prepSnapshot(run);
    case 'reward': return rewardSnapshot(run);
    default: return null;
  }
}

/** 战前准备（塔楼层）：层数/敌人预告/遗物装卸/进入战斗。 */
export function prepSnapshot(run) {
  const p = run.player;
  const nextBoss = Math.ceil(run.floor / FLOORS_PER_CHAPTER) * FLOORS_PER_CHAPTER;
  const equipped = new Set(p.equippedRelics);
  return {
    kind: 'prep',
    title: '战前准备',
    floor: run.floor,
    totalFloors: run.totalFloors,
    toBoss: nextBoss - run.floor,
    atBossFloor: isBossFloor(run.floor),
    // 名字在此解析（注册表反查是 core 纯读），Stage 拿到的直接是可绘文本
    encounter: (run.encounter ?? []).map((e) => {
      const id = e?.defId ?? e;
      return { defId: id, name: getEnemyDefinition(id)?.name ?? id };
    }),
    relicSlots: { used: p.equippedRelics.length, total: p.relicSlots },
    relics: p.relics.map((id) => {
      const def = getRelicDefinition(id);
      const isEquipped = equipped.has(id);
      const usesLeft = def?.uses != null ? (run.relicUses?.[id] ?? 0) : null;
      return {
        id,
        name: def?.name ?? id,
        equipped: isEquipped,
        // 主动遗物的可用性在此判定（Stage 不判断"能不能用"）
        canUse: !!def?.prepUse && isEquipped && (usesLeft == null || usesLeft > 0),
        usesLeft,
      };
    }),
    canStartBattle: true,
  };
}

/**
 * 战后奖励（房间层·模态面板）：金币入账 + 卡包选择 + 包内三选一。
 * 卡面视图在 core 侧解析（`describe` 的 ctx 传当前 player，应用前口径），
 * 使快照保持纯数据——Stage 只负责烘焙与摆位。
 * 卡包已自动开好（单包时 spawnRewards 直接开包）→ packId 非空、skillChoices 已填。
 */
export function rewardSnapshot(run) {
  const rw = run.rewards;
  if (!rw) return null;
  const packMeta = (id) => {
    const p = PACKS[id] ?? { id, name: id, desc: '' };
    return { id, name: p.name ?? id, desc: p.desc ?? '' };
  };
  return {
    kind: 'reward',
    title: '战后奖励',
    money: rw.money ?? 0,
    packs: (rw.packs ?? []).map(packMeta),
    packId: rw.packId ?? null,
    packName: rw.packId ? packMeta(rw.packId).name : null,
    skillChoices: (rw.skillChoices ?? []).map(id => ({
      defId: id,
      view: cardViewFromDef(getSkillDefinition(id), { player: run.player }),
    })),
  };
}
