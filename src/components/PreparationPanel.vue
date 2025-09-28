<template>
  <div class="preparation-panel">
    <h2>战前准备</h2>
    <p class="tip">拖拽卡牌调整出场顺序（左 → 右）。</p>

    <div class="hand-host">
      <SkillsHand
        :skills="internalSkills"
        :draggable="true"
        :is-player-turn="false"
        :is-control-disabled="false"
        @reorder-request="onReorder"
      />
    </div>

    <div class="actions">
      <button class="apply" @click="emitUpdate">应用调整</button>
    </div>
  </div>
</template>

<script>
import SkillsHand from './SkillsHand.vue';

export default {
  name: 'PreparationPanel',
  components: { SkillsHand },
  props: {
    skills: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      internalSkills: []
    };
  },
  watch: {
    skills: {
      immediate: true,
      handler(newVal) {
        const arr = Array.isArray(newVal) ? newVal.filter(Boolean) : [];
        this.internalSkills = arr;
      }
    }
  },
  methods: {
    onReorder({ from, to }) {
      const list = this.internalSkills.slice();
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      this.internalSkills = list;
    },
    emitUpdate() {
      // 只回传非空技能序列，父级会按 maxSlots 截断
      this.$emit('update-slots', this.internalSkills.slice());
    }
  }
}
</script>

<style scoped>
.preparation-panel {
  border: 1px solid #9e9e9e;
  padding: 16px;
  background: linear-gradient(135deg, #f8fbff, #eef3ff);
  border-radius: 8px;
}

.preparation-panel h2 {
  margin: 0 0 8px 0;
  color: #3949ab;
}

.tip {
  color: #666;
  margin: 0 0 12px 0;
  font-size: 0.9em;
}

.hand-host {
  min-height: 280px;
  border: 2px dashed #c5cae9;
  border-radius: 8px;
  background: #fafafa;
  padding: 8px;
}

.actions {
  margin-top: 12px;
  text-align: right;
}

.apply {
  background: #3949ab;
  color: #fff;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.apply:hover {
  background: #2f3f95;
}
</style>
