// UnitObject（§4.3 最小版）：场景内的一个单位（玩家/敌人/队友）。
// 结构：Group
//   ├─ body:  纯色占位 quad（side 配色；立绘 sprite 后续替换）
//   └─ label: 文本 plane（名称 + HP/护盾，RichTextEngine 烘焙）
// 文本签名（hp/shield/effects…）不变不重烘；受击闪红等演出后续换 shader。

import * as THREE from 'three';

const SIDE_COLORS = Object.freeze({
  player: 0x4a6fa5,
  enemy: 0xa54a4a,
  ally: 0x4aa56e,
});

export class UnitObject extends THREE.Group {
  /**
   * @param {object} options
   *   uniqueID, side: 'player'|'enemy'|'ally'
   *   width/height: body quad 世界尺寸
   *   bakeLabel: (text) => { texture, width, height }   文本烘焙（缺省 1x1 占位）
   *   pixelsPerWorld: 烘焙像素 → 世界单位换算（默认 10，与牌面 200x270↔20x27 同约定）
   */
  constructor(options) {
    super();
    const { uniqueID, side, width = 14, height = 18, bakeLabel = null, pixelsPerWorld = 10 } = options;
    this.uniqueID = uniqueID;
    this.side = side;
    this._bakeLabel = bakeLabel || defaultBakeLabel;
    this._ppw = pixelsPerWorld;
    this._bodyWidth = width;
    this._bodyHeight = height;

    this._body = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ color: SIDE_COLORS[side] ?? 0x888888 }),
    );
    this._body.name = 'body';
    this.add(this._body);

    this._labelMaterial = new THREE.MeshBasicMaterial({ transparent: true });
    this._label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._labelMaterial);
    this._label.name = 'label';
    this._label.position.y = -(height / 2 + 3.5); // 血条挂在脚下（setUnit 会按烘焙尺寸重定位）
    this.add(this._label);

    this._signature = null;
  }

  /** 单位投影更新：签名变化才重烘文本。 */
  setUnit(projection) {
    const sig = JSON.stringify({
      n: projection.name, hp: projection.hp, max: projection.maxHp,
      sh: projection.shield, dead: projection.isDead, ef: projection.effects,
      mana: projection.mana, ap: projection.actionPoints,
    });
    if (sig === this._signature) return false;
    this._signature = sig;

    let text = `${projection.name}\nHP ${projection.hp}/${projection.maxHp}`;
    if (projection.shield > 0) text += ` 盾${projection.shield}`;
    if (projection.mana != null) text += `\n蓝${projection.mana}/${projection.maxMana} AP${projection.actionPoints}/${projection.maxActionPoints}`;
    if (projection.effects?.length) {
      text += `\n${projection.effects.map(e => `${e.effectId}x${e.stacks}`).join(' ')}`;
    }

    const { texture, width, height } = this._bakeLabel(text);
    const old = this._labelMaterial.map;
    this._labelMaterial.map = texture;
    this._labelMaterial.needsUpdate = true;
    old?.dispose?.();

    // 按烘焙尺寸换算世界大小（ppw 约定），挂脚下居中
    const w = width / this._ppw;
    const h = height / this._ppw;
    this._label.geometry.dispose();
    this._label.geometry = new THREE.PlaneGeometry(w, h);
    this._label.position.y = -(this._bodyHeight / 2 + h / 2 + 1);

    this._body.material.color.set(projection.isDead ? 0x333333 : (SIDE_COLORS[this.side] ?? 0x888888));
    return true;
  }

  flash(color = 0xff4444) {
    this._body.material.color.set(color);
  }

  restoreColor() {
    this._body.material.color.set(SIDE_COLORS[this.side] ?? 0x888888);
  }

  /** 目标标注高亮（拖牌指定目标时）：body 背后衬一圈金色环。 */
  setHighlight(on) {
    if (on === !!this._ring) return;
    if (on) {
      this._ring = new THREE.Mesh(
        new THREE.PlaneGeometry(this._bodyWidth + 2.4, this._bodyHeight + 2.4),
        new THREE.MeshBasicMaterial({ color: 0xffd34c, transparent: true, opacity: 0.85 }),
      );
      this._ring.position.z = -0.1;
      this.add(this._ring);
    } else {
      this.remove(this._ring);
      this._ring.geometry.dispose();
      this._ring.material.dispose();
      this._ring = null;
    }
  }

  get highlighted() { return !!this._ring; }

  dispose() {
    this.setHighlight(false);
    this._body.geometry.dispose();
    this._body.material.dispose();
    this._label.geometry.dispose();
    this._labelMaterial.map?.dispose?.();
    this._labelMaterial.dispose();
  }
}

function defaultBakeLabel() {
  const texture = new THREE.Texture({ width: 1, height: 1 });
  texture.needsUpdate = true;
  return { texture, width: 1, height: 1 };
}
