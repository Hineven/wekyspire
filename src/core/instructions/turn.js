import BattleInstruction, { WAIT } from '../kernel/BattleInstruction.js';
import { resetTurnHistory, aliveAllies, aliveEnemies } from '../state/battleState.js';
import { DrawCardsInstruction } from './cards.js';
import { SkillCooldownInstruction } from './skill.js';
import AIActInstruction from './aiAct.js';
import { getAllyDefinition } from '../allies/registry.js';
import { getEnemyDefinition } from '../enemies/registry.js';

// ---- 回合标记指令：本身无结算，是效果订阅的挂载点（回合开始/结束效果 = 其 POST 订阅） ----

export class TurnStartInstruction extends BattleInstruction {
  constructor(side, opts = {}) {
    super(opts);
    this.side = side;   // 燃烧等效果按 side 过滤（自己的回合开始才 tick）
  }
  execute() { return true; }
}

export class TurnEndInstruction extends BattleInstruction {
  constructor(side, opts = {}) {
    super(opts);
    this.side = side;
  }
  execute() { return true; }
}

export class PlayerTurnStartInstruction extends TurnStartInstruction {
  constructor(opts = {}) { super('player', opts); }
}
export class EnemyTurnStartInstruction extends TurnStartInstruction {
  constructor(opts = {}) { super('enemy', opts); }
}
export class PlayerTurnEndInstruction extends TurnEndInstruction {
  constructor(opts = {}) { super('player', opts); }
}
export class EnemyTurnEndInstruction extends TurnEndInstruction {
  constructor(opts = {}) { super('enemy', opts); }
}

// ---- 玩家回合：阶段机。stage 4 挂起（WAIT）等待玩家操作 ----
// 开始结算 → 冷却推进 → 抽牌 → 队友（瑞米）依次行动 → WAIT 玩家输入 → 回合结束结算
export class PlayerTurnInstruction extends BattleInstruction {
  constructor(opts = {}) {
    super(opts);
    this.endRequested = false;   // 玩家点"结束回合"时由流程层置位
  }

  execute(ctx) {
    switch (this._stage) {
      case 0:
        ctx.battleState.turn.side = 'player';
        ctx.battleState.turn.count += 1;
        resetTurnHistory(ctx.battleState);
        ctx.player.shield = 0;    // 护盾在自己回合开始清零（持续整个敌方回合）
        ctx.player.mana = ctx.player.maxMana;
        ctx.player.actionPoints = ctx.player.maxActionPoints;
        ctx.kernel.submitInstruction(new PlayerTurnStartInstruction(), this);
        return false;
      case 1:
        ctx.kernel.submitInstruction(new SkillCooldownInstruction(), this);
        return false;
      case 2:
        // 首回合不抽牌：起手牌由 PreBattle 的 initialDraw 发放
        if (ctx.battleState.turn.count > 1) {
          ctx.kernel.submitInstruction(
            new DrawCardsInstruction({ count: ctx.battleState.config.drawPerTurn }), this);
        }
        return false;
      case 3:
        for (const ally of aliveAllies(ctx.battleState)) {
          ctx.kernel.submitInstruction(
            new AIActInstruction({ unit: ally, resolveDef: getAllyDefinition }), this);
        }
        return false;
      case 4:
        if (this.endRequested) return false;
        return WAIT;
      case 5:
        ctx.kernel.submitInstruction(new PlayerTurnEndInstruction(), this);
        return false;
      default:
        return true;
    }
  }
}

// ---- 敌方回合：敌人按数组序依次行动，行动后预算下回合意图 ----
export class EnemyTurnInstruction extends BattleInstruction {
  execute(ctx) {
    switch (this._stage) {
      case 0:
        ctx.battleState.turn.side = 'enemy';
        for (const e of aliveEnemies(ctx.battleState)) e.shield = 0;
        ctx.kernel.submitInstruction(new EnemyTurnStartInstruction(), this);
        return false;
      case 1:
        for (const e of aliveEnemies(ctx.battleState)) {
          ctx.kernel.submitInstruction(
            new AIActInstruction({ unit: e, resolveDef: getEnemyDefinition }), this);
        }
        return false;
      case 2:
        for (const e of aliveEnemies(ctx.battleState)) {
          const def = getEnemyDefinition(e.defId);
          e.intention = def.getIntention ? def.getIntention(e) : null;
        }
        ctx.kernel.submitInstruction(new EnemyTurnEndInstruction(), this);
        return false;
      default:
        return true;
    }
  }
}

// ---- 回合循环：交替提交玩家/敌方回合，直到内核终局 abort（战斗结束的唯一出口） ----
export class TurnLoopInstruction extends BattleInstruction {
  execute(ctx) {
    if (this._stage % 2 === 0) {
      ctx.kernel.submitInstruction(new PlayerTurnInstruction(), this);
    } else {
      ctx.kernel.submitInstruction(new EnemyTurnInstruction(), this);
    }
    return false;
  }
}
