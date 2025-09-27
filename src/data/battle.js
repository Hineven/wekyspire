// battle.js - 战斗阶段逻辑

import EnemyFactory from './enemyFactory.js'
import backendEventBus, { EventNames } from '../backendEventBus.js'
import { processStartOfTurnEffects, processEndOfTurnEffects, processSkillActivationEffects } from './effectProcessor.js'
import { addSystemLog, addPlayerActionLog, addEnemyActionLog, addDeathLog } from './battleLogUtils.js'
import { backendGameState as gameState } from './gameState.js'
import { enqueueUI, enqueueDelay } from './animationDispatcher.js'

// 开始战斗
export function startBattle() {
  
  gameState.battleCount++;
  
  // 生成敌人
  generateEnemy(gameState);

  // 战前事件
  backendEventBus.emit(EventNames.Game.BEFORE_BATTLE, {
    battleCount: gameState.battleCount,
    player: gameState.player,
    enemy: gameState.enemy
  });
  
  // 从技能槽克隆技能到战斗技能数组
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
  
  // 切换游戏状态到战斗状态
  gameState.gameStage = 'battle';

  // 开始玩家游戏回合
  startPlayerTurn(gameState);
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

// 开始玩家回合
export function startPlayerTurn() {
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

  // 回合开始时结算效果
  const isStunned = processStartOfTurnEffects(gameState.player);
  if (isStunned) {
    addSystemLog('你被眩晕，跳过回合！');
    endPlayerTurn(gameState);
    return;
  }

  enqueueUI('unlockControl');
  
  // 强制刷新操作面板渲染
  // 注意：在Vue组件中可能需要不同的处理方式
  
  // 等待玩家操作
  // 玩家操作通过BattleScreen组件的事件处理
}

// 使用技能
export function useSkill(skill) {
  // 使用技能逻辑
  addPlayerActionLog(`你使用了 /blue{${skill.name}}！`);

  // 让前端播放技能卡片的使用动画
  enqueueUI('animateCardById', {id: skill.uniqueID, kind: 'centerThenDeck'});

  // 通知UI层锁定控制面板
  enqueueUI('lockControl');

  // 资源结算（后端状态）
  skill.consumeResources(gameState.player);
  
  // 技能发动时结算效果（后端状态）
  processSkillActivationEffects(gameState.player);

  var stage = 0;
  // 发动技能效果
  while(true) {
    const result = skill.use(gameState.player, gameState.enemy, stage);

    // 先检查玩家死亡
    if (gameState.player.hp <= 0) {
      addDeathLog(`你 被击败了！`);
      endBattle(false);
      enqueueUI('unlockControl');
      // 提前退出结算
      return;
    }
    // 然后再检查敌人死亡
    if (gameState.enemy.hp <= 0) {
      addDeathLog(`${gameState.enemy.name} 被击败了！`);
      endBattle(true);
      enqueueUI('unlockControl');
      // 提前退出结算
      return;
    }
    if(result === true) break;
    stage ++;
  }

  backendEventBus.emit(EventNames.Player.AFTER_SKILL_USE, { player: gameState.player, skill: skill });
  handleSkillAfterUse(skill);

  // UI解锁
  enqueueUI('unlockControl');
}


// 玩家放弃最左侧技能
export function dropSkill() {
  // 消耗1个行动力
  gameState.player.consumeActionPoints(1);
  // 从前台技能中移除最左侧技能
  const droppedSkill = gameState.player.frontierSkills.shift();
  if (droppedSkill) {
    // 左侧技能进入后备技能
    gameState.player.backupSkills.push(droppedSkill);
    // 触发技能丢弃事件
    backendEventBus.emit(EventNames.Player.SKILL_DROPPED, { skill: droppedSkill });
  }
}

// 敌人回合
export function enemyTurn() {
  // 敌人行动逻辑
  gameState.isEnemyTurn = true;

  enqueueUI('lockControl');

  addEnemyActionLog(`/red{${gameState.enemy.name}} 的回合！`);

  enqueueDelay(1000);

  // 触发敌人回合开始事件
  backendEventBus.emit(EventNames.Enemy.TURN_START);

  // 回合开始时结算效果
  const isStunned = processStartOfTurnEffects(gameState.enemy);
  if (isStunned) {
    addSystemLog('敌人被眩晕，跳过回合！');
    // 触发敌人回合结束事件，通知BattleScreen组件
    backendEventBus.emit(EventNames.Enemy.TURN_END);
    startNextTurn(gameState);
    enqueueUI('unlockControl');
    return;
  }

  // 等待敌人行动完成（包括所有攻击动画）
  gameState.enemy.act(gameState.player);
  // 看看玩家是不是逝了
  const isPlayerDead = gameState.player.hp <= 0;

  if (isPlayerDead) {
    endBattle(false);
    return;
  }
  // 触发敌人行动结束事件，通知BattleScreen组件
  backendEventBus.emit(EventNames.Enemy.ACTION_END);
  // 结算敌人回合结束效果
  processEndOfTurnEffects(gameState.enemy);
  // 触发敌人回合结束事件，通知BattleScreen组件
  backendEventBus.emit(EventNames.Enemy.TURN_END);
  // 敌人行动结束后开始新回合
  startNextTurn(gameState);
}

// 结束玩家回合
export function endPlayerTurn() {
  // 回合结束时结算效果
  processEndOfTurnEffects(gameState.player);
  
  // 检查玩家是否死亡
  if (gameState.player.hp <= 0) {
    endBattle(false);
    return;
  }
  
  // 执行敌人回合
  enemyTurn(gameState);
}

// 开始下一回合
export function startNextTurn(gameState) {
  // 检查游戏是否结束
  if (gameState.player.hp <= 0) {
    endBattle(false);
    return;
  }
  
  if (gameState.enemy.hp <= 0) {
    endBattle(true);
    return;
  }
  
  addSystemLog(`你的回合！`);
  // 开始新回合
  startPlayerTurn(gameState);
}

// 结束战斗
export function endBattle(isVictory) {
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

  // 发送胜利事件
  if(isVictory) backendEventBus.emit(EventNames.Enemy.BATTLE_VICTORY);

  // 添加延迟，让玩家体验到胜利或失败的感觉
  enqueueDelay(3000);
  // 解锁操作面板
  enqueueUI('unlockControl');

  // 战斗结束事件
  backendEventBus.emit(EventNames.Game.AFTER_BATTLE, {
    battleCount : gameState.battleCount,
    player: gameState.player,
    enemy: gameState.enemy,
    isVictory: isVictory
  });
}


function fillFrontierSkills(player) {
  // 从后备技能列表头部取技能，直到前台技能数量达到最大值
  while (player.frontierSkills.length < player.maxFrontierSkills && player.backupSkills.length > 0) {
    const skill = player.backupSkills.shift();
    player.frontierSkills.push(skill);
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
    // 从前台技能列表中移除
    gameState.player.frontierSkills.splice(index, 1);

    if (skill.coldDownTurns !== 0 || skill.maxUses === Infinity) {
      // 如果是可充能/无限使用技能，移动到后备技能列表尾部
      gameState.player.backupSkills.push(skill);
      addSystemLog(`/blue{${skill.name}} 进入后备。`);
    } else {
      // 如果是不可充能技能，直接从技能列表中移除
      const skillsIndex = gameState.player.skills.findIndex(s => s === skill);
      if (skillsIndex !== -1) {
        gameState.player.skills.splice(skillsIndex, 1);
      }
      addSystemLog(`/blue{${skill.name}} 已耗尽。`);
    }

    // 触发技能列表更新事件
    backendEventBus.emit(EventNames.Player.FRONTIER_UPDATED, {
      frontierSkills: gameState.player.frontierSkills,
      backupSkills: gameState.player.backupSkills
    });
  }

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