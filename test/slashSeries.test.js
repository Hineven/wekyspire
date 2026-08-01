import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { BattleDriver } from '../src/core/sdk/driver.js';
import Enemy from '../src/core/state/enemy.js';
import { registerSkill } from '../src/core/skills/registry.js';
import { registerEffect } from '../src/core/effects/registry.js';
import { zoneOf, moveCard, handNeighbors, firstAliveEnemy } from '../src/core/state/battleState.js';
import { DrawCardsInstruction, DiscardCardInstruction, MoveCardInstruction } from '../src/core/instructions/cards.js';
import { DealDamageInstruction, GainShieldInstruction } from '../src/core/instructions/combat.js';
import { AddEffectInstruction } from '../src/core/instructions/effects.js';
import { GainActionPointsInstruction } from '../src/core/instructions/resources.js';
import { PlayerTurnEndInstruction } from '../src/core/instructions/turn.js';

// ---- 刀组合收尾 + 超越/藏锋（滞气）原型 ----
// 语义对齐旧仓库（tag pre-rewrite-archive）：
//   滞气 = debuff，无法抽牌（含回合开始抽牌与技能抽牌），玩家回合结束层数 -1。
//   藏锋 = 高伤 + 等量护盾 + 滞气；超越 = 0 费回 AP + 滞气（锁当回合后续抽牌）。

// 滞气：无法抽牌；玩家回合结束层数 -1
registerEffect({
  id: 'stall', type: 'debuff', stacking: 'count',
  subscriptions: (unit) => [
    {
      when: DrawCardsInstruction, phase: 'pre',
      react: (instr, ctx) => ctx.kernel.veto(instr, 'stall'),
    },
    {
      when: PlayerTurnEndInstruction, phase: 'post',
      react: (instr, ctx) => ctx.kernel.submitInstruction(
        new AddEffectInstruction({ target: unit, effectId: 'stall', stacks: -1 }), instr),
    },
  ],
});

// 收刃（藏锋系列）：20 伤 + 20 护盾 + 2 层滞气（消耗性）
registerSkill({
  id: 'storeEdge', name: '收刃',
  cost: { mana: 0, actionPoint: 2 },
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 20,
    }));
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount: 20 }));
    sctx.kernel.submitInstruction(new AddEffectInstruction({
      target: sctx.player, effectId: 'stall', stacks: 2,
    }));
    return true;
  },
});

// 肾上腺素激增（超越系列）：0 费 +1 AP + 1 层滞气（消耗性）
registerSkill({
  id: 'adrenaline', name: '肾上腺素激增',
  cost: { mana: 0, actionPoint: 0 },
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new GainActionPointsInstruction({ amount: 1 }));
    sctx.kernel.submitInstruction(new AddEffectInstruction({
      target: sctx.player, effectId: 'stall', stacks: 1,
    }));
    return true;
  },
});

// 刀背打击：12 伤，然后丢最右手牌（跳过自身）
registerSkill({
  id: 'knifeBack', name: '刀背打击',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 12,
    }));
    const hand = sctx.battleState.zones.hand;
    for (let i = hand.length - 1; i >= 0; i--) {
      if (hand[i].uniqueID !== sctx.self.uniqueID) {
        sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: hand[i].uniqueID }));
        break;
      }
    }
    return true;
  },
});

// 回旋飞刀：27 伤，弃两侧牌，然后抽牌补进两侧空位（以自身为锚点）
registerSkill({
  id: 'whirlingDagger', name: '回旋飞刀',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  use(sctx, stage) {
    if (stage === 0) {
      sctx.kernel.submitInstruction(new DealDamageInstruction({
        source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 27,
      }));
      const { left, right } = handNeighbors(sctx.battleState, sctx.self.uniqueID);
      sctx.self._slots = [left && 'before', right && 'after'].filter(Boolean);
      for (const card of [left, right]) {
        if (card) sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: card.uniqueID }));
      }
      if (sctx.self._slots.length) {
        sctx.self._draw = new DrawCardsInstruction({ count: sctx.self._slots.length });
        sctx.kernel.submitInstruction(sctx.self._draw);
      }
      return false;
    }
    // 弃牌后自身索引即锚点；按槽位顺序把抽到的牌移到 before/after
    const drawn = sctx.self._draw?.result?.drawn ?? [];
    const hand = sctx.battleState.zones.hand;
    const selfIdx = hand.findIndex(c => c.uniqueID === sctx.self.uniqueID);
    drawn.forEach((card, k) => {
      // 'before' 落在 selfIdx；'after' 落在 selfIdx + 1 + 之前已插入的 before 数
      const beforeCount = sctx.self._slots.slice(0, k).filter(s => s === 'before').length;
      const index = sctx.self._slots[k] === 'before' ? selfIdx : selfIdx + 1 + beforeCount;
      sctx.kernel.submitInstruction(
        new MoveCardInstruction({ uniqueID: card.uniqueID, toZone: 'hand', index }));
    });
    sctx.self._slots = null;
    sctx.self._draw = null;
    return true;
  },
});

const bigSlime = () => new Enemy({ defId: 'slime', name: '史莱姆', maxHp: 200 });

// 洗牌不定起手：把指定牌挪进手牌并放到指定位置（测试布置）
function placeAt(d, defId, index) {
  const deck = d.state.zones.deck.find(c => c.defId === defId);
  if (deck) moveCard(d.state, deck.uniqueID, 'hand');
  const hand = d.state.zones.hand;
  const i = hand.findIndex(c => c.defId === defId);
  const [card] = hand.splice(i, 1);
  hand.splice(index, 0, card);
  return card;
}

describe('滞气：抽牌锁', () => {
  it('收刃：高伤+护盾+2 层滞气；次回合开始抽牌被 veto，两回合后恢复', () => {
    const d = new BattleDriver({
      deck: ['storeEdge', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: [bigSlime()], seed: 5, config: { initialDraw: 4, drawPerTurn: 3 },
    });
    const slime = d.state.enemies[0];
    d.start();
    placeAt(d, 'storeEdge', 0);

    d.play('storeEdge');
    expect(slime.hp).toBe(200 - 20);
    expect(d.player.shield).toBe(20);
    expect(d.player.getEffectStacks('stall')).toBe(2);

    d.endTurn(); // 滞气 2 → 1
    const handAfterT1 = d.state.zones.hand.length;
    expect(d.player.getEffectStacks('stall')).toBe(1);

    // 回合 2 开始：抽牌被 veto（cardDrawn 未播报，手牌不变）
    const drawnCalls = d.calls('cardDrawn').length;
    expect(d.state.zones.hand).toHaveLength(handAfterT1);
    expect(d.calls('cardDrawn')).toHaveLength(drawnCalls);

    d.endTurn(); // 滞气 1 → 0
    expect(d.player.getEffectStacks('stall')).toBe(0);
    expect(d.player.getEffect('stall')).toBeNull(); // 扣尽注销
    expect(d.state.zones.hand).toHaveLength(handAfterT1 + 3); // 回合 3 正常抽 3
  });

  it('超越：回 AP 但当回合后续技能抽牌也被锁', () => {
    const d = new BattleDriver({
      deck: ['adrenaline', 'punch', 'punch', 'punch', 'punch'],
      enemies: [bigSlime()], seed: 5, config: { initialDraw: 5 },
      player: { maxActionPoints: 5 },
    });
    d.start();
    placeAt(d, 'adrenaline', 0);

    d.playAll(['punch', 'punch']); // AP 5 → 3
    d.play('adrenaline');          // 0 费 → AP 4，滞气 1
    expect(d.player.actionPoints).toBe(4);
    expect(d.player.getEffectStacks('stall')).toBe(1);

    const handBefore = d.state.zones.hand.length;
    d.dispatch(new DrawCardsInstruction({ count: 2 })); // 当回合技能抽牌被 veto
    expect(d.state.zones.hand).toHaveLength(handBefore);
    expect(d.state.history.turn.drawn).toBe(0);

    d.endTurn(); // 滞气 1 → 0：下回合正常
    expect(d.state.zones.hand.length).toBeGreaterThan(handBefore);
  });
});

describe('刀背打击：丢最右手牌', () => {
  it('自身不在最右时丢最右一张', () => {
    const d = new BattleDriver({
      deck: ['knifeBack', 'punch', 'punch', 'punch'],
      enemies: [bigSlime()], seed: 5, config: { initialDraw: 4 },
    });
    const slime = d.state.enemies[0];
    d.start();
    placeAt(d, 'knifeBack', 0);
    const rightmost = d.state.zones.hand.at(-1);

    d.play('knifeBack');
    expect(slime.hp).toBe(200 - 12);
    expect(zoneOf(d.state, rightmost.uniqueID)).toBe('discard');
    expect(d.state.zones.hand).toHaveLength(2); // 4 - 自身 - 最右
  });

  it('自身在最右时丢次右一张（跳过自身）', () => {
    const d = new BattleDriver({
      deck: ['knifeBack', 'punch', 'punch', 'punch'],
      enemies: [bigSlime()], seed: 5, config: { initialDraw: 4 },
    });
    d.start();
    placeAt(d, 'knifeBack', 3);
    const secondRight = d.state.zones.hand.at(-2);

    d.play('knifeBack');
    expect(zoneOf(d.state, secondRight.uniqueID)).toBe('discard');
    expect(d.state.zones.hand).toHaveLength(2);
  });
});

describe('回旋飞刀：换两侧牌', () => {
  it('弃两侧后抽牌分别补进自身前后空位', () => {
    const d = new BattleDriver({
      deck: ['whirlingDagger', 'punch', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: [bigSlime()], seed: 5, config: { initialDraw: 4 },
    });
    const slime = d.state.enemies[0];
    d.start();
    const wd = placeAt(d, 'whirlingDagger', 1); // 确保两侧有牌
    const { left, right } = handNeighbors(d.state, wd.uniqueID);
    const survivor = d.state.zones.hand.at(-1); // 原最右牌（非邻居，应留到最后）
    const deckTop = d.state.zones.deck[0];
    const deckSecond = d.state.zones.deck[1];

    d.play('whirlingDagger');
    expect(slime.hp).toBe(200 - 27);
    expect(zoneOf(d.state, left.uniqueID)).toBe('discard');
    expect(zoneOf(d.state, right.uniqueID)).toBe('discard');
    expect(zoneOf(d.state, wd.uniqueID)).toBe('discard'); // 普通卡结算完入弃牌堆

    // 补进两侧空位而非堆到手牌末尾：自身离手后两张新牌相邻居中
    const hand = d.state.zones.hand;
    expect(hand.map(c => c.uniqueID)).toEqual([
      deckTop.uniqueID, deckSecond.uniqueID, survivor.uniqueID,
    ]);
  });

  it('没有左侧牌时只抽一张补右侧，没有牌也能发动', () => {
    const d = new BattleDriver({
      deck: ['whirlingDagger', 'punch', 'punch', 'punch', 'punch'],
      enemies: [bigSlime()], seed: 5, config: { initialDraw: 3 },
    });
    const slime = d.state.enemies[0];
    d.start();
    const wd = placeAt(d, 'whirlingDagger', 0); // 自身最左，无左邻
    const { left, right } = handNeighbors(d.state, wd.uniqueID);
    expect(left).toBeNull();
    const deckTop = d.state.zones.deck[0];

    d.play('whirlingDagger');
    expect(slime.hp).toBe(200 - 27);
    expect(zoneOf(d.state, right.uniqueID)).toBe('discard');

    // 只补右侧一张：新牌落在自身右槽（自身离手后成为首张），而非堆到手牌末尾
    const hand = d.state.zones.hand;
    expect(hand).toHaveLength(2); // 3 - 1弃 + 1抽 - 1自身
    expect(hand[0].uniqueID).toBe(deckTop.uniqueID);
  });
});
