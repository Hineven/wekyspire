// 通用单卡（COMMON_CARDS.md：所有体系共享的灰色单卡，看作体修体系）。
// 两组语言：
//   汲取 = 魏启获取（纳气存气 + 护盾/AP 代价），跨战斗资源引擎的战斗内表达；
//   激发 = 魏启 → AP 的即时转换（AP 获取不受上限截断，爆发蓄能语义）。
// 魏启罐系列无费用无冷却，纯消耗品（纳气 N，打出即焚）。
// §2 散卡：杂技（下一张进入牌库的卡抽回手牌）。

import { registerSkill } from '../skills/registry.js';
import { zoneOf } from '../state/battleState.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { GainShieldInstruction } from '../instructions/combat.js';
import { GainActionPointsInstruction } from '../instructions/resources.js';
import {
  AddCardInstruction, DiscardCardInstruction, MoveCardInstruction,
} from '../instructions/cards.js';
import { UseSkillInstruction } from '../instructions/skill.js';

// ---- 汲取·纯化线（MP 换纳气 + 护盾）----

// 纯化（汲取 D）：1MP，冷却1：纳气2，3护盾。
registerSkill({
  id: 'purify', name: '纯化', type: 'normal', pack: 'common', tier: 'D',
  cost: { mana: 1, actionPoint: 0 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal',
  promotesTo: 'deepPurify',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks: 2 }));
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 3 }));
    return true;
  },
  describe: () => '/effect{纳气}2，3护盾',
});

// 深度纯化（汲取 C）：1MP，冷却1：纳气2，7护盾。
registerSkill({
  id: 'deepPurify', name: '深度纯化', type: 'normal', pack: 'common', tier: 'C',
  cost: { mana: 1, actionPoint: 0 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks: 2 }));
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 7 }));
    return true;
  },
  describe: () => '/effect{纳气}2，7护盾',
});

// 萃取（汲取 C）：3MP，冷却1：纳气4，12护盾。
registerSkill({
  id: 'extract', name: '萃取', type: 'normal', pack: 'common', tier: 'C',
  cost: { mana: 3, actionPoint: 0 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal',
  promotesTo: 'deepExtract',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks: 4 }));
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 12 }));
    return true;
  },
  describe: () => '/effect{纳气}4，12护盾',
});

// 深度萃取（汲取 B）：3MP，冷却1：纳气5，17护盾。
registerSkill({
  id: 'deepExtract', name: '深度萃取', type: 'normal', pack: 'common', tier: 'B',
  cost: { mana: 3, actionPoint: 0 },
  charges: { max: 1, cooldownTurns: 1 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks: 5 }));
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 17 }));
    return true;
  },
  describe: () => '/effect{纳气}5，17护盾',
});

// ---- 汲取·汲取线（AP 换纳气，长冷却）----

// 汲取（C）：1AP，冷却3：纳气2。
registerSkill({
  id: 'drawQi', name: '汲取', type: 'normal', pack: 'common', tier: 'C',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 3 },
  cardMode: 'normal',
  promotesTo: 'squeezeQi',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks: 2 }));
    return true;
  },
  describe: () => '/effect{纳气}2',
});

// 压榨（B）：1AP，冷却3：纳气3。
registerSkill({
  id: 'squeezeQi', name: '压榨', type: 'normal', pack: 'common', tier: 'B',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 3 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks: 3 }));
    return true;
  },
  describe: () => '/effect{纳气}3',
});

// ---- 魏启罐系列（无费用消耗品：纳气 N）----

const manaJar = (id, name, tier, stacks) => registerSkill({
  id, name, type: 'normal', pack: 'common', tier,
  cost: { mana: 0, actionPoint: 0 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new AddEffectInstruction({ target: sctx.player, effectId: 'naqi', stacks }));
    return true;
  },
  describe: () => `/effect{纳气}${stacks}`,
});
manaJar('manaJar', '魏启罐', 'D', 1);
manaJar('manaJarPlus', '高级魏启罐', 'C', 2);
manaJar('manaJarUltra', '极品魏启罐', 'B', 3);
manaJar('manaJarRoyal', '冉牌魏启罐', 'A', 5);
manaJar('manaJarLegend', '何猥魏启罐', 'S', 12);

// ---- 激发系列（魏启 → AP 即时转换，消耗）----

const stimulant = (id, name, tier, mana, ap) => registerSkill({
  id, name, type: 'normal', pack: 'common', tier,
  cost: { mana, actionPoint: 0 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new GainActionPointsInstruction({ amount: ap }));
    return true;
  },
  describe: () => `获得${ap}行动点`,
});
stimulant('stimulant', '激发', 'C', 2, 2);
stimulant('burstStimulant', '爆发', 'B', 2, 4);
stimulant('fullStimulant', '充分激发', 'B', 1, 2);

// ---- §2 散卡 ----

// 杂技（A，1AP）：下一张进入牌库的卡抽回手牌。
// 「进入牌库」覆盖三条主要路径：打出的卡收尾回库（UseSkill POST）、弃牌回库
// （DiscardCard POST）、造牌/移动回库（AddCard / MoveCard POST）。登记一组监听，
// 首次命中即把该卡从牌库移入手牌，并注销其余监听（owner 统一，命中后清干净）。
// 排除自身：杂技收尾同样回库，不能把自己捞回来。
registerSkill({
  id: 'acrobatics', name: '杂技', type: 'normal', pack: 'common', tier: 'A',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal', targetMode: 'none',
  use(sctx) {
    const owner = `acrobatics:${sctx.self.uniqueID}`;
    let pulled = false;
    const pull = (card, ctx, parent) => {
      if (pulled || !card || card.uniqueID === sctx.self.uniqueID) return;
      if (zoneOf(ctx.battleState, card.uniqueID) !== 'deck') return;
      pulled = true;
      ctx.kernel.submitInstruction(
        new MoveCardInstruction({ uniqueID: card.uniqueID, toZone: 'hand' }), parent);
      ctx.kernel.removeSubscriptionsByOwner(owner);
    };
    const watchers = [
      [UseSkillInstruction, (instr) => instr.skill],
      [DiscardCardInstruction, (instr) => instr.result?.card],
      [AddCardInstruction, (instr) => instr.result?.card],
      [MoveCardInstruction, (instr) => (instr.result?.toZone === 'deck' ? instr.result?.card : null)],
    ];
    for (const [when, pick] of watchers) {
      sctx.kernel.addSubscription({
        when, phase: 'post', owner,
        react: (instr, ctx) => pull(pick(instr), ctx, instr),
      });
    }
    return true;
  },
  describe: () => '下一张进入牌库的卡抽回手牌',
});
