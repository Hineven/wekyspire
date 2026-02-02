<template>
  <div class="battle-screen">
    <!-- 战斗标题 -->
    <h3 style="color: white;"> {{name}} </h3>
    <!-- 悬空Display区域 -->
    <div class="status-panels">
      <!-- 敌人 -->
      <EnemyStatusDisplay
        :enemy="enemy"
        :z-index="2"
        ref="enemyStatusDisplay"
      />

    </div>

    <!-- 战斗日志面板 -->
    <BattleLogPanel 
      :logs="logs"
      :enemy="enemy"
    />

    <!-- 操作面板 -->
    <ActionPanel
      :player="player"
      :is-player-turn="isPlayerTurn"
    />

  </div>
</template>

<script>
import BattleLogPanel from './BattleLogPanel.vue';
import EnemyStatusDisplay from './EnemyStatusDisplay.vue';
import ActionPanel from './ActionPanel.vue';
import frontendEventBus from '../../frontendEventBus.js';

export default {
  name: 'BattleScreen',
  components: {
    BattleLogPanel,
    EnemyStatusDisplay,
    ActionPanel,
  },
  props: {
    player: { type: Object, required: true },
    enemy: { type: Object, required: true },
    isPlayerTurn: { type: Boolean, default: true },
    level: { type: Number, default: 1 }
  },
  methods: {
  }
};
</script>

<style scoped>
.battle-screen {
  margin: 0 auto;
  max-width: 1200px;
  height:100vh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  position: relative;
}

</style>
