// battle.js - 战斗阶段逻辑

import EnemyFactory from './enemyFactory.js'
import backendEventBus, { EventNames } from '../backendEventBus.js'
import { processStartOfTurnEffects, processEndOfTurnEffects, processSkillActivationEffects } from './effectProcessor.js'
import { addSystemLog, addPlayerActionLog, addEnemyActionLog, addDeathLog } from './battleLogUtils.js'
import { backendGameState as gameState } from './gameState.js'
import { enqueueUI, enqueueDelay } from './animationDispatcher.js'
import {burnSkillCard, drawSkillCard, dropSkillCard} from "./battleUtils";

// 开始战斗
export function enterBattleStage() {
  
  gameState.battleCount++;

  // 生成敌人
  generateEnemy(gameState);

  // 战前事件
  backendEventBus.emit(EventNames.Game.PRE_BATTLE, {
    battleCount: gameState.battleCount,
    player: gameState.player,
    enemy: gameState.enemy
  });

  // 切换游戏状态到战斗状态
  gameState.gameStage = 'battle';

  // 进入游戏控制流
  backendEventBus.emit(EventNames.Battle.BATTLE_START);
}

function startBattle() {
  // 从技能槽克隆技能到战斗技能数组
  console.log('Starting battle with cultivated skills:', gameState.player.cultivatedSkills);
  gameState.player.skills = gameState.player.cultivatedSkills
    .filter(skill => skill !== null)
    .map(skill => cloneSkill(skill));


  // 初始化前台和后备技能列表
  gameState.player.backupSkills = [...gameState.player.skills];
  gameState.player.frontierSkills = [];

  // 填充前台技能
  fillFrontierSkills(gameState.player);

  // 调用技能的onBattleStart方法
  gameState.player.skills.forEach(skill => {
    skill.onBattleStart();
  });

  // 添加战斗日志
  addSystemLog(`战斗 #${gameState.battleCount} 开始！`);
  addSystemLog(`遭遇了 ${gameState.enemy.name}！`);

  // 开始玩家回合
  backendEventBus.emit(EventNames.Battle.PLAYER_TURN, {});
}

// 开始玩家回合
function startPlayerTurn() {
  // 确保这是玩家回合
  gameState.isEnemyTurn = false;

  // 补充行动力
  gameState.player.remainingActionPoints = gameState.player.maxActionPoints;

  // 进行技能冷却
  gameState.player.skills.forEach(skill => {
    skill.coldDown();
  });

  // 填充前台技能
  fillFrontierSkills(gameState.player);

  enqueueDelay(300);
  // 回合开始时结算效果（使用修正后的玩家对象）
  const modPlayer = gameState.player.getModifiedPlayer ? gameState.player.getModifiedPlayer() : gameState.player;
  const isStunned = processStartOfTurnEffects(modPlayer);
  if(checkBattleVictory()) return ;

  if (isStunned) {
    addSystemLog('你被眩晕，跳过回合！');
    // 触发玩家回合结束事件
    backendEventBus.emit(EventNames.Battle.PLAYER_END_TURN, {});
    return;
  }

  enqueueUI('unlockControl');

  // 等待玩家操作
  // 玩家操作通过BattleScreen组件的事件处理
  // 玩家结束回合后会自动进入下一阶段
}

function checkBattleVictory () {
  // 看看玩家是不是逝了
  const isPlayerDead = gameState.player.hp <= 0;
  const isEnemyDead = gameState.enemy.hp <= 0;

  if (isPlayerDead) {
    backendEventBus.emit(EventNames.Battle.BATTLE_VICTORY, false);
    return true;
  }

  // 看看敌人是不是逝了
  if (isEnemyDead) {
    backendEventBus.emit(EventNames.Battle.BATTLE_VICTORY, true);
    return true;
  }

  return false;
}

// 生成敌人
export function generateEnemy() {
  // 根据战斗场次数生成敌人
  const battleIntensity = gameState.battleCount;
  
  // 简单实现：在第2 + 6xn (n = 1, 2, 3, ...）场战斗时生成Boss
  if (gameState.battleCount !== 2 && (gameState.battleCount - 2) % 6 === 0) {
    gameState.enemy = EnemyFactory.generateRandomEnemy(battleIntensity, true);
  } else {
    // 普通敌人
    gameState.enemy = EnemyFactory.generateRandomEnemy(battleIntensity, false);
  }
}

// 此技能返回值必须被检查！
export function activateSkill (skill) {
  // 技能发动时结算效果（后端状态，使用修正后的玩家）
  const modPlayer = gameState.player.getModifiedPlayer ? gameState.player.getModifiedPlayer() : gameState.player;
  processSkillActivationEffects(modPlayer);
  if(checkBattleVictory()) return true;

  var stage = 0;
  // 发动技能效果（对技能传入修正后的玩家）
  while(true) {
    const result = skill.use(modPlayer, gameState.enemy, stage);
    if(checkBattleVictory()) return true;

    if(result === true) break;
    stage ++;
  }
  return false;
}

// 使用技能
function useSkill(skill) {
  // 使用技能逻辑
  addPlayerActionLog(`你使用了 /blue{${skill.name}}！`);

  // 技能脱手发动动画（卡牌移动到中央）
  enqueueUI('animateCardById', {id: skill.uniqueID, kind: 'flyToCenter'});

  // 通知UI层锁定控制面板
  // enqueueUI('lockControl');

  // 增设一条idle动画指令，确保animateCardByID动画完成后才开始播放卡牌发动带来的各种效果的动画
  enqueueUI('idle', {}, { blockBeforePreviousAnimations: true });

  // 资源结算（后端状态）
  skill.consumeResources(gameState.player);
  
  // 触发技能发动前效果与技能主体
  if(activateSkill(skill)) return ;

  if(checkBattleVictory()) return ;

  backendEventBus.emit(EventNames.Player.SKILL_USED, { player: gameState.player, skill: skill });
  handleSkillAfterUse(skill);

  if(checkBattleVictory()) return ;

  // UI解锁
  // enqueueUI('unlockControl', {}, { blockBeforePreviousAnimations: true });
  enqueueUI('idle', {}, { blockBeforePreviousAnimations: true });
}


// 玩家放弃最左侧技能
export function dropLeftmostSkill() {
  // 消耗1个行动力
  gameState.player.consumeActionPoints(1);
  // 从前台技能中移除最左侧技能
  dropSkillCard(gameState.player, gameState.player.frontierSkills[0].uniqueID);
  if(checkBattleVictory()) return ;
}


// 结束玩家回合
function endPlayerTurn() {
  // 回合结束时结算效果（使用修正后的玩家）
  const modPlayer = gameState.player.getModifiedPlayer ? gameState.player.getModifiedPlayer() : gameState.player;
  processEndOfTurnEffects(modPlayer);

  if(checkBattleVictory()) return ;

  // 进入敌人回合
  backendEventBus.emit(EventNames.Battle.ENEMY_TURN, {})
}

// 敌人回合
function enemyTurn() {
  // 敌人行动逻辑
  gameState.isEnemyTurn = true;

  enqueueUI('lockControl');

  addEnemyActionLog(`/red{${gameState.enemy.name}} 的回合！`);

  enqueueDelay(500);

  // 触发敌人回合开始事件
  backendEventBus.emit(EventNames.Enemy.TURN_START);

  // 回合开始时结算效果
  const isStunned = processStartOfTurnEffects(gameState.enemy);
  if(checkBattleVictory()) return ;

  if (isStunned) {
    addSystemLog('敌人被眩晕，跳过回合！');
  } else {
    // 等待敌人行动完成（包括所有攻击动画），对敌人传入修正后的玩家以包含防御修正
    const modPlayer = gameState.player.getModifiedPlayer ? gameState.player.getModifiedPlayer() : gameState.player;
    gameState.enemy.act(modPlayer);
  }


  if(checkBattleVictory()) return ;
  enqueueDelay(500);

  // 触发敌人行动结束事件，通知BattleScreen组件
  backendEventBus.emit(EventNames.Enemy.ACTION_END);
  // 结算敌人回合结束效果
  processEndOfTurnEffects(gameState.enemy);

  if(checkBattleVictory()) return ;
  enqueueDelay(500);

  // 触发敌人回合结束事件，通知BattleScreen组件
  backendEventBus.emit(EventNames.Enemy.TURN_END);
  // 敌人行动结束后进入玩家回合
  backendEventBus.emit(EventNames.Battle.PLAYER_TURN, {});
}

// 结束战斗
function battleVictory(isVictory) {
  // 清空玩家身上的所有效果
  gameState.player.effects = {};
  // 清空玩家身上的护盾
  gameState.player.shield = 0;
  // 清空战斗技能数组
  gameState.player.skills = [];

  // 锁定操作面板
  gameState.isEnemyTurn = true;
  
  // 弹出胜利信息
  if (isVictory) {
    addSystemLog("/green{你胜利了！}");
  } else {
    addSystemLog("/red{你失败了！}");
  }

  // 添加延迟，让玩家体验到胜利或失败的感觉
  enqueueDelay(3000);

  // 清理掉卡牌ghost
  enqueueUI('clearCardAnimations');

  // 解锁操作面板
  enqueueUI('unlockControl');

  // 战斗结束事件
  backendEventBus.emit(EventNames.Game.POST_BATTLE, {
    battleCount : gameState.battleCount,
    player: gameState.player,
    enemy: gameState.enemy,
    isVictory: isVictory
  });
}

function fillFrontierSkills(player) {
  // 从后备技能列表头部取技能，直到前台技能数量达到最大值
  while (player.frontierSkills.length < player.maxFrontierSkills && player.backupSkills.length > 0) {
    drawSkillCard(player);
    // const skill = player.backupSkills.shift();
    // player.frontierSkills.push(skill);
  }
  
  // 触发技能列表更新事件
  backendEventBus.emit(EventNames.Player.FRONTIER_UPDATED, {
    frontierSkills: player.frontierSkills,
    backupSkills: player.backupSkills
  });
}

// 处理技能使用后的逻辑
function handleSkillAfterUse(skill) {
  // 查找技能在前台技能列表中的位置
  const index = gameState.player.frontierSkills.findIndex(s => s === skill);
  if (index !== -1) {
    // 首先，入队一个idle指令，保证后续动画在技能使用动画结束之后播放
    enqueueUI('idle', {}, { blockBeforePreviousAnimations: true });
    if (skill.coldDownTurns !== 0 || skill.maxUses === Infinity || skill.remainingUses > 0) {
      // 如果是可充能/无限使用技能，或者充能有剩余，移动到后备技能列表尾部
      dropSkillCard(gameState.player, skill.uniqueID);
    } else {
      // 如果是不可充能技能，焚毁
      burnSkillCard(gameState.player, skill.uniqueID);
    }

    // 触发技能列表更新事件
    backendEventBus.emit(EventNames.Player.FRONTIER_UPDATED, {
      frontierSkills: gameState.player.frontierSkills,
      backupSkills: gameState.player.backupSkills
    });
  }
}

export function initializeBattleFlowListeners() {
  // 战斗开始
  backendEventBus.on(EventNames.Battle.BATTLE_START, () => {
    startBattle();
  });

  // 玩家回合开始
  backendEventBus.on(EventNames.Battle.PLAYER_TURN, () => {
    startPlayerTurn();
  });


  // 玩家使用技能
  backendEventBus.on(EventNames.Battle.PLAYER_USE_SKILL, (uniqueID) => {
    const skill = gameState.player.frontierSkills.find(s => s.uniqueID === uniqueID);
    console.log('使用技能：', skill);
    if (skill) {
      // 额外检查一次技能是否能使用，因为前端是异步动画，所以如果玩家操作过快则可能会尝试发动无法使用的技能
      if(gameState.gameStage === 'battle' && gameState.isPlayerTurn && skill.canUse(gameState.player)) {
        useSkill(skill);
      } else {
        console.warn(`技能使用失败：技能 ${skill.name} 当前无法使用。`);
      }
    } else {
      console.warn(`技能使用失败：前台技能列表中未找到id为 ${uniqueID} 的技能`);
      console.log(gameState.player.frontierSkills);
    }
  });

  // 玩家丢弃最左侧技能
  backendEventBus.on(EventNames.Battle.PLAYER_DROP_SKILL, () => {
    dropLeftmostSkill();
  });

  // 玩家结束回合
  backendEventBus.on(EventNames.Battle.PLAYER_END_TURN, () => {
    endPlayerTurn();
  });

  // 敌人回合开始
  backendEventBus.on(EventNames.Battle.ENEMY_TURN, () => {
    enemyTurn();
  })

  // 战斗结束
  backendEventBus.on(EventNames.Battle.BATTLE_VICTORY, (isVictory) => {
    battleVictory(isVictory);
  });
}

// 克隆技能对象
function cloneSkill(skill) {
  // 获取技能的原型
  const skillPrototype = Object.getPrototypeOf(skill);
  
  // 创建一个新的技能实例
  const clonedSkill = Object.create(skillPrototype);
  
  // 复制所有可枚举的属性
  for (const key in skill) {
    if (skill.hasOwnProperty(key)) {
      const value = skill[key];
      
      // 对于基础数据类型，直接复制
      if (value === null || 
          typeof value === 'undefined' || 
          typeof value === 'boolean' || 
          typeof value === 'number' || 
          typeof value === 'string' || 
          typeof value === 'symbol' || 
          value instanceof Date) {
        clonedSkill[key] = value;
      }
      // 对于函数，保持引用（通常不需要克隆函数）
      else if (typeof value === 'function') {
        clonedSkill[key] = value;
      }
      // 对于数组，创建新数组并递归克隆元素
      else if (Array.isArray(value)) {
        clonedSkill[key] = value.map(item => 
          typeof item === 'object' && item !== null ? cloneSkill(item) : item
        );
      }
      // 对于对象，递归克隆
      else if (typeof value === 'object') {
        clonedSkill[key] = cloneSkill(value);
      }
      // 其他情况直接复制
      else {
        clonedSkill[key] = value;
      }
    }
  }
  
  return clonedSkill;
}