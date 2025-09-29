<template>
  <div class="rest-control-panel">
    <h3 class="title">休整操作</h3>
    <div class="controls">
      <button @click="$emit('toggle-preparation-panel')">
        {{ preparationPanelVisible ? '隐藏' : '显示' }} 准备面板
      </button>
      <!-- 预留：未来可以在此添加更多休整操作按钮 -->
    </div>
  </div>
</template>

<script>
export default {
  name: 'RestControlPanel',
  props: {
    preparationPanelVisible: { type: Boolean, default: false },
  },
  emits: ['toggle-preparation-panel']
}
</script>

<style scoped>
.rest-control-panel {
  width: 360px;
  box-sizing: border-box;
  padding: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #eef7ff;
}
.title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}
.controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
button {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  background: rgba(66, 185, 131, 0.9);
  color: #fff;
  cursor: pointer;
}
button:hover {
  background: rgba(53, 156, 109, 0.95);
}
</style>

