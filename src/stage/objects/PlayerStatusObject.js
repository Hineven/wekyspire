// PlayerStatusObject：左下角玩家状态栏（战斗/地图共享）——头像 + 四行信息：
// AP/魏启资源点两排 + 金币行 + 瑞米状态行；后续扩展位（精英能力/大师能力
// 灵脉图标等）挂在 abilities 区（见 LAYOUT 注释）。
// 结构：Group（原点 = 面板中心）
//   ├─ plate:  圆角深色底板（canvas 烘焙；node 无 document 退化为纯色 plane）
//   ├─ avatar: 圆形头像（CircleGeometry + 立绘纹理 setAvatar 注入，
//   │          用 texture repeat/offset 裁出头顶部区域，无需 canvas 合成）
//   │          + 金属描边环
//   ├─ apPips / manaPips: ResourcePipsObject（align:'left' 两排，update 需外部
//   │          tick 透传——两舞台帧循环已逐行 update）
//   ├─ moneyLabel: 金币行（setMoney 重烘文本）
//   ├─ remiLabel:  瑞米状态行（setRemi 重烘；被打跑时红色警示）
//   └─ abilities: 留位 Group（能力/灵脉图标行的未来挂载点，位于瑞米行下方）
//
// 布局常量和面板尺寸集中在本文件 LAYOUT，舞台只摆面板位置。

import * as THREE from 'three';
import { ResourcePipsObject } from './ResourcePipsObject.js';

export const PLAYER_STATUS_LAYOUT = Object.freeze({
  PANEL_W: 36,
  PANEL_H: 14.4,
  AVATAR_R: 4.2,
  AVATAR_X: -11.6,  // 头像中心（局部坐标）
  RING_R: 4.9,      // 描边环外径
  ROW_X: -5.4,      // 四行信息的左锚点（局部坐标）
  ROW_AP_Y: 5.4,
  ROW_MANA_Y: 1.8,
  ROW_MONEY_Y: -1.8,
  ROW_REMI_Y: -5.4,
  // 能力/灵脉图标行留位：未来在 (ROW_X, -8.8) 起横向排布，面板随内容加高
});

// 左下角摆放位（UI 空间世界坐标）：战斗/地图两舞台共享同位同尺寸。
// 面板底缘固定贴 UI 可视底缘 -65（PANEL_H 14.4 → 中心 -57.35、顶 -50.15）；
// z=6 低于手牌（10+），面板顶部与左侧手牌 hover 区重叠可接受（交互元素在上层）
export const PLAYER_STATUS_POS = Object.freeze({ x: -70, y: -57.35, z: 6 });

export class PlayerStatusObject extends THREE.Group {
  /**
   * @param {object} options
   *   bakeLabel: 文本烘焙（透传 ResourcePipsObject；缺省 1x1 占位）
   *   apColor/manaColor: 资源点颜色
   */
  constructor({ bakeLabel = null, apColor = 0xf0c040, manaColor = 0x4a8fe8 } = {}) {
    super();
    const L = PLAYER_STATUS_LAYOUT;

    // ---- 底板 ----
    this._plateMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    this._plate = new THREE.Mesh(new THREE.PlaneGeometry(L.PANEL_W, L.PANEL_H), this._plateMaterial);
    this._plate.name = 'plate';
    this._applyPlateBake(bakePlate(L.PANEL_W, L.PANEL_H));
    this.add(this._plate);

    // ---- 头像（纹理后挂，先深底占位）+ 描边环 ----
    this._avatarMaterial = new THREE.MeshBasicMaterial({ color: 0x232838, transparent: true });
    this._avatar = new THREE.Mesh(new THREE.CircleGeometry(L.AVATAR_R, 40), this._avatarMaterial);
    this._avatar.name = 'avatar';
    this._avatar.position.set(L.AVATAR_X, 0, 0.5);
    this.add(this._avatar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(L.AVATAR_R, L.RING_R, 40),
      new THREE.MeshBasicMaterial({ color: 0x8a94b8, transparent: true }),
    );
    ring.name = 'avatarRing';
    ring.position.set(L.AVATAR_X, 0, 0.6);
    this.add(ring);

    // ---- 资源点两排（左对齐）----
    this.apPips = new ResourcePipsObject({ name: 'AP', color: apColor, bakeLabel, align: 'left' });
    this.manaPips = new ResourcePipsObject({ name: '魏启', color: manaColor, bakeLabel, align: 'left' });
    this.apPips.position.set(L.ROW_X, L.ROW_AP_Y, 1);
    this.manaPips.position.set(L.ROW_X, L.ROW_MANA_Y, 1);
    this.add(this.apPips, this.manaPips);

    // ---- 金币行 / 瑞米状态行（纯文本，左对齐同一锚点）----
    this._bake = bakeLabel || defaultInfoBake();
    this._ppw = 10; // 烘焙像素 → 世界单位（与 ResourcePipsObject 同全局约定）
    this._moneyLabel = this._makeInfoRow('moneyLabel', L.ROW_MONEY_Y);
    this._remiLabel = this._makeInfoRow('remiLabel', L.ROW_REMI_Y);
    this._moneySig = null;
    this._remiSig = null;

    // ---- 能力/灵脉图标行留位（未来扩展挂载点）----
    this.abilities = new THREE.Group();
    this.abilities.name = 'abilities';
    this.abilities.position.set(L.ROW_X, -8.8, 1);
    this.add(this.abilities);
  }

  // 纯文本行工厂：与资源点 label 同材质语言（透明 plane + 烘焙纹理）
  _makeInfoRow(name, y) {
    const material = new THREE.MeshBasicMaterial({ transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.name = name;
    mesh.position.set(PLAYER_STATUS_LAYOUT.ROW_X, y, 1);
    this.add(mesh);
    return mesh;
  }

  /** 金币行：签名不变不重烘。 */
  setMoney(amount) {
    const sig = `money:${amount}`;
    if (sig === this._moneySig) return;
    this._moneySig = sig;
    this._bakeInfoRow(this._moneyLabel, `金币 ${amount}`, 0xffffff);
  }

  /**
   * 瑞米状态行：{ level, fruits, drivenOff }。
   * 正常："remi Lv.N · 果 M"；被打跑："remi 被打跑"红色警示。
   */
  setRemi({ level = 1, fruits = 0, drivenOff = false } = {}) {
    const sig = `remi:${level}:${fruits}:${drivenOff}`;
    if (sig === this._remiSig) return;
    this._remiSig = sig;
    if (drivenOff) this._bakeInfoRow(this._remiLabel, 'remi 被打跑', 0xff7875);
    else this._bakeInfoRow(this._remiLabel, `remi Lv.${level} · 果 ${fruits}`, 0xb7eb8f);
  }

  // 重烘一行文本：左缘锚定 ROW_X（与资源点 'left' 对齐同语义），tint 乘色
  _bakeInfoRow(mesh, text, tint) {
    const { texture, width, height } = this._bake(text);
    const old = mesh.material.map;
    mesh.material.map = texture;
    mesh.material.color.set(tint);
    mesh.material.needsUpdate = true;
    old?.dispose?.();
    const lw = width / this._ppw;
    const lh = height / this._ppw;
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(lw, lh);
    mesh.position.x = PLAYER_STATUS_LAYOUT.ROW_X + lw / 2;
  }

  /**
   * 挂头像纹理（立绘正视图）：用 repeat/offset 裁出图片**头顶部**的方形区域
   * （CircleGeometry 的 UV 是单位圆外接正方形，等比裁切不变形）。
   * @param {HTMLImageElement} image
   */
  setAvatar(image) {
    if (!image?.width) return;
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    // 裁切目标：头顶部 ≈ 全图高 62% 的方形区域（水平居中、顶对齐）
    const w = image.width;
    const h = image.height;
    let fracY = 0.62;
    let fracX = fracY * (h / w); // 方形裁切：repeat.x * w_px == repeat.y * h_px
    if (fracX > 1) { fracY /= fracX; fracX = 1; } // 图太宽时退化为整宽
    texture.repeat.set(fracX, fracY);
    texture.offset.set((1 - fracX) / 2, 1 - fracY); // flipY 下 offset.y 顶对齐
    const old = this._avatarMaterial.map;
    this._avatarMaterial.map = texture;
    this._avatarMaterial.color.set(0xffffff); // 占位色换真图
    this._avatarMaterial.needsUpdate = true;
    old?.dispose?.();
  }

  _applyPlateBake(baked) {
    if (baked) {
      this._plateMaterial.map = baked;
      this._plateMaterial.color.set(0xffffff);
    } else {
      this._plateMaterial.color.set(0x14161f); // node 退化：纯色暗板
      this._plateMaterial.opacity = 0.72;
    }
    this._plateMaterial.needsUpdate = true;
  }

  dispose() {
    this._plate.geometry.dispose();
    this._plateMaterial.map?.dispose?.();
    this._plateMaterial.dispose();
    this._avatar.geometry.dispose();
    this._avatarMaterial.map?.dispose?.();
    this._avatarMaterial.dispose();
    this.apPips.dispose();
    this.manaPips.dispose();
    for (const mesh of [this._moneyLabel, this._remiLabel]) {
      mesh.geometry.dispose();
      mesh.material.map?.dispose?.();
      mesh.material.dispose();
    }
  }
}

// 金币/瑞米行的缺省烘焙：1x1 占位（与 ResourcePipsObject 缺省一致；
// 浏览器下两舞台均注入真 bakeLabel，此退化只保 node 单测可建）
function defaultInfoBake() {
  return () => {
    const texture = new THREE.Texture({ width: 1, height: 1 });
    texture.needsUpdate = true;
    return { texture, width: 1, height: 1 };
  };
}

// 底板烘焙：圆角暗板 + 顶部一丝冷光渐变 + 细描边（与 buttonFace 同语言）；
// node 无 document 返回 null（调用方退化纯色 plane）
function bakePlate(w, h) {
  if (typeof document === 'undefined') return null;
  const P = 10; // px/wu 全局约定
  const S = 2;  // 超采样
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * P * S);
  canvas.height = Math.ceil(h * P * S);
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const r = 3.2 * P * S * 0.5;
  // 圆角路径
  ctx.beginPath();
  ctx.roundRect(1 * S, 1 * S, W - 2 * S, H - 2 * S, r);
  // 底：深蓝黑微渐变（顶部亮一丝，像环境冷光打在板顶）
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(38, 44, 66, 0.86)');
  grad.addColorStop(0.35, 'rgba(20, 22, 31, 0.82)');
  grad.addColorStop(1, 'rgba(13, 14, 21, 0.82)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(122, 138, 190, 0.55)';
  ctx.lineWidth = 1.2 * S;
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}
