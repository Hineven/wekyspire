<template>
    <div class="enemy-status-display" ref="enemyStatusDisplay">

  </div>
</template>

<script>
import EffectDisplayBar from '../global/EffectDisplayBar.vue';
import HurtAnimationWrapper from '../global/HurtAnimationWrapper.vue';
import HealthBar from '../global/HealthBar.vue';
import Enemy from "../../data/enemy";
import frontendEventBus from '@/frontendEventBus.js';

export default {
  name: 'EnemyStatusDisplay',
  components: {
    EffectDisplayBar
  },
  props: {
    enemy: {
      type: Object,
      required: true
    }
  }
};
</script>

<style scoped>
</style>