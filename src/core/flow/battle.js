import BattleKernel from '../kernel/BattleKernel.js';
import { createBattleState, aliveEnemies } from '../state/battleState.js';
import { createNullPresenter } from '../presenter.js';
import { canUseSkill } from '../skills/helpers.js';
import { UseSkillInstruction } from '../instructions/skill.js';
import { PlayerTurnInstruction, TurnLoopInstruction } from '../instructions/turn.js';
import {
  BattleRootInstruction, PreBattleInstruction, PostBattleInstruction,
} from '../instructions/battleRoot.js';

// 战斗装配与玩家操作 API。流程：
//   const battle = createBattle({ runState, enemies, allies, seed, presenter });
//   startBattle(battle);                    // 跑到第一次玩家 WAIT
//   playerUseSkill(battle, uniqueID);       // 出牌（作为当前玩家回合指令的子指令提交）
//   playerEndTurn(battle);                  // 结束回合 → 敌方回合 → 下一玩家回合再次 WAIT
//   isBattleFinished(battle) / battle.ctx.kernel.verdict
export function createBattle({
  runState, enemies = [], allies = [], seed = 1, presenter = null, config = {},
}) {
  const battleState = createBattleState({
    enemies, allies, seed,
    chantCapacity: runState.player.chantSlotBase,
  });
  battleState.config = { initialDraw: 4, drawPerTurn: 3, ...config };
  battleState.result = null;

  const kernel = new BattleKernel({
    isBattleOver: (ctx) => {
      if (ctx.player.isDead()) return 'defeat';
      if (aliveEnemies(ctx.battleState).length === 0) return 'victory';
      return null;
    },
  });
  const ctx = {
    runState, battleState,
    player: runState.player,
    kernel,
    presenter: presenter ?? createNullPresenter(),
  };

  // 战斗根：战前 → 回合循环 → 战后。终局 abort TurnLoop，让战后清理正常执行。
  const pre = new PreBattleInstruction();
  const turnLoop = new TurnLoopInstruction();
  const post = new PostBattleInstruction();
  kernel.getAbortTarget = () => turnLoop;

  const root = new BattleRootInstruction();
  root.children = [pre, turnLoop, post];
  for (const c of root.children) c.parentInstruction = root;

  return { kernel, ctx, root, battleState, turnLoop };
}

export function startBattle(battle) {
  battle.kernel.run(battle.root, battle.ctx);
}

// 当前挂起的玩家回合指令（暂停时栈为 [root, turnLoop, playerTurn]）
export function currentPlayerTurn(battle) {
  return battle.kernel.stack.find(i => i instanceof PlayerTurnInstruction) ?? null;
}

export function isWaitingPlayerInput(battle) {
  const turn = currentPlayerTurn(battle);
  return !!turn && turn._waiting && !turn.endRequested;
}

export function isBattleFinished(battle) {
  return battle.kernel.stack.length === 0;
}

// 玩家出牌：可用性检查 → 作为当前回合指令的子节点提交 → 恢复泵
export function playerUseSkill(battle, uniqueID) {
  const { ctx, kernel } = battle;
  const turn = currentPlayerTurn(battle);
  if (!turn || !turn._waiting) return false;
  const skill = ctx.battleState.zones.hand.find(s => s.uniqueID === uniqueID);
  if (!skill || !canUseSkill(ctx, skill)) return false;
  kernel.submitInstruction(new UseSkillInstruction({ skill }), turn);
  kernel.resume(turn, ctx);
  return true;
}

// 玩家结束回合
export function playerEndTurn(battle) {
  const { ctx, kernel } = battle;
  const turn = currentPlayerTurn(battle);
  if (!turn || !turn._waiting) return false;
  turn.endRequested = true;
  kernel.resume(turn, ctx);
  return true;
}
