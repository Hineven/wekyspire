<template>
  <div id="game-app">
    <!-- 开始游戏界面 -->
    <StartScreen 
      v-if="gameState.gameStage === 'start'"
      :game-state="gameState"
    />
    
    <!-- 战斗界面 -->
    <BattleScreen 
      v-if="gameState.gameStage === 'battle'"
      :player="gameState.player"
      :enemy="gameState.enemy"
      :is-control-disabled="gameState.controlDisableCount > 0"
      :is-player-turn="!gameState.isEnemyTurn"
      :level="gameState.battleCount"
    />
    <!-- 休整界面 -->
    <RestScreen 
      v-if="gameState.gameStage === 'rest'"
      :game-state="gameState"
    />

    <!-- 结束界面 -->
    <EndScreen 
      v-if="gameState.gameStage === 'end'" 
      :is-victory="gameState.isVictory"
      @restart-game="restartGame"
    />
    
    <!-- 对话界面 -->
    <DialogScreen />
    
    <!-- Boss登场特效界面 -->
    <BossShowupAnimation />
    
    <!-- 过场动画界面 -->
    <CutsceneScreen :game-state="gameState" />
    
    <!-- 音频控制界面 -->
    <AudioControllerScreen />
    
    <!-- 粒子效果管理器 -->
    <ParticleEffectManager />
    
    <!-- 消息弹出框界面 -->
    <MessagePopupScreen />
  </div>
</template>

<script>
import StartScreen from './components/StartScreen.vue'
import BattleScreen from './components/BattleScreen.vue'
import RestScreen from './components/RestScreen.vue'
import EndScreen from './components/EndScreen.vue'
import DialogScreen from './components/DialogScreen.vue'
import BossShowupAnimation from './components/BossShowupAnimation.vue'
import CutsceneScreen from './components/CutsceneScreen.vue'
import AudioControllerScreen from './components/AudioControllerScreen.vue'
import ParticleEffectManager from './components/ParticleEffectManager.vue'
import MessagePopupScreen from './components/MessagePopupScreen.vue'
import SkillManager from './data/skillManager.js'

import eventBus from './eventBus.js'
import * as dialogues from './data/dialogues.js'
import { displayGameState as gameState, backendGameState, resetAllGameStates } from './data/gameState.js';
import { startBattle } from './data/battle.js'

export default {
  name: 'App',
  components: {
    StartScreen,
    BattleScreen,
    RestScreen,
    EndScreen,
    DialogScreen,
    BossShowupAnimation,
    CutsceneScreen,
    AudioControllerScreen,
    ParticleEffectManager,
    MessagePopupScreen
  },
  computed: {
    isPlayerTurn() {
      return !gameState.isEnemyTurn;
    }
  },
  data() {
    return {
      gameState: gameState
    }
  },
  mounted() {
    this.eventBus = eventBus;
    // 不再在App层维护战斗日志，交由BattleScreen本地管理
    // 注册对话监听
    dialogues.registerListeners(eventBus);
    dialogues.setIsRemiPresent(gameState.isRemiPresent);

    this.eventBus.on('start-game', () => {
        this.startGame();
    });
    },
  beforeUnmount() {
    if(this.eventBus) {
      this.eventBus.off('start-game');
      dialogues.unregisterListeners(eventBus);
    }
  },
  watch: {
    // 当显示层的故事模式开关变化时，同步给对话系统
    'gameState.isRemiPresent'(val) {
      dialogues.setIsRemiPresent(val);
    }
  },
  methods: {
    startGame() {
      // 触发开场事件
      eventBus.emit('before-game-start');
      
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
    },
    restartGame() {
      // 重置两份游戏状态
      resetAllGameStates();

    },
  }
}
</script>

<style>
#game-app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  /* color: #eef7ff; */
  /* margin-top: 60px; */
  user-select: none;
  position: relative;
  height:100vh;
}

</style>