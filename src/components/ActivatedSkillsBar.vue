<template>
  <div class="activated-skills-bar" ref="barRoot">
    <div class="activated-slot" v-for="(skill, idx) in visibleSkills" :key="skill.uniqueID"
         :style="slotStyle(idx, skill)" :class="{'leaving': leaving[skill.uniqueID]}"
         @click="onSkillClick(skill)">
      <SkillCard :skill="skill"
                 :player="player"
                 :disabled="!canInteract"
                 :can-click="canInteract"
                 :player-mana="player?.mana ?? Infinity"
                 :auto-register-in-registry="false"
                 :ref="el => setCardRef(el, skill.uniqueID)"
                 :preview-mode="false" />
      <div class="chant-actions" v-if="skill.cardMode==='chant' && canInteract">
        <button class="stop-btn" @click.stop="stopChant(skill)">停止</button>
      </div>
    </div>
    <div v-for="n in emptySlots" :key="'empty-'+n" class="activated-slot placeholder">
      <div class="placeholder-inner">空</div>
    </div>
  </div>
</template>

<script>
import SkillCard from './SkillCard.vue';
import frontendEventBus from '../frontendEventBus.js';
import backendEventBus, { EventNames } from '../backendEventBus.js';
import { registerCardEl, unregisterCardEl } from '../utils/cardDomRegistry.js';

export default {
  name: 'ActivatedSkillsBar',
  components: { SkillCard },
  props: {
    player: { type: Object, required: true },
    isPlayerTurn: { type: Boolean, default: true },
    isControlDisabled: { type: Boolean, default: false },
    listenTransferEvents: { type: Boolean, default: true },
    containerKey: { type: String, default: 'activated-bar' }
  },
  data() {
    return {
      cardRefs: {},
      appearing: {},
      leaving: {},
      prevIds: []
    };
  },
  computed: {
    visibleSkills() { return (this.player?.activatedSkills || []).filter(Boolean); },
    visibleIds() { return this.visibleSkills.map(s => s.uniqueID); },
    emptySlots() { return Math.max(0, (this.player?.maxActivatedSkills || 0) - this.visibleSkills.length); },
    canInteract() { return this.isPlayerTurn && !this.isControlDisabled; }
  },
  watch: {
    visibleIds: {
      immediate: true,
      handler(newIds, old) {
        if (!old) { this.prevIds = [...newIds]; return; }
        const prevSet = new Set(this.prevIds);
        const added = newIds.filter(id => !prevSet.has(id));
        const removed = this.prevIds.filter(id => !new Set(newIds).has(id));
        this.prevIds = [...newIds];
        if (added.length && this.listenTransferEvents) {
          added.forEach(id => { this.appearing[id] = true; this.scheduleAppearFallback(id); });
        }
        // Removed cards: keep leaving flag until transfer-end cleans it up (backend already updated state)
        removed.forEach(id => { delete this.appearing[id]; delete this.leaving[id]; });
      }
    }
  },
  mounted() {
    if (this.listenTransferEvents) {
      frontendEventBus.on('card-transfer-start', this.onTransferStart);
      frontendEventBus.on('card-transfer-end', this.onTransferEnd);
    }
  },
  beforeUnmount() {
    frontendEventBus.off('card-transfer-start', this.onTransferStart);
    frontendEventBus.off('card-transfer-end', this.onTransferEnd);
    Object.keys(this.cardRefs).forEach(id => unregisterCardEl(id));
  },
  methods: {
    setCardRef(el, id) {
      if (el) {
        this.cardRefs[id] = el;
        const dom = el.$el ? el.$el : el;
        registerCardEl(id, dom);
      } else {
        unregisterCardEl(id);
        delete this.cardRefs[id];
      }
    },
    scheduleAppearFallback(id) { setTimeout(() => { if (this.appearing[id]) delete this.appearing[id]; }, 1500); },
    onTransferStart(payload = {}) {
      if (payload.from === this.containerKey && payload.phase === 'start') {
        const id = payload.id;
        if (id != null) this.leaving[id] = true;
      }
    },
    onTransferEnd(payload = {}) {
      if (payload.phase !== 'end') return;
      const { id, to, from } = payload;
      if (to === this.containerKey && this.appearing[id]) delete this.appearing[id];
      if (from === this.containerKey && this.leaving[id]) delete this.leaving[id];
    },
    slotStyle(idx, skill) {
      const baseX = idx * 210; // spacing
      const hidden = !!this.appearing[skill.uniqueID];
      return {
        transform: `translateX(${baseX}px)` ,
        visibility: hidden ? 'hidden' : 'visible'
      };
    },
    onSkillClick(skill) {
      // 默认点击行为：如果是咏唱牌，等同停止按钮
      if (skill.cardMode === 'chant' && this.canInteract) this.stopChant(skill);
    },
    stopChant(skill) {
      backendEventBus.emit(EventNames.Battle.PLAYER_STOP_ACTIVATED_SKILL, skill.uniqueID);
    }
  }
};
</script>

<style scoped>
.activated-skills-bar { position: absolute; left: 50%; bottom: 300px; transform: translateX(-50%); height: 280px; pointer-events: auto; min-width: 220px; }
.activated-slot { position: absolute; top: 0; transition: transform .25s ease, visibility 0s linear; }
.activated-slot.placeholder { width:198px; height:266px; border:2px dashed rgba(255,255,255,0.3); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:14px; color:#ccc; }
.chant-actions { position:absolute; bottom:4px; right:4px; }
.stop-btn { font-size:12px; padding:2px 6px; cursor:pointer; }
</style>

