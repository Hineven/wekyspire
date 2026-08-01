// CardObject（§4.2）：场景内的一张牌。
// 结构：Group
//   └─ face: PlaneGeometry(cardWidth, cardHeight)，材质 map = RichTextEngine 烘焙纹理
// 牌面内容（名称/费用/描述文本）由注入的 bakeFace(cardData) 函数产出
// { texture, hitRegions, width, height } —— 纹理与 hit map 永远成对替换（§4.6 铁律）。
// 状态视觉（禁用/高亮/焚毁…）先以材质颜色占位，shader 版本后续替换 setVisualState 内部实现。

import * as THREE from 'three';

export class CardObject extends THREE.Group {
  /**
   * @param {object} options
   *   uniqueID: string
   *   cardWidth/cardHeight: number   世界单位
   *   bakeFace: (cardData) => { texture, hitRegions, width, height }   默认纯色占位
   */
  constructor(options) {
    super();
    const { uniqueID, cardWidth = 20, cardHeight = 27, bakeFace = null } = options;
    this.uniqueID = uniqueID;
    this.cardWidth = cardWidth;
    this.cardHeight = cardHeight;
    this._bakeFace = bakeFace || defaultBakeFace;

    this._material = new THREE.MeshBasicMaterial({ transparent: true });
    this._face = new THREE.Mesh(new THREE.PlaneGeometry(cardWidth, cardHeight), this._material);
    this._face.name = 'face';
    this.add(this._face);

    this._hitRegions = [];   // 烘焙布局坐标（见 setCard）
    this._layoutSize = { width: cardWidth, height: cardHeight };
    this._visualState = 'normal';
  }

  /** 牌面内容更新：重烘纹理 + 成对替换 hit map。 */
  setCard(cardData) {
    const { texture, hitRegions, width, height } = this._bakeFace(cardData);
    const old = this._material.map;
    this._material.map = texture;
    this._material.needsUpdate = true;
    old?.dispose?.();
    this._hitRegions = hitRegions || [];
    // hit map 用烘焙布局坐标（与牌面世界尺寸无关），uv 反算时按此尺寸还原
    this._layoutSize = { width: width || this.cardWidth, height: height || this.cardHeight };
    this._cardData = cardData;
  }

  get cardData() { return this._cardData || null; }
  get hitRegions() { return this._hitRegions; }
  get faceMesh() { return this._face; }

  /**
   * raycast 命中牌面后的查询：uv → 牌面局部坐标 → hit map。
   * @param {{u:number, v:number}} uv  three raycast 交点 uv（v 向上）
   * @returns {{type:string, payload:object, rect:object}|null}
   */
  hitTestUV({ u, v }) {
    // 烘焙布局坐标：x 向右（与 u 同向），y 向下（与 v 反向）
    const lx = u * this._layoutSize.width;
    const ly = (1 - v) * this._layoutSize.height;
    return this.hitTestLocal(lx, ly);
  }

  hitTestLocal(lx, ly) {
    for (const region of this._hitRegions) {
      const r = region.rect;
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return region;
    }
    return null;
  }

  /** 状态视觉占位：normal | disabled（淡灰白=暂不可发动） | highlighted。shader 版实现时保持此接口。 */
  setVisualState(state) {
    this._visualState = state;
    switch (state) {
      case 'disabled': this._material.color.set(0xb8b8b8); break;
      case 'highlighted': this._material.color.set(0xffffcc); break;
      default: this._material.color.set(0xffffff);
    }
  }

  /** 激活态边缘流光（咏唱已激活）：绕牌边缘循环的小光点，由 updateGlow(dt) 逐帧驱动。 */
  setActiveGlow(on) {
    if (on === !!this._glowDot) return;
    if (on) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe9a0, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this._glowDot = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
      this._glowDot.position.z = 0.6;
      this._glowT = 0;
      this.add(this._glowDot);
    } else {
      this.remove(this._glowDot);
      this._glowDot.geometry.dispose();
      this._glowDot.material.dispose();
      this._glowDot = null;
    }
  }

  get hasActiveGlow() { return !!this._glowDot; }

  /** 逐帧驱动流光：沿牌边缘矩形路径循环 + 呼吸脉动。 */
  updateGlow(dt) {
    if (!this._glowDot) return;
    this._glowT = (this._glowT + dt * 0.35) % 1; // ≈2.9s 一圈
    const p = perimeterPoint(this._glowT, this.cardWidth + 1.6, this.cardHeight + 1.6);
    this._glowDot.position.x = p.x;
    this._glowDot.position.y = p.y;
    const pulse = 0.75 + 0.25 * Math.sin(this._glowT * Math.PI * 8);
    this._glowDot.scale.set(pulse, pulse, 1);
  }

  /** 特效 overlay（冷却/充能脉冲）：盖住牌面的发光片，惰性创建，默认隐藏。 */
  ensureOverlay() {
    if (this._overlay) return this._overlay;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cardWidth * 1.06, this.cardHeight * 1.06), mat);
    this._overlay.position.z = 0.4;
    this._overlay.visible = false;
    this.add(this._overlay);
    return this._overlay;
  }

  get visualState() { return this._visualState; }

  dispose() {
    this.setActiveGlow(false);
    if (this._overlay) {
      this._overlay.userData.fxTween?.kill?.();
      this.remove(this._overlay);
      this._overlay.geometry.dispose();
      this._overlay.material.dispose();
      this._overlay = null;
    }
    this._material.map?.dispose?.();
    this._material.dispose();
    this._face.geometry.dispose();
  }
}

// 矩形周长参数路径（t∈[0,1)，顶边左→右起顺时针），w/h 为路径全宽/全高
function perimeterPoint(t, w, h) {
  const per = 2 * (w + h);
  let d = t * per;
  if (d < w) return { x: -w / 2 + d, y: h / 2 };   // 顶边 左→右
  d -= w;
  if (d < h) return { x: w / 2, y: h / 2 - d };    // 右边 上→下
  d -= h;
  if (d < w) return { x: w / 2 - d, y: -h / 2 };   // 底边 右→左
  d -= w;
  return { x: -w / 2, y: -h / 2 + d };             // 左边 下→上
}

// 占位烘焙：无 RichTextEngine 时的纯色 1x1 纹理（§8 风险条款允许的 placeholder 链路）
function defaultBakeFace() {
  const canvas = { width: 1, height: 1 };
  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return { texture, hitRegions: [], width: 1, height: 1 };
}
