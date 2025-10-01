<template>
  <div class="skill-uses">
    <ColoredText
      v-if="skill.coldDownTurns !== 0 && skill.remainingUses !== skill.maxUses && !previewMode"
      :text="`/named{重整} ${skill.remainingColdDownTurns}/${skill.coldDownTurns}`"
    />
    <ColoredText
      v-else-if="skill.coldDownTurns !== 0"
      :text="`/named{重整} ${skill.coldDownTurns} 回合`"
    />
    <ColoredText
      v-else-if="skill.remainingUses !== Infinity"
      text="/named{消耗}"
    />
    <ColoredText v-if="skill.slowStart" text="/named{慢热}" />
    <br />
    <strong v-if="skill.maxUses === Infinity && skill.coldDownTurns === 0">无限</strong>
    <span v-else-if="previewMode">(装填 {{ skill.maxUses }}/{{ skill.maxUses }})</span>
    <span v-else>(装填 {{ skill.remainingUses }}/{{ skill.maxUses }})</span>
  </div>
</template>

<script>
import ColoredText from '../ColoredText.vue';
export default {
  name: 'SkillUses',
  components: { ColoredText },
  props: {
    skill: { type: Object, required: true },
    previewMode: { type: Boolean, default: false }
  }
};
</script>

<style scoped>
.skill-uses { font-size: 12px; color: #666; }
</style>

