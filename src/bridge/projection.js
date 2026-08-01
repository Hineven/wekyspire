import { swapCostOf } from '../core/state/battleState.js';
import { getSkillDefinition } from '../core/skills/registry.js';
import { makeSkillCtx } from '../core/skills/helpers.js';
import { isWaitingPlayerInput } from '../core/flow/battle.js';

// 状态投影：battleState → 前端只读视图（纯数据、可序列化）。
// 约定：runtime 上 `_` 结尾的字段是后端私有（_input/_draw/_slots…），一律不外发；
// 定义数据经注册表反查后压平进视图，Stage/Shell 不需要 import Core 注册表。

export function projectSkill(rt) {
  return {
    uniqueID: rt.uniqueID,
    defId: rt.defId,
    power: rt.power,
    remainingUses: rt.remainingUses,
    currentCooldown: rt.currentCooldown,
    isActivated: rt.isActivated,
  };
}

export function projectUnit(u) {
  return {
    uniqueID: u.uniqueID,
    defId: u.defId ?? null,
    name: u.name,
    side: u.side,
    hp: u.hp,
    maxHp: u.maxHp,
    shield: u.shield,
    isDead: u.isDead(),
    effects: u.effects.map(e => ({ effectId: e.effectId, stacks: e.stacks })),
    intention: u.intention ?? null,
  };
}

// 卡牌完整视图（Stage 烘焙纹理用）：runtime 投影 + 定义元数据 + 动态描述文本
export function projectCardFull(battle, rt) {
  const def = getSkillDefinition(rt.defId);
  const sctx = makeSkillCtx(battle.ctx, rt);
  return {
    ...projectSkill(rt),
    name: def.name ?? rt.defId,
    tier: def.tier ?? null,
    type: def.type ?? 'normal',
    series: def.series ?? null,
    image: def.image ?? null,
    cost: def.cost ?? { mana: 0, actionPoint: 0 },
    keywords: def.keywords ?? [],
    cardMode: def.cardMode ?? 'normal',
    charges: def.charges ?? null,
    text: def.describe ? def.describe(sctx) : '',
  };
}

export function projectBattle(battle) {
  const { battleState, ctx } = battle;
  return {
    turn: { count: battleState.turn.count, side: battleState.turn.side },
    verdict: ctx.kernel.verdict,
    result: battleState.result,
    waitingPlayerInput: isWaitingPlayerInput(battle),
    pendingInput: battleState.pendingInput
      ? { request: battleState.pendingInput.request }
      : null,
    swapCost: swapCostOf(battleState),
    player: {
      ...projectUnit(ctx.player),
      mana: ctx.player.mana,
      maxMana: ctx.player.maxMana,
      actionPoints: ctx.player.actionPoints,
      maxActionPoints: ctx.player.maxActionPoints,
    },
    enemies: battleState.enemies.map(projectUnit),
    allies: battleState.allies.map(projectUnit),
    hand: battleState.zones.hand.map(rt => projectCardFull(battle, rt)),
    chant: {
      capacity: battleState.chant.capacity,
      slots: battleState.chant.slots.map(rt => projectCardFull(battle, rt)),
    },
    // 覆盖层（牌库/弃牌堆/焚毁区查看器）用完整列表（含牌面烘焙所需的定义数据）；常规 HUD 只读 counts
    counts: {
      deck: battleState.zones.deck.length,
      discard: battleState.zones.discard.length,
      burnt: battleState.zones.burnt.length,
    },
    zones: {
      deck: battleState.zones.deck.map(rt => projectCardFull(battle, rt)),
      discard: battleState.zones.discard.map(rt => projectCardFull(battle, rt)),
      burnt: battleState.zones.burnt.map(rt => projectCardFull(battle, rt)),
    },
  };
}
