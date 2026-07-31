import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 最小内容（punch/guard/slime 等）
import { BattleDriver } from '../src/core/sdk/driver.js';
import { registerSkill } from '../src/core/skills/registry.js';
import { zoneOf, moveCard, handNeighbors, firstAliveEnemy } from '../src/core/state/battleState.js';
import { DrawCardsInstruction, DiscardCardInstruction } from '../src/core/instructions/cards.js';
import { DealDamageInstruction, GainShieldInstruction } from '../src/core/instructions/combat.js';
import { PlayerTurnEndInstruction } from '../src/core/instructions/turn.js';

// ---- 刀组合（卡序体系）原型技能：压测 zones 模型 ----

// 回旋斩：低费从牌库末抽 2 张
registerSkill({
  id: 'cycloneSlash', name: '回旋斩',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx) {
    sctx.kernel.submitInstruction(new DrawCardsInstruction({ count: 2, from: 'bottom' }));
    return true;
  },
});

// 飞刀：弃掉本牌两侧的手牌，每弃一张伤害 +5（基础 6）
registerSkill({
  id: 'flyingDagger', name: '飞刀',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx) {
    const { left, right } = handNeighbors(sctx.battleState, sctx.self.uniqueID);
    let bonus = 0;
    for (const card of [left, right]) {
      if (!card) continue;
      bonus += 5;
      sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID: card.uniqueID }));
    }
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 6 + bonus,
    }));
    return true;
  },
});

// 摘星手：牌序格挡——位于手牌最右端打出时获得 12 格挡，否则 3
registerSkill({
  id: 'starPick', name: '摘星手',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx) {
    const hand = sctx.battleState.zones.hand;
    const idx = hand.findIndex(c => c.uniqueID === sctx.self.uniqueID);
    const amount = idx === hand.length - 1 ? 12 : 3;
    sctx.kernel.submitInstruction(new GainShieldInstruction({ target: sctx.player, amount }));
    return true;
  },
});

// 断神斩：最高伤害单卡，条件苛刻——仅能在牌库中冷却（cooldownZones: ['deck']），
// 在手中渡过回合则快速衰败（power -4）。
registerSkill({
  id: 'godSever', name: '断神斩',
  cost: { mana: 0, actionPoint: 2 },
  charges: { max: 1, cooldownTurns: 2 },
  cooldownZones: ['deck'],
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: firstAliveEnemy(sctx.battleState),
      amount: 16 + sctx.self.power,
    }));
    return true;
  },
  subscriptions: (sctx) => [{
    when: PlayerTurnEndInstruction, phase: 'post',
    filter: (instr, ctx) => zoneOf(ctx.battleState, sctx.self.uniqueID) === 'hand',
    react: () => { sctx.self.power -= 4; },
  }],
});

// 把手牌中 defId 对应的牌挪到指定位置（测试布置，与 shuffle 无关的确定性手段）
function placeAt(driver, defId, index) {
  const hand = driver.state.zones.hand;
  const i = hand.findIndex(c => c.defId === defId);
  const [card] = hand.splice(i, 1);
  hand.splice(index, 0, card);
  return card;
}

describe('刀组合：回旋斩（牌库末抽牌）', () => {
  it('DrawCardsInstruction from:bottom 取牌库末而非顶', () => {
    const d = new BattleDriver({
      deck: ['punch', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    expect(d.state.zones.deck).toHaveLength(2); // 6 - initialDraw 4

    const bottom = d.state.zones.deck[1];
    d.dispatch(new DrawCardsInstruction({ count: 1, from: 'bottom' }));
    expect(zoneOf(d.state, bottom.uniqueID)).toBe('hand');
    expect(d.state.zones.deck).toHaveLength(1);

    const top = d.state.zones.deck[0];
    d.dispatch(new DrawCardsInstruction({ count: 1, from: 'top' }));
    expect(zoneOf(d.state, top.uniqueID)).toBe('hand');
    expect(d.state.zones.deck).toHaveLength(0);
  });

  it('牌库抽空后洗回弃牌堆，仍从底部抽', () => {
    const d = new BattleDriver({
      deck: ['cycloneSlash', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 3 },
    });
    d.start();
    expect(d.handIds().sort()).toEqual(['cycloneSlash', 'punch', 'punch'].sort());

    d.play('punch');
    d.play('punch');
    const discarded = [...d.state.zones.discard].map(c => c.uniqueID);
    expect(discarded).toHaveLength(2);

    d.play('cycloneSlash'); // 牌库空 → 洗回 2 张弃牌 → 从底部抽 2 张
    expect(d.state.zones.hand).toHaveLength(2);
    expect(d.state.zones.hand.map(c => c.uniqueID).sort()).toEqual(discarded.sort());
    expect(d.state.zones.discard.map(c => c.defId)).toEqual(['cycloneSlash']);
  });
});

describe('刀组合：飞刀（弃两侧牌）', () => {
  it('弃掉左右相邻手牌，每张 +5 伤害', () => {
    const d = new BattleDriver({
      deck: ['flyingDagger', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    const slime = d.state.enemies[0];
    d.start();

    const fd = placeAt(d, 'flyingDagger', 1); // 确保在中间，两侧都有牌
    const { left, right } = handNeighbors(d.state, fd.uniqueID);
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();

    d.play('flyingDagger');
    expect(zoneOf(d.state, left.uniqueID)).toBe('discard');
    expect(zoneOf(d.state, right.uniqueID)).toBe('discard');
    expect(slime.hp).toBe(20 - 16); // 6 + 5×2
    expect(d.state.history.battle.discarded).toBe(2);
  });

  it('手牌仅飞刀一张时无牌可弃，只造成基础伤害', () => {
    const d = new BattleDriver({
      deck: ['flyingDagger'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    const slime = d.state.enemies[0];
    d.start();
    expect(d.state.zones.hand).toHaveLength(1);

    d.play('flyingDagger');
    expect(slime.hp).toBe(20 - 6);
    expect(d.state.history.battle.discarded).toBe(0);
  });
});

describe('刀组合：摘星手（牌序格挡）', () => {
  it('位于手牌最右端打出获得 12 格挡', () => {
    const d = new BattleDriver({
      deck: ['starPick', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    d.start();
    placeAt(d, 'starPick', d.state.zones.hand.length - 1);
    d.play('starPick');
    expect(d.player.shield).toBe(12);
  });

  it('不在最右端打出只获得 3 格挡', () => {
    const d = new BattleDriver({
      deck: ['starPick', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    d.start();
    placeAt(d, 'starPick', 0);
    d.play('starPick');
    expect(d.player.shield).toBe(3);
  });
});

describe('刀组合：断神斩（位置敏感冷却 + 衰败）', () => {
  it('在手中渡过回合快速衰败（power -4），伤害随之降低', () => {
    const d = new BattleDriver({
      deck: ['godSever', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4 },
    });
    const slime = d.state.enemies[0];
    d.start();

    d.play('punch'); // 20-6
    d.endTurn();     // 断神斩留在手中渡过回合 → power -4

    const gs = d.state.zones.hand.find(c => c.defId === 'godSever');
    expect(gs.power).toBe(-4);

    d.play('godSever');
    expect(slime.hp).toBe(20 - 6 - 12); // 16 + (-4)
  });

  it('在弃牌堆/手牌中不冷却，回到牌库后才逐回合冷却', () => {
    const d = new BattleDriver({
      deck: ['godSever', 'punch', 'punch', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, config: { initialDraw: 4, drawPerTurn: 0 },
    });
    const slime = d.state.enemies[0];
    d.start();

    d.play('godSever');
    expect(slime.hp).toBe(20 - 16);
    const gs = d.state.zones.discard.find(c => c.defId === 'godSever');
    expect(gs.remainingUses).toBe(0);
    expect(gs.currentCooldown).toBe(2);

    // 在弃牌堆渡过两回合：冷却不推进、不衰败
    d.endTurn();
    d.endTurn();
    expect(gs.currentCooldown).toBe(2);
    expect(gs.remainingUses).toBe(0);
    expect(gs.power).toBe(0);

    // 模拟洗牌回库（moveCard 是 zone 迁移的唯一通道）
    moveCard(d.state, gs.uniqueID, 'deck');
    d.endTurn(); // 冷却 2 → 1
    expect(gs.currentCooldown).toBe(1);
    expect(gs.remainingUses).toBe(0);

    d.endTurn(); // 冷却 1 → 0，充能恢复
    expect(gs.currentCooldown).toBe(0);
    expect(gs.remainingUses).toBe(1);
  });
});
