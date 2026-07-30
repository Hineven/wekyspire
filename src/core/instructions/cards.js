import BattleInstruction from '../kernel/BattleInstruction.js';
import { moveCard } from '../state/battleState.js';

// 卡牌指令族。约定：牌库顶 = 数组 index 0。一切 zone 迁移走 moveCard（数组唯一事实源）。

// 抽牌：白名单 ['count']（PRE 可改抽牌数）。
// from: 'top'（默认）| 'bottom'（回旋斩"牌库末抽牌"类机制）。
// 牌库抽空时把弃牌堆洗回牌库（rng 可复现）。
export class DrawCardsInstruction extends BattleInstruction {
  constructor({ count = 1, from = 'top' }, opts = {}) {
    super(opts);
    this.count = count;
    this.from = from;
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
