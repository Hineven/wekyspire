<template>
  <div class="animatable-elements-container">
    <!-- 卡牌层 -->
    <div class="cards-layer">
      <div
        v-for="skill in allSkills"
        :key="skill.uniqueID"
        class="card-wrapper"
        :class="{ hidden: !isCardVisible(skill) }"
        :ref="el => registerCard(el, skill.uniqueID)"
        @mousedown="onCardMouseDown(skill.uniqueID, $event)"
        @mouseenter="onCardHover(skill.uniqueID, $event)"
        @mouseleave="onCardLeave(skill.uniqueID, $event)"
        @click="onCardClick(skill.uniqueID, $event)"
      >
        <SkillCard
          :skill="skill"
          :player="player"
          :preview-mode="false"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { computed, watch, nextTick, ref, onBeforeUnmount, onMounted } from 'vue';
import SkillCard from './SkillCard.vue';
import { displayGameState } from '../../data/gameState.js';
import frontendEventBus from '../../frontendEventBus.js';
import animator from '../../utils/animator.js';

export default {
  name: 'AnimatableElementContainer',
  components: { SkillCard },
  setup() {
    const cardRefs = ref({});
    const registeredIds = ref(new Set());
    const mutationObservers = new Map();
    const resizeObservers = new Map();

    const allSkills = computed(() => displayGameState.player?.skills || []);
    const player = computed(() => displayGameState.player || null);

    const visibleCardIds = computed(() => {
      const ids = new Set();
      const frontier = displayGameState.player?.frontierSkills || [];
      frontier.forEach(s => { if (s?.uniqueID != null) ids.add(s.uniqueID); });
      const activated = displayGameState.player?.activatedSkills || [];
      activated.forEach(s => { if (s?.uniqueID != null) ids.add(s.uniqueID); });
      return ids;
    });

    const isCardVisible = (skill) => skill?.uniqueID != null && visibleCardIds.value.has(skill.uniqueID);

    const disconnectObservers = (id) => {
      try { mutationObservers.get(id)?.disconnect(); } catch(_) {}
      try { resizeObservers.get(id)?.disconnect(); } catch(_) {}
      mutationObservers.delete(id);
      resizeObservers.delete(id);
    };

    const registerCard = (wrapperEl, uniqueID) => {
      if (!wrapperEl || uniqueID == null) return;
      if (registeredIds.value.has(uniqueID)) {
        cardRefs.value[uniqueID] = wrapperEl;
        return;
      }
      cardRefs.value[uniqueID] = wrapperEl;

      nextTick(() => {
        const domEl = wrapperEl; // wrapper 作为可动画元素
        if (domEl) {
          animator.register(uniqueID, domEl, 'card');
          registeredIds.value.add(uniqueID);
          // 观察内部真实内容变化（SkillCard 根节点）
          const contentEl = domEl.firstElementChild || domEl;
          try {
            const mo = new MutationObserver(() => {
              frontendEventBus.emit('card-content-updated', { id: uniqueID });
            });
            mo.observe(contentEl, { childList: true, characterData: true, subtree: true, attributes: true });
            mutationObservers.set(uniqueID, mo);
          } catch(_) {}
          try {
            const ro = new ResizeObserver(() => {
              frontendEventBus.emit('card-content-updated', { id: uniqueID });
            });
            ro.observe(contentEl);
            resizeObservers.set(uniqueID, ro);
          } catch(_) {}
        }
      });
    };

    // Pixi overlay integration: hide/show DOM visuals when sprite is committed/released
    const onSpriteCommitted = ({ id }) => {
      const el = cardRefs.value[id];
      if (!el) return;
      // 添加一个仅影响视觉的隐藏类，避免影响 computed opacity
      el.classList.add('pixi-hidden');
    };
    const onSpriteReleased = ({ id }) => {
      const el = cardRefs.value[id];
      if (!el) return;
      el.classList.remove('pixi-hidden');
    };

    onMounted(() => {
      frontendEventBus.on('pixi-sprite-committed', onSpriteCommitted);
      frontendEventBus.on('pixi-sprite-released', onSpriteReleased);
    });

    let prevSkillIds = [];
    watch(allSkills, (newSkills, oldSkills) => {
      const newIds = newSkills.map(s => s?.uniqueID).filter(id => id != null);
      const removed = prevSkillIds.filter(id => !newIds.includes(id));
      removed.forEach(id => {
        animator.unregister(id);
        disconnectObservers(id);
        // 移除隐藏类，避免遗留
        const el = cardRefs.value[id];
        if (el) el.classList.remove('pixi-hidden');
        delete cardRefs.value[id];
        registeredIds.value.delete(id);
      });
      prevSkillIds = newIds;
    }, { deep: true });

    const onCardMouseDown = (id, event) => {
      frontendEventBus.emit('card-drag-start', { id, x: event.clientX, y: event.clientY });
    };
    const onCardHover = (id, event) => { frontendEventBus.emit('card-hover', { id }); };
    const onCardLeave = (id, event) => { frontendEventBus.emit('card-leave', { id }); };
    const onCardClick = (id, event) => { frontendEventBus.emit('card-click', { id, x: event.clientX, y: event.clientY }); };

    onBeforeUnmount(() => {
      for (const id of registeredIds.value) {
        animator.unregister(id);
        disconnectObservers(id);
      }
      frontendEventBus.off('pixi-sprite-committed', onSpriteCommitted);
      frontendEventBus.off('pixi-sprite-released', onSpriteReleased);
    });

    return { allSkills, player, isCardVisible, registerCard, onCardMouseDown, onCardHover, onCardLeave, onCardClick };
  }
};
</script>

<style scoped>
.animatable-elements-container {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: var(--z-animatable-elements, 100);
}

.cards-layer { position: absolute; inset: 0; }

.cards-layer > .card-wrapper {
  position: absolute;
  pointer-events: auto; /* 由 wrapper 接收交互 */
  transform-origin: center center;
  will-change: transform, opacity;
}

/* 可见性控制（游戏逻辑隐藏）：不参与 Pixi 绘制 */
.cards-layer > .hidden { visibility: hidden; }

/* 视觉隐藏（由 Pixi 覆盖绘制时启用），不影响 computed opacity */
.cards-layer > .pixi-hidden { filter: opacity(0); }
</style>
