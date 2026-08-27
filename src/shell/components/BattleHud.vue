<script setup>
// 战斗 HUD：左上日志 + 回合计数 + tooltip 浮层（Picker 的 tooltip:* 协议呈现）。
// tooltip 载荷的 x/y 为屏幕像素（Picker 直传指针坐标），CSS 定位即可。
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { EventNames } from '../../bridge/index.js';
import { tooltipHtml } from '../tooltip.js';

const props = defineProps({ ctrl: { type: Object, required: true } });
const ctrl = props.ctrl;
const turnText = ref('');
const tooltip = ref({ visible: false, x: 0, y: 0, html: '' });
let bridge = null;

const refresh = () => {
  const p = bridge?.getProjection();
  if (p) turnText.value = `回合 ${p.turn.count}（${p.turn.side === 'player' ? '玩家' : '敌方'}）`;
};

const place = ({ x, y }) => {
  tooltip.value.x = x + 14;
  tooltip.value.y = y + 14;
};

const onTooltipShow = (payload) => {
  tooltip.value.html = tooltipHtml(payload);
  tooltip.value.visible = true;
  place(payload);
};
const onTooltipMove = place;
const onTooltipHide = () => { tooltip.value.visible = false; };

onMounted(() => {
  bridge = ctrl.getBattleBridge();
  if (!bridge) return;
  bridge.backendBus.on(EventNames.STATE_DIRTY, refresh);
  bridge.frontendBus.on(EventNames.TOOLTIP_SHOW, onTooltipShow);
  bridge.frontendBus.on(EventNames.TOOLTIP_MOVE, onTooltipMove);
  bridge.frontendBus.on(EventNames.TOOLTIP_HIDE, onTooltipHide);
  refresh();
});
onBeforeUnmount(() => {
  bridge?.backendBus.off(EventNames.STATE_DIRTY, refresh);
  bridge?.frontendBus.off(EventNames.TOOLTIP_SHOW, onTooltipShow);
  bridge?.frontendBus.off(EventNames.TOOLTIP_MOVE, onTooltipMove);
  bridge?.frontendBus.off(EventNames.TOOLTIP_HIDE, onTooltipHide);
});
</script>

<template>
  <div class="hud">
    <div class="turn">{{ turnText }}</div>
    <div class="log">
      <div v-for="l in ctrl.log" :key="l.id" :class="`log-${l.kind}`">{{ l.text }}</div>
    </div>
    <div v-if="tooltip.visible" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      v-html="tooltip.html"></div>
  </div>
</template>

<style scoped>
.hud { position: fixed; top: 8px; left: 12px; z-index: 20; font-family: sans-serif; pointer-events: none; }
.turn {
  color: #ccd; font-size: 13px; background: rgba(0, 0, 0, .45);
  padding: 4px 10px; border-radius: 4px; display: inline-block;
}
.log { margin-top: 8px; max-width: 340px; color: #aab; font-size: 12px; }
.log .log-combat { color: #e8b; }
.log .log-skill { color: #8ce; }
.tooltip {
  position: fixed; z-index: 40; max-width: 260px;
  background: rgba(8, 12, 24, .92); border: 1px solid #46507a; border-radius: 6px;
  padding: 8px 12px; color: #dde; font-size: 13px; line-height: 1.5;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .5);
  pointer-events: none;
}
.tooltip :deep(b) { color: #ffd; }
</style>
