<template>
  <div id="game-app">
    <!-- Three.js渲染层（核心渲染场景） -->
    <ThreejsScreen />

    <!-- TODO: [阶段2重构] 以下组件需迁移为Three.js舞台元素 -->
    <!-- 暂时注释，功能将在后续阶段逐步实现 -->

    <!-- 永久保留的Vue HUD（最小集合） -->
    <!-- TODO: 对话系统（阶段后期集成）-->
    <!-- TODO: 音频控制（阶段后期集成）-->
  </div>
</template>

<script>
// Three.js前端重构 - 主应用组件
// 此文件已清理deprecated组件引用，功能将在重构阶段逐步添加

import ThreejsScreen from './components/global/ThreejsScreen.vue'
import { displayGameState as gameState, resetAllGameStates } from './data/gameState.js';

export default {
  name: 'App',
  components: {
    ThreejsScreen
  },
  data() {
    return {
      gameState: gameState
    }
  },
  mounted() {
    console.log('[GameApp] Mounted - Three.js refactored version');
    console.log('[GameApp] Game stage:', gameState.gameStage);
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

.screen-transition-enter-active, .screen-transition-leave-active {
  transition: opacity 0.5s;
}
.screen-transition-enter-from, .screen-transition-leave-to {
  opacity: 0;
}

</style>