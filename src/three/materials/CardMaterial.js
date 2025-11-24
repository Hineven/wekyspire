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
  
  varying vec2 vUv;
  
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
        uBorderWidth: { value: 0.02 }
      },
      transparent: false,
      side: THREE.FrontSide
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
}

export default CardMaterial;
export { TIER_COLORS };

