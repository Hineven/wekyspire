<template>
  <div 
    class="hurt-animation-wrapper" 
    :class="{ 
      'hurt-shake': isShaking,
      'hurt-effect': isHurt,
      'evade-effect': isEvading,
      'dead-wrapper': isDead,
      'shielded-wrapper': isShielded
      }"
    :style="[hurtStyle, zIndexStyle]"
  >
    <slot></slot>
    <!-- 治疗效果覆盖层 -->
    <div 
      v-if="isHealing" 
      class="heal-overlay" 
    ></div>
    <!-- 死亡爆炸效果覆盖层 -->
    <div 
      v-if="isDead" 
      class="dead-overlay" 
    ></div>
  </div>
</template>

<script>
import frontendEventBus from '../frontendEventBus.js';
export default {
  name: 'HurtAnimationWrapper',
  props: {
    unit: {
      type: Object,
      default: null
    },
    zIndex: {
      type: Number,
      default: 1
    }
  },
  data() {
    return {
      isShaking: false,
      isHurt: false,
      isEvading: false,
      isHealing: false,
      isDead: false,
      isShieldBroke: false,
      shakeIntensity: 0,
      hurtIntensity: 0,
      particles: [],
      _prevSnapshot: { hp: 0, shield: 0 },
      _timers: []
    };
  },
  computed: {
    isShielded() {
      return (this.unit?.shield || 0) > 0;
    },
    // 注意：移除了 shakeStyle，避免与 CSS 动画在 transform 上冲突
    hurtStyle() {
      if (!this.isHurt) return {};
      const intensity = Math.min(this.hurtIntensity / 50, 1);
      const borderWidth = Math.min(Math.max(2, Math.floor(5 * intensity)), 10);
      return {
        '--hurt-border-width': `${borderWidth}px`,
        '--hurt-opacity': Math.max(Math.min(intensity, 1), 0.2)
      };
    },

    zIndexStyle() {
      return { zIndex: this.zIndex };
    },

    // 用于合并监听 hp/shield 变化的签名
    statKey() {
      const hp = this.unit?.hp ?? 0;
      const shield = this.unit?.shield ?? 0;
      const id = this.unit?.uniqueID || this.unit?.name || '';
      return `${id}:${hp}/${shield}`;
    }
  },
  mounted() {
    // 初始化快照
    this._prevSnapshot = {
      hp: this.unit?.hp ?? 0,
      shield: this.unit?.shield ?? 0
    };
  },
  watch: {
    // 当 unit 实例切换时，重置快照，避免跨实例误判
    unit(newUnit, oldUnit) {
      this._prevSnapshot = {
        hp: newUnit?.hp ?? 0,
        shield: newUnit?.shield ?? 0
      };
      // 可选择重置动画状态，避免继承残留态
      this.isShaking = false;
      this.isHurt = false;
      this.isEvading = false;
      this.isHealing = false;
      this.isDead = false;
      this.hurtIntensity = 0;
      this.shakeIntensity = 0;
      this._clearTimers();
    },

    // 合并监听 hp/shield 变化，计算 delta 并驱动动画
    statKey() {
      if (!this.unit) return;
      const prevHp = this._prevSnapshot.hp;
      const prevShield = this._prevSnapshot.shield;
      const currHp = this.unit.hp;
      const currShield = this.unit.shield;

      const dhp = currHp - prevHp; // 负值=受伤，正值=治疗
      const dshield = currShield - prevShield; // 负值=护盾损失

      // 死亡触发（hp从>0到<=0），排除玩家
      if (prevHp > 0 && currHp <= 0 && this.unit.type !== 'player') {
        this.handleBattleVictory();
      }

      if (dhp < 0 || dshield < 0) {
        const hpDamage = Math.max(0, -dhp);
        const passThroughDamage = hpDamage + Math.max(0, -dshield);
        this.triggerHurtAnimation(hpDamage, passThroughDamage);
      } else if (dhp > 0) {
        // 治疗
        this.triggerHurtAnimation(-dhp, 0);
      }

      // 更新快照
      this._prevSnapshot = { hp: currHp, shield: currShield };
    }
  },
  beforeUnmount() {
    this._clearTimers();
  },
  methods: {
    _setTimer(fn, delay) {
      const id = setTimeout(fn, delay);
      this._timers.push(id);
      return id;
    },
    _clearTimers() {
      if (this._timers && this._timers.length) {
        for (const id of this._timers) clearTimeout(id);
        this._timers = [];
      }
    },

    triggerHurtAnimation(hpDamage, passThroughDamage) {
      const damage = hpDamage;
      // 无伤害且无穿透 => 闪避
      if (damage === 0 && passThroughDamage === 0) {
        this.isEvading = true;
        this._setTimer(() => { this.isEvading = false; }, 700);
        return;
      }

      // 负数伤害 => 治疗
      if (damage < 0) {
        this.isHealing = true;
        this.createDamageText(damage);
        this._setTimer(() => { this.isHealing = false; }, 600);
        return;
      }

      // 正常受伤
      this.shakeIntensity = damage;
      this.isShaking = true;
      this.hurtIntensity = damage;
      this.isHurt = true;

      // 粒子：hp 伤害红色/橙色，纯护盾伤害蓝色
      if (damage > 0) {
        this.createParticles(damage, 0);
      } else {
        this.createParticles(Math.abs(damage), 140);
      }
      // 伤害文本（使用穿透总伤害）
      this.createDamageText(passThroughDamage);

      // 抖动持续时间
      const duration = Math.min(200 + passThroughDamage * 2, 600);
      this._setTimer(() => { this.isShaking = false; this.shakeIntensity = 0; }, duration);
      // 受伤特效快速结束
      this._setTimer(() => { this.isHurt = false; this.hurtIntensity = 0; }, 200);
    },

    handleBattleVictory() {
      if (this.unit.type !== 'player') {
        // 持续生成粒子
        for (let i = 0; i < 7; i++) {
          this._setTimer(() => { this.createParticles(20); }, i * 200);
        }
        // 爆炸前抖动
        this._setTimer(() => { this.isShaking = true; this.shakeIntensity = 20; }, 900);
        // 闪烁并置 dead
        this._setTimer(() => { this.isDead = true; }, 1400);
        // 爆炸粒子
        this._setTimer(() => { this.createParticles(100); }, 1400);
      }
    },

    createDamageText(damage) {
      const wrapper = this.$el;
      const wrapperRect = wrapper.getBoundingClientRect();
      const wrapperWidth = wrapperRect.width;
      const wrapperHeight = wrapperRect.height;

      const isHealing = damage < 0;
      const text = isHealing ? `+${Math.abs(damage)}` : `-${damage}`;
      const color = isHealing ? '#00ff00' : '#ff0000';
      const damageValue = Math.abs(damage);
      const fontSize = Math.min(96, Math.max(24, 12 + damageValue / 4));

      const centerX = wrapperRect.left + wrapperWidth / 2;
      const centerY = wrapperRect.top + wrapperHeight / 2;
      const startX = centerX + (Math.random() - 0.5) * wrapperWidth * 0.3;
      const startY = centerY + (Math.random() - 0.5) * wrapperHeight * 0.3;

      const duration = Math.min(3000, isHealing ? (1000 - damageValue * 50) : (800 + damageValue * 30));
      const gravity = isHealing ? 0 : 1000;
      const velocityX = (Math.random() - 0.5) * 200;
      const velocityY = -200 - Math.random() * 200;

      const particle = {
        x: startX,
        y: startY,
        vx: velocityX,
        vy: velocityY,
        gravity: gravity,
        life: duration,
        size: fontSize,
        text: text,
        extraStyles: {
          color: color,
          userSelect: 'none',
          pointerEvents: 'none',
          fontSize: `${fontSize}px`,
          fontWeight: 'bold',
          zIndex: '20'
        }
      };
      frontendEventBus.emit('spawn-particles', [particle]);
    },

    createParticles(damageMagnitude, hueShift = 0) {
      const wrapperRect = this.$el.getBoundingClientRect();
      const wrapperWidth = wrapperRect.width;
      const wrapperHeight = wrapperRect.height;

      const magnitude = Math.max(1, Math.abs(damageMagnitude));
      const particleCount = Math.min(Math.max(Math.floor(magnitude / 5), 20), 80);

      const particles = [];
      for (let i = 0; i < particleCount; i++) {
        const edge = Math.floor(Math.random() * 4);
        let startX = 0, startY = 0;
        switch (edge) {
          case 0: startX = Math.random() * wrapperWidth; startY = 0; break;
          case 1: startX = wrapperWidth; startY = Math.random() * wrapperHeight; break;
          case 2: startX = Math.random() * wrapperWidth; startY = wrapperHeight; break;
          case 3: startX = 0; startY = Math.random() * wrapperHeight; break;
        }
        const centerX = wrapperWidth / 2;
        const centerY = wrapperHeight / 2;
        const angle = Math.atan2(startY - centerY, startX - centerX);

        const speed = (8 + Math.random() * 12) * Math.max(1, Math.min(magnitude / 10, 8));
        const size = (1 + Math.random() * 4) * Math.min(20, Math.max(2, magnitude / 4));

        const hue = hueShift + Math.random() * 45;
        const saturation = 80 + Math.random() * 20;
        const lightness = 40 + Math.random() * 20;

        const absoluteX = wrapperRect.left + startX;
        const absoluteY = wrapperRect.top + startY;

        particles.push({
          x: absoluteX,
          y: absoluteY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: size,
          color: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
          life: (500 + Math.random() * 500) * Math.min(3, Math.max(1, magnitude / 100)),
          shape: 'circle',
          opacityFade: true,
          drag: 0.1,
          zIndex: 0
        });
      }
      // 通过事件总线发送粒子生成请求
      frontendEventBus.emit('spawn-particles', particles);
    }
  }
};
</script>

<style scoped>
.hurt-animation-wrapper {
  width: fit-content;
  height: fit-content;
  position: relative;
  transition: transform 0.1s ease;
  /* 受伤特效的默认变量 */
  --hurt-border-width: 0px;
  --hurt-opacity: 0;
  border: var(--hurt-border-width) solid rgba(255, 0, 0, var(--hurt-opacity));
  filter: drop-shadow(0 0 5px rgba(255, 0, 0, calc(var(--hurt-opacity) * 0.5)));
  transition: border 0.2s ease, filter 0.2s ease;
}

.hurt-shake {
  animation: shake 0.3s ease-in-out;
}

.hurt-effect {
  /* 受伤时的特效 */
  border: var(--hurt-border-width) solid rgba(255, 0, 0, var(--hurt-opacity));
  filter: drop-shadow(0 0 5px rgba(255, 0, 0, calc(var(--hurt-opacity) * 0.5)));
  transition: border 0.2s ease, filter 0.2s ease;
}

.evade-effect {
  animation: evade-swing 0.3s ease-in-out;
}

@keyframes evade-swing {
  0% { transform: rotate(0deg); }
  50% { transform: translate(20px) rotate(3deg); }
  100% { transform: translate(0px) rotate(0deg); }
}

.heal-overlay {
  /* 治疗时的特效覆盖层 */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 255, 0, 0.6);
  pointer-events: none;
  z-index: 10;
  animation: heal-fadeout 0.6s forwards;
}

.dead-overlay {
  /* 死亡时的特效覆盖层 */
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: white;
  pointer-events: none;
  z-index: 11;
  animation: dead-flash 0.6s forwards;
}

@keyframes shake {
  0% { transform: translate(0, 0) rotate(0); }
  10% { transform: translate(-2px, -1px) rotate(-0.5deg); }
  20% { transform: translate(2px, 1px) rotate(0.5deg); }
  30% { transform: translate(-2px, 1px) rotate(-0.5deg); }
  40% { transform: translate(2px, -1px) rotate(0.5deg); }
  50% { transform: translate(-1px, 2px) rotate(-0.5deg); }
  60% { transform: translate(1px, -2px) rotate(0.5deg); }
  70% { transform: translate(-1px, -1px) rotate(-0.5deg); }
  80% { transform: translate(1px, 1px) rotate(0.5deg); }
  90% { transform: translate(-1px, 1px) rotate(-0.5deg); }
  100% { transform: translate(0, 0) rotate(0); }
}

@keyframes heal-fadeout {
  0% { opacity: 0.6; }
  100% { opacity: 0; }
}

@keyframes dead-flash {
  0% { opacity: 0.3; background-color: red;}
  10% { opacity: 0; }
  20% { opacity: 0.6; background-color: red;}
  30% { opacity: 0; }
  40% { opacity: 1; background-color: black;}
  50% { opacity: 0; }
  60% { opacity: 1; background-color: red;}
  70% { opacity: 0.5;}
  100% { opacity: 1; background-color: white;}
}

/* 死亡时让元素看起来消失 */
.dead-wrapper {
  animation: dead-disappear 0.6s forwards;
}

@keyframes dead-disappear {
  0% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

/* 有盾的时候，增加一个花哨的蓝色边框（盾牌） */
.shielded-wrapper {
  border: 5px solid #1E90FF;
  border-radius: 8px;
}
</style>