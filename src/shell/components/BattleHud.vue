<script setup>
// 战斗 HUD（占位简版）：左上日志 + 回合计数；卡牌交互/tooltip 在 Stage 内
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { EventNames } from '../../bridge/index.js';

const props = defineProps({ ctrl: { type: Object, required: true } });
const ctrl = props.ctrl;
const turnText = ref('');
let bridge = null;

const refresh = () => {
  const p = bridge?.getProjection();
  if (p) turnText.value = `回合 ${p.turn.count}（${p.turn.side === 'player' ? '玩家' : '敌方'}）`;
};

onMounted(() => {
  bridge = ctrl.getBattleBridge();
  if (!bridge) return;
  bridge.backendBus.on(EventNames.STATE_DIRTY, refresh);
  refresh();
});
onBeforeUnmount(() => {
  bridge?.backendBus.off(EventNames.STATE_DIRTY, refresh);
});
</script>

<template>
  <div class="hud">
    <div class="turn">{{ turnText }}</div>
    <div class="log">
      <div v-for="l in ctrl.log" :key="l.id" :class="`log-${l.kind}`">{{ l.text }}</div>
    </div>
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
</style>
