import { describe, it, expect, beforeEach } from 'vitest';
import '../src/core/content/index.js'; // 注册全部最小内容
import Player from '../src/core/state/player.js';
import Enemy from '../src/core/state/enemy.js';
import { createRunState } from '../src/core/state/runState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { createRecordingPresenter } from '../src/core/presenter.js';
import { registerEnemy, getEnemyDefinition } from '../src/core/enemies/registry.js';
import { getAllyDefinition } from '../src/core/allies/registry.js';
import { canUseSkill } from '../src/core/skills/helpers.js';
import { DealDamageInstruction } from '../src/core/instructions/combat.js';
import {
  createBattle, startBattle, playerUseSkill, playerEndTurn,
  isBattleFinished, isWaitingPlayerInput,
} from '../src/core/flow/battle.js';

function makeRun(deckIds, { abilities = ['battleFocus'] } = {}) {
  const runState = createRunState({ player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }) });
  runState.player.deck = deckIds.map(id => createSkillRuntime(id));
  runState.player.abilities = abilities;
  return runState;
}

// 简单出牌策略：优先咏唱，其次点火，再次冲拳，没得出就结束回合
function playOneCard(battle) {
  const { ctx } = battle;
  const priority = ['focusChant', 'inflame', 'punch'];
  for (const defId of priority) {
    const skill = ctx.battleState.zones.hand.find(s => s.defId === defId && canUseSkill(ctx, s));
    if (skill) return playerUseSkill(battle, skill.uniqueID);
  }
  return false;
}

describe('完整 headless 战斗', () => {
  beforeEach(() => {
    // 内容在模块加载时已注册（content/index.js），每个用例补充注册测试专用敌人
    registerEnemy({
      id: 'killer', name: '杀手',
      createUnit: () => new Enemy({ defId: 'killer', name: '杀手', maxHp: 50 }),
      act(actx) {
        actx.kernel.submitInstruction(new DealDamageInstruction({
          source: actx.unit, target: actx.player, amount: 100,
        }));
      },
    });
  });

  it('胜利路径：瑞米先动 → 玩家出牌 → 敌人行动，燃烧跳伤，全程到 victory', () => {
    const runState = makeRun(['punch', 'punch', 'guard', 'inflame', 'focusChant']);
    const slime = getEnemyDefinition('slime').createUnit();
    const remi = getAllyDefinition('remi').createUnit();
    const presenter = createRecordingPresenter();
    const battle = createBattle({ runState, enemies: [slime], allies: [remi], seed: 7, presenter });

    startBattle(battle);

    // ---- 战前 + 首回合开始阶段断言（泵停在第一次玩家 WAIT）----
    expect(isWaitingPlayerInput(battle)).toBe(true);
    expect(battle.battleState.turn.count).toBe(1);
    expect(battle.battleState.turn.side).toBe('player');
    expect(battle.battleState.zones.hand).toHaveLength(4);           // 初始抽牌
    expect(slime.hp).toBe(18);                                       // 瑞米先于玩家行动：20-2
    expect(runState.player.getStat('attack')).toBe(1);               // 战意：+1 力量
    expect(slime.intention).toEqual({ type: 'attack', value: 3 });   // 初始意图
    expect(presenter.calls.some(c => c.method === 'battleStart')).toBe(true);

    // ---- 脚本驱动直到战斗结束 ----
    let steps = 0;
    while (!isBattleFinished(battle) && steps < 100) {
      steps++;
      if (!playOneCard(battle)) playerEndTurn(battle);
    }
    expect(steps).toBeLessThan(100);

    // ---- 结果断言 ----
    expect(battle.ctx.kernel.verdict).toBe('victory');
    expect(battle.battleState.result).toBe('victory');
    expect(slime.isDead()).toBe(true);
    expect(runState.player.isDead()).toBe(false);
    expect(presenter.calls.some(c => c.method === 'battleEnd' && c.args[0].result === 'victory')).toBe(true);

    // 咏唱卡至少激活过一次（进入了咏唱槽）
    expect(presenter.calls.some(c => c.method === 'chantStarted')).toBe(true);
    // 点火施加过燃烧，且燃烧跳过穿透伤害
    expect(presenter.calls.some(c => c.method === 'effect' && c.args[0].effectId === 'burn')).toBe(true);
    expect(presenter.calls.some(c => c.method === 'damage' && c.args[0].pierce === true)).toBe(true);
    // 战后清理：battle 窗口订阅全部注销
    expect(battle.ctx.kernel.subscriptions).toHaveLength(0);
    // history 有累计
    expect(battle.battleState.history.battle.played).toBeGreaterThan(0);
    expect(battle.battleState.history.battle.damageDealt).toBeGreaterThan(0);
  });

  it('失败路径：玩家暴毙于敌方回合，后续敌人行动被 abort，战后清理照常', () => {
    const runState = makeRun(['punch'], { abilities: [] });
    const k1 = getEnemyDefinition('killer').createUnit();
    const k2 = getEnemyDefinition('killer').createUnit();
    const presenter = createRecordingPresenter();
    const battle = createBattle({ runState, enemies: [k1, k2], seed: 3, presenter });

    startBattle(battle);
    expect(isWaitingPlayerInput(battle)).toBe(true);

    playerEndTurn(battle); // 敌方回合：k1 一击致命

    expect(isBattleFinished(battle)).toBe(true);
    expect(runState.player.hp).toBe(0);
    expect(battle.ctx.kernel.verdict).toBe('defeat');
    expect(k1.actionIndex).toBe(1);  // k1 行动过
    expect(k2.actionIndex).toBe(0);  // k2 被 abort，未曾行动
    // 战后清理照常执行（abort 的是 TurnLoop，不是根）
    expect(presenter.calls.some(c => c.method === 'battleEnd' && c.args[0].result === 'defeat')).toBe(true);
    expect(battle.ctx.kernel.subscriptions).toHaveLength(0);
  });

  it('燃烧效果联动：燃焰术士给玩家上燃烧，玩家回合开始跳伤递减', () => {
    const runState = makeRun(['guard', 'guard', 'punch', 'punch', 'punch'], { abilities: [] });
    const pyro = getEnemyDefinition('pyro').createUnit();
    pyro.maxHp = 200; // 拉满血量，保证它能活到第三次行动（上燃烧）
    pyro.hp = 200;
    const presenter = createRecordingPresenter();
    const battle = createBattle({ runState, enemies: [pyro], seed: 5, presenter });

    startBattle(battle);
    // 过四个玩家回合：pyro 行动 0,1,2,3 —— 第 2 次（敌方第三回合）给玩家上 2 层燃烧，
    // 第四个玩家回合开始时燃烧跳 2 伤并递减为 1 层
    for (let i = 0; i < 4 && !isBattleFinished(battle); i++) {
      while (playOneCard(battle)) { /* 出到不能出 */ }
      playerEndTurn(battle);
    }
    // pyro 第三次行动已给玩家上 2 层燃烧；之后的玩家回合开始跳 2 伤并减为 1 层
    const burnTicks = presenter.calls.filter(c =>
      c.method === 'damage' && c.args[0].pierce === true && c.args[0].target === runState.player);
    expect(burnTicks.length).toBeGreaterThan(0);
    expect(runState.player.getEffectStacks('burn')).toBeLessThanOrEqual(1);
  });
});
