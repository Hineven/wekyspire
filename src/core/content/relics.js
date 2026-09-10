import { registerRelic } from '../relics/registry.js';
import { TurnStartInstruction, PlayerTurnEndInstruction } from '../instructions/turn.js';
import {
  DealDamageInstruction, GainShieldInstruction, ApplyHealInstruction, wouldBeLethal,
} from '../instructions/combat.js';
import { GainManaInstruction, GainActionPointsInstruction } from '../instructions/resources.js';
import { DrawCardsInstruction } from '../instructions/cards.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { UseSkillInstruction } from '../instructions/skill.js';
import { getSkillDefinition } from '../skills/registry.js';
import { gainMaxHp } from '../run/prep.js';

// 遗物内容（RELICS.md 2026-09-10 第一批：只上「不需要新机制」的那些，见 todos/ 记录）。
//
// 字段口径（用户 2026-09-10 定，以 RELICS.md 为准）：
//   rarity   'C'|'B'|'A'|'S'（抽选权重与定价依据）
//   cost     槽位权重 0..3（Σ ≤ relicSlots=3）；0 槽 = 能装备但不花槽
//   nonSlot  true = **非槽位式遗物**：不进装卸界面、拾起即恒生效（走 activeRelics）
//   requires 灵脉门禁（抽选池过滤用，与卡包同一口径）：{leino,min} 或 {anyLeino}
//   acquisition 来源标签 ['draft','shop','event']（缺省 draft+shop）；event = 仅事件获得
//   onAcquire(run)  拾起时（一次性）；gainMaxHp 同时抬基础值与当前生命
//   runModifiers(p) 或 {字段: 增量}：run 级数值修正——**从 baseStats 重算**，不增量累加
//   onCampRest(run) 营地休整时（非槽位式的常驻钩子）
//   onBattleStart(ctx) / subscriptions(ctx)：战斗内钩子（仅「已激活」遗物挂载）
const COST0 = { cost: 0 };

// ---- 拾起时（均为非槽位式：恒生效，不进装卸界面）----

registerRelic({
  id: 'hardBaguette', name: '超硬法棍', rarity: 'B', nonSlot: true,
  description: '拾起时，获得 5 最大生命。',
  onAcquire: (run) => gainMaxHp(run, 5),
});

registerRelic({
  id: 'northMountainRock', name: '北山岩', rarity: 'C', nonSlot: true,
  description: '拾起时，获得 2 最大生命。',
  onAcquire: (run) => gainMaxHp(run, 2),
});

registerRelic({
  id: 'naan', name: '馕饼', rarity: 'C', nonSlot: true,
  description: '拾起时，获得 3 最大生命。',
  onAcquire: (run) => gainMaxHp(run, 3),
});

registerRelic({
  id: 'steelShard', name: '拟钢碎片', rarity: 'C', nonSlot: true,
  description: '拾起时，获得 1 最大生命；战斗开始时获得 1 护盾。',
  onAcquire: (run) => gainMaxHp(run, 1),
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new GainShieldInstruction({ target: ctx.player, amount: 1 }));
  },
});

// 池空兜底件（唯一可重复获得的遗物；抽选 SDK 在「全部可抽遗物都已拥有」时发它）
registerRelic({
  id: 'towerGift', name: '塔的馈赠', rarity: 'C', nonSlot: true,
  description: '拾起时，获得 1 最大生命。',
  onAcquire: (run) => gainMaxHp(run, 1),
});

// ---- 非槽位式的常驻钩子 ----

registerRelic({
  id: 'springFlask', name: '山泉壶', rarity: 'C', nonSlot: true,
  description: '休息处休息时，额外恢复 5 点生命。',
  onCampRest(run) {
    const p = run.player;
    p.hp = Math.min(p.maxHp, p.hp + 5);
  },
});

// ---- 战斗开始时（资源 / 状态）----

registerRelic({
  id: 'dragonHeartTissue', name: '龙心组织', rarity: 'A', cost: 1,
  description: '战斗开始时，获得 2 行动力。',
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new GainActionPointsInstruction({ amount: 2 }));
  },
});

registerRelic({
  id: 'seaCrystal', name: '海晶石', rarity: 'B', cost: 1,
  description: '战斗开始时，获得 1 魏启。',
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new GainManaInstruction({ amount: 1 }));
  },
});

registerRelic({
  id: 'kadasFang', name: '卡达斯的獠牙', rarity: 'A', cost: 2,
  description: '战斗开始时，获得 3 魏启。',
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new GainManaInstruction({ amount: 3 }));
  },
});

registerRelic({
  id: 'blackMountainRock', name: '黑山岩', rarity: 'C', cost: 1,
  description: '战斗开始时，获得 4 护盾。',
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new GainShieldInstruction({ target: ctx.player, amount: 4 }));
  },
});

registerRelic({
  id: 'evanStone', name: '埃文石', rarity: 'A', cost: 1,
  description: '战斗开始时，赋予所有敌人虚弱 1。',
  onBattleStart(ctx) {
    for (const e of ctx.battleState.enemies) {
      ctx.kernel.submitInstruction(new AddEffectInstruction({ target: e, effectId: 'weaken', stacks: 1 }));
    }
  },
});

// 火灵脉专属（门禁与卡包同一口径）
registerRelic({
  id: 'sunStone', name: '太阳石', rarity: 'A', ...COST0, requires: { leino: 'fire', min: 1 },
  description: '战斗开始时，获得烈焰亲和 2。',
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new AddEffectInstruction({
      target: ctx.player, effectId: 'flameAffinity', stacks: 2,
    }));
  },
});

registerRelic({
  id: 'kadasClaw', name: '卡达斯之爪', rarity: 'A', cost: 1, requires: { leino: 'fire', min: 1 },
  description: '战斗开始时，获得炎魔 1。',
  onBattleStart(ctx) {
    ctx.kernel.submitInstruction(new AddEffectInstruction({
      target: ctx.player, effectId: 'flameDemon', stacks: 1,
    }));
  },
});

registerRelic({
  id: 'whiteFireStone', name: '白火石', rarity: 'B', cost: 2, requires: { leino: 'fire', min: 1 },
  description: '战斗第一回合开始时，赋予所有单位燃烧 2。',
  subscriptions: () => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr, c) => instr.side === 'player' && c.battleState.turn.count === 1,
    react: (instr, c) => {
      const all = [c.player, ...c.battleState.allies, ...c.battleState.enemies];
      for (const u of all) {
        if (u.isDead()) continue;
        c.kernel.submitInstruction(new AddEffectInstruction({ target: u, effectId: 'burn', stacks: 2 }), instr);
      }
    },
  }],
});

// ---- 回合节奏 ----

registerRelic({
  id: 'endlessManaJar', name: '无限魏启罐', rarity: 'A', cost: 1,
  description: '每 3 回合，回合开始时回复 1 魏启。',
  subscriptions: () => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr, c) => instr.side === 'player' && c.battleState.turn.count % 3 === 0,
    react: (instr, c) => c.kernel.submitInstruction(new GainManaInstruction({ amount: 1 }), instr),
  }],
});

registerRelic({
  id: 'smoothBuckler', name: '光滑小圆盾', rarity: 'B', cost: 1,
  description: '第二回合开始时，获得 12 护盾。',
  subscriptions: () => [{
    when: TurnStartInstruction,
    phase: 'post',
    // priority -100：回合开始的「出现类」效果必须排在护盾重置（-50）**之后**，
    // 否则刚发的 12 点盾会被同一拍的清盾立刻抹掉（见 battleRoot 的护盾重置注释）
    priority: -100,
    filter: (instr, c) => instr.side === 'player' && c.battleState.turn.count === 2,
    react: (instr, c) => c.kernel.submitInstruction(
      new GainShieldInstruction({ target: c.player, amount: 12 }), instr),
  }],
});

registerRelic({
  id: 'lubricant', name: '润滑油', rarity: 'C', cost: 1,
  description: '第二回合开始时，抽 1 牌。',
  subscriptions: () => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr, c) => instr.side === 'player' && c.battleState.turn.count === 2,
    react: (instr, c) => c.kernel.submitInstruction(
      new DrawCardsInstruction({ count: 1, reason: 'relic' }), instr),
  }],
});

registerRelic({
  id: 'seed', name: '种子', rarity: 'A', cost: 1,
  description: '第三回合到第五回合，每回合开始时恢复 1 生命。',
  subscriptions: () => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr, c) => {
      if (instr.side !== 'player') return false;
      const t = c.battleState.turn.count;
      return t >= 3 && t <= 5;
    },
    react: (instr, c) => c.kernel.submitInstruction(
      new ApplyHealInstruction({ target: c.player, amount: 1 }), instr),
  }],
});

registerRelic({
  id: 'remiCharm', name: '瑞米挂饰', rarity: 'B', cost: 2,
  description: '第 5 回合开始时，获得闪避 1。',
  subscriptions: () => [{
    when: TurnStartInstruction,
    phase: 'post',
    filter: (instr, c) => instr.side === 'player' && c.battleState.turn.count === 5,
    react: (instr, c) => c.kernel.submitInstruction(
      new AddEffectInstruction({ target: c.player, effectId: 'dodge', stacks: 1 }), instr),
  }],
});

registerRelic({
  id: 'warHornItem', name: '号角', rarity: 'C', cost: 1,
  description: '第一回合开始时获得力量 2；该回合结束时失去力量 2。',
  subscriptions: () => [
    {
      when: TurnStartInstruction,
      phase: 'post',
      filter: (instr, c) => instr.side === 'player' && c.battleState.turn.count === 1,
      react: (instr, c) => c.kernel.submitInstruction(
        new AddEffectInstruction({ target: c.player, effectId: 'strength', stacks: 2 }), instr),
    },
    {
      when: PlayerTurnEndInstruction,
      phase: 'post',
      filter: (instr, c) => c.battleState.turn.count === 1,
      react: (instr, c) => c.kernel.submitInstruction(
        new AddEffectInstruction({ target: c.player, effectId: 'strength', stacks: -2 }), instr),
    },
  ],
});

// 飞镖 / 迷你飞镖 共用：第一回合结束的群伤
function dartVolley() {
  return {
    when: PlayerTurnEndInstruction,
    phase: 'post',
    filter: (instr, c) => c.battleState.turn.count === 1,
    react: (instr, c) => {
      for (const e of c.battleState.enemies) {
        if (e.isDead()) continue;
        c.kernel.submitInstruction(new DealDamageInstruction({
          source: c.player, target: e, amount: 2, tags: ['aoe'],
        }), instr);
      }
    },
  };
}

registerRelic({
  id: 'dart', name: '飞镖', rarity: 'C', cost: 1,
  description: '第一回合结束时，对所有敌人造成 2 伤害。',
  subscriptions: () => [dartVolley()],
});

registerRelic({
  id: 'miniDart', name: '迷你飞镖', rarity: 'A', ...COST0,
  description: '第一回合结束时，对所有敌人造成 2 伤害。',
  subscriptions: () => [dartVolley()],
});

// ---- 受击 / 出牌 反应 ----

registerRelic({
  id: 'sledgehammer', name: '大锤', rarity: 'C', cost: 1,
  description: '每次受伤后，获得 1 护盾。',
  subscriptions: () => [{
    when: DealDamageInstruction,
    phase: 'post',
    filter: (instr, c) => instr.target === c.player && (instr.result?.dealt ?? 0) > 0,
    react: (instr, c) => c.kernel.submitInstruction(
      new GainShieldInstruction({ target: c.player, amount: 1 }), instr),
  }],
});

registerRelic({
  id: 'adrenalineSyringe', name: '肾上腺素注射器', rarity: 'C', cost: 1,
  description: '每场战斗中，第一次单次造成超过 15 点伤害后，抽 2 牌。',
  subscriptions: () => {
    let fired = false; // 每场战斗一次（subscriptions 工厂每场战斗调用一次）
    return [{
      when: DealDamageInstruction,
      phase: 'post',
      filter: (instr, c) => !fired && instr.source === c.player && (instr.result?.dealt ?? 0) > 15,
      react: (instr, c) => {
        fired = true;
        c.kernel.submitInstruction(new DrawCardsInstruction({ count: 2, reason: 'relic' }), instr);
      },
    }];
  },
});

registerRelic({
  id: 'masterInsight', name: '宗师的心得', rarity: 'C', cost: 1,
  description: '每场战斗打出的第三张牌，打出后回复其行动力消耗。',
  subscriptions: () => {
    let plays = 0;
    return [{
      when: UseSkillInstruction,
      phase: 'post',
      filter: (instr) => instr.skill?.defId != null,
      react: (instr, c) => {
        plays += 1;
        if (plays !== 3) return;
        const ap = getSkillDefinition(instr.skill.defId)?.cost?.actionPoint ?? 0;
        if (ap > 0) c.kernel.submitInstruction(new GainActionPointsInstruction({ amount: ap }), instr);
      },
    }];
  },
});

// S 级「诸神」恩赐：仅事件获得（acquisition: ['event']，故不进抽取/商店池）
registerRelic({
  id: 'aovibonyBlessing', name: '奥薇邦妮之恩赐', rarity: 'S', cost: 1, acquisition: ['event'],
  description: '你每次打空手牌时，恢复 2 魏启。',
  subscriptions: () => [{
    when: UseSkillInstruction,
    phase: 'post',
    filter: (instr, c) => (c.battleState.zones.hand?.length ?? 0) === 0,
    react: (instr, c) => c.kernel.submitInstruction(new GainManaInstruction({ amount: 2 }), instr),
  }],
});

registerRelic({
  id: 'ranqingBlessing', name: '冉青之恩赐', rarity: 'S', cost: 2, acquisition: ['event'],
  description: '每赋予一层燃烧，获得一层护盾。',
  // 口径：**给他人**上燃烧才回盾（自己身上结算燃烧不回——否则自我燃烧会变成白盾机器）
  subscriptions: () => [{
    when: AddEffectInstruction,
    phase: 'post',
    filter: (instr, c) => instr.effectId === 'burn' && instr.target !== c.player
      && (instr.payload?.stacks ?? 0) > 0,
    react: (instr, c) => c.kernel.submitInstruction(
      new GainShieldInstruction({ target: c.player, amount: instr.payload.stacks }), instr),
  }],
});

// ---- run 级数值修正（从 baseStats 重算，见 prep.refreshRunModifiers）----

registerRelic({
  id: 'dragonScale', name: '龙鳞', rarity: 'A', cost: 3,
  description: '战斗开始时，防御 2。',
  runModifiers: { defense: 2 },
});

registerRelic({
  id: 'tianqingStone', name: '天青石', rarity: 'A', cost: 3, requires: { leino: 'air', min: 2 },
  description: '行动力上限 +1。',
  runModifiers: { maxActionPoints: 1 },
});

registerRelic({
  id: 'implantJar', name: '植入式魏启罐', rarity: 'C', cost: 1, requires: { anyLeino: 1 },
  description: '战斗开始时，获得 1 魏启上限（但不恢复魏启）。',
  runModifiers: { maxMana: 1 },
});

// ---- 塞西莉亚之恩赐（S·事件专属）：致命一击延迟一回合 ----
// 实现＝「致命拦截 + 奇迹1」；拦截点是伤害指令的 PRE（PRE 在 execute 之前跑，
// 是唯一能改变本次结算结果的时机）。语义见 effects.js 的 miracle。
registerRelic({
  id: 'ceciliaBlessing', name: '塞西莉亚之恩赐', rarity: 'S', cost: 1, acquisition: ['event'],
  description: '每场战斗一次：你将死亡时，改为保留 1 点生命并获得奇迹 1（自己回合结束时奇迹 -1，归零即死亡）。',
  subscriptions: () => {
    let used = false; // 每场战斗重置：subscriptions 在战前装配时调用一次
    return [{
      when: DealDamageInstruction,
      phase: 'pre',
      // 致命判定写在 react 而不是 filter：内核 _collect 先对所有订阅跑 filter、再按
      // priority 排序跑 react，故 filter 里读到的是**所有伤害修饰之前**的 payload。
      // priority -100 让本 react 排到所有修饰 react（priority 0）之后。
      priority: -100,
      filter: (instr, c) => !used
        && instr.target === c.player
        && !instr.tags?.includes('miracle')
        && c.player.getEffectStacks('miracle') <= 0,
      react: (instr, c) => {
        if (!wouldBeLethal(instr, c.player)) return;
        used = true;
        const p = c.player;
        c.kernel.veto(instr, 'cecilia', [
          new DealDamageInstruction({
            source: instr.source, target: p,
            amount: Math.max(p.hp - 1, 0) + p.shield, fixed: true, tags: ['ceciliaGuard'],
          }),
          new AddEffectInstruction({ target: p, effectId: 'miracle', stacks: 1 }),
        ]);
      },
    }];
  },
});
