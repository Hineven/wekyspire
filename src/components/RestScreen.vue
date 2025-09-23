<template>
  <div class="rest-screen" :class="{'remi-present-rest-screen': gameState.isRemiPresent}">
    <div class="rest-screen-content">
      <h1 class="rest-title">{{ gameState.isRemiPresent ? '好好休息！' : '休整阶段'}}</h1>
      
      <div class="content-wrapper">
        <!-- 左侧固定大小面板容器 -->
        <div class="left-panel-container">
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
          
          <!-- 商店面板 -->
          <ShopPanel
        :is-visible="currentRewardPanel === 'shop'"
        :shop-items="gameState.shopItems"
        :game-state="gameState"
        @close="closeShopPanel"
      />
        </div>
        
        <!-- 右侧玩家状态面板 -->
        <PlayerStatusPanel :player="gameState.player" :restScreen="true"/>
      </div>
      
      <SkillSlotSelectionPanel
        :is-visible="skillSlotSelectionPanelVisible"
        :skill-slots="gameState.player.skillSlots"
        :skill="claimingSkill"
        @select-slot="onSkillSlotSelected"
        @close="closeSkillSlotSelectionPanel"
      />
    </div>
  </div>
</template>

<script>
import ColoredText from './ColoredText.vue';
import AbilityRewardPanel from './AbilityRewardPanel.vue';
import SkillRewardPanel from './SkillRewardPanel.vue';
import SkillSlotSelectionPanel from './SkillSlotSelectionPanel.vue';
import ShopPanel from './ShopPanel.vue';
import PlayerStatusPanel from './PlayerStatusPanel.vue';
import MoneyRewardPanel from './MoneyRewardPanel.vue';
import BreakthroughRewardPanel from './BreakthroughRewardPanel.vue';
import frontendEventBus from "../frontendEventBus";
import backendEventBus, { EventNames } from "../backendEventBus";

export default {
  name: 'RestScreen',
  components: {
    ColoredText,
    AbilityRewardPanel,
    SkillRewardPanel,
    SkillSlotSelectionPanel,
    ShopPanel,
    PlayerStatusPanel,
    MoneyRewardPanel,
    BreakthroughRewardPanel
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
      skillSlotSelectionPanelVisible: false,
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
      this.claimingSkill = currentSkill;
      // 稍等片刻后打开SkillSlotSelectionPanel，让动画放完
      setTimeout(() => {
        this.skillSlotSelectionPanelVisible = true;
      }, 300);
    },
    closeSkillSlotSelectionPanel() {
      this.skillSlotSelectionPanelVisible = false;
    },
    onSkillSlotSelected(slotIndex) {
      backendEventBus.emit(EventNames.Rest.CLAIM_SKILL, {
        skill: this.claimingSkill,
        slotIndex,
        clearRewards: false
      });
      // 关闭面板
      this.closeSkillSlotSelectionPanel();
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
    }

  }
}
</script>

<style scoped>
.rest-screen {
  height: 100%;
  width: 100%;
  background-size: cover;
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
  height: 220px;
  position: relative;
  flex-shrink: 0;
}
</style>