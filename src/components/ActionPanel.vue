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

    <!-- 使用独立的 DeckIcon 组件作为牌库图标与锚点 -->
    <DeckIcon
      ref="deckAnchor"
      :count="backupSkillsCount"
      :names="backupSkillsPreview"
      :top-skill="topBackupSkill"
      :player="player"
      @click="onDeckClick"
    />

    <!-- Deck 全屏覆盖面板 -->
    <DeckOverlayPanel
      v-if="showDeckOverlay"
      :skills="player?.backupSkills || []"
      :player="player"
      @close="showDeckOverlay = false"
    />

    <button @click="onDropSkillButtonClicked" :disabled="!canDropSkill">⚡1 丢弃头部技能</button>
    <button @click="onEndTurnButtonClicked" :disabled="!isPlayerTurn || isControlDisabled">结束回合</button>
  </div>
</template>

<script>
import SkillCard from './SkillCard.vue';
import DeckIcon from './DeckIcon.vue';
import DeckOverlayPanel from './DeckOverlayPanel.vue';
import frontendEventBus from '../frontendEventBus.js';
import backendEventBus, { EventNames } from '../backendEventBus';
import { registerCardEl, unregisterCardEl } from '../utils/cardDomRegistry.js';
import orchestrator from '../utils/animationOrchestrator.js';

export default {
  name: 'ActionPanel',
  components: { SkillCard, DeckIcon, DeckOverlayPanel },
  props: {
    player: { type: Object, required: true },
    isControlDisabled: { type: Boolean, default: false },
    isPlayerTurn: { type: Boolean, default: true }
  },
  data() {
    return {
      cardRefs: {},
      prevIds: [],
      appearing: {},
      showDeckOverlay: false
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
    },
    backupSkillsCount() {
      return (this.player?.backupSkills || []).length;
    },
    backupSkillsPreview() {
      // 预览前5张后备技能名称
      const list = (this.player?.backupSkills || []).slice(0, 5);
      return list.map(s => s?.name || '(未知技能)');
    },
    topBackupSkill() {
      return (this.player?.backupSkills || [])[0] || null;
    }
  },
  mounted() {
    frontendEventBus.on('card-appear-finished', this.onCardAppearFinished);
    // 将动画的“牌库锚点”指向 DeckIcon 的根元素
    this.$nextTick(() => {
      const r = this.$refs.deckAnchor;
      const el = r && r.$el ? r.$el : r;
      if (el) orchestrator.deckAnchorEl = el;
    });
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
        const dom = el.$el ? el.$el : el;
        registerCardEl(id, dom);
      } else {
        unregisterCardEl(id);
        delete this.cardRefs[id];
      }
    },
    animateAppearFromDeck(id) {
      // 改为请求后端/流程层触发动画（通过 uniqueID 定位DOM），本地只做兜底超时解除隐藏
      frontendEventBus.emit('request-card-appear', { id });
      setTimeout(() => { if (this.appearing[id]) delete this.appearing[id]; }, 1500);
    },
    canUseSkill(skill) {
      return skill && typeof skill.canUse === 'function' && skill.canUse(this.player) && skill.usesLeft !== 0;
    },
    onSkillCardClicked(skill, event) {
      if (this.canUseSkill(skill)) {
        const manaCost = skill.manaCost;
        const actionPointCost = skill.actionPointCost;
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        // 后端现在接受 uniqueID
        backendEventBus.emit(EventNames.Player.USE_SKILL, skill.uniqueID);
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
    },
    onDeckClick() {
      // 打开牌库覆盖面板，并隐藏悬浮tooltip
      this.showDeckOverlay = true;
      frontendEventBus.emit('tooltip:hide');
    }
  }
};
</script>

<style scoped>
/***** 操作面板 *****/
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

/* DeckIcon 自带样式，不再在此定义 */
</style>
