<template>
  <div class="rest-screen" :class="{'remi-present-rest-screen': gameState.isRemiPresent}">
    <div class="rest-screen-content">
      <h1 class="rest-title">{{ gameState.isRemiPresent ? '好好休息！' : '休整阶段'}}</h1>
      
      <div class="content-wrapper">
        <!-- 左侧固定大小面板容器 -->
        <div class="left-panel-container" :class="{ 'two-panels': currentRewardPanel === 'shop' }">
          <!-- 金钱奖励面板 -->
          <MoneyRewardPanel
            :is-visible="currentRewardPanel === 'money'"
            :amount="gameState.rewards.money"
            @claimed="onMoneyRewardClaimed"
          />
          
          <!-- 突破奖励面板 -->
          <BreakthroughRewardPanel
            :is-visible="currentRewardPanel === 'breakthrough'"
            @claimed="onBreakthroughRewardClaimed"
          />
          
          <!-- 技能奖励面板 -->
          <SkillRewardPanel
            :is-visible="currentRewardPanel === 'skill'"
            :skills="gameState.rewards.skills"
            @close="closeSkillRewardPanel"
            @selected-skill-reward="onSkillRewardSelected"
          />
          
          <!-- 能力奖励面板 -->
          <AbilityRewardPanel
            :is-visible="currentRewardPanel === 'ability'"
            :abilities="gameState.rewards.abilities"
            @selected-ability-reward="onAbilityRewardSelected"
            @close="closeAbilityRewardPanel"
          />
          
          <!-- 商店 + 准备面板并列显示 -->
          <div v-if="currentRewardPanel === 'shop'" class="shop-prep-wrapper">
            <ShopPanel
              :is-visible="true"
              :shop-items="gameState.shopItems"
              :game-state="gameState"
              @close="closeShopPanel"
            />
            <PreparationPanel
              :skills="gameState.player.cultivatedSkills"
              @update-slots="onUpdatePreparation"
            />
          </div>
        </div>
        
        <!-- 右侧玩家状态面板 -->
        <PlayerStatusPanel :player="gameState.player" :restScreen="true"/>
      </div>
      
      <SkillSelectionPanel
        :is-visible="skillSelectionPanelVisible"
        :skills="this.gameState.player.cultivatedSkills"
        :skill="claimingSkill"
        @select-skill="onSkillSelected"
        @close="closeSkillSelectionPanel"
      />
    </div>
  </div>
</template>

<script>
import ColoredText from './ColoredText.vue';
import AbilityRewardPanel from './AbilityRewardPanel.vue';
import SkillRewardPanel from './SkillRewardPanel.vue';
import SkillSelectionPanel from './SkillSelectionPanel.vue';
import ShopPanel from './ShopPanel.vue';
import PlayerStatusPanel from './PlayerStatusPanel.vue';
import MoneyRewardPanel from './MoneyRewardPanel.vue';
import BreakthroughRewardPanel from './BreakthroughRewardPanel.vue';
import PreparationPanel from './PreparationPanel.vue';
import frontendEventBus from "../frontendEventBus";
import backendEventBus, { EventNames } from "../backendEventBus";

export default {
  name: 'RestScreen',
  components: {
    ColoredText,
    AbilityRewardPanel,
    SkillRewardPanel,
    SkillSelectionPanel,
    ShopPanel,
    PlayerStatusPanel,
    MoneyRewardPanel,
    BreakthroughRewardPanel,
    PreparationPanel
  },
  props: {
    gameState: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      currentRewardPanel: '', // 'money', 'breakthrough', 'skill', 'ability', 'shop' or empty
      skillSelectionPanelVisible: false,
      claimingSkill: null,
      rewardPanels: [],
      currentRewardIndex: 0
    }
  },
  mounted() {
    // 初始化奖励面板队列
    this.initRewardPanels();
    // 显示第一个奖励面板
    this.showNextRewardPanel();
    // 监听后端商品购买，弹出UI消息
    backendEventBus.on(EventNames.Shop.ITEM_PURCHASED, (purchasedItem) => {
      frontendEventBus.emit("pop-message", {
        id: 'item-purchased',
        text: `购买了物品：${purchasedItem.name}`
      });
    });
  },
  beforeUnmount() {
    backendEventBus.off && backendEventBus.off(EventNames.Shop.ITEM_PURCHASED);
  },
  methods: {
    initRewardPanels() {
      this.rewardPanels = [];
      
      // 按顺序添加奖励面板
      if (this.gameState.rewards.money > 0) {
        this.rewardPanels.push('money');
      }
      
      if (this.gameState.rewards.breakthrough) {
        this.rewardPanels.push('breakthrough');
      }
      
      if (this.gameState.rewards.skills.length > 0) {
        this.rewardPanels.push('skill');
      }
      
      if (this.gameState.rewards.abilities.length > 0) {
        this.rewardPanels.push('ability');
      }
      
      // 总是添加商店面板
      this.rewardPanels.push('shop'); 
    },
    
    showNextRewardPanel() {
      // 先隐藏当前面板
      this.currentRewardPanel = 'none';
      // 稍等片刻后，再显示下一个面板
      setTimeout(()=> {
        if (this.currentRewardIndex < this.rewardPanels.length) {
          this.currentRewardPanel = this.rewardPanels[this.currentRewardIndex];
        } else {
          // 所有奖励面板都已显示完毕
          this.currentRewardPanel = '';
        }
      }, 500);
    },
    
    onMoneyRewardClaimed() {
      this.currentRewardIndex++;
      this.showNextRewardPanel();
    },
    onBreakthroughRewardClaimed() {
      this.currentRewardIndex++;
      this.showNextRewardPanel();
    },
    closeSkillRewardPanel() {
      this.currentRewardIndex++;
      this.showNextRewardPanel();
    },
    closeAbilityRewardPanel() {
      this.currentRewardIndex++;
      this.showNextRewardPanel();
    },

    onSkillRewardSelected(currentSkill) {
      // 简化后的自动升级逻辑：如果奖励技能带有 upgradedFrom，直接替换来源技能
      if(currentSkill.isUpgradeCandidate && currentSkill.upgradedFrom) {
        const slots = this.gameState.player.cultivatedSkills;
        const sourceSlotIndex = slots.findIndex(s => s && s.name === currentSkill.upgradedFrom);
        if(sourceSlotIndex !== -1) {
          const oldSkill = slots[sourceSlotIndex];
          backendEventBus.emit(EventNames.Rest.CLAIM_SKILL, {
            skill: currentSkill,
            slotIndex: sourceSlotIndex,
            clearRewards: false
          });
          frontendEventBus.emit('pop-message', {
            id: 'skill-upgraded',
            text: `技能升级：${oldSkill.name} -> ${currentSkill.name}`
          });
          this.closeSkillRewardPanel();
          return;
        }
      }
      // 回退：未能自动升级则自动增添到末尾
      if(this.gameState.player.cultivatedSkills.length < this.gameState.player.maxSkills) {
        // 直接添加到末尾
        backendEventBus.emit(EventNames.Rest.CLAIM_SKILL, {
          skill: currentSkill,
          slotIndex: -1,
          clearRewards: false
        });
        this.closeSkillRewardPanel();
        return;
      }
      // 如果技能栏已满，则弹出技能选择面板，替换一个技能
      this.claimingSkill = currentSkill;
      setTimeout(() => { this.skillSelectionPanelVisible = true; }, 300);
    },
    closeSkillSelectionPanel() {
      this.skillSelectionPanelVisible = false;
    },
    onSkillSelected(slotIndex) {
      backendEventBus.emit(EventNames.Rest.CLAIM_SKILL, {
        skill: this.claimingSkill,
        slotIndex,
        clearRewards: false
      });
      // 关闭面板
      this.closeSkillSelectionPanel();
      this.closeSkillRewardPanel();
    },
    onAbilityRewardSelected(ability) {
      backendEventBus.emit(EventNames.Rest.CLAIM_ABILITY, {
        ability,
        clearRewards: false
      });
      this.closeAbilityRewardPanel();
    },
    closeShopPanel() {
      // 结束休整阶段，开始下一场战斗（后端流程监听）
      backendEventBus.emit(EventNames.Rest.FINISH);
    },
    onUpdatePreparation(newSlots) {
      // 将拖拽后的顺序回写到 cultivatedSkills（保持长度不超过 maxSkills）
      const max = this.gameState.player.maxSkills || 0;
      const arr = Array.isArray(newSlots) ? newSlots.slice(0, max) : [];
      this.gameState.player.cultivatedSkills = arr;
    }

  }
}
</script>

<style scoped>
.rest-screen {
  height: 100%;
  width: 100%;
  background-size: cover;
  overflow: hidden;
}

.remi-present-rest-screen {
  background-image: url('@assets/images/shop-background.png');
}

.rest-screen-content {
  margin: 0 auto;
  padding: 20px;
  max-width: 1200px;
}

.content-wrapper {
  display: flex;
  flex-direction: row;
  gap: 20px;
  justify-content: center;
  align-items: flex-start;
}

.rest-title {
  font-size: 2em;
  margin-bottom: 20px;
  color: #eef7ff;
}

.left-panel-container {
  width: 800px;
  min-height: 220px;
  position: relative;
  flex-shrink: 0;
}

.left-panel-container.two-panels {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.shop-prep-wrapper > * {
  flex: 1;
}
</style>