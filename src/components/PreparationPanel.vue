<template>
  <div class="preparation-panel">
    <h2>战前准备</h2>
    <p class="tip">拖拽卡牌调整出场顺序（左 → 右）。</p>
    <div class="slots-grid">
      <div
        v-for="(slot, index) in internalSlots"
        :key="index"
        class="slot-cell"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragover.prevent
        @drop="onDrop(index)"
        @dragend="onDragEnd"
        :class="{ 'drag-over': dragOverIndex === index }"
      >
        <div class="index-badge">{{ index + 1 }}</div>
        <SkillCard v-if="slot" :skill="slot" :preview-mode="true" :can-click="false" />
        <div v-else class="empty">空位</div>
      </div>
    </div>
    <div class="actions">
      <button class="apply" @click="emitUpdate">应用调整</button>
    </div>
  </div>
</template>

<script>
import SkillCard from './SkillCard.vue';

export default {
  name: 'PreparationPanel',
  components: { SkillCard },
  props: {
    slots: {
      type: Array,
      default: () => []
    },
    maxSlots: {
      type: Number,
      default: 0
    }
  },
  data() {
    return {
      internalSlots: [],
      dragStartIndex: null,
      dragOverIndex: null
    };
  },
  watch: {
    slots: {
      immediate: true,
      // inline watcher function to avoid linter false positive
      handler(newVal) {
        const max = this.maxSlots || newVal.length || 0;
        const arr = Array.isArray(newVal) ? newVal.slice() : [];
        while (arr.length < max) arr.push(null);
        if (arr.length > max) arr.length = max;
        this.internalSlots = arr;
      }
    }
  },
  methods: {
    onDragStart(index) {
      this.dragStartIndex = index;
    },
    onDrop(targetIndex) {
      if (this.dragStartIndex === null || targetIndex === null) return;
      const newArr = this.internalSlots.slice();
      const [moved] = newArr.splice(this.dragStartIndex, 1);
      newArr.splice(targetIndex, 0, moved);
      // 保持长度不变
      if (newArr.length > this.maxSlots) newArr.length = this.maxSlots;
      this.internalSlots = newArr;
      this.dragStartIndex = null;
      this.dragOverIndex = null;
    },
    onDragEnd() {
      this.dragStartIndex = null;
      this.dragOverIndex = null;
    },
    emitUpdate() {
      this.$emit('update-slots', this.internalSlots);
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

.slots-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.slot-cell {
  position: relative;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #c5cae9;
  border-radius: 8px;
  background: #fafafa;
}

.slot-cell.drag-over {
  border-color: #5c6bc0;
  background: #e8eaf6;
}

.empty {
  color: #999;
  font-style: italic;
}

.index-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #5c6bc0;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
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
