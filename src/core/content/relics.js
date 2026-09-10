import { registerRelic } from '../relics/registry.js';
import { DealDamageInstruction, wouldBeLethal } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';

// 占位遗物（§9 遗物具体设计留坑；内容 0~1 个起步，机制后续替换）

// 战号：战斗开始时获得 1 层力量（镜像 battleFocus 的被动钩子形态）
registerRelic({
  id: 'warHorn', name: '战号',
  description: '战斗开始时获得 1 层力量。',
  onBattleStart(ctx) {
    ctx.player.addEffect('strength', 1);
  },
});

// 山泉壶：战前主动使用一次，回复 5 点生命（prepUse 钩子形态验证）
registerRelic({
  id: 'springFlask', name: '山泉壶',
  description: '战前准备阶段主动使用：回复 5 点生命（每局 1 次）。',
  uses: 1,
  prepUse(run) {
    run.player.hp = Math.min(run.player.maxHp, run.player.hp + 5);
  },
});

// 塞西莉亚之恩赐（S·木，RELICS.md）：你将死亡时，延迟其 1 回合的到来。
//
// 实现＝「致命拦截 + 奇迹1」，拦截点是伤害指令的 PRE（PRE 在 execute 之前跑，是唯一
// 能改变本次结算结果的时机；PRE 里提交的子指令要到 execute 之后才生效，挡不住这一下）。
// 拦截动作照搬闪避的 veto 范式：被 veto 的节点从未执行、不触发任何 POST，再把「刚好把
// 生命留到 1」的伤害与「奇迹1」作为替代指令插回原位。
//
// 为什么替代伤害要 fixed：fixed 的 payload 白名单为空，PRE 不可再修饰——否则易伤等
// 加深伤害的 PRE 会在我们算完之后把这一下重新变成致命伤（奇迹1 那时还没生效）。
// 为什么每场战斗至多一次：奇迹耗尽即死亡，若拦截可重复触发，死亡会被无限延迟；
// 归零死亡另带 tags:['miracle'] 兜底豁免（见 effects.js 的 miracle）。
registerRelic({
  id: 'ceciliaBlessing', name: '塞西莉亚之恩赐',
  description: '每场战斗一次：你将死亡时，改为保留 1 点生命并获得奇迹1（自己回合结束时奇迹 -1，归零即死亡）。',
  subscriptions: () => {
    let used = false; // 每场战斗重置：subscriptions 在战前装配时调用一次
    return [{
      when: DealDamageInstruction,
      phase: 'pre',
      // 致命判定写在 react 而不是 filter：内核 _collect 是「先对所有订阅跑 filter、
      // 再按 priority 排序跑 react」，所以 filter 里读到的是**所有伤害修饰之前**的
      // payload——格挡减半、换伤翻倍都还没写入。只看数值的 filter 会在临界值上判错。
      // priority -100 让本 react 排到所有修饰 react 之后（它们都是 0），此时 payload
      // 才是最终伤害。
      priority: -100,
      filter: (instr, ctx) => !used
        && instr.target === ctx.player
        && !instr.tags?.includes('miracle')
        && ctx.player.getEffectStacks('miracle') <= 0, // 已有奇迹地板时无需拦截
      react: (instr, ctx) => {
        if (!wouldBeLethal(instr, ctx.player)) return; // 修饰后的最终伤害才算数
        used = true;
        const p = ctx.player;
        // 留 1 点生命：护盾先吸、余额打掉 hp-1（fixed 不过防御，故只补护盾）
        ctx.kernel.veto(instr, 'cecilia', [
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
