<script setup>
// 卡面预览（战斗同源）：直接调战场牌面烘焙器 bakeCardFace 出 dataURL，
// 与战场卡走同一渲染管线（等阶边框/费用徽章/富文本正文/卡图）——所见即所得，
// 无需在 Vue 面板里维护第二套卡面样式。
// 卡图异步加载：未命中先按无图出卡，加载完成订阅重出（与战场 addOnLoad 重烘同语言）。
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { getSkillDefinition } from '../../core/skills/registry.js';
import { bakeCardFace } from '../../stage/richtext/cardFace.js';
import { sharedCardArtCache } from '../../stage/art/cardArtCache.js';
import { KEYWORD_LABELS } from '../../bridge/projection.js';

const props = defineProps({
  skillId: { type: String, required: true },
  // describe 上下文：run 级面板传 { player }（应用前口径，与旧面板文案一致）
  ctx: { type: Object, default: () => ({}) },
});

// projectCardFull 同形的卡面视图（战斗外口径：text 走应用前 describe）
function viewOf(def) {
  if (!def) return null;
  return {
    name: def.name ?? '',
    tier: def.tier ?? null,
    type: def.type ?? 'normal',
    series: def.series ?? null,
    cost: def.cost ?? { mana: 0, actionPoint: 0 },
    keywords: (def.keywords ?? []).map(k => KEYWORD_LABELS[k] ?? k),
    cardMode: def.cardMode ?? 'normal',
    charges: def.charges ?? null,
    text: def.describe?.(props.ctx) ?? '',
  };
}

const view = computed(() => viewOf(getSkillDefinition(props.skillId)));

// 卡图取值：cache.get 未命中会发起异步加载并返回 null（先按无图出卡）
const art = ref(view.value ? sharedCardArtCache.get(view.value) : null);
let unsub = null;
const stopListen = () => { unsub?.(); unsub = null; };
watch(view, (v) => {
  art.value = v ? sharedCardArtCache.get(v) : null;
  stopListen();
  if (!art.value && v && sharedCardArtCache.resolveUrl(v)) {
    const expected = sharedCardArtCache.resolveUrl(v);
    unsub = sharedCardArtCache.addOnLoad((url) => {
      if (url === expected) art.value = sharedCardArtCache.get(v);
    });
  }
}, { immediate: true });
onBeforeUnmount(stopListen);

// 视图/卡图任一变化即整面重烘（DOM 预览不消费热区，只取像素）
const url = computed(() => (
  view.value ? bakeCardFace(view.value, { scale: 2, art: art.value }).canvas.toDataURL() : ''
));
</script>

<template>
  <img v-if="url" class="card-face-preview" :src="url" alt="" draggable="false">
</template>

<style scoped>
/* 尺寸交给宿主容器约束；比例随烘焙画布 200x270 */
.card-face-preview {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  user-select: none;
}
</style>
