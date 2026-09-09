import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册全部内容（含 commonSkills 纳气卡）
import { BattleDriver } from '../src/core/sdk/driver.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { zoneOf, moveCard } from '../src/core/state/battleState.js';
import { canUseSkill } from '../src/core/skills/helpers.js';

// 新内容结算验证：虚形拳系列（唯一手牌条件）与 COMMON 通用单卡（汲取/激发/魏启罐）。

function tank() {
  const e = getEnemyDefinition('slime').createUnit();
  e.maxHp = 500;
  e.hp = 500;
  return e;
}

const enemyHp = (d) => d.state.enemies[0].hp;

// 把指定 defId 的卡弄回手牌（从任意 zone；已在手则原样返回）
function toHandKeep(d, defId) {
  const card = [d.state.zones.deck, d.state.zones.burnt]
    .flat().find(c => c.defId === defId);
  if (card) moveCard(d.state, card.uniqueID, 'hand');
  return d.state.zones.hand.find(c => c.defId === defId);
}
const toHand = toHandKeep;

// 清空手牌中除指定卡外的所有卡（构造「唯一手牌」）
function keepOnly(d, defId) {
  for (const other of [...d.state.zones.hand.filter(c => c.defId !== defId)]) {
    moveCard(d.state, other.uniqueID, 'deck'); // 挪走置牌库底（弃牌堆已不存在，FIFO）
  }
}

describe('虚形拳系列：唯一手牌条件', () => {
  it('豹形拳/龙形拳：唯一手牌时增伤并抽牌，非唯一只 7 伤', () => {
    const d = new BattleDriver({ deck: ['leopardFist', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    let hp0 = enemyHp(d);
    d.play('leopardFist'); // 手中多牌
    expect(hp0 - enemyHp(d)).toBe(7);

    const leopard = toHand(d, 'leopardFist');
    leopard.currentCooldown = 0;
    leopard.remainingUses = 1;
    keepOnly(d, 'leopardFist');
    hp0 = enemyHp(d);
    d.play('leopardFist');
    expect(hp0 - enemyHp(d)).toBe(20); // 7 + 13
    expect(d.state.zones.hand).toHaveLength(1); // 离手后抽 1 回补
  });

  it('空形拳：仅作为唯一手牌时可打出（canUse 守卫），100 伤', () => {
    const d = new BattleDriver({ deck: ['emptyFist', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const fist = d.state.zones.hand.find(c => c.defId === 'emptyFist');
    expect(canUseSkill(d.ctx, fist)).toBe(false); // 手中多牌：不可打出

    toHandKeep(d, 'emptyFist');
    keepOnly(d, 'emptyFist');
    expect(canUseSkill(d.ctx, fist)).toBe(true);
    const hp0 = enemyHp(d);
    d.play('emptyFist');
    expect(hp0 - enemyHp(d)).toBe(100);
  });
});

describe('COMMON：汲取/激发/魏启罐', () => {
  it('纯化：1MP 换纳气2 + 3护盾，下回合开始兑现魏启', () => {
    const d = new BattleDriver({ deck: ['purify', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start(); // 半满1 + 回合恢复1 = 2
    const mana0 = d.player.mana;
    d.play('purify');
    expect(d.player.mana).toBe(mana0 - 1); // 支付 1MP
    expect(d.player.shield).toBe(3);
    expect(d.player.getEffectStacks('naqi')).toBe(2);
    d.endTurn(); // 下回合开始：+1 常规 + 纳气整取 2
    expect(d.player.mana).toBe(Math.min(mana0 - 1 + 3, d.player.maxMana));
    expect(d.player.getEffectStacks('naqi')).toBe(0);
  });

  it('魏启罐：0 费消耗品，纳气兑现即归零', () => {
    const d = new BattleDriver({ deck: ['manaJar', 'manaJarPlus', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start();
    const jar = d.state.zones.hand.find(c => c.defId === 'manaJar');
    const mana0 = d.player.mana;
    d.play('manaJar');
    expect(zoneOf(d.state, jar.uniqueID)).toBe('burnt'); // 消耗
    expect(d.player.mana).toBe(mana0); // 0 费
    expect(d.player.getEffectStacks('naqi')).toBe(1);
    d.play('manaJarPlus'); // 叠加到 3 层
    expect(d.player.getEffectStacks('naqi')).toBe(3);
    d.endTurn();
    expect(d.player.mana).toBe(d.player.maxMana); // min(2+1+3, 3) = 3 抵上限
    expect(d.player.getEffectStacks('naqi')).toBe(0); // 一次性整取
  });

  it('激发：2MP 换 2AP（获取不截断，可超上限）', () => {
    const d = new BattleDriver({ deck: ['stimulant', 'punch', 'punch'], enemies: [tank()], seed: 5 });
    d.start(); // 魏启 2
    const ap0 = d.player.actionPoints;
    d.play('punch'); // -1AP → 2
    const stim = d.state.zones.hand.find(c => c.defId === 'stimulant');
    d.play('stimulant');
    expect(d.player.mana).toBe(0); // 支付 2MP
    expect(d.player.actionPoints).toBe(ap0 + 1); // (ap0-1) + 2
    expect(zoneOf(d.state, stim.uniqueID)).toBe('burnt'); // 消耗
  });
});
