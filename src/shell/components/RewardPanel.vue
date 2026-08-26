<script setup>
// 战后奖励面板：金币入账展示 + 技能 3 选 1（或跳过）
import { getSkillDefinition } from '../../core/skills/registry.js';

const props = defineProps({ ctrl: { type: Object, required: true } });
const run = props.ctrl.run;
const def = (id) => getSkillDefinition(id);
</script>

<template>
  <div class="panel" v-if="run.rewards">
    <h2>战后奖励</h2>
    <div class="money">金币 +{{ run.rewards.money }}</div>
    <div class="cards">
      <div v-for="id in run.rewards.skillChoices" :key="id" class="card" @click="ctrl.claimReward(id)">
        <div class="tier">{{ def(id)?.tier }}</div>
        <div class="cname">{{ def(id)?.name }}</div>
        <div class="desc">{{ def(id)?.describe?.({ player: run.player }) ?? '' }}</div>
      </div>
    </div>
    <button class="skip" @click="ctrl.claimReward(null)">跳过</button>
  </div>
</template>

<style scoped>
.panel {
  position: fixed; left: 50%; top: 44%; transform: translate(-50%, -50%); z-index: 20;
  background: rgba(10, 14, 26, .9); border: 1px solid #38415e; border-radius: 10px;
  padding: 18px 26px; color: #cdd6f4; font-family: sans-serif; text-align: center;
}
h2 { margin: 0 0 6px; font-size: 18px; color: #ffd75e; }
.money { color: #ffe58f; margin-bottom: 12px; }
.cards { display: flex; gap: 14px; }
.card {
  width: 130px; min-height: 110px; background: #202944; border: 1px solid #4a587f;
  border-radius: 8px; padding: 10px; cursor: pointer; text-align: left;
}
.card:hover { border-color: #ffd75e; background: #28324f; }
.tier { color: #8a93b2; font-size: 12px; }
.cname { color: #fff; font-size: 15px; margin: 4px 0; }
.desc { color: #9aa3c0; font-size: 12px; line-height: 1.5; }
.skip {
  margin-top: 14px; background: none; border: none; color: #8a93b2;
  cursor: pointer; text-decoration: underline; font-size: 13px;
}
</style>
