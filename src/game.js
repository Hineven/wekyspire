import backendEventBus, { EventNames } from "./backendEventBus";
import * as dialogues from './data/dialogues'
import SkillManager from './data/skillManager.js'
import {backendGameState as gameState, backendGameState} from './data/gameState.js'
import { startBattle, useSkill, dropSkill, endPlayerTurn } from './data/battle.js'
import {
  claimMoney, claimSkillReward, claimAbilityReward, claimBreakthroughReward, reorderSkills, purchaseItem, spawnRewards, clearRewards
} from './data/rest.js'

function startGame() {
  // 触发开场事件（通过对话模块触发后端事件，总线隔离）
  dialogues.triggerBeforeGameStart();

  // 为玩家添加初始技能到养成技能列表（写入后端状态）
  const initialSkill1 = SkillManager.getInstance().createSkill('拳打脚踢');
  const initialSkill2 = SkillManager.getInstance().createSkill('活动筋骨');
  const initialSkill3 = SkillManager.getInstance().createSkill('打滚');
  const initialSkill4 = SkillManager.getInstance().createSkill('抱头防御');

  backendGameState.player.cultivatedSkills = [initialSkill1, initialSkill2, initialSkill3, initialSkill4];

  // 升满级调试
  // while(backendGameState.player.tier < 9) {
  //   upgradePlayerTier(backendGameState.player);
  // }

  // 以事件驱动开始第一场战斗
  backendEventBus.emit(EventNames.Game.ENTER_BATTLE_STAGE);
}

export function initGameFlowListeners() {
  // 注册后端对话系统监听器
  dialogues.registerListeners();

  // 游戏开始
  backendEventBus.on(EventNames.Game.GAME_START, () => {
    startGame();
  });

  // 开始战斗（统一入口）
  backendEventBus.on(EventNames.Game.ENTER_BATTLE_STAGE, () => {
    startBattle();
  });

  // 玩家使用技能（由前端仅发事件，不直接调用函数）
  backendEventBus.on(EventNames.Player.USE_SKILL, (uniqueID) => {
    const skill = gameState.player.frontierSkills.find(s => s.uniqueID === uniqueID);
    console.log('使用技能：', skill);
    if (skill) useSkill(skill);
    else {
      console.warn(`技能使用失败：前台技能列表中未找到id为 ${uniqueID} 的技能`);
      console.log(gameState.player.frontierSkills);
    }
  });

  // 玩家丢弃最左侧技能
  backendEventBus.on(EventNames.Player.DROP_SKILL, () => {
    dropSkill();
  });

  // 玩家结束回合
  backendEventBus.on(EventNames.Player.END_TURN, () => {
    endPlayerTurn();
  });

  // 战斗结束后的流程编排（胜利进入休整；失败进入结束）
  backendEventBus.on(EventNames.Game.POST_BATTLE, ({ isVictory }) => {
    // 结算战斗结果
    if (isVictory) {
      // 计算奖励
      clearRewards();
      spawnRewards();
      gameState.gameStage = 'rest';
      gameState.isVictory = true;
    } else {
      // 玩家失败
      gameState.isVictory = false;
      gameState.gameStage = 'end';
    }
    if (!isVictory) {
      // 失败：宣告游戏结束（UI 监听 game-over 做收尾）
      backendEventBus.emit(EventNames.Game.GAME_OVER, { reason: 'defeat' });
    } else {
      // 胜利：已在 battle.js 中设置 gameStage='rest' 并生成奖励；等待休整结束
      backendEventBus.emit(EventNames.Game.ENTER_REST_STAGE);
    }
  });

  // 休整阶段：事件驱动的后端结算与流程推进
  backendEventBus.on(EventNames.Rest.CLAIM_MONEY, () => {
    claimMoney();
  });
  backendEventBus.on(EventNames.Rest.CLAIM_SKILL, ({ skill, slotIndex, clearRewards }) => {
    claimSkillReward(skill, slotIndex, !!clearRewards);
  });
  backendEventBus.on(EventNames.Rest.CLAIM_ABILITY, ({ ability, clearRewards }) => {
    claimAbilityReward(ability, !!clearRewards);
  });
  backendEventBus.on(EventNames.Rest.CLAIM_BREAKTHROUGH, () => {
    claimBreakthroughReward();
  });
  backendEventBus.on(EventNames.Rest.REORDER_SKILLS, ({skillIDs}) => {
    reorderSkills(skillIDs);
  });
  backendEventBus.on(EventNames.Rest.PURCHASE_ITEM, ({ item }) => {
    const ok = purchaseItem(item);
    if (ok) {
      // 刷新商店物品，由后端生成，显示层通过投影自动更新
      spawnRewards();
    }
  });
  backendEventBus.on(EventNames.Rest.FINISH, () => {
    backendEventBus.emit(EventNames.Rest.END);
  });

  // 休整结束后继续下一场战斗
  backendEventBus.on(EventNames.Rest.END, () => {
    backendEventBus.emit(EventNames.Game.ENTER_BATTLE_STAGE);
  });
}