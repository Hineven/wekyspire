/**
 * CardMaterial - 卡牌材质
 *
 * 提供卡牌的基础渲染材质，支持：
 * - 等阶颜色边框
 * - 渐变背景
 * - 禁用状态灰度
 */

import * as THREE from 'three';

// 等阶颜色映射
const TIER_COLORS = {
  0: 0x888888, // 灰色 - 0阶
  1: 0xffffff, // 白色 - 1阶
  2: 0x00ff00, // 绿色 - 2阶
  3: 0x0088ff, // 蓝色 - 3阶
  4: 0x9933ff, // 紫色 - 4阶
  5: 0xff8800, // 橙色 - 5阶
  6: 0xff0000, // 红色 - 6阶
};

// 顶点着色器
const vertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 片段着色器
const fragmentShader = `
  uniform vec3 uTierColor;
  uniform vec3 uBackgroundColor;
  uniform float uDisabled;
  uniform float uTime;
  uniform float uBorderWidth;
  uniform float uHighlight;
  uniform float uCooldownProgress;
  uniform float uBurnProgress;
  uniform float uFlashIntensity;
  
  varying vec2 vUv;
  
  // 噪声函数（用于焚毁效果）
  float noise(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
  }
  
  void main() {
    vec3 color = uBackgroundColor;
    
    // 渐变背景（从上到下稍微变暗）
    float gradient = mix(1.0, 0.85, vUv.y);
    color *= gradient;
    
    // 边框
    float border = uBorderWidth;
    if (vUv.x < border || vUv.x > 1.0 - border ||
        vUv.y < border || vUv.y > 1.0 - border) {
      color = uTierColor;
    }
    
    // 禁用状态转灰度
    if (uDisabled > 0.5) {
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = vec3(gray);
    }
    
    // 高亮效果
    if (uHighlight > 0.0) {
      color = mix(color, vec3(1.0, 1.0, 0.8), uHighlight);
    }
    
    // 冷却效果（旋转遮罩）
    if (uCooldownProgress > 0.0) {
      float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
      float progress = uCooldownProgress;
      float cooldownMask = step(angle + 3.14159, progress * 6.28318);
      color = mix(color, vec3(0.3, 0.3, 0.5), cooldownMask * 0.5);
    }
    
    // 焚毁效果
    if (uBurnProgress > 0.0) {
      float burnNoise = noise(vUv * 10.0 + uTime * 0.5);
      float burnThreshold = uBurnProgress;
      float edgeWidth = 0.1;
      
      if (burnNoise < burnThreshold - edgeWidth) {
        discard;
      }
      
      float edge = smoothstep(burnThreshold - edgeWidth, burnThreshold, burnNoise);
      vec3 edgeColor = vec3(1.0, 0.5, 0.0);
      color = mix(edgeColor, color, edge);
    }
    
    // 闪光效果
    if (uFlashIntensity > 0.0) {
      float flash = sin(uTime * 10.0) * 0.5 + 0.5;
      color += vec3(1.0) * flash * uFlashIntensity;
    }
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

class CardMaterial extends THREE.ShaderMaterial {
  constructor(tier = 1, options = {}) {
    const tierColor = TIER_COLORS[tier] || TIER_COLORS[1];

    super({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTierColor: { value: new THREE.Color(tierColor) },
        uBackgroundColor: { value: new THREE.Color(0x2a2a2a) },
        uDisabled: { value: 0.0 },
        uTime: { value: 0.0 },
        uBorderWidth: { value: 0.02 },
        uHighlight: { value: 0.0 },
        uCooldownProgress: { value: 0.0 },
        uBurnProgress: { value: 0.0 },
        uFlashIntensity: { value: 0.0 }
      },
      transparent: true, // 启用透明度，支持焚毁效果的discard
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true
    });

    this.tier = tier;
  }

  /**
   * 设置等阶
   */
  setTier(tier) {
    this.tier = tier;
    const tierColor = TIER_COLORS[tier] || TIER_COLORS[1];
    this.uniforms.uTierColor.value.setHex(tierColor);
  }

  /**
   * 设置禁用状态
   */
  setDisabled(disabled) {
    this.uniforms.uDisabled.value = disabled ? 1.0 : 0.0;
  }

  /**
   * 更新时间（用于动画效果）
   */
  updateTime(time) {
    this.uniforms.uTime.value = time;
  }

  /**
   * 设置高亮效果
   * @param {number} intensity - 高亮强度 (0.0 - 1.0)
   */
  setHighlight(intensity) {
    this.uniforms.uHighlight.value = Math.max(0.0, Math.min(1.0, intensity));
  }

  /**
   * 设置冷却效果进度
   * @param {number} progress - 冷却进度 (0.0 - 1.0)
   */
  setCooldownProgress(progress) {
    this.uniforms.uCooldownProgress.value = Math.max(0.0, Math.min(1.0, progress));
  }

  /**
   * 设置焚毁效果进度
   * @param {number} progress - 焚毁进度 (0.0 - 1.0)
   */
  setBurnProgress(progress) {
    this.uniforms.uBurnProgress.value = Math.max(0.0, Math.min(1.0, progress));
  }

  /**
   * 设置闪光效果强度
   * @param {number} intensity - 闪光强度 (0.0 - 1.0)
   */
  setFlashIntensity(intensity) {
    this.uniforms.uFlashIntensity.value = Math.max(0.0, Math.min(1.0, intensity));
  }

  /**
   * 重置所有特效
   */
  resetEffects() {
    this.setHighlight(0.0);
    this.setCooldownProgress(0.0);
    this.setBurnProgress(0.0);
    this.setFlashIntensity(0.0);
  }
}

export default CardMaterial;
export { TIER_COLORS };

