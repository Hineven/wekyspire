<script setup>
// tooltip 唯一渲染宿主（App.vue 顶层挂载，塔楼/房间两层共享）：
// 状态与生命周期在 tooltipHub（同 token 抑制、跟随移动），本组件纯呈现——
// 内容模型 { title, delta?, body, tint? } 由 shell/tooltip.js 统一解析。
// z 层：面板 20 之上、模态弹窗 60 之下（模态期间不悬浮）。
import { tooltipState } from '../tooltipHub.js';
const s = tooltipState;
</script>

<template>
  <div v-if="s.visible && s.model" class="tooltip" :style="{ left: s.x + 'px', top: s.y + 'px' }">
    <b>{{ s.model.title }}</b><span v-if="s.model.delta">（威力 {{ s.model.delta > 0 ? '+' : '' }}{{ s.model.delta }}）</span>
    <template v-if="s.model.body"><br><span class="tip-body" :style="{ color: s.model.tint }">{{ s.model.body }}</span></template>
  </div>
</template>

<style scoped>
.tooltip {
  position: fixed; z-index: 45; max-width: 260px;
  background: rgba(8, 12, 24, .92); border: 1px solid #46507a; border-radius: 6px;
  padding: 8px 12px; color: #dde; font-size: 13px; line-height: 1.5;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .5);
  pointer-events: none;
}
.tooltip b { color: #ffd; }
</style>
