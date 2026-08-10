// ResourcePipsObject：一项玩家资源（行动点/魏启）的状态显示。
// 结构：Group
//   ├─ label: 文本 plane（"AP 3/3"，RichTextEngine 烘焙，签名不变不重烘）
//   └─ pips:  圆点 mesh 横排（满=资源色，耗=灰；耗尽的点保留不消失）
// 数值签名（current/max）不变不重建；max 变化才增删点。
//
// 帧驱动过渡（update(dt) 由 StageManager tick 调）：
//   - 点的颜色每帧向目标色 lerp（靠近后吸附精确值）——消耗变色、高亮启止都由此平滑过渡
//   - setPending(n)：高亮"即将消耗"的 n 个点（已充盈点列的末尾 n 个），
//     目标色在资源色与白色之间随时间正弦脉动（忽明忽暗）
//   - 充盈状态翻转（消耗/恢复）时点做短促缩放弹跳（pop，non-blocking）

import * as THREE from 'three';

const PIP_RADIUS = 0.9;
const PIP_GAP = 1.0;
const DEPLETED_COLOR = 0x555555;
const LERP_RATE = 10;        // 颜色趋近速率（/s）
const SNAP_EPS = 0.004;      // 每通道距目标小于此值即吸附（≈1/255，保证收敛到精确色）
const PULSE_FREQ = 7;        // 高亮脉动角频率
const PULSE_MIX = [0.3, 0.8];// 脉动混白区间（暗→亮）
const POP_DECAY = 3.5;       // 消耗弹跳衰减（/s）
const POP_SCALE = 0.35;      // 弹跳最大放大

const _scratch = new THREE.Color();
const _white = new THREE.Color(0xffffff);

export class ResourcePipsObject extends THREE.Group {
  /**
   * @param {object} options
   *   name: 标签前缀（如 'AP' / '魏启'）
   *   color: 有点时的颜色（hex）
   *   align: 'center'（文本+点排整体居中于原点，默认）| 'left'（左缘锚定原点——
   *     状态栏等需要多行左对齐的场景）
   *   bakeLabel: (text) => { texture, width, height }   文本烘焙（缺省 1x1 占位）
   *   pixelsPerWorld: 烘焙像素 → 世界单位换算（默认 10，全局约定）
   */
  constructor({ name, color, bakeLabel = null, pixelsPerWorld = 10, align = 'center' }) {
    super();
    this._name = name;
    this._color = color;
    this._align = align;
    this._bakeLabel = bakeLabel || defaultBakeLabel;
    this._ppw = pixelsPerWorld;

    this._labelMaterial = new THREE.MeshBasicMaterial({ transparent: true });
    this._label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._labelMaterial);
    this._label.name = 'label';
    this.add(this._label);

    this._pips = [];
    this._signature = null;
    this._current = 0;
    this._pending = 0;   // 高亮"即将消耗"的点数（从充盈点列末尾数）
    this._time = 0;
  }

  /** 数值更新：签名变化才重烘/重排。 */
  setValue(current, max) {
    const sig = `${current}/${max}`;
    if (sig === this._signature) return false;
    this._signature = sig;
    this._current = current;

    // 数字文本
    const { texture, width, height } = this._bakeLabel(`${this._name} ${current}/${max}`);
    const old = this._labelMaterial.map;
    this._labelMaterial.map = texture;
    this._labelMaterial.needsUpdate = true;
    old?.dispose?.();
    const lw = width / this._ppw;
    const lh = height / this._ppw;
    this._label.geometry.dispose();
    this._label.geometry = new THREE.PlaneGeometry(lw, lh);

    // 点数量对齐 max（耗尽不消失，只变灰——数量只随上限变）
    while (this._pips.length < max) {
      const pip = new THREE.Mesh(
        new THREE.CircleGeometry(PIP_RADIUS, 24),
        new THREE.MeshBasicMaterial(),
      );
      this.add(pip);
      this._pips.push(pip);
    }
    while (this._pips.length > max) {
      const pip = this._pips.pop();
      this.remove(pip);
      pip.geometry.dispose();
      pip.material.dispose();
    }

    // 布局：'center' = 文本+点排整体居中于 Group 原点；'left' = 左缘锚定原点
    const step = PIP_RADIUS * 2 + PIP_GAP;
    const pipsWidth = max > 0 ? max * step - PIP_GAP : 0;
    const total = lw + 1.5 + pipsWidth;
    let x = this._align === 'left' ? 0 : -total / 2;
    this._label.position.set(x + lw / 2, 0, 0);
    x += lw + 1.5;
    this._pips.forEach((pip, i) => {
      pip.position.set(x + PIP_RADIUS + i * step, 0, 0);
      const filled = i < current;
      if (pip.userData.filled === undefined) {
        // 新点：直接吸附目标色，不播过渡（首次出现不弹跳）
        pip.userData.filled = filled;
        pip.userData.pop = 0;
        pip.material.color.set(filled ? this._color : DEPLETED_COLOR);
      } else if (pip.userData.filled !== filled) {
        // 充盈状态翻转（消耗/恢复）：短促弹跳，颜色交给 update 渐变
        pip.userData.filled = filled;
        pip.userData.pop = 1;
      }
    });
    return true;
  }

  /** 高亮"即将消耗"的 n 个点（悬浮在卡牌上时按其 cost 调用；0 = 清除）。 */
  setPending(n) {
    this._pending = Math.max(0, n | 0);
  }

  /** 点 i 是否处于"即将消耗"高亮态（充盈点列的末尾 pending 个）。 */
  isPending(i) {
    return !!this._pips[i]?.userData.filled && i >= this._current - this._pending;
  }

  /** 帧推进：颜色向目标渐变（高亮点目标随时间脉动），弹跳衰减。 */
  update(dt) {
    this._time += dt;
    const t = Math.min(1, dt * LERP_RATE);
    for (let i = 0; i < this._pips.length; i++) {
      const pip = this._pips[i];
      const c = pip.material.color;
      if (!pip.userData.filled) {
        approachColor(c, DEPLETED_COLOR, t);
      } else if (this.isPending(i)) {
        // 忽明忽暗：目标色在资源色与白色之间正弦往返（相位错开，波纹感）
        const k = 0.5 + 0.5 * Math.sin(this._time * PULSE_FREQ + i * 0.7);
        const mix = PULSE_MIX[0] + (PULSE_MIX[1] - PULSE_MIX[0]) * k;
        _scratch.set(this._color).lerp(_white, mix);
        c.lerp(_scratch, t); // 脉动目标不停移动，永不吸附——持续渐变即平滑
      } else {
        approachColor(c, this._color, t);
      }
      if (pip.userData.pop > 0) {
        pip.userData.pop = Math.max(0, pip.userData.pop - dt * POP_DECAY);
        const s = 1 + POP_SCALE * pip.userData.pop;
        pip.scale.set(s, s, 1);
      }
    }
  }

  get pipCount() { return this._pips.length; }
  pipColor(i) { return this._pips[i]?.material.color.getHex() ?? null; }

  dispose() {
    this._label.geometry.dispose();
    this._labelMaterial.map?.dispose?.();
    this._labelMaterial.dispose();
    for (const pip of this._pips) {
      this.remove(pip);
      pip.geometry.dispose();
      pip.material.dispose();
    }
    this._pips = [];
  }
}

// 向目标色渐变，足够接近时吸附精确值（保证静止时收敛到设计色，测试可断言）
function approachColor(color, targetHex, t) {
  _scratch.set(targetHex);
  color.lerp(_scratch, t);
  if (
    Math.abs(color.r - _scratch.r) < SNAP_EPS
    && Math.abs(color.g - _scratch.g) < SNAP_EPS
    && Math.abs(color.b - _scratch.b) < SNAP_EPS
  ) color.copy(_scratch);
}

function defaultBakeLabel() {
  const texture = new THREE.Texture({ width: 1, height: 1 });
  texture.needsUpdate = true;
  return { texture, width: 1, height: 1 };
}
