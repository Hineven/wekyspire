<template>
  <span
    class="card-icon"
    @mouseenter="onEnter"
    @mousemove="onMove"
    @mouseleave="onLeave"
    :style="inlineStyle"
  >
    <span class="icon" :style="{color: tierColor}">{{ displayIcon }}</span>
    <span class="name" :style="{color: tierColor}">{{ displayName }}</span>
  </span>
</template>

<script>
import frontendEventBus from '../../frontendEventBus.js';
import SkillManager from '../../data/skillManager.js';
import { getSkillTierColor } from '../../utils/tierUtils.js';

export default {
  name: 'SkillIcon',
  props: {
    skillName: { type: String, required: true }
  },
  data() {
    return { skillInstance: null };
  },
  computed: {
    tierColor() {
      if (this.skillInstance) return getSkillTierColor(this.skillInstance.tier);
      return '#aaaaaa';
    },
    displayIcon() {
      return '🀫';
    },
    displayName() {
      if (!this.skillInstance) return this.skillName;
      return this.skillInstance.name;
    },
    inlineStyle() { return { cursor: 'help' }; }
  },
  methods: {
    ensureInstance() {
      if (!this.skillInstance) {
        try {
          const mgr = SkillManager.getInstance();
          const inst = mgr.getSkillSingleton(this.skillName);
          this.skillInstance = inst;
          this.applyPowerDelta();
        } catch (_) {}
      }
    },
    applyPowerDelta() {
      if (!this.skillInstance) return;
      if (typeof this.powerDelta === 'number' && this.powerDelta !== 0) {
        // 直接修改 power 值（不触发动画）
        this.skillInstance.power = this.powerDelta;
      }
    },
    onEnter(e) {
      this.ensureInstance();
      if (!this.skillInstance) return;
      frontendEventBus.emit('card-tooltip:show', { skill: this.skillInstance, x: e.clientX, y: e.clientY });
    },
    onMove(e) { frontendEventBus.emit('card-tooltip:move', { x: e.clientX, y: e.clientY }); },
    onLeave() { frontendEventBus.emit('card-tooltip:hide'); }
  },
  mounted() {
    this.ensureInstance();
  },
  beforeUnmount() { frontendEventBus.emit('card-tooltip:hide'); }
};
</script>

<style scoped>
.card-icon { display: inline-flex; align-items: center; gap: 2px; font-weight: 600; }
.card-icon .icon { font-size: 0.95em; }
.card-icon .name { text-decoration: underline dotted currentColor; }
</style>
