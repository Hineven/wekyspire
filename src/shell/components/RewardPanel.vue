<script setup>
// 战后奖励面板：金币入账展示 + 技能 3 选 1（或跳过）。
// 卡牌候选直接用战场同源烘焙卡面（CardFacePreview）——所见即所得，
// 富文本热区释义由 CardFacePreview 自带（与战斗 Picker 同协议）。
import CardFacePreview from './CardFacePreview.vue';

const props = defineProps({ ctrl: { type: Object, required: true } });
const run = props.ctrl.run;
</script>

<template>
  <div class="run-panel" v-if="run.rewards">
    <h2 class="run-panel-title">战后奖励</h2>
    <div class="money-pill">🪙 金币 +{{ run.rewards.money }}</div>
    <p class="run-panel-hint">择一张技能卡加入牌组</p>
    <div class="card-choices">
      <button
        v-for="id in run.rewards.skillChoices" :key="id"
        class="card-choice"
        @click="ctrl.claimReward(id)"
      >
        <CardFacePreview :skill-id="id" :ctx="{ player: run.player }" />
      </button>
    </div>
    <button class="skip-link" @click="ctrl.claimReward(null)">跳过奖励</button>
  </div>
</template>
