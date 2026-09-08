// 体修体系基础卡组（BODY_CULTIVATION_CARDS §1-§3）：拳（过牌）/ 刀（卡序）/ 拆（格挡）
// 三子体系的 D+C 等阶首批内容，供整局发育游玩测试。B/A 等阶为后续升阶目标，暂缓。
// 设计约定：
//   * 体修卡全走 AP（无魏启），type 'normal'（体修灰卡面）；
//   * 格挡一律落 block 效果层数（≠ 护盾池）；
//   * 深入卡（需精英能力）与咏唱高阶（太极/武学等）不在本批；
//   * 斩系列"有且仅有一张/焚毁召回"的唯一性投放属 spawn 元数据（rewards §6.3 留坑），暂不强制。
// 伤害统一走「基数 + 攻击面板 + power」语言（与拳一致，衰败/强化经 power 表达）。

import { registerSkill } from '../skills/registry.js';
import { firstAliveEnemy, handNeighbors, zoneOf } from '../state/battleState.js';
import { handIndexAtPlay, handNeighborsAtPlay } from '../skills/helpers.js';
import { DrawCardsInstruction, DiscardCardInstruction, AddCardInstruction } from '../instructions/cards.js';
import { DealDamageInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { GainActionPointsInstruction } from '../instructions/resources.js';
import { PlayerTurnStartInstruction } from '../instructions/turn.js';
import { UseSkillInstruction, SkillCooldownInstruction } from '../instructions/skill.js';
import { enemyTarget, resolvedDamageText } from './skills.js';

// 伤害基数 + 攻击面板 + power（体修攻击卡统一算式）
function attackAmount(sctx, base) {
  return base + sctx.player.getStat('attack') + sctx.self.power;
}

// 手牌中自身的出牌时点位置（结算中读捕获值，预览态实时；不在手牌返回 -1）
function handIndex(sctx) {
  return handIndexAtPlay(sctx);
}

// 冷却类效果统一走 SkillCooldownInstruction（skill.js）：正 delta = 卡内加速
// （猛拳「每打 1 牌冷却 1」），负 delta = 衰败 N（斩系「在手反向冷却」）。
// 指令内自带 cooldownTick 播报（绿/暗红脉冲）与回充逻辑，此处只声明触发时机。

// ==== 拳组合（过牌）============================================================

// 敏捷连击（敏捷连击系列 D）：最左端打出补抽牌。promotesTo 疾速连击（C）。
registerSkill({
  id: 'agileCombo', name: '敏捷连击', type: 'normal', tier: 'D', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  promotesTo: 'rapidCombo',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 7),
    }));
    if (handIndex(sctx) === 0) {
      sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    }
    return true;
  },
  describe: () => '7伤害；最左端打出时抽1牌',
  battleDescribe: (sctx) => (handIndex(sctx) === 0
    ? `${resolvedDamageText(sctx, 7)}，抽1牌`
    : resolvedDamageText(sctx, 7)),
});

// 疾速连击（敏捷连击系列 C）：最左端抽 2。
registerSkill({
  id: 'rapidCombo', name: '疾速连击', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 7),
    }));
    if (handIndex(sctx) === 0) {
      sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 2 }));
    }
    return true;
  },
  describe: () => '7伤害；最左端打出时抽2牌',
  battleDescribe: (sctx) => (handIndex(sctx) === 0
    ? `${resolvedDamageText(sctx, 7)}，抽2牌`
    : resolvedDamageText(sctx, 7)),
});

// 蓄力（蓄力系列 D）：向牌库随机位插入 2 张千击（衍生 0 费 7 伤抽 1）。
registerSkill({
  id: 'chargeUp', name: '蓄力', type: 'normal', tier: 'D', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  cardMode: 'normal',
  promotesTo: 'comboStrike',
  use(sctx) {
    for (let i = 0; i < 2; i++) {
      sctx.kernel.submitInstruction(new AddCardInstruction({ defId: 'thousandHits', index: 'random' }));
    }
    return true;
  },
  describe: () => '向牌库随机插入2「千击」',
});

// 连击（蓄力系列 C）：插 3 张千击。
registerSkill({
  id: 'comboStrike', name: '连击', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  cardMode: 'normal',
  promotesTo: 'quadrupleHit',
  use(sctx) {
    for (let i = 0; i < 3; i++) {
      sctx.kernel.submitInstruction(new AddCardInstruction({ defId: 'thousandHits', index: 'random' }));
    }
    return true;
  },
  describe: () => '向牌库随机插入3「千击」',
});

// 四重击（蓄力系列 B）：1AP 插 4 张千击（量取胜）。
registerSkill({
  id: 'quadrupleHit', name: '四重击', type: 'normal', tier: 'B', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  cardMode: 'normal',
  promotesTo: 'instantThousand',
  use(sctx) {
    for (let i = 0; i < 4; i++) {
      sctx.kernel.submitInstruction(new AddCardInstruction({ defId: 'thousandHits', index: 'random' }));
    }
    return true;
  },
  describe: () => '向牌库随机插入4「千击」',
});

// 一瞬千击（蓄力系列 A）：1AP 消耗，一次性灌入 7 张千击。
registerSkill({
  id: 'instantThousand', name: '一瞬千击', type: 'normal', tier: 'A', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  use(sctx) {
    for (let i = 0; i < 7; i++) {
      sctx.kernel.submitInstruction(new AddCardInstruction({ defId: 'thousandHits', index: 'random' }));
    }
    return true;
  },
  describe: () => '向牌库随机插入7「千击」',
});

// 千击（蓄力系列衍生牌）：0AP，7 伤害 + 抽 1，打出即消耗。只经 AddCard 入场，不进奖励池。
registerSkill({
  id: 'thousandHits', name: '千击', type: 'normal', tier: 'D', series: 'fist',
  cost: { mana: 0, actionPoint: 0 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  canSpawnAsReward: false,
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 7),
    }));
    sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    return true;
  },
  describe: () => '7伤害，抽1牌',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 7)}，抽1牌`,
});

// 猛拳（崩拳系列 C）：在手牌中时，每打出 1 张牌即刻冷却 1 回合（含他人）。
// 冷却位仅牌库（cooldownZones: ['deck']）：手中无自然冷却，出牌是唯一加速途径
// （A 阶崩拳"随时可冷却"的跃迁由此成立）；自身打出结算完成时已离手，不自我加速。
registerSkill({
  id: 'fierceFist', name: '猛拳', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 4 },
  cooldownZones: ['deck'],
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 14),
    }));
    return true;
  },
  subscriptions: (sctx) => [{
    when: UseSkillInstruction, phase: 'post',
    filter: (instr, ctx) => zoneOf(ctx.battleState, sctx.self.uniqueID) === 'hand',
    react: (instr, ctx) => ctx.kernel.submitInstruction(
      new SkillCooldownInstruction({ skill: sctx.self, delta: 1 }), instr),
  }],
  describe: () => '14伤害；在手时，你每打出1牌，此牌冷却1',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 14)}；在手时，你每打出1牌，此牌冷却1`,
});

// ==== 虚形拳系列（唯一手牌）====
// 条件口径（2026-08 设计稿）：「为唯一手牌」= 打出那一刻手中只有此牌本身。
// 结算中发动卡已离手（pending）：手上无牌 = 打出时恰一张；预览态自身在手：恰一张。
// 判定一律读出牌时点（isOnlyHandCard 双路径换算），与位置敏感卡同律。

// 仿形拳（虚形拳系列 C）：唯一手牌时 +7 并补牌。
registerSkill({
  id: 'mimicFist', name: '仿形拳', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal', targetMode: 'enemy',
  promotesTo: 'leopardFist',
  use(sctx) {
    const only = isOnlyHandCard(sctx);
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx),
      amount: attackAmount(sctx, only ? 14 : 7),
    }));
    if (only) sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    return true;
  },
  describe: () => '7伤害；为唯一手牌时：14伤害，抽1牌',
  battleDescribe: (sctx) => isOnlyHandCard(sctx)
    ? `${resolvedDamageText(sctx, 14)}，抽1牌`
    : resolvedDamageText(sctx, 7),
});

// 豹形拳（虚形拳系列 B）：唯一手牌时 +13 并补牌。
registerSkill({
  id: 'leopardFist', name: '豹形拳', type: 'normal', tier: 'B', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal', targetMode: 'enemy',
  promotesTo: 'dragonFist',
  use(sctx) {
    const only = isOnlyHandCard(sctx);
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx),
      amount: attackAmount(sctx, only ? 20 : 7),
    }));
    if (only) sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    return true;
  },
  describe: () => '7伤害；为唯一手牌时：20伤害，抽1牌',
  battleDescribe: (sctx) => isOnlyHandCard(sctx)
    ? `${resolvedDamageText(sctx, 20)}，抽1牌`
    : resolvedDamageText(sctx, 7),
});

// 龙形拳（虚形拳系列 B）：唯一手牌时 +17 且抽 3（抽牌分叉位）。
registerSkill({
  id: 'dragonFist', name: '龙形拳', type: 'normal', tier: 'B', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal', targetMode: 'enemy',
  promotesTo: 'voidFist',
  use(sctx) {
    const only = isOnlyHandCard(sctx);
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx),
      amount: attackAmount(sctx, only ? 24 : 7),
    }));
    if (only) sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 3 }));
    return true;
  },
  describe: () => '7伤害；为唯一手牌时：24伤害，抽3牌',
  battleDescribe: (sctx) => isOnlyHandCard(sctx)
    ? `${resolvedDamageText(sctx, 24)}，抽3牌`
    : resolvedDamageText(sctx, 7),
});

// 虚形拳（虚形拳系列 A）：唯一手牌时抽满手牌（口径：抽 5 张——手牌无上限，
// 「满」按常规手牌规模 5 取值，待设计确认）。
registerSkill({
  id: 'voidFist', name: '虚形拳', type: 'normal', tier: 'A', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    const only = isOnlyHandCard(sctx);
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 7),
    }));
    if (only) sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 5 }));
    return true;
  },
  describe: () => '7伤害；为唯一手牌时抽5牌',
  battleDescribe: (sctx) => isOnlyHandCard(sctx)
    ? `${resolvedDamageText(sctx, 7)}，抽5牌`
    : resolvedDamageText(sctx, 7),
});

// 空形拳（虚形拳系列 A 顶点）：仅作为唯一手牌时可打出，100 伤害。
registerSkill({
  id: 'emptyFist', name: '空形拳', type: 'normal', tier: 'A', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal', targetMode: 'enemy',
  canUse: (sctx) => sctx.battleState.zones.hand.length === 1,
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 100),
    }));
    return true;
  },
  describe: () => '仅作为唯一手牌时可打出：100伤害',
  battleDescribe: (sctx) => resolvedDamageText(sctx, 100),
});

// 「为唯一手牌」判定（出牌时点口径）：结算中自身已离手（pending），手上无牌 = 打出时恰一张；
// 预览态（canUse/battleDescribe）自身在手，手上恰一张 = 唯一。
function isOnlyHandCard(sctx) {
  return sctx.handIndexAtPlay != null
    ? sctx.battleState.zones.hand.length === 0
    : sctx.battleState.zones.hand.length === 1;
}

// ==== 刀组合（卡序）============================================================

// 斩（斩系列 C）：最高单伤链起点。机制走 named 术语：斩（仅在牌库中冷却充能——
// FIFO 下打出本就连牌库底回，斩的苛刻在于冷却只在牌库推进）+ 衰败N（回合开始时
// 若在手，冷却计时反向推进）。
// 局内进阶链（斩→裂石斩→…→断神斩）待 modifier 系统落地；斩灭召回待 spawn 元数据。
registerSkill({
  id: 'slash', name: '斩', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 2 },
  charges: { max: 1, cooldownTurns: 2 },
  cooldownZones: ['deck'],
  decay: 1,
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 16),
    }));
    return true;
  },
  subscriptions: (sctx) => [{
    // 衰败：回合开始时若在手牌中，冷却反向推进（满充能时计时为 0，无处可反，不生效）
    when: PlayerTurnStartInstruction, phase: 'post',
    filter: (instr, ctx) => zoneOf(ctx.battleState, sctx.self.uniqueID) === 'hand',
    react: (instr, ctx) => ctx.kernel.submitInstruction(
      new SkillCooldownInstruction({ skill: sctx.self, delta: -(sctx.def.decay ?? 1) }), instr),
  }],
  describe: () => '16伤害，衰败1，斩',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 16)}，/named{衰败1}，/named{斩}`,
});

// 蓄力斩（斩系列 C 平行卡）：同机制更高基数。
registerSkill({
  id: 'powerSlash', name: '蓄力斩', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 2 },
  charges: { max: 1, cooldownTurns: 2 },
  cooldownZones: ['deck'],
  decay: 1,
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 22),
    }));
    return true;
  },
  subscriptions: (sctx) => [{
    when: PlayerTurnStartInstruction, phase: 'post',
    filter: (instr, ctx) => zoneOf(ctx.battleState, sctx.self.uniqueID) === 'hand',
    react: (instr, ctx) => ctx.kernel.submitInstruction(
      new SkillCooldownInstruction({ skill: sctx.self, delta: -(sctx.def.decay ?? 1) }), instr),
  }],
  describe: () => '22伤害，衰败1，斩',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 22)}，/named{衰败1}，/named{斩}`,
});

// 回旋斩（回旋斩系列 C）：伤害 + 从牌库末抽牌（与牌库顶抽牌形成规划语言）。
registerSkill({
  id: 'cycloneSlash', name: '回旋斩', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 6),
    }));
    sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1, from: 'bottom' }));
    return true;
  },
  describe: () => '6伤害，从牌库末抽1牌',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 6)}，从牌库末抽1牌`,
});

// 刀背打击（刀背打击系列 D）：从最右侧丢牌（跳过自身）。
registerSkill({
  id: 'knifeBack', name: '刀背打击', type: 'normal', tier: 'D', series: 'blade',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  promotesTo: 'knifeBackHeavy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 6),
    }));
    discardRightmost(sctx, 1);
    return true;
  },
  describe: () => '6伤害，弃最右1手牌',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 6)}，弃最右1手牌`,
});

// 刀背强击（刀背打击系列 C）：同机制更高基数。
registerSkill({
  id: 'knifeBackHeavy', name: '刀背强击', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 12),
    }));
    discardRightmost(sctx, 1);
    return true;
  },
  describe: () => '12伤害，弃最右1手牌',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 12)}，弃最右1手牌`,
});

// 从最右侧丢弃 n 张手牌（发动卡自身已离手进 pending，不参与；不足则尽力丢）
function discardRightmost(sctx, n) {
  const hand = sctx.battleState.zones.hand;
  for (const card of hand.slice(-n).reverse()) {
    sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: card.uniqueID }));
  }
}

// 飞刀（飞刀系列 C）：两侧邻牌献祭。需要两侧都有牌（canUse 守卫）。
registerSkill({
  id: 'flyingDagger', name: '飞刀', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  canUse: (sctx) => {
    const { left, right } = handNeighbors(sctx.battleState, sctx.self.uniqueID);
    return Boolean(left && right);
  },
  use(sctx) {
    const { left, right } = handNeighborsAtPlay(sctx); // 出牌时点邻位（自身已离手）
    let bonus = 0;
    for (const card of [left, right]) {
      if (!card) continue;
      bonus += 5;
      sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: card.uniqueID }));
    }
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 6 + bonus),
    }));
    return true;
  },
  describe: () => '6伤害；弃两侧手牌，每弃1张+5，需两侧有牌',
  battleDescribe: (sctx) => {
    const { left, right } = handNeighborsAtPlay(sctx);
    if (left && right) return `${resolvedDamageText(sctx, 16)}，弃两侧牌`;
    return `${resolvedDamageText(sctx, 6)}；需两侧有牌`;
  },
});

// 收刃（藏锋系列 C）：高伤换滞气（抽牌锁）。
registerSkill({
  id: 'storeEdge', name: '收刃', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 2 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 15),
    }));
    sctx.kernel.submitInstruction(new AddEffectInstruction({
      target: sctx.player, effectId: 'stall', stacks: 1,
    }));
    return true;
  },
  describe: () => '15伤害，/effect{滞气}1',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 15)}，/effect{滞气}1`,
});

// ==== 拆组合（格挡）============================================================

// 抱头（格挡系列 D）：+1 层格挡（block 效果，非护盾池）。promotesTo 格挡（C）。
registerSkill({
  id: 'duckHead', name: '抱头', type: 'normal', tier: 'D', series: 'block',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  promotesTo: 'blockGuard',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({
      target: sctx.player, effectId: 'block', stacks: 1,
    }));
    return true;
  },
  describe: () => '/effect{格挡}1',
});

// 格挡（格挡系列 C）：+2 层格挡。
registerSkill({
  id: 'blockGuard', name: '格挡', type: 'normal', tier: 'C', series: 'block',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({
      target: sctx.player, effectId: 'block', stacks: 2,
    }));
    return true;
  },
  describe: () => '/effect{格挡}2',
});

// 破势（破势系列 C）：消耗格挡转伤害（至多 4 层，每层 +4）。
registerSkill({
  id: 'breakStance', name: '破势', type: 'normal', tier: 'C', series: 'block',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    const spend = Math.min(sctx.player.getEffectStacks('block'), 4);
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 12 + spend * 4),
    }));
    if (spend > 0) {
      sctx.kernel.submitInstruction(new AddEffectInstruction({
        target: sctx.player, effectId: 'block', stacks: -spend,
      }));
    }
    return true;
  },
  describe: () => '12伤害，可弃至多4/effect{格挡}，每弃1点+4',
  battleDescribe: (sctx) => {
    const spend = Math.min(sctx.player.getEffectStacks('block'), 4);
    if (spend > 0) return `${resolvedDamageText(sctx, 12 + spend * 4)}，弃${spend}/effect{格挡}`;
    return resolvedDamageText(sctx, 12);
  },
});

// 防御姿态（龟守链 C）：咏唱，回合开始 +1 层格挡（C 位无上限/无代价，
// 守护/龟守的上限与代价随 B/A 等阶引入）。咏唱双态：发动后住手牌持续生效，
// 按咏唱值占手牌压力（咏唱2 = 激活时计 2 张手牌）；再次打出免费解除并回牌库。
registerSkill({
  id: 'defenseStance', name: '防御姿态', type: 'normal', tier: 'C', series: 'block',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'chant',
  chantWeight: 2,
  use() { return true; },
  activated: {
    subscriptions: () => [{
      when: PlayerTurnStartInstruction, phase: 'post',
      react: (instr, ctx) => {
        ctx.kernel.submitInstruction(new AddEffectInstruction({
          target: ctx.player, effectId: 'block', stacks: 1,
        }), instr);
      },
    }],
  },
  describe: () => '咏唱2：回合开始时/effect{格挡}1；再次打出（免费）解除并回牌库',
  battleDescribe: (sctx) => (sctx.self.isActivated
    ? '已激活：回合开始时/effect{格挡}1；再次打出（免费）解除并回牌库'
    : '咏唱2：回合开始时/effect{格挡}1；再次打出（免费）解除并回牌库'),
});

// 肾上腺素（体修套牌 C）：0 开销消耗卡——获得 1AP 并抽 1 牌。应急节奏阀，
// 消耗属性保证不沉淀循环（打出即焚，套牌越打越薄）。
registerSkill({
  id: 'adrenaline', name: '肾上腺素', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 0 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new GainActionPointsInstruction({ amount: 1 }));
    sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    return true;
  },
  describe: () => '获得1行动点，抽1牌',
});

// 情况不对（起始套牌泛用保险 D）：固有消耗卡——弃全手牌抽等量，鬼抽时的整体重调。
// 固有保证起手必然上手（详见 namedTerms「固有」）；不入奖励池：系统级保险卡，
// 定位同衍生牌（千击），重复获取会稀释其「起手必有」的确定性。
registerSkill({
  id: 'badOmen', name: '情况不对', type: 'normal', tier: 'D',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'none',
  keywords: ['exhaust', 'innate'],
  canSpawnAsReward: false,
  use(sctx) {
    // 自身已在结算区（pending），手中即其余卡：全部弃掉后抽等量
    const hand = [...sctx.battleState.zones.hand];
    for (const c of hand) {
      sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: c.uniqueID }));
    }
    sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: hand.length }));
    return true;
  },
  describe: () => '固有；弃手中全部卡，抽等量卡',
  battleDescribe: () => '/named{固有}；弃手中全部卡，抽等量卡',
});

// ==== 体修起始卡组（BODY_CULTIVATION_CARDS §0：从基础卡「拳/盾」生长）====
// 拳（真拳系列 D）×3 + 盾（盾系列 D）×3 + 抱头（格挡系列 D）×1 + 肾上腺素（C）×1
// + 情况不对（D）×1：三系种子齐备（拳的出牌、盾的自保、拆的格挡），
// 肾上腺素做节奏阀、情况不对做鬼抽保险，9 张基准规模。
export const BODY_STARTER_DECK = Object.freeze([
  'punch', 'punch', 'punch',
  'guard', 'guard', 'guard',
  'duckHead',
  'adrenaline',
  'badOmen',
]);
