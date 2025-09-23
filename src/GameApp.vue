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

import frontendEventBus from './frontendEventBus.js'
import { displayGameState as gameState, resetAllGameStates } from './data/gameState.js';

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
  watch: {
    // 当显示层的故事模式开关变化时，同步给对话系统
    'gameState.isRemiPresent'(val) {
      dialogues.setIsRemiPresent(val);
    }
  },
  methods: {
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