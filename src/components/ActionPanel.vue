<template>
  <div class="action-panel" :class="{ 'disabled': !isPlayerTurn || isControlDisabled }">
    <SkillsHand
      :player="player"
      :is-control-disabled="isControlDisabled"
      :is-player-turn="isPlayerTurn"
    />

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
import SkillsHand from './SkillsHand.vue';
import DeckIcon from './DeckIcon.vue';
import DeckOverlayPanel from './DeckOverlayPanel.vue';
import frontendEventBus from '../frontendEventBus.js';
import backendEventBus, { EventNames } from '../backendEventBus';
import orchestrator from '../utils/animationOrchestrator.js';

export default {
  name: 'ActionPanel',
  components: { SkillsHand, DeckIcon, DeckOverlayPanel },
  props: {
    player: { type: Object, required: true },
    isControlDisabled: { type: Boolean, default: false },
    isPlayerTurn: { type: Boolean, default: true }
  },
  data() {
    return {
      showDeckOverlay: false
    };
  },
  computed: {
    canDropSkill() {
      return (this.isPlayerTurn && !this.isControlDisabled && this.player.remainingActionPoints > 0);
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
    // 将动画的“牌库锚点”指向 DeckIcon 的根元素
    this.$nextTick(() => {
      const r = this.$refs.deckAnchor;
      const el = r && r.$el ? r.$el : r;
      if (el) orchestrator.deckAnchorEl = el;
    });
  },
  methods: {
    onEndTurnButtonClicked() {
      backendEventBus.emit(EventNames.Player.END_TURN);
    },
    onDropSkillButtonClicked() {
      backendEventBus.emit(EventNames.Player.DROP_SKILL);
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

/* DeckIcon 自带样式，不再在此定义 */
</style>
