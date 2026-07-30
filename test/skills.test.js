import { describe, it, expect, beforeEach } from 'vitest';
import BattleKernel from '../src/core/kernel/BattleKernel.js';
import Player from '../src/core/state/player.js';
import Enemy from '../src/core/state/enemy.js';
import { createRunState } from '../src/core/state/runState.js';
import { createBattleState, zoneOf, moveCard, firstAliveEnemy } from '../src/core/state/battleState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { createRecordingPresenter } from '../src/core/presenter.js';
import { registerSkill, clearSkillRegistry } from '../src/core/skills/registry.js';
import { canUseSkill, registerSkillSubscriptions } from '../src/core/skills/helpers.js';
import {
  UseSkillInstruction, ManualStopChantInstruction, SkillCooldownInstruction,
} from '../src/core/instructions/skill.js';
import { DrawCardsInstruction } from '../src/core/instructions/cards.js';
import { ConsumeManaInstruction } from '../src/core/instructions/resources.js';
import { DealDamageInstruction } from '../src/core/instructions/combat.js';

// ---- 测试技能定义 ----

const punch = {
  id: 'punch', name: '冲拳', tier: 'D',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'normal',
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 6 + sctx.self.power,
    }));
    return true;
  },
  describe: () => '造成 6 点伤害。',
};

const heavy = {
  id: 'heavy', name: '大力一击', tier: 'C',
  cost: { mana: 2, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 2 },
  cardMode: 'normal',
  keywords: ['exhaust'],
  use(sctx) {
    sctx.kernel.submitInstruction(new DealDamageInstruction({
      source: sctx.player, target: firstAliveEnemy(sctx.battleState), amount: 10,
    }));
    return true;
  },
};

const chantFlags = { enabled: false, disabledReason: null };
const chanter = {
  id: 'chanter', name: '蓄力术', tier: 'C',
  cost: { mana: 1, actionPoint: 1 },
  charges: { max: Infinity, cooldownTurns: 0 },
  cardMode: 'chant',
  use() { return true; },
  activated: {
    onEnable() { chantFlags.enabled = true; },
    onDisable(_sctx, reason) { chantFlags.disabledReason = reason; },
    subscriptions: (sctx) => [{
      when: DrawCardsInstruction, phase: 'post',
      react: () => { sctx.player.mana = Math.min(sctx.player.mana + 1, sctx.player.maxMana); },
    }],
  },
};

const stagesSeen = [];
const multiStage = {
  id: 'multiStage', name: '三段拳', tier: 'D',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: Infinity },
  use(_sctx, stage) {
    stagesSeen.push(stage);
    return stage >= 2;
  },
};

const triggerLog = [];
const triggerCard = {
  id: 'triggerCard', name: '崩拳', tier: 'C',
  cost: { mana: 0, actionPoint: 1 },
  charges: { max: 1, cooldownTurns: 1 },
  use() { return true; },
  // 仅在手牌中时：任意技能结算完即刻冷却（崩拳类机制）
  subscriptions: (sctx) => [{
    when: UseSkillInstruction, phase: 'post',
    filter: () => zoneOf(sctx.battleState, sctx.self.uniqueID) === 'hand',
    react: () => triggerLog.push('cooled'),
  }],
};

function setup() {
  clearSkillRegistry();
  [punch, heavy, chanter, multiStage, triggerCard].forEach(registerSkill);
  chantFlags.enabled = false;
  chantFlags.disabledReason = null;
  stagesSeen.length = 0;
  triggerLog.length = 0;

  const runState = createRunState({ player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }) });
  const enemy = new Enemy({ maxHp: 20 });
  const battleState = createBattleState({ enemies: [enemy], seed: 5 });
  const presenter = createRecordingPresenter();
  const kernel = new BattleKernel();
  const ctx = { runState, battleState, player: runState.player, kernel, presenter };
  return { ctx, enemy };
}

function putInHand(ctx, defId, overrides = {}) {
  const rt = createSkillRuntime(defId, overrides);
  ctx.battleState.zones.hand.push(rt);
  return rt;
}

// ---- 用例 ----

describe('canUseSkill：可用性检查', () => {
  it('费用/充能/咏唱槽约束', () => {
    const { ctx } = setup();
    const p = putInHand(ctx, 'punch');
    expect(canUseSkill(ctx, p)).toBe(true);

    ctx.player.actionPoints = 0;
    expect(canUseSkill(ctx, p)).toBe(false);
    ctx.player.actionPoints = 3;

    p.remainingUses = 0;
    expect(canUseSkill(ctx, p)).toBe(false);

    const c = putInHand(ctx, 'chanter', { remainingUses: 1 });
    ctx.battleState.chant.capacity = 0; // 无空槽
    expect(canUseSkill(ctx, c)).toBe(false);
  });
});

describe('UseSkillInstruction：完整流程', () => {
  it('资源消耗 → 激活 → 弃牌，history 与 presenter 正确', () => {
    const { ctx, enemy } = setup();
    const p = putInHand(ctx, 'punch');
    ctx.kernel.run(new UseSkillInstruction({ skill: p }), ctx);

    expect(enemy.hp).toBe(14);
    expect(ctx.player.actionPoints).toBe(2);
    expect(ctx.battleState.history.turn.played).toBe(1);
    expect(zoneOf(ctx.battleState, p.uniqueID)).toBe('discard');
    expect(ctx.presenter.calls.some(c => c.method === 'skillUsed')).toBe(true);
  });

  it('费用走资源指令：PRE 订阅改费对技能生效（费用管线）', () => {
    const { ctx } = setup();
    const h = putInHand(ctx, 'heavy');
    ctx.kernel.addSubscription({
      when: ConsumeManaInstruction, phase: 'pre',
      react: (instr) => instr.setPayload('amount', instr.payload.amount * 2),
    });
    ctx.kernel.run(new UseSkillInstruction({ skill: h }), ctx);
    expect(ctx.player.mana).toBe(0); // 2×2=4，截断到 0
    expect(zoneOf(ctx.battleState, h.uniqueID)).toBe('burnt'); // exhaust
  });

  it('多阶段技能按 stage 推进', () => {
    const { ctx } = setup();
    const m = putInHand(ctx, 'multiStage');
    ctx.kernel.run(new UseSkillInstruction({ skill: m }), ctx);
    expect(stagesSeen).toEqual([0, 1, 2]);
  });
});

describe('咏唱卡生命周期', () => {
  it('入槽激活、订阅生效；手动停止注销订阅并弃牌', () => {
    const { ctx } = setup();
    const c = putInHand(ctx, 'chanter');
    ctx.kernel.run(new UseSkillInstruction({ skill: c }), ctx);

    expect(zoneOf(ctx.battleState, c.uniqueID)).toBe('chantSlot');
    expect(c.isActivated).toBe(true);
    expect(chantFlags.enabled).toBe(true);

    // 激活订阅：抽牌回蓝
    ctx.battleState.zones.deck.push(createSkillRuntime('punch'));
    ctx.player.mana = 0;
    ctx.kernel.run(new DrawCardsInstruction({ count: 1 }), ctx);
    expect(ctx.player.mana).toBe(1);

    // 手动停止
    ctx.kernel.run(new ManualStopChantInstruction({ uniqueID: c.uniqueID }), ctx);
    expect(chantFlags.disabledReason).toBe('manual');
    expect(c.isActivated).toBe(false);
    expect(zoneOf(ctx.battleState, c.uniqueID)).toBe('discard');

    // 订阅已注销：再抽牌不回蓝
    ctx.battleState.zones.deck.push(createSkillRuntime('punch'));
    ctx.kernel.run(new DrawCardsInstruction({ count: 1 }), ctx);
    expect(ctx.player.mana).toBe(1);
  });
});

describe('技能触发订阅（zone 限定）', () => {
  it('仅在手牌中时响应其他技能的使用', () => {
    const { ctx } = setup();
    const t = putInHand(ctx, 'triggerCard');
    registerSkillSubscriptions(ctx, t);

    const p1 = putInHand(ctx, 'punch');
    ctx.kernel.run(new UseSkillInstruction({ skill: p1 }), ctx);
    expect(triggerLog).toEqual(['cooled']);

    // 移到牌库后不再触发
    moveCard(ctx.battleState, t.uniqueID, 'deck');
    const p2 = putInHand(ctx, 'punch');
    ctx.kernel.run(new UseSkillInstruction({ skill: p2 }), ctx);
    expect(triggerLog).toEqual(['cooled']);
  });
});

describe('SkillCooldownInstruction：冷却推进', () => {
  it('按 cooldownTurns 推进并充能；仅冷却 cooldownZones 内的技能', () => {
    const { ctx } = setup();
    // heavy 在手牌中，模拟已用尽
    const h = putInHand(ctx, 'heavy', { remainingUses: 0, currentCooldown: 2 });
    ctx.kernel.run(new SkillCooldownInstruction(), ctx);
    expect(h.currentCooldown).toBe(1);
    expect(h.remainingUses).toBe(0);
    ctx.kernel.run(new SkillCooldownInstruction(), ctx);
    expect(h.currentCooldown).toBe(0);
    expect(h.remainingUses).toBe(1);

    // 焚毁区（不在默认 cooldownZones）的技能不冷却
    const h2 = createSkillRuntime('heavy', { remainingUses: 0, currentCooldown: 2 });
    ctx.battleState.zones.burnt.push(h2);
    ctx.kernel.run(new SkillCooldownInstruction(), ctx);
    expect(h2.remainingUses).toBe(0);
  });
});
