// 各休息阶段面板的「快照 → widget 列表」构建器（纯映射，无状态）。
// 一个面板一个 builder；PanelObject 只认 widget 描述，不认识任何面板语义。
// action 字段即上报给 runController 的意图（见 runController.dispatchPanelIntent）。

/** 战前准备（塔楼层）：层数 / 敌人预告 / 遗物装卸 / 进入战斗。 */
export function buildPrepPanel(snap) {
  const w = [];
  w.push({ kind: 'title', text: snap.title ?? '战前准备' });
  w.push({ kind: 'text', text: `层数 ${snap.floor} / ${snap.totalFloors}` });
  w.push({
    kind: 'text',
    text: snap.atBossFloor ? `本层即 Boss！` : `距 Boss 层 ${snap.toBoss} 层`,
    tint: snap.atBossFloor ? '#ff7875' : undefined,
  });

  w.push({ kind: 'gap' });
  w.push({ kind: 'sub', text: '下层敌人预告', tint: '#8a93b2' });
  if (!snap.encounter?.length) w.push({ kind: 'text', text: '（无）', tint: '#77809a' });
  for (const e of snap.encounter ?? []) {
    w.push({ kind: 'text', text: e.name, tint: '#f08080' });
  }

  w.push({ kind: 'gap' });
  w.push({
    kind: 'sub',
    text: `遗物（装备位 ${snap.relicSlots.used}/${snap.relicSlots.total}）`,
    tint: '#8a93b2',
  });
  if (!snap.relics?.length) w.push({ kind: 'text', text: '（无）', tint: '#77809a' });
  for (const r of snap.relics ?? []) {
    const suffix = r.equipped ? '（已装备）' : '';
    w.push({ kind: 'text', text: `${r.name}${suffix}`, tint: r.equipped ? '#ffd75e' : undefined });
    if (r.equipped) {
      w.push({ kind: 'button', id: `relic:unequip:${r.id}`, label: '卸下', action: { action: 'unequip', relicId: r.id } });
      if (r.canUse) {
        const uses = r.usesLeft != null ? `（余 ${r.usesLeft}）` : '';
        w.push({ kind: 'button', id: `relic:use:${r.id}`, label: `使用${uses}`, action: { action: 'useRelic', relicId: r.id } });
      }
    } else {
      w.push({ kind: 'button', id: `relic:equip:${r.id}`, label: '装备', action: { action: 'equip', relicId: r.id } });
    }
  }

  w.push({ kind: 'gap' });
  w.push({
    kind: 'button', id: 'prep:start', label: '进入战斗', size: 'main',
    enabled: snap.canStartBattle !== false, action: { action: 'startBattle' },
  });
  return w;
}
