import BattleInstruction from '../kernel/BattleInstruction.js';
import { moveCard, swapCostOf, zoneOf } from '../state/battleState.js';
import { createSkillRuntime } from '../state/skillRuntime.js';
import { enterBattle, leaveBattle } from '../skills/helpers.js';
import { ConsumeActionPointsInstruction } from './resources.js';

// 卡牌指令族。约定：牌库顶 = 数组 index 0。一切 zone 迁移走 moveCard（数组唯一事实源）。

// 抽牌：白名单 ['count']（PRE 可改抽牌数）。
// from: 'top'（默认）| 'bottom'（回旋斩"牌库末抽牌"类机制）。
// reason: 抽牌缘由标记（'turnStart' = 回合开始抽牌），供 filter 区分
// "回合开始抽牌数修正"（龟守/神龟姿态）与技能抽牌。
// 牌库抽空时把弃牌堆洗回牌库（rng 可复现）。
export class DrawCardsInstruction extends BattleInstruction {
  constructor({ count = 1, from = 'top', reason = null }, opts = {}) {
    super(opts);
    this.count = count;
    this.from = from;
    this.reason = reason;
  }

  get modifiablePayload() { return ['count']; }

  buildPayload() { this.payload.count = this.count; }

  execute(ctx) {
    const { zones, rng } = ctx.battleState;
    const drawn = [];
    for (let i = 0; i < this.payload.count; i++) {
      if (zones.deck.length === 0) {
        if (zones.discard.length === 0) break;
        zones.deck = rng.shuffle(zones.discard);
        zones.discard = [];
      }
      const card = this.from === 'bottom' ? zones.deck.pop() : zones.deck.shift();
      zones.hand.push(card);
      drawn.push(card);
    }
    this.result = { drawn };

    ctx.battleState.history.turn.drawn += drawn.length;
    ctx.battleState.history.battle.drawn += drawn.length;
    ctx.presenter?.cardDrawn?.({ cards: drawn, from: this.from });
    return true;
  }
}

// 焚牌：任意 zone → 焚毁区。
export class BurnCardInstruction extends BattleInstruction {
  constructor({ uniqueID }, opts = {}) {
    super(opts);
    this.uniqueID = uniqueID;
  }

  execute(ctx) {
    const card = moveCard(ctx.battleState, this.uniqueID, 'burnt');
    this.result = { card };
    ctx.battleState.history.turn.burnt += 1;
    ctx.battleState.history.battle.burnt += 1;
    ctx.presenter?.cardBurnt?.({ card });
    return true;
  }
}

// 弃牌：手牌 → 弃牌堆。index 语义在手牌有序数组上（刀背打击"右手边"等由调用方算好 uniqueID）。
export class DiscardCardInstruction extends BattleInstruction {
  constructor({ uniqueID }, opts = {}) {
    super(opts);
    this.uniqueID = uniqueID;
  }

  execute(ctx) {
    const card = moveCard(ctx.battleState, this.uniqueID, 'discard');
    this.result = { card };
    ctx.battleState.history.turn.discarded += 1;
    ctx.battleState.history.battle.discarded += 1;
    ctx.presenter?.cardDiscarded?.({ card });
    return true;
  }
}

// 移牌：任意 zone → 任意 zone（可选落点 index）。牌库检索抽取（完美飞刀）、
// 回合结束自动回库（开刃/斩灭）、手牌自由换序（刃心）等统一走这里，保证有 PRE/POST 与播报。
export class MoveCardInstruction extends BattleInstruction {
  constructor({ uniqueID, toZone, index = null }, opts = {}) {
    super(opts);
    this.uniqueID = uniqueID;
    this.toZone = toZone;
    this.index = index;
  }

  execute(ctx) {
    const card = moveCard(ctx.battleState, this.uniqueID, this.toZone, { index: this.index });
    this.result = { card, toZone: this.toZone };
    ctx.presenter?.cardMoved?.({ card, toZone: this.toZone });
    return true;
  }
}

// 造牌：战斗中创建新卡入场（真空斩/假动作插虚无、一瞬千击增值牌库等）。
// index: null=末尾 | 数字 | 'random'（走种子 rng，可复现）。
export class AddCardInstruction extends BattleInstruction {
  constructor({ defId, overrides = {}, toZone = 'deck', index = null }, opts = {}) {
    super(opts);
    this.defId = defId;
    this.overrides = overrides;
    this.toZone = toZone;
    this.index = index;
  }

  execute(ctx) {
    const card = createSkillRuntime(this.defId, this.overrides);
    const arr = this.toZone === 'chantSlot'
      ? ctx.battleState.chant.slots
      : ctx.battleState.zones[this.toZone];
    let at = this.index;
    if (at === 'random') at = ctx.battleState.rng.int(0, arr.length);
    if (at === null) arr.push(card);
    else arr.splice(at, 0, card);
    enterBattle(ctx, card); // 新卡走"进入战斗"元语：充能初始化 + 常驻订阅注册
    this.result = { card, index: at ?? arr.length - 1 };
    ctx.presenter?.cardAdded?.({ card, toZone: this.toZone, index: this.result.index });
    return true;
  }
}

// 换牌：玩家流程动作（非技能卡）。费用（swapCostOf，走资源指令子节点 → PRE 可修饰）
// → 弃牌 → 抽 1（reason:'swap'，不受龟守等回合抽牌修正影响）→ swapCount+1。
export class SwapCardInstruction extends BattleInstruction {
  constructor({ uniqueID }, opts = {}) {
    super(opts);
    this.uniqueID = uniqueID;
  }

  execute(ctx) {
    switch (this._stage) {
      case 0: {
        this.cost = swapCostOf(ctx.battleState);
        if (this.cost > 0) {
          ctx.kernel.submitInstruction(new ConsumeActionPointsInstruction({ amount: this.cost }), this);
        }
        return false;
      }
      case 1:
        ctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: this.uniqueID }), this);
        ctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 1, reason: 'swap' }), this);
        return false;
      default:
        ctx.battleState.swapCount += 1;
        this.result = { cost: this.cost };
        ctx.presenter?.cardSwapped?.({ uniqueID: this.uniqueID, cost: this.cost });
        return true;
    }
  }
}

// 转化：原地换绑 defId——uniqueID、zone、位置、power 全部延续（与焚+造的本质区别）。
// 白名单 ['toDefId']：PRE 可改写转化结果（"转化升阶"类能力）。
// 换绑走 leaveBattle → enterBattle：旧 def 订阅（常驻 + activated）注销，新 def 订阅注册，
// 充能按新 def 重置；keepPower: false 时顺带清空强化偏移。
export class TransformCardInstruction extends BattleInstruction {
  constructor({ uniqueID, toDefId, keepPower = true }, opts = {}) {
    super(opts);
    this.uniqueID = uniqueID;
    this.toDefId = toDefId;
    this.keepPower = keepPower;
  }

  get modifiablePayload() { return ['toDefId']; }

  buildPayload() { this.payload.toDefId = this.toDefId; }

  execute(ctx) {
    const zone = zoneOf(ctx.battleState, this.uniqueID);
    if (!zone) throw new Error(`卡牌 ${this.uniqueID} 不在任何 zone，无法转化`);
    const arr = zone === 'chantSlot' ? ctx.battleState.chant.slots : ctx.battleState.zones[zone];
    const card = arr.find(c => c.uniqueID === this.uniqueID);

    const fromDefId = card.defId;
    leaveBattle(ctx, this.uniqueID);
    card.defId = this.payload.toDefId;
    if (!this.keepPower) card.power = 0;
    enterBattle(ctx, card);

    this.result = { card, fromDefId, toDefId: card.defId };
    ctx.presenter?.cardTransformed?.({ card, fromDefId, toDefId: card.defId });
    return true;
  }
}
