// 体修体系基础卡组（BODY_CULTIVATION_CARDS §1-§3）：拳（过牌）/ 刀（卡序）/ 拆（格挡）
// 三子体系的 D+C 等阶首批内容，供整局发育游玩测试。B/A 等阶为后续升阶目标，暂缓。
// 设计约定：
//   * 体修卡全走 AP（无魏启），type 'normal'（体修灰卡面）；
//   * 格挡一律落 block 效果层数（≠ 护盾池）；
//   * 深入卡（需精英能力）与咏唱高阶（太极/武学等）不在本批；
//   * 斩系列"有且仅有一张/焚毁召回"的唯一性投放属 spawn 元数据（rewards §6.3 留坑），暂不强制。
// 伤害统一走「基数 + 攻击面板 + power」语言（与冲拳一致，衰败/强化经 power 表达）。

import { registerSkill } from '../skills/registry.js';
import { firstAliveEnemy, handNeighbors, zoneOf } from '../state/battleState.js';
import { DrawCardsInstruction, DiscardCardInstruction, AddCardInstruction } from '../instructions/cards.js';
import { DealDamageInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { PlayerTurnEndInstruction, PlayerTurnStartInstruction } from '../instructions/turn.js';
import { UseSkillInstruction } from '../instructions/skill.js';
import { enemyTarget, resolvedDamageText } from './skills.js';

// 伤害基数 + 攻击面板 + power（体修攻击卡统一算式）
function attackAmount(sctx, base) {
  return base + sctx.player.getStat('attack') + sctx.self.power;
}

// 手牌中自身的位置（不在手牌返回 -1）
function handIndex(sctx) {
  return sctx.battleState.zones.hand.findIndex(c => c.uniqueID === sctx.self.uniqueID);
}

// 冷却推进 1 格并按需恢复充能（与 SkillCooldownInstruction 同语义，
// 猛拳"在手中每打 1 牌冷却 1"等卡内加速复用）
function accelerateCooldown(skill, def) {
  if (skill.currentCooldown <= 0) return;
  const max = def.charges?.max ?? Infinity;
  skill.currentCooldown -= 1;
  if (skill.currentCooldown === 0) {
    skill.remainingUses = Math.min(skill.remainingUses + 1, max);
    if (skill.remainingUses < max) skill.currentCooldown = def.charges.cooldownTurns;
  }
}

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

// 蓄力（蓄力系列 D）：向牌库随机位插入千击（衍生 0 费抽 1）。
registerSkill({
  id: 'chargeUp', name: '蓄力', type: 'normal', tier: 'D', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  cardMode: 'normal',
  promotesTo: 'comboStrike',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddCardInstruction({ defId: 'thousandHits', index: 'random' }));
    return true;
  },
  describe: () => '向牌库随机插入1「千击」',
});

// 连环打击（蓄力系列 C）：插 2 张千击。
registerSkill({
  id: 'comboStrike', name: '连环打击', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  cardMode: 'normal',
  use(sctx) {
    for (let i = 0; i < 2; i++) {
      sctx.kernel.submitInstruction(new AddCardInstruction({ defId: 'thousandHits', index: 'random' }));
    }
    return true;
  },
  describe: () => '向牌库随机插入2「千击」',
});

// 千击（蓄力系列衍生牌）：0AP 抽 1，打出即消耗。只经 AddCard 入场，不进奖励池。
registerSkill({
  id: 'thousandHits', name: '千击', type: 'normal', tier: 'D', series: 'fist',
  cost: { mana: 0, actionPoint: 0 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  canSpawnAsReward: false,
  use(sctx) {
    sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    return true;
  },
  describe: () => '抽1牌',
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
    react: () => accelerateCooldown(sctx.self, sctx.def),
  }],
  describe: () => '14伤害；在手时，你每打出1牌，此牌冷却1',
  battleDescribe: (sctx) => `${resolvedDamageText(sctx, 14)}；在手时，你每打出1牌，此牌冷却1`,
});

// 仿形拳（虚形拳系列 C）：作为最后一张手牌打出时增伤并补牌。
registerSkill({
  id: 'mimicFist', name: '仿形拳', type: 'normal', tier: 'C', series: 'fist',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    const last = handIndex(sctx) === sctx.battleState.zones.hand.length - 1;
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx),
      amount: attackAmount(sctx, last ? 12 : 5),
    }));
    if (last) sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1 }));
    return true;
  },
  describe: () => '5伤害；作为最后手牌打出时：12伤害，抽1牌',
  battleDescribe: (sctx) => {
    const hand = sctx.battleState.zones.hand;
    const last = handIndex(sctx) === hand.length - 1;
    return last
      ? `${resolvedDamageText(sctx, 12)}，抽1牌`
      : resolvedDamageText(sctx, 5);
  },
});

// ==== 刀组合（卡序）============================================================

// 斩（斩系列 C）：最高单伤链起点。仅牌库中冷却（cooldownZones），手中渡过回合衰败（power -1）。
// 局内进阶链（斩→裂石斩→…→断神斩）待 modifier 系统落地；焚毁召回待 spawn 元数据。
registerSkill({
  id: 'slash', name: '斩', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 2 },
  charges: { max: 1, cooldownTurns: 2 },
  cooldownZones: ['deck'],
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 16),
    }));
    return true;
  },
  subscriptions: (sctx) => [{
    when: PlayerTurnEndInstruction, phase: 'post',
    filter: (instr, ctx) => zoneOf(ctx.battleState, sctx.self.uniqueID) === 'hand',
    react: () => { sctx.self.power -= 1; },
  }],
  describe: () => '16伤害。斩：仅牌库中冷却，手中渡过回合伤害-1',
  battleDescribe: (sctx) => resolvedDamageText(sctx, 16),
});

// 蓄力斩（斩系列 C 平行卡）：同机制更高基数。
registerSkill({
  id: 'powerSlash', name: '蓄力斩', type: 'normal', tier: 'C', series: 'blade',
  cost: { mana: 0, actionPoint: 2 },
  charges: { max: 1, cooldownTurns: 2 },
  cooldownZones: ['deck'],
  cardMode: 'normal', targetMode: 'enemy',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: enemyTarget(sctx), amount: attackAmount(sctx, 22),
    }));
    return true;
  },
  subscriptions: (sctx) => [{
    when: PlayerTurnEndInstruction, phase: 'post',
    filter: (instr, ctx) => zoneOf(ctx.battleState, sctx.self.uniqueID) === 'hand',
    react: () => { sctx.self.power -= 1; },
  }],
  describe: () => '22伤害。斩：仅牌库中冷却，手中渡过回合伤害-1',
  battleDescribe: (sctx) => resolvedDamageText(sctx, 22),
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

// 从最右侧丢弃 n 张手牌（跳过发动卡自身；不足则尽力丢）
function discardRightmost(sctx, n) {
  const hand = sctx.battleState.zones.hand;
  const targets = [];
  for (let i = hand.length - 1; i >= 0 && targets.length < n; i--) {
    if (hand[i].uniqueID !== sctx.self.uniqueID) targets.push(hand[i]);
  }
  for (const card of targets) {
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
    const { left, right } = handNeighbors(sctx.battleState, sctx.self.uniqueID);
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
    const { left, right } = handNeighbors(sctx.battleState, sctx.self.uniqueID);
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
// 守护/龟守的上限与代价随 B/A 等阶引入）。
registerSkill({
  id: 'defenseStance', name: '防御姿态', type: 'normal', tier: 'C', series: 'block',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'chant',
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
  describe: () => '咏唱：回合开始时/effect{格挡}1',
});

// ==== 体修起始卡组（BODY_CULTIVATION_CARDS §0：从基础卡「冲拳/格挡」生长）====
// 冲拳（真拳系列 D）×4 + 抱头（格挡系列 D）×2 + 盾（盾系列 D）×2：
// 三系种子齐备（拳的出牌、拆的格挡、通用自保），8 张基准规模。
export const BODY_STARTER_DECK = Object.freeze([
  'punch', 'punch', 'punch', 'punch',
  'duckHead', 'duckHead',
  'guard', 'guard',
]);
