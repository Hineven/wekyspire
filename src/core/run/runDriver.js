import Player from '../state/player.js';
import { createSkillRuntime } from '../state/skillRuntime.js';
import { BODY_STARTER_DECK } from '../content/bodySkills.js';
import { createNullPresenter } from '../presenter.js';
import { canUseSkill } from '../skills/helpers.js';
import {
  startBattle, playerUseSkill, playerEndTurn, isBattleFinished,
} from '../flow/battle.js';
import {
  createRun, enterBattle, createRunBattle, finishBattle, completeRewards, completeRoom,
} from './runFlow.js';
import { chooseSkillReward, isRewardsClaimed } from './rewards.js';
import { trainingMode, upgradableCards, trainUpgrade, trainDrawChoices, trainDraw } from './rooms/training.js';
import { chooseAscension, chooseAscensionAbility } from './ascension.js';
import { campOptions, campRest, campRecoverRemi } from './rooms/camp.js';
import { playEvent } from './rooms/event.js';

// Headless 整局 SDK（类比 BattleDriver，RUN_DESIGN §6.5）：一行驱动完整爬塔，
// 供 agent 批量验证流程正确性与（未来的）经济平衡/奖励分布。
//
// const d = new RunDriver({ seed: 7, totalFloors: 11 });
// d.start().runToEnd();
// d.expect(r => r.result === 'victory', '应当杀穿');
//
// 奖励领取/房间抉择目前走占位直通（completeRewards/completeRoom），
// onRewards/onRoom 钩子随各系统落地逐个替换。
export class RunDriver {
  constructor({
    seed = 1,
    profile = null,
    totalFloors,                 // 覆盖塔高（故事模式/测试；缺省 44）
    deck = [...BODY_STARTER_DECK], // 缺省=现行初始卡组（bodySkills 导出，随平衡改动同步）
    abilities = ['battleFocus'],
    player = {},                 // Player 构造参数覆盖
    battlePolicy = null,         // (battle) => skillRuntime | null（缺省=打第一张可出的牌）
  } = {}) {
    this.opts = { seed, profile, totalFloors, deck, abilities, player, battlePolicy };
    this.run = null;
    this.lastBattle = null;
    this.history = [];           // [{ floor, encounter, room }] 供确定性对账
    this.onRewards = null;       // (run) => 奖励领取抉择（占位直通）
    this.onRoom = null;          // (run) => 房间抉择（占位直通）
    this.onAscension = null;     // (run) => 进阶事件抉择（占位直通）
  }

  start() {
    const { seed, profile, totalFloors, deck, abilities, player } = this.opts;
    this.run = createRun({
      seed, profile,
      ...(totalFloors !== undefined ? { totalFloors } : {}),
      player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3, ...player }),
    });
    this.run.player.deck = deck.map(id => createSkillRuntime(id));
    this.run.player.abilities = abilities;
    return this;
  }

  get stage() { return this.run.gameStage; }
  get floor() { return this.run.floor; }
  get result() { return this.run.result; }
  isFinished() { return this.run.gameStage === 'end'; }

  // 打当前层战斗：策略驱动到终局，回写 run。
  fightBattle({ maxSteps = 400 } = {}) {
    const battle = createRunBattle(this.run, { presenter: createNullPresenter() });
    startBattle(battle);
    let steps = 0;
    while (!isBattleFinished(battle)) {
      if (++steps > maxSteps) throw new Error(`战斗超过 ${maxSteps} 步，疑似卡死（floor=${this.run.floor}）`);
      if (battle.battleState.pendingInput) {
        throw new Error('战斗遇到结算期输入请求，RunDriver 占位策略不支持（需手动处理）');
      }
      const pick = this.opts.battlePolicy?.(battle)
        ?? battle.ctx.battleState.zones.hand.find(s => canUseSkill(battle.ctx, s));
      if (pick) playerUseSkill(battle, pick.uniqueID);
      else playerEndTurn(battle);
    }
    this.lastBattle = battle;
    finishBattle(this.run, battle.ctx.kernel.verdict, battle);
    return this;
  }

  // 推进阶段机一步（end 时返回 false）
  step() {
    switch (this.run.gameStage) {
      case 'prep': {
        const { floor, encounter } = this.run;
        enterBattle(this.run);
        this.fightBattle();
        if (this.run.gameStage === 'reward') this.history.push({ floor, encounter, room: null });
        return true;
      }
      case 'reward':
        this.onRewards?.(this.run);
        // 缺省领取策略：钩子未抉择时领第一个候选（占位，供后续替换）
        if (!isRewardsClaimed(this.run)) {
          chooseSkillReward(this.run, this.run.rewards.skillChoices[0] ?? null);
        }
        completeRewards(this.run);
        if (this.run.gameStage === 'room') {
          this.history[this.history.length - 1].room = this.run.currentRoom;
        }
        return true;
      case 'room':
        this.onRoom?.(this.run);
        this.defaultRoomAction(this.run);
        completeRoom(this.run);
        return true;
      case 'ascension':
        this.onAscension?.(this.run);
        chooseAscension(this.run, 'fire'); // 缺省加火灵脉（占位）
        if (this.run.ascensionOffer) {
          chooseAscensionAbility(this.run, this.run.ascensionOffer[0] ?? null);
        }
        return true;
      default:
        return false;
    }
  }

  // 房间缺省抉择（占位直通）：钩子未处理时走各房最小默认行为
  defaultRoomAction(run) {
    switch (run.currentRoom) {
      case 'training':
        // 先升后抓：升级后强制三选一，headless 缺省取首张候选
        if (trainingMode(run) === 'upgrade') {
          trainUpgrade(run, upgradableCards(run)[0].uniqueID);
          trainDraw(run, run.roomData.drawChoices[0]);
        } else { trainDrawChoices(run); trainDraw(run, null); } // 抓牌分支缺省跳过
        break;
      case 'camp':
        // 缺省：瑞米被打跑则找回，否则休整（保命优先）
        if (campOptions(run).includes('recoverRemi')) campRecoverRemi(run);
        else campRest(run);
        break;
      case 'event':
        playEvent(run);
        break;
      default:
        break; // slot 缺省不抽奖（省钱；老虎机交互待阶段 7 UI 接入）
    }
  }

  // 一行跑完整局
  runToEnd({ maxSteps = 1000 } = {}) {
    let steps = 0;
    while (!this.isFinished()) {
      if (++steps > maxSteps) throw new Error(`runToEnd 超过 ${maxSteps} 步，疑似卡死`);
      this.step();
    }
    return this;
  }

  expect(fn, msg = '断言失败') {
    if (!fn(this)) throw new Error(msg);
    return this;
  }
}
