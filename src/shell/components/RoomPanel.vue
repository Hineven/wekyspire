<script setup>
// 奖励房面板：训练场 / 营地 / 老虎机 / 事件（占位简版交互）
import { getSkillDefinition } from '../../core/skills/registry.js';

const props = defineProps({ ctrl: { type: Object, required: true } });
const ctrl = props.ctrl;
const run = ctrl.run;
const skillDef = (id) => getSkillDefinition(id);
const ROOM_NAMES = { training: '训练场', camp: '营地', slot: '老虎机', event: '事件房' };
const prizeText = (p) => ({
  nothing: '什么也没发生……',
  money: `金币 +${p.money}`,
  fruit: '获得remi升级果 ×1',
  training: '训练次数 +1',
  card: `获得卡牌：${skillDef(p.defId)?.name}`,
  relic: `获得遗物：${p.relicId}`,
}[p.type]);
const eventText = (r) => ({
  moneyBag: `捡到钱袋：金币 +${r.money}`,
  spring: `治愈泉：回复 ${r.heal} 点生命`,
}[r.eventId]);
</script>

<template>
  <div class="panel">
    <h2>{{ ROOM_NAMES[run.currentRoom] }}</h2>

    <!-- 训练场 -->
    <template v-if="run.currentRoom === 'training'">
      <template v-if="ctrl.trainingMode() === 'upgrade'">
        <p>免费升级一张卡：</p>
        <div v-for="rt in ctrl.upgradableCards()" :key="rt.uniqueID" class="row">
          <span>{{ skillDef(rt.defId)?.name }}</span>
          <button @click="ctrl.trainingUpgrade(rt.uniqueID)">升级</button>
        </div>
      </template>
      <template v-else>
        <template v-if="!run.roomData">
          <p>暂无可升级卡牌，改为抓牌（可跳过）。</p>
          <button @click="ctrl.trainingDrawRoll()">抓牌</button>
        </template>
        <template v-else>
          <div class="choices">
            <button v-for="id in run.roomData.drawChoices" :key="id" @click="ctrl.trainingDraw(id)">
              {{ skillDef(id)?.name }}（{{ skillDef(id)?.tier }}）
            </button>
          </div>
          <button class="skip" @click="ctrl.trainingDraw(null)">跳过</button>
        </template>
      </template>
    </template>

    <!-- 营地 -->
    <template v-else-if="run.currentRoom === 'camp'">
      <div class="choices">
        <button v-if="ctrl.campOptions().includes('recoverRemi')" @click="ctrl.campChoose('recoverRemi')">找回remi</button>
        <button v-if="ctrl.campOptions().includes('rest')" @click="ctrl.campChoose('rest')">
          休整（50% 生命 + 全部魏启）
        </button>
      </div>
      <template v-if="ctrl.campOptions().includes('upgrade')">
        <p>或升级一张卡：</p>
        <div v-for="rt in ctrl.upgradableCards()" :key="rt.uniqueID" class="row">
          <span>{{ skillDef(rt.defId)?.name }}</span>
          <button @click="ctrl.campChoose('upgrade', rt.uniqueID)">升级</button>
        </div>
      </template>
    </template>

    <!-- 老虎机（S4 pilot：roll 动画经 run sequencer 编排，animationend 回执开闸；
         结果文字在动画落定后揭示——渐进揭示，连点多次依次串行播出） -->
    <template v-else-if="run.currentRoom === 'slot'">
      <p>花费 {{ ctrl.SLOT_PLACEHOLDER.spinCost }} 金币抽奖（金币 {{ run.player.money }}）</p>
      <button class="lever" :class="{ rolling: ctrl.slot.anim }" @click="ctrl.spin()">拉杆！</button>
      <div v-if="ctrl.slot.anim" :key="ctrl.slot.anim.id" class="rolling" @animationend="ctrl.reportSlotAnimDone(ctrl.slot.anim.id)">🎰</div>
      <div v-else-if="ctrl.slot.lastSpin" class="result">{{ prizeText(ctrl.slot.lastSpin) }}</div>
      <button class="skip" @click="ctrl.leaveSlot()">离开</button>
    </template>

    <!-- 事件房 -->
    <template v-else-if="run.currentRoom === 'event'">
      <template v-if="!ctrl.eventRoom.result">
        <p>一间弥漫着迷雾的房间……</p>
        <button @click="ctrl.triggerEvent()">探索</button>
      </template>
      <template v-else>
        <div class="result">{{ eventText(ctrl.eventRoom.result) }}</div>
        <button class="skip" @click="ctrl.leaveEvent()">离开</button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.panel {
  position: fixed; left: 50%; top: 44%; transform: translate(-50%, -50%); z-index: 20;
  background: rgba(10, 14, 26, .9); border: 1px solid #38415e; border-radius: 10px;
  padding: 18px 28px; color: #cdd6f4; font-family: sans-serif; text-align: center; min-width: 300px;
}
h2 { margin: 0 0 10px; font-size: 18px; color: #ffd75e; }
p { color: #9aa3c0; font-size: 13px; }
.choices { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 8px 0; }
.row { display: flex; gap: 10px; justify-content: center; align-items: center; margin: 6px 0; }
.result { margin: 10px 0; color: #ffe58f; }
button {
  background: #2b3552; color: #cdd6f4; border: 1px solid #4a587f; border-radius: 6px;
  padding: 6px 14px; cursor: pointer; font-size: 13px;
}
button:hover { background: #3a4666; border-color: #ffd75e; }
.skip { margin-top: 12px; background: none; border: none; color: #8a93b2; text-decoration: underline; }
.lever.rolling { filter: brightness(1.35); }
.rolling {
  margin: 10px auto 0; font-size: 34px; line-height: 1;
  animation: slot-roll 1.1s cubic-bezier(.36, .07, .19, .97) both;
}
@keyframes slot-roll {
  0% { transform: translateY(0) rotate(0deg); }
  15% { transform: translateY(-14px) rotate(-16deg); }
  40% { transform: translateY(4px) rotate(12deg); }
  70% { transform: translateY(-6px) rotate(-8deg); }
  100% { transform: translateY(0) rotate(0deg); }
}
</style>
