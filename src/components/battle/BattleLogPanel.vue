<template>
  <div :class="['battle-log', {'hide-scrool-bar': !isHovered}]" ref="battleLog"
  @mouseenter="isHovered = true" @mouseleave="isHovered = false">
    <transition-group name="vertical-popup" appear>
      <div
        v-for="(item, index) in displayedLogs"
        :key="item.key"
        :class="getLogClass(item.value)"
        class="log-entry"
        :style="{opacity: getEntryOpacity(index)}"
      >
        <span class="log-icon">{{ getLogIcon(item.value) }}</span>
        <ColoredText :text="typeof item.value === 'string' ? item.value : item.value.log" />
      </div>
    </transition-group>
  </div>
</template>

<script>
import ColoredText from '../global/ColoredText.vue';

export default {
  name: 'BattleLogPanel',
  components: { ColoredText },
  props: {
    logs: { type: Array, default: () => [] }
  },
  methods: {
  }
};
</script>

<style scoped>
.battle-log {
  flex: 1;
  justify-content: center;
  flex-direction: column;
  padding: 10px;
  margin: 10px 0;
  overflow-y: auto;
  max-height: 300px;
}

</style>