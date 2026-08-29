import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { BattleDriver } from '../src/core/sdk/driver.js';
import { registerSkill } from '../src/core/skills/registry.js';
import { zoneOf, moveCard, firstAliveEnemy } from '../src/core/state/battleState.js';
import { handIndexAtPlay, handNeighborsAtPlay } from '../src/core/skills/helpers.js';
import AwaitPlayerInputInstruction from '../src/core/instructions/input.js';
import { UseSkillInstruction } from '../src/core/instructions/skill.js';
import { DiscardCardInstruction } from '../src/core/instructions/cards.js';
import { DealDamageInstruction } from '../src/core/instructions/combat.js';

// ---- pending 结算区 ----
// 铁律：发动卡在 UseSkillInstruction stage 1 离手（hand→pending），收尾落位
// （chantSlot/burnt/discard）；落地指令 zoneOf 校验、目标不在预期区静默落空；
// 效果逻辑自行安置时收尾不二次搬动；终局 abort 由 PostBattle 清扫。
// （「discardRightmost 无特判」的刀背行为由 bodySkills.test.js 同步更新覆盖，此处不重复。）

// 停滞卡（测试卡）：结算中段挂起等玩家输入——观察 pending 的窗口
registerSkill({
  id: 'stallProbe', name: '停滞卡',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx, stage) {
    if (stage === 0) {
      sctx.self._input = new AwaitPlayerInputInstruction({
        request: {
          kind: 'selectHandCard', count: 1,
          candidates: sctx.battleState.zones.hand.map(c => c.uniqueID),
        },
      });
      sctx.kernel.submitInstruction(sctx.self._input);
      return false;
    }
    sctx.self._input = null;
    return true;
  },
});

// 咏唱探针（测试卡）：最小咏唱卡，验证 pending → chantSlot 落位
registerSkill({
  id: 'chantProbe', name: '咏唱探针', cardMode: 'chant',
  cost: { mana: 0, actionPoint: 1 },
  use() { return true; },
});

// 嵌套出牌对（测试卡）：outerProbe 打出最左一张手牌（= 被发动的宾语卡），
// innerProbe 执行时记录两卡的 zone 快照
const innerZones = [];
registerSkill({
  id: 'outerProbe', name: '传导拳',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx) {
    const inner = sctx.battleState.zones.hand[0]; // 自身已离手，hand[0] 即剩余最左
    if (inner) sctx.kernel.submitInstruction(new UseSkillInstruction({
      skill: inner, costOverride: { mana: 0, actionPoint: 0 },
    }));
    return true;
  },
});
registerSkill({
  id: 'innerProbe', name: '内层探针',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx) {
    innerZones.push({
      self: zoneOf(sctx.battleState, sctx.self.uniqueID),
      outerInPending: sctx.battleState.zones.pending.some(c => c.defId === 'outerProbe'),
    });
    return true;
  },
});

// 回库拳（测试卡）：use 内自行安置——回牌库顶（「这张牌不入弃牌堆」类自改去向）
registerSkill({
  id: 'topLoader', name: '回库拳',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx) {
    moveCard(sctx.battleState, sctx.self.uniqueID, 'deck', { index: 0 });
    return true;
  },
});

// 致命停滞（测试卡）：结算中段造成致命伤 → 终局 abort，后续 stage 不再执行（卡滞留 pending）
registerSkill({
  id: 'lethalProbe', name: '致命停滞',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx, stage) {
    if (stage === 0) {
      sctx.kernel.submitInstruction(new DealDamageInstruction({
        source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 999,
      }));
      return false;
    }
    return true; // 不会到达：伤害结算完即终局
  },
});

// 连锁咏唱（测试卡）：POST 范式的「每丢弃一张，额外弃当前最右一张」——
// 目标在结算时重选（pending 中的发动卡天然不参与），链式弃牌到手牌清空自然终止
registerSkill({
  id: 'cascadeChant', name: '连锁咏唱', cardMode: 'chant',
  cost: { mana: 0, actionPoint: 1 },
  activated: {
    subscriptions: () => [{
      when: DiscardCardInstruction, phase: 'post',
      react: (instr, ctx) => {
        const hand = ctx.battleState.zones.hand;
        if (hand.length === 0) return;
        ctx.kernel.submitInstruction(
          new DiscardCardInstruction({ uniqueID: hand[hand.length - 1].uniqueID }), instr);
      },
    }],
  },
});

describe('pending 结算区', () => {
  it('发动中离手：WAIT 挂起时卡在 pending、不在手牌；应答结算后落弃牌堆', () => {
    const d = new BattleDriver({
      deck: ['stallProbe', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    const rt = d.state.zones.hand.find(c => c.defId === 'stallProbe');
    d.play('stallProbe');
    expect(d.pendingInput).toBeTruthy();
    expect(zoneOf(d.state, rt.uniqueID)).toBe('pending');
    expect(d.state.zones.hand.some(c => c.uniqueID === rt.uniqueID)).toBe(false);
    expect(d.presenter.calls.some(c => c.method === 'cardDiscarded')).toBe(false); // 离手不是弃牌，无弃牌播报

    d.respond([d.pendingInput.request.candidates[0]]);
    expect(d.pendingInput).toBeNull();
    expect(zoneOf(d.state, rt.uniqueID)).toBe('discard');
  });

  it('咏唱卡经 pending 落位咏唱槽并激活', () => {
    const d = new BattleDriver({
      deck: ['chantProbe', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    const rt = d.state.zones.hand.find(c => c.defId === 'chantProbe');
    d.play('chantProbe');
    expect(zoneOf(d.state, rt.uniqueID)).toBe('chantSlot');
    expect(rt.isActivated).toBe(true);
    expect(d.state.zones.pending).toHaveLength(0);
  });

  it('DiscardCardInstruction：目标不在手牌（同卡双弃 / pending 中的发动卡）→ 静默落空', () => {
    const d = new BattleDriver({ deck: ['punch', 'punch'], enemies: ['slime'], seed: 5 });
    d.start();
    const [a, b] = d.state.zones.hand;
    const before = d.state.history.battle.discarded;
    d.presenter.clear();
    d.dispatch(new DiscardCardInstruction({ uniqueID: a.uniqueID }));
    d.dispatch(new DiscardCardInstruction({ uniqueID: a.uniqueID })); // 同卡双弃：第二次落空
    expect(zoneOf(d.state, a.uniqueID)).toBe('discard');
    expect(d.state.history.battle.discarded).toBe(before + 1);
    expect(d.presenter.calls.filter(c => c.method === 'cardDiscarded')).toHaveLength(1);

    // pending 中的卡（发动中）不可被弃：过期引用无害
    moveCard(d.state, b.uniqueID, 'pending');
    d.dispatch(new DiscardCardInstruction({ uniqueID: b.uniqueID }));
    expect(zoneOf(d.state, b.uniqueID)).toBe('pending');
    expect(d.state.history.battle.discarded).toBe(before + 1);
  });

  it('出牌时点查询助手：结算中读捕获值，预览态实时（两路口径一致）', () => {
    // 打出时手牌 = [h0, self, h2]（捕获 index 1）；结算中自身已离手 → hand = [h0, h2]
    const h0 = { uniqueID: 'h0' };
    const h2 = { uniqueID: 'h2' };
    const self = { uniqueID: 'self' };
    const mid = { handIndexAtPlay: 1, battleState: { zones: { hand: [h0, h2] } }, self };
    expect(handIndexAtPlay(mid)).toBe(1);
    expect(handNeighborsAtPlay(mid)).toEqual({ left: h0, right: h2 });
    // 预览态（自身在 hand = [h0, self, h2]）：实时邻位同结果
    const preview = { battleState: { zones: { hand: [h0, self, h2] } }, self };
    expect(handIndexAtPlay(preview)).toBe(1);
    expect(handNeighborsAtPlay(preview)).toEqual({ left: h0, right: h2 });
  });

  it('嵌套出牌：内层卡（被发动的宾语）经自己的 UseSkill 进 pending，内外先后落位', () => {
    innerZones.length = 0;
    const d = new BattleDriver({
      deck: ['outerProbe', 'innerProbe', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    const inner = d.state.zones.hand.find(c => c.defId === 'innerProbe');
    moveCard(d.state, inner.uniqueID, 'hand', { index: 0 }); // 置于打出后手牌最左
    const outer = d.state.zones.hand.find(c => c.defId === 'outerProbe');
    d.play('outerProbe');
    expect(innerZones).toEqual([{ self: 'pending', outerInPending: true }]);
    expect(zoneOf(d.state, inner.uniqueID)).toBe('discard');
    expect(zoneOf(d.state, outer.uniqueID)).toBe('discard');
    expect(d.state.history.battle.played).toBe(2);
  });

  it('落位容差：效果逻辑自行安置（回牌库顶）→ 收尾不二次搬动', () => {
    const d = new BattleDriver({
      deck: ['topLoader', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    const rt = d.state.zones.hand.find(c => c.defId === 'topLoader');
    d.play('topLoader');
    expect(zoneOf(d.state, rt.uniqueID)).toBe('deck');
    expect(d.state.zones.deck[0].uniqueID).toBe(rt.uniqueID); // 牌库顶 = index 0
    expect(d.state.zones.discard.some(c => c.uniqueID === rt.uniqueID)).toBe(false);
  });

  it('终局 abort：结算中敌方死亡 → 树被截断，PostBattle 清扫 pending、残卡落弃牌堆', () => {
    const d = new BattleDriver({
      deck: ['lethalProbe', 'punch', 'punch', 'punch'],
      enemies: ['slime'], seed: 5,
    });
    d.start();
    const rt = d.state.zones.hand.find(c => c.defId === 'lethalProbe');
    d.play('lethalProbe');
    expect(d.state.result).toBe('victory');
    expect(d.state.zones.pending).toHaveLength(0);
    expect(zoneOf(d.state, rt.uniqueID)).toBe('discard');
  });

  it('弃牌连锁咏唱（POST 范式）：链式弃到手牌清空自然终止，发动卡不被连锁误弃', () => {
    const d = new BattleDriver({
      deck: ['cascadeChant', 'knifeBack', 'punch', 'punch'],
      enemies: ['slime'], seed: 5, player: { maxHp: 200 },
    });
    d.start();
    const chant = d.state.zones.hand.find(c => c.defId === 'cascadeChant');
    d.play('cascadeChant'); // 入咏唱槽
    expect(zoneOf(d.state, chant.uniqueID)).toBe('chantSlot');

    d.play('knifeBack'); // 自身弃 1 → 连锁再弃 1 → 再连锁 → 手牌清空
    expect(d.state.zones.hand).toHaveLength(0);
    const discardIds = d.state.zones.discard.map(c => c.uniqueID);
    expect(discardIds).toHaveLength(3); // 两张连锁弃牌 + knifeBack 自身收尾，各一次
    expect(new Set(discardIds).size).toBe(3); // 无同卡双弃
    expect(d.state.history.battle.discarded).toBe(2); // 只有两次真弃牌（knifeBack 收尾是 zone 迁移不计弃）
  });
});
