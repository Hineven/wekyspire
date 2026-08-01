// LayoutEngine：牌桌布局计算（§4.4）。
// 移植旧 SkillsHand.vue:75-131 的手牌布局算法（间隙压缩 + 悬浮撑开），
// 坐标系从屏幕像素改为世界坐标（约定见 StageManager：屏幕高 = 100 世界单位，y 向上）。
//
// 寻址契约不变：对外仍是 updateAnchors(containerKey, Map<uniqueID,{x,y,scale,rotation}>) ；
// StageAnimator 通过 getAnchor(uniqueID) 查询静息锚点，不关心锚点由谁算出。

const DEFAULT_GAP = 1.5;    // 相邻牌默认间隙（世界单位，旧值 15px ≈ 屏高 1000px 的 1.5%）
const MIN_STEP = 3.0;       // 压缩到极限时相邻牌中心最小间距（旧值 30px）
const HOVER_EXTRA = 12;     // 悬浮撑开总量（旧值 120px）
const HOVER_DECAY = 0.6;    // 撑开量随距离衰减
const HOVER_SCALE = 1.08;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export class LayoutEngine {
  constructor() {
    // containerKey -> { centerX, centerY, width, cardWidth, cardHeight }
    this._containers = new Map();
    // uniqueID -> { x, y, scale, rotation, z, containerKey }
    this._anchors = new Map();
    // 场景级命名锚点（center / deck / restDeck ...）
    this._namedAnchors = new Map();
  }

  registerContainer(key, config) {
    // 原样存配置：layoutHand 用 centerX/centerY/width/cardWidth/cardHeight，
    // layoutColumn 用 centerX/topY/cardHeight/gap/zBase
    this._containers.set(key, { ...config });
  }

  unregisterContainer(key) {
    this._containers.delete(key);
    for (const [id, a] of this._anchors) {
      if (a.containerKey === key) this._anchors.delete(id);
    }
  }

  setNamedAnchor(name, point) { this._namedAnchors.set(name, point); }
  getNamedAnchor(name) { return this._namedAnchors.get(name) || null; }

  getAnchor(uniqueID) { return this._anchors.get(uniqueID) || null; }

  /** 契约接口：外部直接给锚点表（§4.4 签名保留）。 */
  updateAnchors(containerKey, anchorsMap) {
    for (const [id, a] of this._anchors) {
      if (a.containerKey === containerKey) this._anchors.delete(id);
    }
    for (const [id, anchor] of anchorsMap) {
      this._anchors.set(id, { rotation: 0, scale: 1, ...anchor, containerKey });
    }
  }

  /**
   * 手牌布局：给一串 uniqueID 计算扇形/平铺锚点并登记。
   * @param {string} containerKey
   * @param {Array<string>} ids  手牌 uniqueID（从左到右）
   * @param {string|null} hoveredId  悬浮牌 uniqueID（撑开其两侧间隙）
   * @returns {Map<string, {x,y,scale,rotation,z}>} 本次锚点表（同时已登记入内部）
   */
  layoutHand(containerKey, ids, hoveredId = null) {
    const c = this._containers.get(containerKey);
    if (!c) throw new Error(`LayoutEngine: container '${containerKey}' not registered`);
    const n = ids.length;
    const result = new Map();
    if (n === 0) {
      this.updateAnchors(containerKey, result);
      return result;
    }

    const i0 = hoveredId != null ? ids.indexOf(hoveredId) : -1;

    // 相邻牌对（i, i+1）的额外间隙：悬浮牌向两侧衰减撑开
    const pairExtra = new Array(Math.max(0, n - 1)).fill(0);
    if (i0 >= 0 && n > 1) {
      for (let d = 0; i0 - 1 - d >= 0 || i0 + d < n - 1; d++) {
        const inc = HOVER_EXTRA * Math.pow(HOVER_DECAY, d) / 2;
        const leftPair = i0 - 1 - d;
        const rightPair = i0 + d;
        if (leftPair >= 0 && leftPair < pairExtra.length) pairExtra[leftPair] += inc;
        if (rightPair >= 0 && rightPair < pairExtra.length) pairExtra[rightPair] += inc;
      }
      for (let i = 0; i < pairExtra.length; i++) {
        const maxAllowed = (i === i0 - 1 || i === i0) ? DEFAULT_GAP : 0;
        pairExtra[i] = Math.min(pairExtra[i], maxAllowed);
      }
    }
    const extraSum = pairExtra.reduce((a, b) => a + b, 0);

    let baseGap;
    if (n === 1) {
      baseGap = 0;
    } else {
      const minGap = -c.cardWidth + MIN_STEP;
      baseGap = clamp((c.width - n * c.cardWidth - extraSum) / (n - 1), minGap, DEFAULT_GAP);
    }

    const pairGap = pairExtra.map(ex => baseGap + ex);
    const totalWidth = n * c.cardWidth + pairGap.reduce((a, b) => a + b, 0);
    let x = c.centerX - totalWidth / 2 + c.cardWidth / 2; // 第一张牌中心

    for (let i = 0; i < n; i++) {
      result.set(ids[i], {
        x,
        y: c.centerY,
        scale: i === i0 ? HOVER_SCALE : 1,
        rotation: 0,
        // z 是 three 世界坐标（相机在 z=100）：保持 [10,40] 区间，悬浮抬升但不越界
        z: 10 + i * 0.5 + (i === i0 ? 20 : 0),
      });
      x += c.cardWidth + (i < pairGap.length ? pairGap[i] : 0);
    }

    this.updateAnchors(containerKey, result);
    return result;
  }

  /**
   * 纵列布局：从 topY 向下等距排（咏唱槽等固定侧栏）。
   * z 用独立低区间（zBase，默认 4 + i*0.5 < 手牌 10+），不与手牌争层级。
   * 容器配置：{ centerX, topY, cardHeight, gap?, zBase? }
   */
  layoutColumn(containerKey, ids) {
    const c = this._containers.get(containerKey);
    if (!c) throw new Error(`LayoutEngine: container '${containerKey}' not registered`);
    const gap = c.gap ?? 2;
    const zBase = c.zBase ?? 4;
    const result = new Map();
    ids.forEach((id, i) => {
      result.set(id, {
        x: c.centerX,
        y: c.topY - i * (c.cardHeight + gap),
        scale: 1,
        rotation: 0,
        z: zBase + i * 0.5,
      });
    });
    this.updateAnchors(containerKey, result);
    return result;
  }
}
