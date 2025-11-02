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
// AnimatableElementContainer
// 负责持有所有可动画元素的Vue元件与DOM实例，管理其生命周期，并注册到animator中
// 和animator配合实现复杂动画

import { computed, watch, nextTick, ref, onBeforeUnmount } from 'vue';
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

    // 计算所有卡牌
    const allSkills = computed(() => {
      return displayGameState.player?.skills || [];
    });

    // 计算玩家对象
    const player = computed(() => {
      return displayGameState.player || null;
    });

    // 计算在场卡牌 ID（frontierSkills + activatedSkills）
    const visibleCardIds = computed(() => {
      const ids = new Set();
      
      // 手牌
      const frontier = displayGameState.player?.frontierSkills || [];
      frontier.forEach(s => {
        if (s?.uniqueID != null) ids.add(s.uniqueID);
      });
      
      // 激活技能
      const activated = displayGameState.player?.activatedSkills || [];
      activated.forEach(s => {
        if (s?.uniqueID != null) ids.add(s.uniqueID);
      });
      
      return ids;
    });

    // 判断卡牌是否可见
    const isCardVisible = (skill) => {
      return skill?.uniqueID != null && visibleCardIds.value.has(skill.uniqueID);
    };

    // 断开观察者
    const disconnectObservers = (id) => {
      try { mutationObservers.get(id)?.disconnect(); } catch(_) {}
      try { resizeObservers.get(id)?.disconnect(); } catch(_) {}
      mutationObservers.delete(id);
      resizeObservers.delete(id);
    };

    // 注册卡牌到 animator
    const registerCard = (wrapperEl, uniqueID) => {
      if (!wrapperEl || uniqueID == null) return;

      // 检查是否已经注册过
      if (registeredIds.value.has(uniqueID)) {
        // 只更新 ref 引用，不重复注册
        cardRefs.value[uniqueID] = wrapperEl;
        return;
      }
      
      // 保存 ref 引用
      cardRefs.value[uniqueID] = wrapperEl;

      // 等待 DOM 更新后注册到 animator
      nextTick(() => {
        const domEl = wrapperEl; // wrapper 作为可动画元素
        if (domEl) {
          animator.register(uniqueID, domEl, 'card');
          registeredIds.value.add(uniqueID);
          // 观察内部真实内容变化（SkillCard 根节点）
          const contentEl = domEl.firstElementChild || domEl;
          try {
            const mo = new MutationObserver(() => {
              // 内容变化：通知 pixi overlay 进行重烘焙
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

    // 监听卡牌列表变化，处理注册/解除注册
    let prevSkillIds = [];
    watch(allSkills, (newSkills, oldSkills) => {
      const newIds = newSkills.map(s => s?.uniqueID).filter(id => id != null);
      
      // 找出移除的卡牌
      const removed = prevSkillIds.filter(id => !newIds.includes(id));
      removed.forEach(id => {
        animator.unregister(id);
        disconnectObservers(id);
        delete cardRefs.value[id];
        registeredIds.value.delete(id); // 从已注册集合中移除
        // console.log('[AnimatableElementContainer] Unregistered card:', id);
      });
      
      prevSkillIds = newIds;
      // console.log('[AnimatableElementContainer] All skills:', newIds.length, ', Registered:', registeredIds.value.size);
    }, { deep: true });

    // 交互事件处理
    const onCardMouseDown = (id, event) => {
      frontendEventBus.emit('card-drag-start', { 
        id, 
        x: event.clientX, 
        y: event.clientY 
      });
    };

    const onCardHover = (id, event) => {
      frontendEventBus.emit('card-hover', { id });
    };

    const onCardLeave = (id, event) => {
      frontendEventBus.emit('card-leave', { id });
    };

    const onCardClick = (id, event) => {
      frontendEventBus.emit('card-click', { 
        id, 
        x: event.clientX, 
        y: event.clientY 
      });
    };

    onBeforeUnmount(() => {
      for (const id of registeredIds.value) {
        animator.unregister(id);
        disconnectObservers(id);
      }
    });

    return {
      allSkills,
      player,
      isCardVisible,
      registerCard,
      onCardMouseDown,
      onCardHover,
      onCardLeave,
      onCardClick
    };
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

.cards-layer {
  position: absolute;
  inset: 0;
}

.cards-layer > .card-wrapper {
  position: absolute;
  pointer-events: auto; /* 由 wrapper 接收交互 */
  transform-origin: center center;
  will-change: transform, opacity;
}

.cards-layer > .hidden { visibility: hidden; }
</style>
