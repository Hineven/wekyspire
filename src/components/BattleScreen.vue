<template>
  <div class="battle-screen">
    <!-- 战斗场次 -->
    <h3 style="color: white;"> 第{{ level }}层 </h3>
    <!-- 顶部状态面板区域 -->
    <div class="status-panels">
      <!-- 敌人状态面板 -->
      <EnemyStatusPanel 
        :enemy="enemy"
        :z-index="2"
        ref="enemyStatusPanel"
      />

      <!-- 玩家状态面板 -->
      <PlayerStatusPanel 
        :player="player"
        ref="playerStatusPanel"
      />
    </div>

    <!-- 战斗日志面板 -->
    <BattleLogPanel 
      :logs="logs"
      :enemy="enemy"
    />
    
    <!-- 操作面板 -->
    <div class="action-panel" :class="{ 'disabled': !isPlayerTurn || isControlDisabled }">
      <div class="skills">
        <transition-group name="card-movement">
        <SkillCard
          v-for="(skill, index) in player.frontierSkills.filter(skill => skill !== null)" 
          :key="skill.uniqueID"
          :skill="skill"
          :player="player"
          :disabled="!canUseSkill(skill) || !isPlayerTurn || isControlDisabled"
          :player-mana="player.mana"
          @skill-card-clicked="onSkillCardClicked"
        />
        </transition-group>
      </div>
      <button @click="onDropSkillButtonClicked" :disabled="!canDropSkill">⚡1 丢弃头部技能</button>
      <button @click="onEndTurnButtonClicked" :disabled="!isPlayerTurn || isControlDisabled">结束回合</button>
    </div>
  </div>
</template>

<script>
import BattleLogPanel from './BattleLogPanel.vue';
import EnemyStatusPanel from './EnemyStatusPanel.vue';
import PlayerStatusPanel from './PlayerStatusPanel.vue';
import SkillCard from './SkillCard.vue';
import frontendEventBus from '../frontendEventBus.js';
import backendEventBus, {EventNames} from "../backendEventBus";

export default {
  name: 'BattleScreen',
  components: {
    BattleLogPanel,
    EnemyStatusPanel,
    PlayerStatusPanel,
    SkillCard
  },
  props: {
    player: { type: Object, required: true },
    enemy: { type: Object, required: true },
    isControlDisabled: { type: Boolean, default: false },
    isPlayerTurn: { type: Boolean, default: true },
    level: { type: Number, default: 1 }
  },
  data() {
    return {
      logs: []
    };
  },
  mounted() {
    frontendEventBus.on('add-battle-log', this.onAddBattleLog);
    frontendEventBus.on('clear-battle-log', this.onClearBattleLog);
  },
  beforeUnmount() {
    frontendEventBus.off('add-battle-log', this.onAddBattleLog);
    frontendEventBus.off('clear-battle-log', this.onClearBattleLog);
  },
  computed: {
    canDropSkill() {
      return (this.isPlayerTurn && !this.isControlDisabled && this.player.remainingActionPoints > 0);
    }
  },
  methods: {
    onAddBattleLog(value) {
      // 兼容字符串与对象格式
      this.logs.push(value);
    },
    onClearBattleLog() {
      this.logs = [];
    },
    canUseSkill(skill) {
      return skill && typeof skill.canUse === 'function' && skill.canUse(this.player) && skill.usesLeft !== 0;
    },
    onSkillCardClicked(skill, event) {
      if(this.canUseSkill(skill)) {
        const manaCost = skill.manaCost;
        const actionPointCost = skill.actionPointCost;
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        const skillIndex = this.player.frontierSkills.indexOf(skill);
        backendEventBus.emit(EventNames.Player.USE_SKILL, skillIndex);
        this.generateParticleEffects(manaCost, actionPointCost, mouseX, mouseY);
      }
    },
    onEndTurnButtonClicked() {
      backendEventBus.emit(EventNames.Player.END_TURN);
    },
    onDropSkillButtonClicked() {
      backendEventBus.emit(EventNames.Player.DROP_SKILL);
    },
    generateParticleEffects(manaCost, actionPointCost, mouseX, mouseY) {
      const particles = [];
      if (manaCost > 0) {
        for (let i = 0; i < 2 + manaCost * 8; i++) {
          particles.push({
            x: mouseX, y: mouseY,
            vx: (Math.random() - 0.5) * 100,
            vy: (Math.random() - 0.5) * 100 - 50,
            color: '#2196f3', life: 2000, gravity: 400, size: 3 + Math.random() * 2
          });
        }
      }
      if (actionPointCost > 0) {
        for (let i = 0; i < 2 + actionPointCost * 8; i++) {
          particles.push({
            x: mouseX, y: mouseY,
            vx: (Math.random() - 0.5) * 100,
            vy: (Math.random() - 0.5) * 100 - 50,
            color: '#FFD700', life: 2000, gravity: 400, size: 3 + Math.random() * 2
          });
        }
      }
      frontendEventBus.emit('spawn-particles', particles);
    }
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
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
}

/* 顶部状态面板区域 */
.status-panels {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  min-height: 200px;
}

/* 操作面板 */
.action-panel {
  border: 1px solid #ccc;
  padding: 15px;
  border-radius: 8px;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.action-panel.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
  position: relative;
}

.card-movement-enter-from,
.card-movement-leave-to {
  opacity: 0;
  transform: translateY(-50px);
}
.card-movement-move,
.card-movement-enter-active,
.card-movement-leave-active {
  transition: all 0.3s ease;
}

.card-movement-leave-active {
  position: absolute;
}

/* 移除之前的包装器样式，改用JavaScript动态设置位置 */
.skills .skill-card {
  position: relative;
}
.card-movement-leave-active {
  left: 0;
  top: 0;
}

</style>
