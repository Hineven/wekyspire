<script setup>
// 进阶事件面板：选择一条主维度升级（占位数值见 ASCENSION_PLACEHOLDER）。
// 瓦片配色是面板本地的表现配置；素材到位后 .dim-icon 换美术图即可。
import { ASCENSION_PLACEHOLDER, totalLeino } from '../../core/run/ascension.js';

const props = defineProps({ ctrl: { type: Object, required: true } });
const ctrl = props.ctrl;
const run = ctrl.run;
const DIMS = [
  { key: 'fire', label: '火灵脉', glyph: '炎', color: '#e85a5a' },
  { key: 'wood', label: '木灵脉', glyph: '木', color: '#4aa56e' },
  { key: 'air', label: '空灵脉', glyph: '风', color: '#5aa2e8' },
  { key: 'body', label: '体修', glyph: '武', color: '#b8894a' },
];
</script>

<template>
  <div class="run-panel">
    <h2 class="run-panel-title">进阶事件</h2>
    <p class="run-panel-hint">灵力涌动——择一条主维度突破：</p>
    <div class="dims">
      <button
        v-for="dim in DIMS" :key="dim.key"
        class="dim-tile" :style="{ '--dim': dim.color }"
        @click="ctrl.chooseAscensionDimension(dim.key)"
      >
        <span class="dim-icon">{{ dim.glyph }}</span>
        <span class="dim-label">{{ dim.label }}</span>
        <span class="lv">{{ run.player.leino[dim.key] }}</span>
      </button>
    </div>
    <p class="note">
      总进阶 {{ totalLeino(run) }}/{{ ASCENSION_PLACEHOLDER.maxTotalLeino }}
      ｜ 突破后全恢复且魏启上限 +{{ ASCENSION_PLACEHOLDER.manaGain }}
    </p>
  </div>
</template>

<style scoped>
.dims { display: flex; gap: 12px; margin: 14px 0; flex-wrap: wrap; justify-content: center; }
.dim-tile {
  width: 96px; padding: 12px 0 9px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  background:
    radial-gradient(circle at 50% 22%, color-mix(in srgb, var(--dim) 28%, transparent), transparent 68%),
    linear-gradient(180deg, #242f4e, #1c2444);
  border: 1px solid #4a587f; border-radius: 10px; color: #cdd6f4; font-size: 13px;
  transition: transform .16s ease, border-color .16s ease;
}
.dim-tile:hover {
  transform: translateY(-3px);
  border-color: var(--dim);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .4), 0 0 10px color-mix(in srgb, var(--dim) 40%, transparent);
}
.dim-icon {
  width: 38px; height: 38px; line-height: 36px; font-size: 19px; border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--dim) 60%, transparent);
  background: color-mix(in srgb, var(--dim) 18%, transparent);
  /* 美术图标到位后此字槽直接替换为背景图 */
}
.dim-label { margin-top: 4px; }
.lv { color: var(--dim); font-size: 17px; font-weight: bold; }
.note { font-size: 12px; color: #9aa3c0; }
</style>
