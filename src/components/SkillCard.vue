<template>
  <div 
    :class="['skill-card', { disabled: disabled }]"
    @click="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    :style="skillCardStyle"
  >
    <div class="skill-card-background-paper"></div>
    <div class="skill-card-background-image" :style="{backgroundImage:`url(${skillCardImageUrl})`}"></div>
    <div class="upgrade-badge" v-if="skill.isUpgradeCandidate">升级</div>
    <div
      v-if="hovered && skill.isUpgradeCandidate && skill.upgradedFrom"
      class="upgrade-replace-tooltip"
    >将替换：{{ skill.upgradedFrom }}</div>
    <div class="mana-cost" v-if="skill.manaCost > 0">
      <span class="mana-icon">💧</span>
      <span class="mana-value" :class="{ 'insufficient-mana': playerMana < skill.manaCost }">{{ skill.manaCost }}</span>
    </div>
    <div class="action-cost" v-if="skill.actionPointCost > 0">
      <span class="action-icon">⚡</span>
      <span class="action-value">{{ skill.actionPointCost }}</span>
    </div>
    <div class="skill-tier">{{ getSkillTierLabel(skill.tier) }}</div>
    <div :class="['skill-subtitle', {'hovered': hovered}]" v-if="skill.subtitle"> {{skill.subtitle}} </div>
    <div :class="['skill-card-panel']">
      <div class="skill-name" :style="{color: skillNameColor, borderColor: skillBackgroundColor}">
        {{ skill.name + (skill.power < 0 ? '（' + skill.power + '）' : '') + (skill.power > 0 ? '（+' + skill.power + '）' : '') }}</div>
      <div class="skill-description">
        <ColoredText :text="skillDescription" />
      </div>
      <div class="skill-uses">
        <ColoredText v-if="skill.coldDownTurns != 0 && skill.remainingUses != skill.maxUses && !previewMode" :text="`/named{重整} ${skill.remainingColdDownTurns}/${skill.coldDownTurns}`"></ColoredText>
        <ColoredText v-else-if="skill.coldDownTurns != 0" :text="`/named{重整} ${skill.coldDownTurns} 回合`"></ColoredText>
        <ColoredText v-else-if="skill.remainingUses != Infinity" :text="`/named{消耗}`"></ColoredText>
        <br />
        <strong v-if="skill.maxUses === Infinity && skill.coldDownTurns == 0">无限</strong>
        <span v-else-if="previewMode">(装填 {{ skill.maxUses }}/{{ skill.maxUses }})</span>
        <span v-else>(装填 {{ skill.remainingUses }}/{{ skill.maxUses }})</span>
      </div>
    </div>
  </div>
</template>

<script>
import ColoredText from './ColoredText.vue';
import {getSkillTierColor, getSkillTierLabel} from '../utils/tierUtils.js';
import frontendEventBus from '../frontendEventBus.js';


export default {
  name: 'SkillCard',
  components: {
    ColoredText
  },
  props: {
    skill: {
      type: Object,
      required: true
    },
    player: {
      type: Object,
      required: false,
      default: null
    },
    disabled: {
      type: Boolean,
      default: false
    },
    playerMana: {
      type: Number,
      default: Infinity
    },
    previewMode: {
      type: Boolean,
      default: false
    },
    canClick: {
      type: Boolean,
      default: true
    },
    // 新增：当为 true 时，点击卡牌不触发本地 CSS 激活动画（交由全局 overlay/GSAP 处理）
    suppressActivationAnimationOnClick: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      hovered: false,
    };
  },
  computed: {
    skillDescription() {
      // 动态根据玩家/技能当前状态生成描述
      if (this.player && typeof this.skill?.regenerateDescription === 'function') {
        return this.skill.regenerateDescription(this.player);
      }
      if (typeof this.skill?.getDescription === 'function') {
        return this.skill.getDescription();
      }
      return this.skill?.description || '';
    },
    skillNameColor() {
      if(this.skill.power < 0) {
        return 'red';
      } else if(this.skill.power > 0) {
        return 'green';
      } else {
        return 'black';
      }
    },
    skillCardStyle () {
      const color = getSkillTierColor(this.skill.tier);
      const backgroundColor = this.adjustColorBrightness(color, 40);
      const borderColor = this.adjustColorBrightness(color, -40);
      return {
        backgroundColor: backgroundColor,
        borderColor: borderColor,
        cursor: (!this.disabled && this.canClick) ? 'pointer' : 'not-allowed'
      };
    },
    skillBackgroundColor() {
      const color = getSkillTierColor(this.skill.tier);
      return this.adjustColorBrightness(color, 50);
    },
    skillCardImageUrl () {
      let imageName = this.skill.image;
      if(imageName) {} else {
        imageName = `0`;
        if (this.skill.tier >= 2) imageName = '1';
        if (this.skill.tier >= 4) imageName = '2';
        if (this.skill.tier >= 6) imageName = '3';
        if (this.skill.tier >= 8) imageName = '4';
        imageName = `${this.skill.type}-${imageName}.png`;
      }
      return new URL(`../assets/cards/${imageName}`, import.meta.url).href;
    }
  },
  mounted() {
    // 不再监听update-skill-descriptions事件，改由computed自动更新
  },
  beforeUnmount() {
    // 无事件需要移除
  },
  methods: {
    getSkillTierLabel,
    adjustColorBrightness(color, percent) {
      // 移除可能存在的#号
      let hex = color.replace(/#/g, '');

      // 验证颜色格式是否正确
      if (hex.length !== 6) {
        throw new Error('无效的颜色格式，请使用6位十六进制颜色，如"#AACC12"');
      }

      // 将十六进制转换为RGB分量
      let r = parseInt(hex.substring(0, 2), 16);
      let g = parseInt(hex.substring(2, 4), 16);
      let b = parseInt(hex.substring(4, 6), 16);

      // 计算调整值（基于百分比）
      const factor = percent / 100;

      // 调整每个颜色分量的亮度
      r = Math.round(r + (255 - r) * factor);
      g = Math.round(g + (255 - g) * factor);
      b = Math.round(b + (255 - b) * factor);

      // 确保值在0-255范围内
      r = Math.min(255, Math.max(0, r));
      g = Math.min(255, Math.max(0, g));
      b = Math.min(255, Math.max(0, b));

      // 将RGB转回十六进制，并确保两位表示
      const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    },
    onClick(event) {
      if (!this.disabled && this.canClick) {
        // 仅当未开启抑制时才播放本地 CSS 激活动画
        if (!this.suppressActivationAnimationOnClick) {
          this.playActivationAnimation();
        }
        this.$emit('skill-card-clicked', this.skill, event);
      }
    },
    
    onMouseEnter() {
      this.hovered = true;
      if (this.previewMode) return;
      frontendEventBus.emit('skill-card-hover-start', this.skill);
    },
    
    onMouseLeave() {
      this.hovered = false;
      if (this.previewMode) return;
      frontendEventBus.emit('skill-card-hover-end', this.skill);
    },
    // 播放技能激活动画
    playActivationAnimation() {
      const card = this.$el;
      if (!card) return;
      
      // 根据技能tier确定动画强度
      const tier = this.skill.tier || 0;
      const intensity = 2;
      
      // 添加动画类
      card.classList.add('activating');
      
      // 设置动画样式
      card.style.animationDuration = `${0.25 / intensity}s`;
      
      // 播放粒子特效
      this.playParticleEffect(tier, card);
      
      // 动画结束后清理
      setTimeout(() => {
        card.classList.remove('activating');
        card.style.animationDuration = '';
      }, 500 / intensity);
    },
    // 播放粒子特效
    playParticleEffect(tier, card) {
      // 根据tier确定粒子参数
      const tierSettings = {
        '-1': { count: 5, size: 3, color: '#333333' },   // curses
        '0': { count: 15, size: 3, color: '#000000' },     // D
        '1': { count: 20, size: 4, color: '#41db39' },     // C-
        '2': { count: 30, size: 5, color: '#41db39' },    // C+
        '3': { count: 40, size: 6, color: '#759eff' },    // B-
        '4': { count: 50, size: 7, color: '#759eff' },    // B
        '5': { count: 60, size: 8, color: '#d072ff' },    // B+
        '6': { count: 60, size: 9, color: '#d072ff' },    // A-
        '7': { count: 60, size: 10, color: '#ff9059' },   // A
        '8': { count: 60, size: 11, color: '#ff9059' },   // A+
        '9': { count: 60, size: 12, color: '#ff0000' }    // S
      };
      
      const settings = tierSettings[tier] || tierSettings['0'];
      
      // 创建粒子数组
      const particles = [];
      
      // 获取卡片的绝对位置
      const cardRect = card.getBoundingClientRect();
      
      // 生成粒子
      for (let i = 0; i < settings.count; i++) {
        // 随机运动方向和距离，确保粒子向四周逸散
        const distance = 30 + Math.random() * 70; // 随机距离(30-100px)
        const velocity = 10 + Math.random() * 20; // 随机速度
        
        // 计算卡牌边缘的随机起始位置（相对坐标）
        const edge = Math.floor(Math.random() * 4); // 0:上, 1:右, 2:下, 3:左
        let startX, startY;
        
        switch (edge) {
          case 0: // 上边缘
            startX = Math.random() * cardRect.width; // 使用实际卡片宽度
            startY = 0;
            break;
          case 1: // 右边缘
            startX = cardRect.width;
            startY = Math.random() * cardRect.height; // 使用实际卡片高度
            break;
          case 2: // 下边缘
            startX = Math.random() * cardRect.width;
            startY = cardRect.height;
            break;
          case 3: // 左边缘
            startX = 0;
            startY = Math.random() * cardRect.height;
            break;
        }

        // 计算飞离卡牌的方向
        const deltaCenterX = startX - cardRect.width / 2;
        const deltaCenterY = startY - cardRect.height / 2;
        const angle = Math.random() * 0.2 + Math.atan2(deltaCenterY, deltaCenterX); // 随机角度
        
        // 将相对坐标转换为绝对坐标
        const absoluteX = cardRect.left + startX;
        const absoluteY = cardRect.top + startY;
        
        const particle = {
          x: absoluteX, // 绝对位置
          y: absoluteY, // 绝对位置
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: 1000, // 生命周期1秒
          color: settings.color,
          size: settings.size,
          opacity: 1,
          opacityFade: true,
          gravity: 0, // 可以根据需要添加重力
          zIndex: 0 // 刚好能被skill card panel遮住
        };
        
        particles.push(particle);
      }
      
      // 通过事件总线触发粒子特效
      frontendEventBus.emit('spawn-particles', particles);
    }
  }
}
</script>

<style scoped>
.skill-card-panel {
  position: absolute;
  width: 150px;
  padding: 15px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.8);
}

.skill-name {
  font-weight: bold;
  font-size: 16px;
  padding:2px;
  border-radius: 8px;
  border-width: 3px;
  border-style: solid;
  margin: 0 auto 8px auto;
}

.skill-description {
  font-size: 14px;
  margin-bottom: 8px;
  text-align: center;
}

.skill-uses {
  font-size: 12px;
  color: #666;
}

.skill-tier {
  position: absolute;
  top: 5px;
  right: 5px;
  font-weight: bold;
  font-size: 18px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.8);
}

.mana-cost {
  position: absolute;
  top: 5px;
  left: 5px;
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
}

.mana-icon {
  font-size: 16px;
  margin-right: 4px;
}

.mana-value {
  font-weight: bold;
  color: #2196f3;
  font-size: 16px;
}

.mana-value.insufficient-mana {
  color: #f44336;
}

.action-cost {
  position: absolute;
  bottom: 5px;
  left: 5px;
  display: flex;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 2px 6px;
  border-radius: 4px;
}

.action-icon {
  font-size: 16px;
  margin-right: 4px;
}

.action-value {
  font-weight: bold;
  color: #ff9800;
  font-size: 16px;
}

.skill-subtitle {
  position: absolute;
  bottom: 5px;
  right: 5px;
  display: flex;
  align-items: center;
  padding: 2px 6px;
  color: rgba(200, 200, 200, 0.7);
  font-size: 12px;
  font-style: italic;
  transition: 0.5s ease;
}
.skill-subtitle.hovered {
  color: black;
  background-color: rgba(255, 255, 255, 0.7);
}

.skill-card {
  width: 198px;
  height: 266px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  /* transition: all 0.3s ease; */
  position: relative;
  border: 3px solid #eee;
  border-radius: 5px;
}

.skill-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.skill-card.disabled {
  filter: brightness(50%);
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* 垫在skill-card上，用来铺上一个白色背景*/
.skill-card-background-paper {
  position: absolute;
  width: 180px;
  height: 240px;
  background-color: white;
}

.skill-card-background-image {
  position: absolute;
  width: 212px;
  height: 280px;
  background-origin: content-box;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

/* 技能激活动画关键帧 */
@keyframes skillActivation {
  0% {
    transform: scale(1);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  50% {
    transform: scale(1.1);
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
    filter: brightness(1.5) drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
  }
  100% {
    transform: scale(1);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
}

.skill-card.activating {
  z-index: 100;
  animation-name: skillActivation;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

.upgrade-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: linear-gradient(135deg, #ffcc33, #ff8800);
  color: #222;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  box-shadow: 0 0 4px rgba(0,0,0,0.4);
  z-index: 2;
}
.upgrade-replace-tooltip {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translate(-50%, 100%);
  background: rgba(255,255,255,0.95);
  color: #222;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
  border: 1px solid #e0e0e0;
  z-index: 10;
  pointer-events: none;
  animation: fadeIn 0.18s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translate(-50%, 120%); }
  to { opacity: 1; transform: translate(-50%, 100%); }
}
</style>