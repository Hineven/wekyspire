<template>
  <div class="action-panel" :class="{ 'disabled': !isPlayerTurn || isControlDisabled }">
    <div class="skills">
      <SkillCard
        v-for="skill in visibleSkills"
        :key="skill.uniqueID"
        :skill="skill"
        :player="player"
        :disabled="!canUseSkill(skill) || !isPlayerTurn || isControlDisabled"
        :player-mana="player.mana"
        :suppress-activation-animation-on-click="true"
        :style="appearing[skill.uniqueID] ? { visibility: 'hidden' } : null"
        :ref="el => setCardRef(el, skill.uniqueID)"
        @skill-card-clicked="onSkillCardClicked"
      />
    </div>
    <button @click="onDropSkillButtonClicked" :disabled="!canDropSkill">⚡1 丢弃头部技能</button>
    <button @click="onEndTurnButtonClicked" :disabled="!isPlayerTurn || isControlDisabled">结束回合</button>
  </div>
</template>

<script>
import SkillCard from './SkillCard.vue';
import frontendEventBus from '../frontendEventBus.js';
import backendEventBus, { EventNames } from '../backendEventBus';
import { enqueueUI } from '../data/animationDispatcher.js';

export default {
  name: 'ActionPanel',
  components: { SkillCard },
  props: {
    player: { type: Object, required: true },
    isControlDisabled: { type: Boolean, default: false },
    isPlayerTurn: { type: Boolean, default: true }
  },
  data() {
    return {
      cardRefs: {},
      prevIds: [],
      appearing: {}
    };
  },
  computed: {
    canDropSkill() {
      return (this.isPlayerTurn && !this.isControlDisabled && this.player.remainingActionPoints > 0);
    },
    visibleSkills() {
      return (this.player?.frontierSkills || []).filter(Boolean);
    },
    visibleIds() {
      return this.visibleSkills.map(s => s.uniqueID);
    }
  },
  mounted() {
    frontendEventBus.on('card-appear-finished', this.onCardAppearFinished);
  },
  beforeUnmount() {
    frontendEventBus.off('card-appear-finished', this.onCardAppearFinished);
  },
  watch: {
    visibleIds: {
      immediate: true,
      handler(newIds, oldIds) {
        if (!oldIds || oldIds.length === 0) {
          this.prevIds = [...newIds];
          return;
        }
        const prevSet = new Set(this.prevIds);
        const added = newIds.filter(id => !prevSet.has(id));
        this.prevIds = [...newIds];
        if (added.length === 0) return;
        // 先标记为出现中，避免闪现
        added.forEach(id => { this.appearing[id] = true; });
        // 等待DOM挂载完成，再播放“从牌库出现”动画
        this.$nextTick(() => {
          added.forEach(id => this.animateAppearFromDeck(id));
        });
      }
    }
  },
  methods: {
    onCardAppearFinished(payload = {}) {
      const id = payload?.id;
      if (id != null && this.appearing[id]) {
        delete this.appearing[id];
      }
    },
    setCardRef(el, id) {
      if (el) {
        this.cardRefs[id] = el;
      } else {
        delete this.cardRefs[id];
      }
    },
    animateAppearFromDeck(id, retry = 0) {
      const comp = this.cardRefs[id];
      const el = comp && comp.$el ? comp.$el : null;
      if (!el) {
        if (retry < 3) {
          setTimeout(() => this.animateAppearFromDeck(id, retry + 1), 16);
        } else {
          // 兜底：避免永远隐藏
          delete this.appearing[id];
        }
        return;
      }
      enqueueUI(
        'animateCardPlay',
        { el, kind: 'appearFromDeck', options: { id, durationMs: 450, startScale: 0.6, fade: true } },
        { duration: 0 }
      );
      // 保险兜底：如果事件未按时回来，自动解除隐藏
      setTimeout(() => { if (this.appearing[id]) delete this.appearing[id]; }, 1200);
    },
    canUseSkill(skill) {
      return skill && typeof skill.canUse === 'function' && skill.canUse(this.player) && skill.usesLeft !== 0;
    },
    onSkillCardClicked(skill, event) {
      if (this.canUseSkill(skill)) {
        const startEl = event?.currentTarget || (event?.target && event.target.closest && event.target.closest('.skill-card')) || null;
        const manaCost = skill.manaCost;
        const actionPointCost = skill.actionPointCost;
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        const skillIndex = this.player.frontierSkills.indexOf(skill);

        if (startEl) {
          enqueueUI('animateCardPlay', { el: startEl });
        }
        // 触发后端逻辑
        setTimeout(() => backendEventBus.emit(EventNames.Player.USE_SKILL, skill.uniqueID), 0);

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
/* 操作面板 */
.action-panel {
  position: absolute;
  bottom: 0;
  width: 100%;
  padding: 15px;
}

.action-panel.disabled {
  filter: brightness(50%);
  pointer-events: none;
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
  position: relative;
}
</style>
