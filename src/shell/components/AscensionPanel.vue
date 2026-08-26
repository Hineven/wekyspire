<script setup>
// 进阶事件面板：选择一条主维度升级（占位数值见 ASCENSION_PLACEHOLDER）
import { ASCENSION_PLACEHOLDER, totalLeino } from '../../core/run/ascension.js';

const props = defineProps({ ctrl: { type: Object, required: true } });
const ctrl = props.ctrl;
const run = ctrl.run;
const DIMS = [
  ['fire', '火灵脉'], ['wood', '木灵脉'], ['air', '空灵脉'], ['body', '体修'],
];
</script>

<template>
  <div class="panel">
    <h2>进阶事件</h2>
    <p>灵力涌动——选择一条主维度突破：</p>
    <div class="dims">
      <button v-for="[key, label] in DIMS" :key="key" @click="ctrl.chooseAscensionDimension(key)">
        {{ label }}<br><span class="lv">{{ run.player.leino[key] }}</span>
      </button>
    </div>
    <p class="note">
      总进阶 {{ totalLeino(run) }}/{{ ASCENSION_PLACEHOLDER.maxTotalLeino }}
      ｜ 突破后全恢复且魏启上限 +{{ ASCENSION_PLACEHOLDER.manaGain }}
    </p>
  </div>
</template>

<style scoped>
.panel {
  position: fixed; left: 50%; top: 44%; transform: translate(-50%, -50%); z-index: 20;
  background: rgba(10, 14, 26, .92); border: 1px solid #6b5b2a; border-radius: 10px;
  padding: 20px 30px; color: #cdd6f4; font-family: sans-serif; text-align: center;
}
h2 { margin: 0 0 8px; font-size: 20px; color: #ffd75e; }
p { color: #9aa3c0; font-size: 13px; }
.dims { display: flex; gap: 12px; margin: 14px 0; }
button {
  width: 92px; padding: 10px 0; background: #2b3552; color: #cdd6f4;
  border: 1px solid #4a587f; border-radius: 8px; cursor: pointer; font-size: 14px;
}
button:hover { border-color: #ffd75e; background: #3a4666; }
.lv { color: #7ab8ff; font-size: 16px; }
.note { font-size: 12px; }
</style>
