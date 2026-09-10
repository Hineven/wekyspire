// headlessPlay：LLM 可玩的文本界面（replay 式会话）。
//
// 会话 = tmp/playtests/<名>.json { seed, actions: [] }。每次调用把全部动作确定性
// 重放一遍（战斗种子由 run 种子派生、奖励走 run rng，同种子同动作序列必同局），
// 新动作成功后才入档——中途战斗状态无需序列化。动作一律用「位置索引」寻址
// （手牌第 N 张 / 构筑第 N 张 / 候选第 N 个），不用 uniqueID（其含随机后缀）。
//
// 用法：
//   node tools/headlessPlay.mjs <会话名> new <种子>        # 建档
//   node tools/headlessPlay.mjs <会话名>                    # 看状态
//   node tools/headlessPlay.mjs <会话名> <动作...>          # 玩
//   node tools/headlessPlay.mjs <会话名> help               # 动作表
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import '../src/core/content/index.js';
import Player from '../src/core/state/player.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { BODY_STARTER_DECK } from '../src/core/content/bodySkills.js';
import { createNullPresenter, createRecordingPresenter } from '../src/core/presenter.js';
import { canUseSkill, makeSkillCtx, effectiveHandCount } from '../src/core/skills/helpers.js';
import { getSkillDefinition } from '../src/core/skills/registry.js';
import { listNamedTerms } from '../src/core/skills/namedTerms.js';
import { getEffectDefinition, allEffects } from '../src/core/effects/registry.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { gatedPromotionTargets } from '../src/core/run/promotion.js';
import { getAbilityDefinition } from '../src/core/abilities/registry.js';
import { getRelicDefinition } from '../src/core/relics/registry.js';
import { swapCostOf } from '../src/core/state/battleState.js';
import {
  startBattle, playerUseSkill, playerEndTurn, playerSwapCard, isBattleFinished, respondInput,
} from '../src/core/flow/battle.js';
import {
  createRun, enterBattle, createRunBattle, finishBattle, completeRewards, completeRoom, isBossFloor,
} from '../src/core/run/runFlow.js';
import {
  chooseSkillReward, chooseRewardPack, isRewardsClaimed, PACKS, maxRewardTier,
} from '../src/core/run/rewards.js';
import {
  chooseAscension, chooseAscensionAbility, chooseSeedCards, rerollSeedOffering,
  ASCENSION_PLACEHOLDER,
} from '../src/core/run/ascension.js';
import {
  trainingMode, upgradableCards, trainUpgrade, trainDrawChoices, trainDraw, skipTraining,
} from '../src/core/run/rooms/training.js';
import { campOptions, campRest, campRecoverRemi, campUpgrade } from '../src/core/run/rooms/camp.js';
import { playEvent } from '../src/core/run/rooms/event.js';
import { spinSlot, SLOT_PLACEHOLDER } from '../src/core/run/rooms/slotMachine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'tmp', 'playtests');
const HELP = `动作表（按当前阶段）：
  战斗: play <手牌#> [敌#] | swap <手牌#>（首次免费，之后费用逐次+1） | end | in <候选#...> | auto
  奖励: pack <#|体修|火|通用> | take <#> | skip | next
  房间: act rest | act remi | act upgrade <构筑#> | act up <构筑#> | act draw
        | act take <#> | act skipdraw | act skip | act spin | act play | next
  进阶: dim 火|跳过 | seed <#,#,#> | reroll | ability <#|skip>
  通用: state | deck | terms（词条/效果释义） | note <文本> | help`;

// ---------- 小工具 ----------
// 富文本 → 纯文本：/effect{x}|/named{x} 保留内文；/card{id} 解析为卡名（渲染层同款语义）
const plain = (s) => String(s ?? '')
  .replace(/\/card\{([^}]*)\}/g, (_, id) => getSkillDefinition(id)?.name ?? id)
  .replace(/\/(?:effect|named)\{([^}]*)\}/g, '$1');
const defOf = (rt) => getSkillDefinition(rt.defId);
const costText = (def) => {
  const c = def.cost ?? {};
  const parts = [];
  if (c.mana === 'X') parts.push('X魏启'); else if (c.mana) parts.push(`${c.mana}魏启`);
  if (c.actionPoint) parts.push(`${c.actionPoint}AP`);
  return parts.join(' ') || '0费';
};
const kwText = (def) => (def.keywords ?? [])
  .filter(k => k !== 'blade').map(k => ({
    exhaust: '消耗', transient: '短暂', innate: '固有', anchored: '锁定', slowStart: '缓启',
  }[k] ?? k)).join(' ');
const effectsText = (unit) => unit.effects?.length
  ? unit.effects.map(e => `${getEffectDefinition(e.effectId)?.name ?? e.effectId}${e.stacks}`).join(' ') : '';
const intentText = (u) => {
  const it = u.intention;
  if (!it) return '未知';
  const kind = (it.kinds ?? []).map(k => ({
    attack: '攻击', defend: '防御', buff: '强化', debuff: '削弱',
    summon: '召唤', unknown: '未知',
  }[k] ?? k)).join('+');
  const dmg = it.damage ? ` ${it.damage}${it.hits > 1 ? `×${it.hits}` : ''}` : '';
  return kind + dmg + (it.note ? `（${it.note}）` : '');
};
function cardLine(idx, rt, battleCtx) {
  const def = defOf(rt);
  // 咏唱卡前置「咏唱N·」标记（打出前可见——点燃/解除语义靠它）
  const nameTag = def.cardMode === 'chant' ? `咏唱${def.chantWeight ?? 2}·${def.name}` : def.name;
  const bits = [`[${idx}] ${nameTag} ${def.tier}阶 ${costText(def)}`];
  const kw = kwText(def); if (kw) bits.push(kw);
  if (rt.isActivated) bits.push('★已激活咏唱');
  else if (rt.remainingUses <= 0) bits.push(`冷却中(剩${rt.currentCooldown}拍)`);
  if (rt.power) bits.push(`威力${rt.power > 0 ? '+' : ''}${rt.power}`);
  let desc;
  try {
    desc = (battleCtx && def.battleDescribe)
      ? plain(def.battleDescribe(makeSkillCtx(battleCtx, rt)))
      : plain(def.describe());
  } catch { desc = plain(def.describe()); }
  bits.push(`「${desc}」`);
  if (battleCtx) bits.push(canUseSkill(battleCtx, rt) ? '可用' : '不可用');
  return bits.join(' | ');
}

// ---------- 会话状态机（replay 解释器） ----------
function freshState(seed) {
  const run = createRun({ seed, player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }) });
  run.player.deck = BODY_STARTER_DECK.map(id => createSkillRuntime(id));
  run.player.abilities = [];
  return { run, battle: null, lastOutcome: '', presenter: createRecordingPresenter() };
}

function ensureBattle(S) {
  if (S.run.gameStage === 'prep') enterBattle(S.run); // 免 fight：战斗动作直达
  if (S.run.gameStage !== 'battle') throw new Error(`当前不在战斗阶段（${stageCn(S.run.gameStage)}）`);
  if (!S.battle) {
    S.presenter.clear(); // 战斗日志按场清零
    S.battle = createRunBattle(S.run, { presenter: S.presenter });
    startBattle(S.battle);
    if (isBattleFinished(S.battle)) settleBattle(S);
  }
  return S.battle;
}

// 战斗结算日志（recording presenter → 中文行；取尾部 N 条）
function battleLogText(S, tail = 10) {
  const lines = [];
  for (const { method, args } of S.presenter?.calls ?? []) {
    const p = args?.[0] ?? {};
    switch (method) {
      case 'damage': {
        if ((p.dealt ?? 0) <= 0 && (p.shieldAbsorbed ?? 0) <= 0 && (p.defenseBlocked ?? 0) <= 0) break;
        const src = p.source?.name ?? (p.pierce ? '持续伤害' : '环境'); // 燃烧/中毒等无来源穿透伤
        lines.push(`${src} → ${p.target?.name}: ${p.dealt}伤`
          + `${p.pierce ? '（穿透）' : ''}${p.shieldAbsorbed ? `（盾挡${p.shieldAbsorbed}）` : ''}`
          + `${p.defenseBlocked ? `（防挡${p.defenseBlocked}）` : ''}`);
        break;
      }
      case 'heal': if ((p.healed ?? 0) > 0) lines.push(`${p.target?.name} 恢复 ${p.healed}`); break;
      case 'shield': if ((p.gained ?? 0) > 0) lines.push(`${p.target?.name} 护盾+${p.gained}`); break;
      case 'effect': {
        const name = getEffectDefinition(p.effectId)?.name ?? p.effectId;
        lines.push((p.stacks ?? 0) > 0 ? `${p.target?.name} 获得${name}${p.stacks}` : `${p.target?.name} ${name}消散`);
        break;
      }
      case 'unitDeath': lines.push(`${p.unit?.name} 被击败！`); break;
      case 'unitSpawned': lines.push(`${p.unit?.name} 现身！`); break;
      case 'cardTransformed':
        lines.push(`⚡卡牌变化: ${getSkillDefinition(p.fromDefId)?.name ?? p.fromDefId} → ${getSkillDefinition(p.toDefId)?.name ?? p.toDefId}`);
        break;
      case 'cardDiscarded': lines.push(`弃 ${p.card ? defOf(p.card).name : '?'}`); break;
      case 'cardBurnt': lines.push(`焚毁 ${p.card ? defOf(p.card).name : '?'}`); break;
      case 'cardAdded':
        lines.push(`洗入 ${p.card ? defOf(p.card).name : '?'}（${p.toZone === 'hand' ? '入手' : '入库'}）`);
        break;
      case 'cardMoved':
        lines.push(`${p.card ? defOf(p.card).name : '?'} → ${{ hand: '手牌', deck: '牌库', burnt: '焚毁区', pending: '结算区' }[p.toZone] ?? p.toZone}`);
        break;
      default: break; // 抽牌/展示/资源等由手牌与资源条直接可见，降噪省略
    }
  }
  return lines.slice(-tail);
}

// 手牌寻址：编号（1起）或卡名/卡名前缀（唯一命中才生效；同 defId 重复卡任取第一张）
function resolveHandIdx(hand, arg, what) {
  if (/^\d+$/.test(arg)) return idxOk(num(arg), hand.length, what);
  const matches = hand.filter(c => {
    const n = defOf(c).name;
    return n === arg || n.startsWith(arg);
  });
  if (!matches.length) throw new Error(`手牌中没有「${arg}」`);
  const defIds = new Set(matches.map(c => c.defId));
  if (defIds.size === 1) return hand.indexOf(matches[0]); // 同名重复卡等价，任打一张
  throw new Error(`「${arg}」匹配多张不同手牌（${matches.map(c => defOf(c).name).join(' / ')}），请用编号`);
}

function settleBattle(S) {
  const verdict = S.battle.ctx.kernel.verdict;
  finishBattle(S.run, verdict, S.battle);
  S.battle = null;
  if (verdict === 'victory') {
    S.lastOutcome = isBossFloor(S.run.floor)
      ? '⚔ Boss 击破！HP 回满，进入奖励'
      : `⚔ 战斗胜利！HP ${S.run.player.hp}/${S.run.player.maxHp}，进入奖励`;
  } else {
    S.lastOutcome = '💀 战斗失败……';
  }
}

const num = (s) => Number.parseInt(s, 10);
const idxOk = (n, len, what) => {
  if (!Number.isInteger(n) || n < 1 || n > len) throw new Error(`${what}编号越界：${n}（1..${len}）`);
  return n - 1;
};

// 升级门禁预检（gatedPromotionTargets 同源）：给出可读的拒绝理由
function upgradeGateError(run, card) {
  const targets = gatedPromotionTargets(run, defOf(card));
  if (targets.length) return null;
  return defOf(card).promotesTo
    ? `「${defOf(card).name}」的晋升目标等阶未解锁（卡包等级门禁），暂不可升级`
    : `「${defOf(card).name}」已是链尾，无可升级目标`;
}

// 老虎机/事件结果的中文呈现（内部 id → 名称）
function slotResultText(r) {
  switch (r.type) {
    case 'money': return `金币 +${r.money}`;
    case 'fruit': return `瑞米的水果 +1`;
    case 'training': return `训练次数 +1（等效一次训练）`;
    case 'card': return `获得卡牌：${getSkillDefinition(r.defId)?.name ?? r.defId}（已入构筑）`;
    case 'relic': return `获得遗物：${getRelicDefinition(r.relicId)?.name ?? r.relicId}`;
    default: return `空奖（nothing）`;
  }
}
function eventResultText(r) {
  if (r.eventId === 'moneyBag') return `「钱袋」金币 +${r.money}`;
  if (r.eventId === 'spring') return `「治愈泉」恢复 ${r.heal} 生命`;
  return JSON.stringify(r);
}

function exec(S, raw) {
  const t = raw.trim().split(/\s+/);
  const [cmd, a, b] = t;
  const run = S.run;
  const stage = run.gameStage;
  switch (cmd) {
    case 'note': S.lastOutcome = `记事: ${t.slice(1).join(' ')}`; return;
    case 'state': case 'deck': case 'terms': case 'help': S.lastOutcome = ''; return;

    // ---- 战斗 ----
    case 'fight':
      if (stage !== 'prep') throw new Error('只能在战前准备(frep/prep)阶段开战');
      enterBattle(run); ensureBattle(S);
      S.lastOutcome = '⚔ 战斗开始';
      return;
    case 'play': {
      const battle = ensureBattle(S);
      if (battle.battleState.pendingInput) throw new Error('有待应答的输入请求（先用 in <候选#...>）');
      const hand = battle.battleState.zones.hand;
      const skill = hand[resolveHandIdx(hand, String(a), '手牌')];
      const name = defOf(skill).name; // 先取名字：结算内斩等转化会就地改写 defId
      const target = b != null
        ? battle.battleState.enemies[idxOk(num(b), battle.battleState.enemies.length, '敌人')] : null;
      if (!playerUseSkill(battle, skill.uniqueID, target?.uniqueID ?? null)) throw new Error('无法打出（费用/条件不满足）');
      S.lastOutcome = `打出 ${name}`;
      if (isBattleFinished(battle)) settleBattle(S);
      return;
    }
    case 'swap': {
      const battle = ensureBattle(S);
      const hand = battle.battleState.zones.hand;
      if (!hand.length) throw new Error('手牌为空，无法换牌');
      const skill = hand[resolveHandIdx(hand, String(a), '手牌')];
      if (!playerSwapCard(battle, skill.uniqueID)) throw new Error('无法换牌（行动点不足？）');
      S.lastOutcome = `换牌 ${defOf(skill).name}`;
      return;
    }
    case 'end': {
      const battle = ensureBattle(S);
      if (!playerEndTurn(battle)) throw new Error('无法结束回合');
      S.lastOutcome = '结束回合';
      if (isBattleFinished(battle)) settleBattle(S);
      return;
    }
    case 'in': {
      const battle = ensureBattle(S);
      const pending = battle.battleState.pendingInput;
      if (!pending) throw new Error('当前没有输入请求');
      const { request } = pending;
      if (request.kind === 'confirm') { respondInput(battle, true); }
      else {
        const ids = t.slice(1).map(x => idxOk(num(x), request.candidates.length, '候选'));
        respondInput(battle, ids.map(i => request.candidates[i]));
      }
      S.lastOutcome = '已应答输入';
      if (isBattleFinished(battle)) settleBattle(S);
      return;
    }
    case 'auto': {
      if (stage === 'prep') { enterBattle(run); }
      const battle = ensureBattle(S);
      let steps = 0;
      while (!isBattleFinished(battle)) {
        if (++steps > 600) throw new Error('auto 战斗超步数，疑似卡死');
        const pi = battle.battleState.pendingInput;
        if (pi) {
          const r = pi.request;
          respondInput(battle, r.kind === 'confirm' ? true
            : (r.candidates ?? []).slice(0, Math.min(r.count ?? 1, (r.candidates ?? []).length)));
          continue;
        }
        const pick = battle.battleState.zones.hand.find(s => canUseSkill(battle.ctx, s));
        if (pick) playerUseSkill(battle, pick.uniqueID);
        else playerEndTurn(battle);
      }
      settleBattle(S);
      return;
    }

    // ---- 战后奖励 ----
    case 'pack': {
      if (stage !== 'reward') throw new Error('当前不在奖励阶段');
      const packs = run.rewards.packs;
      const PACK_ALIAS = { 体修: 'body', 火: 'fire', 火灵脉: 'fire', 通用: 'common' };
      const key = PACK_ALIAS[a] ?? a;
      const id = /^-?\d+$/.test(key ?? '')
        ? packs[idxOk(num(key), packs.length, '卡包')]
        : (packs.includes(key) ? key : (() => { throw new Error(`卡包不可选：${a}（${packs.join('/')}）`); })());
      chooseRewardPack(run, id);
      S.lastOutcome = `开包 ${PACKS[id]?.name ?? id}`;
      return;
    }
    case 'take': {
      if (stage !== 'reward') throw new Error('当前不在奖励阶段');
      const choices = run.rewards.skillChoices;
      const defId = choices[idxOk(num(a), choices.length, '候选')];
      chooseSkillReward(run, defId);
      S.lastOutcome = `获得卡牌：${getSkillDefinition(defId).name}`;
      return;
    }
    case 'skip':
      if (stage !== 'reward') throw new Error('当前不在奖励阶段');
      chooseSkillReward(run, null);
      S.lastOutcome = '跳过奖励';
      return;

    // ---- 奖励房 ----
    case 'act': {
      if (stage !== 'room') throw new Error('当前不在奖励房');
      if (S.roomDone) throw new Error('本房间动作已完成，用 next 离开');
      const room = run.currentRoom;
      if (room === 'camp') {
        if (a === 'rest') { campRest(run); S.roomDone = true; S.lastOutcome = '休整：恢复50%生命，魏启回满'; return; }
        if (a === 'remi') { campRecoverRemi(run); S.roomDone = true; S.lastOutcome = '找回瑞米'; return; }
        if (a === 'upgrade') {
          const card = run.player.deck[idxOk(num(b), run.player.deck.length, '构筑卡')];
          const gateErr = upgradeGateError(run, card);
          if (gateErr) throw new Error(gateErr);
          const before = defOf(card).name;
          campUpgrade(run, card.uniqueID);
          S.roomDone = true;
          S.lastOutcome = `营地升级：${before} → ${defOf(card).name}`;
          return;
        }
        throw new Error('营地动作：act rest | act remi | act upgrade <构筑#>');
      }
      if (room === 'training') {
        if (a === 'up') {
          const card = run.player.deck[idxOk(num(b), run.player.deck.length, '构筑卡')];
          const gateErr = upgradeGateError(run, card);
          if (gateErr) throw new Error(gateErr);
          const before = defOf(card).name;
          trainUpgrade(run, card.uniqueID);
          S.lastOutcome = `训练升级：${before} → ${defOf(card).name}（接下来强制三选一抓牌）`;
          return;
        }
        if (a === 'draw') { trainDrawChoices(run); S.lastOutcome = '训练抓牌候选已生成'; return; }
        if (a === 'take') {
          const choices = run.roomData?.drawChoices ?? [];
          const defId = choices[idxOk(num(b), choices.length, '抓牌候选')];
          trainDraw(run, defId);
          S.roomDone = true;
          S.lastOutcome = `训练抓牌：${getSkillDefinition(defId).name}`;
          return;
        }
        if (a === 'skipdraw') { trainDraw(run, null); S.roomDone = true; S.lastOutcome = '跳过训练抓牌'; return; }
        if (a === 'skip') { skipTraining(run); S.roomDone = true; S.lastOutcome = '跳过训练（计一次训练）'; return; }
        throw new Error('训练动作：act up <构筑#> | act draw | act take <#> | act skipdraw | act skip');
      }
      if (room === 'slot') {
        if (a === 'spin') {
          const r = spinSlot(run);
          S.lastOutcome = `老虎机(-${SLOT_PLACEHOLDER.spinCost}金币)：${slotResultText(r)}`;
          return;
        }
        throw new Error('老虎机动作：act spin（离开用 next）');
      }
      if (room === 'event') {
        if (a === 'play') {
          const r = playEvent(run);
          S.roomDone = true;
          S.lastOutcome = `事件：${eventResultText(r)}`;
          return;
        }
        throw new Error('事件动作：act play');
      }
      throw new Error(`未知房间类型：${room}`);
    }

    // ---- 进阶 ----
    case 'dim': {
      if (stage !== 'ascension') throw new Error('当前不在进阶事件');
      if (a === '跳过' || a === 'skip') { chooseAscension(run, null); S.lastOutcome = `跳过进阶（体修隐藏等级+1，恢复${ASCENSION_PLACEHOLDER.healAmount}点生命，魏启上限+1）`; }
      else if (a === '火' || a === 'fire') { chooseAscension(run, 'fire'); S.lastOutcome = `火灵脉 +1（恢复${ASCENSION_PLACEHOLDER.healAmount}点生命，魏启上限+1）`; }
      else throw new Error('dim 火 | dim 跳过');
      return;
    }
    case 'seed': {
      const off = run.cardOffering;
      if (!off) throw new Error('当前没有种子卡待选');
      const picks = (t.slice(1).join(',').split(',').filter(Boolean))
        .map(x => off.cards[idxOk(num(x), off.cards.length, '种子卡')]);
      if (picks.length !== 3) throw new Error('种子卡必须选 3 张：seed 1,4,7');
      chooseSeedCards(run, picks);
      S.lastOutcome = `种子入组：${picks.map(id => getSkillDefinition(id).name).join('、')}`;
      return;
    }
    case 'reroll':
      rerollSeedOffering(run);
      S.lastOutcome = '刷新种子候选';
      return;
    case 'ability': {
      const offer = run.ascensionOffer;
      if (!offer) throw new Error('当前没有能力候选');
      if (a === 'skip' || a === '跳过') chooseAscensionAbility(run, null);
      else {
        const id = offer[idxOk(num(a), offer.length, '能力')];
        chooseAscensionAbility(run, id);
        S.lastOutcome = `获得能力：${id}`;
      }
      return;
    }

    // ---- 阶段推进 ----
    case 'next':
      if (stage === 'reward') { completeRewards(run); S.roomDone = false; S.lastOutcome = '离开奖励'; return; }
      if (stage === 'room') {
        // 训练强绑尾款未领不允许离场（UI 契约：forced 状态只给三选一不给跳过）
        if (run.roomData?.forced) throw new Error('升级后的强绑抓牌必须领取：act take <#>');
        completeRoom(run); S.roomDone = false; S.lastOutcome = '离开房间'; return;
      }
      throw new Error(`当前阶段无需 next（${stageCn(stage)}）`);
    default:
      throw new Error(`未知动作：${cmd}（help 查看动作表）`);
  }
}

const stageCn = (s) => ({
  prep: '战前准备', battle: '战斗', reward: '战后奖励', room: '奖励房',
  ascension: '进阶事件', end: '终局',
}[s] ?? s);

// ---------- 状态渲染 ----------
function render(S) {
  const run = S.run;
  const p = run.player;
  const L = [];
  const head = `【魏启尖塔 · headless】第 ${run.floor}/${run.totalFloors} 层 · ${stageCn(run.gameStage)}`
    + (run.result ? `（${run.result === 'victory' ? '登顶成功' : '战败'}）` : '');
  L.push(`═══ ${head} ═══`);
  L.push(`玩家: HP ${p.hp}/${p.maxHp} 护盾${p.shield} 魏启 ${p.mana}/${p.maxMana} AP ${p.actionPoints}/${p.maxActionPoints} 金币 ${p.money} | 灵脉 火${p.leino.fire} 体修${p.bodyLevel ?? 0} | 训练 ${p.trainingCount} 进阶 ${p.ascensionCount}/${ASCENSION_PLACEHOLDER.maxAscensions}`);
  if (p.effects?.length) L.push(`玩家效果: ${effectsText(p)}`);
  if (p.abilities.length) L.push(`能力: ${p.abilities.join(' ')}`);
  if (p.equippedRelics?.length) L.push(`装备遗物: ${p.equippedRelics.map(id => getRelicDefinition(id)?.name ?? id).join(' ')}`);

  const stage = run.gameStage;
  if (stage === 'battle' && S.battle) {
    const bs = S.battle.battleState;
    L.push(`〔回合 ${bs.turn.count}〕敌人:`);
    bs.enemies.forEach((e, i) => {
      if (e.isDead()) { L.push(`  [${i + 1}] ${e.name} ✝`); return; }
      L.push(`  [${i + 1}] ${e.name} HP ${e.hp}/${e.maxHp}${e.shield ? ` 护盾${e.shield}` : ''}${effectsText(e) ? ` 效果:${effectsText(e)}` : ''} 意图: ${intentText(e)}`);
    });
    for (const al of bs.allies) {
      if (al.isDead()) continue;
      L.push(`瑞米: HP ${al.hp}/${al.maxHp} 意图: ${intentText(al)}`);
    }
    L.push(`牌库 ${bs.zones.deck.length} | 焚毁 ${bs.zones.burnt.length} | 手牌 ${effectiveHandCount(bs)}/${p.maxHandSize}（加权）`);
    L.push(`手牌:`);
    bs.zones.hand.forEach((c, i) => L.push('  ' + cardLine(i + 1, c, S.battle.ctx)));
    L.push(`本回合累计: 打${bs.history.turn.played} 弃${bs.history.turn.discarded} 抽${bs.history.turn.drawn}`);
    const pi = bs.pendingInput?.request;
    if (pi) {
      L.push(`▶ 待输入: ${pi.prompt ?? pi.kind}${pi.count ? `（选${pi.count}张）` : ''}`);
      if (pi.candidates?.length) {
        L.push('  候选: ' + pi.candidates.map((id, i) => {
          const c = bs.zones.hand.find(h => h.uniqueID === id);
          return `[${i + 1}] ${c ? defOf(c).name : id}`;
        }).join(' '));
      }
    }
    L.push(`→ play <手牌#或卡名> [敌#] / swap <#或卡名>（弃1抽1，费${swapCostOf(bs)}AP） / end / in <候选#...>`);
    const log = battleLogText(S);
    if (log.length) {
      L.push(`最近结算:`);
      for (const l of log) L.push(`  · ${l}`);
    }
  } else if (stage === 'reward' && run.rewards) {
    const rw = run.rewards;
    L.push(`金币 +${rw.money}`);
    if (!rw.packId) {
      L.push(`可选卡包:`);
      rw.packs.forEach((id, i) => L.push(`  [${i + 1}] ${PACKS[id]?.name ?? id}（等级上限 ${maxRewardTier(run, id)}）`));
      L.push(`→ pack <#>`);
    } else {
      L.push(`已开 ${PACKS[rw.packId]?.name ?? rw.packId}，候选:`);
      rw.skillChoices.forEach((id, i) => {
        const def = getSkillDefinition(id);
        const nameTag = def.cardMode === 'chant' ? `咏唱${def.chantWeight ?? 2}·${def.name}` : def.name;
        L.push(`  [${i + 1}] ${nameTag} ${def.tier}阶 ${costText(def)} ${kwText(def)}「${plain(def.describe())}」`);
      });
      L.push(`→ take <#> / skip`);
    }
  } else if (stage === 'room') {
    const room = run.currentRoom;
    if (S.roomDone) {
      L.push(`（房间动作已完成 → next 离开）`);
    } else if (room === 'camp') {
      const optCn = { recoverRemi: '找回瑞米(remi)', rest: '休整(rest)', upgrade: '升级(upgrade)' };
      L.push(`营地。可用: ${campOptions(run).map(o => optCn[o] ?? o).join(' / ')}（act rest | act remi | act upgrade <构筑#>，之后 next）`);
    } else if (room === 'training') {
      L.push(`训练场（累计训练 ${run.player.trainingCount} 次）。模式: ${trainingMode(run) === 'upgrade' ? '先升后抓' : '退化抓牌'}`);
      if (run.roomData?.drawChoices) {
        L.push(`抓牌候选:`);
        run.roomData.drawChoices.forEach((id, i) => {
          const def = getSkillDefinition(id);
          const nameTag = def.cardMode === 'chant' ? `咏唱${def.chantWeight ?? 2}·${def.name}` : def.name;
          L.push(`  [${i + 1}] ${nameTag} ${def.tier}阶 ${costText(def)} ${kwText(def)}「${plain(def.describe())}」${run.roomData.forced ? '' : '（可跳过）'}`);
        });
        L.push(`→ act take <#>${run.roomData.forced ? '（升级强绑，不可跳过）' : ' / act skipdraw'}`);
      } else if (trainingMode(run) === 'upgrade') {
        const deckIdx = (rt) => `[${run.player.deck.indexOf(rt) + 1}]`;
        L.push(`可升级卡: ${upgradableCards(run).map(rt => `${deckIdx(rt)}${defOf(rt).name}`).join(' ')}`);
        L.push(`→ act up <构筑#>（编号即 deck 视图行号）/ act skip`);
      } else {
        L.push(`→ act draw（看候选）/ act skip`);
      }
    } else if (room === 'slot') {
      L.push(`老虎机：${SLOT_PLACEHOLDER.spinCost}金币/次，现有 ${p.money} 金币 → act spin（可多次）/ next 离开`);
    } else if (room === 'event') {
      L.push(`事件房 → act play 触发事件`);
    }
  } else if (stage === 'ascension') {
    L.push(`→ dim 火 | dim 跳过`);
    if (run.cardOffering) {
      const off = run.cardOffering;
      L.push(`种子九选三（选3张入组，刷新剩 ${off.rerollsLeft}）:`);
      off.cards.forEach((id, i) => {
        const def = getSkillDefinition(id);
        L.push(`  [${i + 1}] ${def.cardMode === 'chant' ? `咏唱${def.chantWeight ?? 2}·` : ''}${def.name} ${def.tier}阶 ${costText(def)} ${kwText(def)}「${plain(def.describe())}」`);
      });
      L.push(`→ seed <#,#,#> / reroll`);
    }
    if (run.ascensionOffer) {
      L.push(`能力候选:`);
      run.ascensionOffer.forEach((id, i) => {
        const def = getAbilityDefinition(id);
        L.push(`  [${i + 1}] ${def?.name ?? id}「${plain(def?.describe?.() ?? '')}」`);
      });
      L.push(`→ ability <#|skip>`);
    }
  } else if (stage === 'prep') {
    L.push(`本层遭遇: ${run.encounter.map(e => {
      const def = getEnemyDefinition(e.defId);
      return `${def?.name ?? e.defId}(${e.maxHp}血)`;
    }).join(' + ')}`);
    L.push(`→ fight 开战 / deck 看牌组`);
  } else if (stage === 'end') {
    L.push(`本局结束：${run.result === 'victory' ? '登顶成功' : '战败'}。感谢游玩！`);
  }
  if ((stage === 'reward' || stage === 'end') && S.presenter?.calls?.length) {
    const log = battleLogText(S);
    if (log.length) {
      L.push('上场战斗尾档（死因/击杀回放）:');
      for (const l of log) L.push(`  · ${l}`);
    }
  }
  if (S.lastOutcome) L.push(`⟐ ${S.lastOutcome}`);
  return L.join('\n');
}

function renderDeck(S) {
  // 战斗中看战斗牌区（牌库顶在前，可见冷却/激活）；平时看构筑（升级用编号）
  if (S.battle && S.run.gameStage === 'battle') {
    const z = S.battle.battleState.zones;
    const L = [`战斗牌区：手牌 ${z.hand.length} | 牌库 ${z.deck.length}（顶在前）| 焚毁 ${z.burnt.length} | 结算区 ${z.pending.length}`];
    L.push('牌库:');
    z.deck.forEach((c, i) => L.push('  ' + cardLine(i + 1, c, null)));
    if (z.burnt.length) {
      L.push('焚毁区:');
      z.burnt.forEach((c, i) => L.push(`  [${i + 1}] ${defOf(c).name}`));
    }
    return L.join('\n');
  }
  const L = [`构筑牌组（${S.run.player.deck.length} 张，升级用编号）:`];
  S.run.player.deck.forEach((rt, i) => {
    const def = defOf(rt);
    const targets = gatedPromotionTargets(S.run, def);
    const next = targets[0];
    const promo = next
      ? ` →${getSkillDefinition(next).name}`
      : (Array.isArray(def.promotesTo) ? def.promotesTo[0] : def.promotesTo)
        ? ' →（等阶未解锁）' : '';
    L.push(`  [${i + 1}] ${def.name} ${def.tier}阶${promo}`);
  });
  return L.join('\n');
}

function renderTerms() {
  const L = ['【词条表】（卡面关键词的完整释义，等同游戏内悬浮说明）'];
  for (const { name, text } of listNamedTerms()) L.push(`  ${name} — ${text}`);
  L.push('【效果表】（状态栏图标释义）');
  for (const def of allEffects()) {
    L.push(`  ${def.name}（${def.type === 'buff' ? '增益' : '减益'}） — ${def.description}`);
  }
  return L.join('\n');
}

// ---------- 调试：PLAYTRACE=<defId> 重放时逐动作打印该卡去向（排查报告用） ----------
const TRACE = process.env.PLAYTRACE ?? null;
function traceLine(S, action) {
  const bs = S.battle?.battleState;
  const where = [];
  if (bs) {
    for (const z of ['hand', 'deck', 'burnt', 'pending']) {
      const n = bs.zones[z].filter(c => c.defId === TRACE).length;
      if (n) where.push(`${z}×${n}${z === 'hand' && bs.zones.hand.some(c => c.defId === TRACE && c.isActivated) ? '★' : ''}`);
    }
  }
  const p = S.run.player;
  console.error(`[trace] ${action} | 层${S.run.floor} ${stageCn(S.run.gameStage)} 回合${bs?.turn.count ?? '-'}`
    + ` | HP${p.hp}/${p.maxHp} 盾${p.shield} 燃烧${p.getEffectStacks('burn')} | ${where.join(' ') || '场上无'}`
    + ` | 构筑×${S.run.player.deck.filter(c => c.defId === TRACE).length}`);
}

// ---------- 入口 ----------
const [, , sessionName, ...argv] = process.argv;
if (!sessionName || sessionName === 'help') { console.log(HELP); process.exit(0); }
fs.mkdirSync(DIR, { recursive: true });
const file = path.join(DIR, `${sessionName}.json`);

if (argv[0] === 'new') {
  const seed = Number.parseInt(argv[1] ?? '', 10);
  if (!Number.isInteger(seed)) { console.error('用法: new <种子数字>'); process.exit(1); }
  if (fs.existsSync(file)) { console.error(`会话已存在：${file}`); process.exit(1); }
  fs.writeFileSync(file, JSON.stringify({ seed, actions: [] }, null, 2));
  console.log(`已建档 ${sessionName}（种子 ${seed}）`);
  process.exit(0);
}
if (!fs.existsSync(file)) { console.error(`会话不存在：${file}（先 new）`); process.exit(1); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const action = argv.join(' ').trim();
const readOnly = !action || action === 'state' || action === 'help' || action === 'terms';

let S;
try {
  S = freshState(data.seed);
  for (const a of data.actions) { exec(S, a); if (TRACE) traceLine(S, a); }
  if (!readOnly) exec(S, action);
} catch (err) {
  console.error(`✗ ${err.message}`);
  console.error('（动作未入档，状态未变）当前状态：');
  try { console.log(render(S)); } catch { /* 状态本身异常时保持纯报错 */ }
  process.exit(1);
}
if (!readOnly) {
  data.actions.push(action);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
if (action === 'help') console.log(HELP);
else if (action === 'deck') console.log(renderDeck(S));
else if (action === 'terms') console.log(renderTerms());
else console.log(render(S));
