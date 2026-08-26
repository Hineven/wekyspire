<script setup>
// 菜单级全局 toast：从底部弹出的无阻塞提示。队列与 3s 寿命由 App.vue 持有
// （provide('showMenuPopup') 推入），本组件只负责渲染与进出/回落动画。
defineProps({
  toasts: { type: Array, default: () => [] }, // [{ id, title, text }]
});
</script>

<template>
  <!-- pointer-events:none：悬浮提示永不拦截游戏点击 -->
  <div class="toast-stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast">
        <div class="toast-title">{{ t.title }}</div>
        <div v-if="t.text" class="toast-text">{{ t.text }}</div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  z-index: 40; display: flex; flex-direction: column; align-items: center; gap: 8px;
  pointer-events: none;
  font-family: sans-serif;
}
.toast {
  max-width: min(420px, 86vw); padding: 10px 22px; text-align: center;
  background: rgba(10, 14, 26, .92); border: 1px solid #38415e; border-radius: 10px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, .5);
}
.toast-title { font-size: 15px; color: #ffe7b3; }
.toast-text { font-size: 12px; color: #9aa3c0; margin-top: 4px; }
/* 进入：从屏幕底缘下方升入；消亡：原地淡出下坠并脱流，同伴经 .toast-move 平滑回落 */
.toast-enter-active { transition: opacity .3s ease, transform .3s ease; }
.toast-enter-from { opacity: 0; transform: translateY(24px); }
.toast-leave-active {
  position: absolute; left: 50%;
  transform: translateX(-50%);
  transition: opacity .4s ease, transform .4s ease;
}
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }
.toast-move { transition: transform .4s ease; }
</style>
