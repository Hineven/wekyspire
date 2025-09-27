<template>
  <span 
    class="effect-icon"
    :style="{ color: effectColor }"
    @mouseenter="showTooltip"
    @mousemove="onMouseMove"
    @mouseleave="hideTooltip"
    :class="{ 'scale-animation': isScaling }"
  >
    {{ effectIcon }}
    {{ effectName }}
    <strong v-if="stack !== 0" :style="{color: this.getStackColor()}">{{ stack }}</strong>
  </span>
</template>

<script>
import effectDescriptions from '../data/effectDescription.js';
import frontendEventBus from '../frontendEventBus.js';

export default {
  name: 'EffectIcon',
  props: {
    effectName: {
      type: String,
      required: true
    },
    stack: {
      type: Number,
      default: 0
    },
    previewMode: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      isScaling: false
    };
  },
  watch: {
    stack(newVal, oldVal) {
      if(newVal !== oldVal && !this.previewMode) {
        this.playScaleAnimation();
      }
    }
  },
  computed: {
    effectInfo() {
      return effectDescriptions[this.effectName] || {};
    },
    effectIcon() {
      return this.effectInfo.icon || '❓';
    },
    effectColor() {
      return this.effectInfo.color || '#000000';
    },
    effectDescription() {
      return this.effectInfo.description || '未知效果';
    },
    effectDisplayName() {
      return this.effectInfo.name || this.effectName;
    }
  },
  methods: {
    playScaleAnimation() {
      this.isScaling = true;
      setTimeout(() => {
        this.isScaling = false;
      }, 500);
    },
    getStackColor() {
      if(this.stack == 0) return this.effectColor;
      if(this.stack > 0) return 'green';
      if(this.stack < 0) return 'red'; 
      return 'gray'; 
    },
    showTooltip(event) {
      frontendEventBus.emit('tooltip:show', {
        name: this.effectDisplayName,
        text: this.effectDescription,
        color: this.effectColor,
        x: event.clientX,
        y: event.clientY
      });
    },
    onMouseMove(event) {
      frontendEventBus.emit('tooltip:move', { x: event.clientX, y: event.clientY });
    },
    hideTooltip() {
      frontendEventBus.emit('tooltip:hide');
    }
  },
  mounted() {
    // 如果初始stack不为0，播放动画
    if(this.stack !== 0 && !this.previewMode) {
      this.playScaleAnimation();
    }
  },
  beforeUnmount() {
    // 组件销毁前，确保隐藏全局tooltip
    frontendEventBus.emit('tooltip:hide');
  }
};
</script>

<style scoped>
.effect-icon {
  display: inline-block;
  font-size: 16px;
  cursor: help;
  margin: 0 2px;
  font-weight: bold;
  transition: transform 0.5s ease;
}

.effect-icon.scale-animation {
  animation: scaleEffect 0.5s ease;
}

@keyframes scaleEffect {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}
</style>
