import { describe, it, expect } from 'vitest';
import BattleKernel from '../src/core/kernel/BattleKernel.js';
import Player from '../src/core/state/player.js';
import Enemy from '../src/core/state/enemy.js';
import Ally from '../src/core/state/ally.js';
import { createRunState } from '../src/core/state/runState.js';
import { createBattleState, firstAliveEnemy } from '../src/core/state/battleState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { createRecordingPresenter } from '../src/core/presenter.js';
import { registerEnemy, getEnemyDefinition, clearEnemyRegistry } from '../src/core/enemies/registry.js';
import { registerAlly, getAllyDefinition, clearAllyRegistry } from '../src/core/allies/registry.js';
import { registerAbility, getAbilityDefinition, clearAbilityRegistry } from '../src/core/abilities/registry.js';
import { clearSkillRegistry, registerSkill } from '../src/core/skills/registry.js';
import { registerEffect, clearEffectRegistry } from '../src/core/effects/registry.js';
import AIActInstruction from '../src/core/instructions/aiAct.js';
import { DealDamageInstruction, GainShieldInstruction } from '../src/core/instructions/combat.js';
import { DrawCardsInstruction } from '../src/core/instructions/cards.js';

function setup() {
  clearEnemyRegistry();
  clearAllyRegistry();
  clearAbilityRegistry();
  clearSkillRegistry();
  clearEffectRegistry();
  registerEffect({ id: 'strength', type: 'buff', stacking: 'count', statModifiers: { attack: s => s } });
  registerSkill({ id: 'dummy', name: '占位', cost: {}, use: () => true });

  // 固定行动序列敌人：攻3 → 盾4 循环
  registerEnemy({
    id: 'slime', name: '史莱姆',
    createUnit: () => new Enemy({ defId: 'slime', maxHp: 20 }),
    act(actx) {
      if (actx.unit.actionIndex % 2 === 0) {
        actx.kernel.submitInstruction(new DealDamageInstruction({
          source: actx.unit, target: actx.player, amount: 3,
        }));
      } else {
        actx.kernel.submitInstruction(new GainShieldInstruction({ target: actx.unit, amount: 4 }));
      }
    },
    getIntention: (unit) => (unit.actionIndex % 2 === 0
      ? { type: 'attack', value: 3 } : { type: 'defend', value: 4 }),
  });

  // 瑞米：每次行动对首个存活敌人造成 2 点伤害
  registerAlly({
    id: 'remi', name: '瑞米',
    createUnit: () => new Ally({ defId: 'remi', maxHp: 15 }),
    act(actx) {
      const target = firstAliveEnemy(actx.battleState);
      if (target) {
        actx.kernel.submitInstruction(new DealDamageInstruction({
          source: actx.unit, target, amount: 2,
        }));
      }
    },
  });

  // 能力：战斗开始获得 1 层力量；抽牌后记录
  registerAbility({
    id: 'battleFocus', name: '战意',
    onBattleStart(ctx) { ctx.player.addEffect('strength', 1); },
    subscriptions: (ctx) => [{
      when: DrawCardsInstruction, phase: 'post',
      react: () => { ctx.player.mana = Math.min(ctx.player.mana + 1, ctx.player.maxMana); },
    }],
  });

  const runState = createRunState({ player: new Player({ maxHp: 30, maxMana: 3 }) });
  const slime = getEnemyDefinition('slime').createUnit();
  const remi = getAllyDefinition('remi').createUnit();
  const battleState = createBattleState({ enemies: [slime], allies: [remi], seed: 5 });
  const presenter = createRecordingPresenter();
  const kernel = new BattleKernel();
  const ctx = { runState, battleState, player: runState.player, kernel, presenter };
  return { ctx, slime, remi };
}

describe('AIActInstruction：敌人固定序列', () => {
  it('按 actionIndex 交替行动并推进游标', () => {
    const { ctx, slime } = setup();
    ctx.kernel.run(new AIActInstruction({ unit: slime, resolveDef: getEnemyDefinition }), ctx);
    expect(ctx.player.hp).toBe(27);
    expect(slime.actionIndex).toBe(1);

    ctx.kernel.run(new AIActInstruction({ unit: slime, resolveDef: getEnemyDefinition }), ctx);
    expect(slime.shield).toBe(4);
    expect(slime.actionIndex).toBe(2);
  });

  it('死亡单位跳过行动', () => {
    const { ctx, slime } = setup();
    slime.hp = 0;
    ctx.kernel.run(new AIActInstruction({ unit: slime, resolveDef: getEnemyDefinition }), ctx);
    expect(ctx.player.hp).toBe(30);
    expect(slime.actionIndex).toBe(0); // 游标不推进
  });

  it('意图预览由定义给出', () => {
    const { slime } = setup();
    expect(getEnemyDefinition('slime').getIntention(slime)).toEqual({ type: 'attack', value: 3 });
  });
});

describe('AIActInstruction：队友（瑞米）', () => {
  it('队友行动攻击首个存活敌人，与敌人共用指令', () => {
    const { ctx, slime, remi } = setup();
    ctx.kernel.run(new AIActInstruction({ unit: remi, resolveDef: getAllyDefinition }), ctx);
    expect(slime.hp).toBe(18);
    expect(remi.actionIndex).toBe(1);
  });
});

describe('能力契约', () => {
  it('onBattleStart 生效，subscriptions 走同一订阅模型', () => {
    const { ctx } = setup();
    const ability = getAbilityDefinition('battleFocus');

    ability.onBattleStart(ctx);
    expect(ctx.player.getStat('attack')).toBe(1); // 0 base + 1 层力量

    ability.subscriptions(ctx).forEach(sub => ctx.kernel.addSubscription({ window: 'battle', ...sub }));
    ctx.battleState.zones.deck.push(createSkillRuntime('dummy'));
    ctx.player.mana = 0;
    ctx.kernel.run(new DrawCardsInstruction({ count: 1 }), ctx);
    expect(ctx.player.mana).toBe(1);
  });
});
