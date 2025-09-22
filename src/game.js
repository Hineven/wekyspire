import backendEventBus from "./backendEventBus";
import * as dialogues from './data/dialogues'
import SkillManager from './data/skillManager.js'
import { backendGameState } from './data/gameState.js'
import { startBattle } from './data/battle.js'
function startGame() {
  // 触发开场事件（通过对话模块触发后端事件，总线隔离）
  dialogues.triggerBeforeGameStart();

  // 为玩家添加初始技能到技能槽（写入后端状态）
  const initialSkill1 = SkillManager.getInstance().createSkill('拳打脚踢');
  const initialSkill2 = SkillManager.getInstance().createSkill('活动筋骨');
  const initialSkill3 = SkillManager.getInstance().createSkill('打滚');
  const initialSkill4 = SkillManager.getInstance().createSkill('抱头防御');

  // 以一次性替换数组的方式写入，减少深度watch触发次数
  const slots = backendGameState.player.skillSlots.slice();
  slots[0] = initialSkill1;
  slots[1] = initialSkill2;
  slots[2] = initialSkill3;
  slots[3] = initialSkill4;
  backendGameState.player.skillSlots = slots;

  // 开始第一场战斗（写入后端状态）
  startBattle();
}

export function initGameFlowListeners() {

  // 注册后端对话系统监听器
  dialogues.registerListeners();

  // start-game
  backendEventBus.on('start-game', () => {
    startGame();
  });
}