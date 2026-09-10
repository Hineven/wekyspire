// PanelObject：休息阶段面板容器（UI pass 空间）。两种形态：
//   · anchored —— 无背板、贴左上角、定宽竖排行流（战前准备）。
//   · modal    —— 全屏背板 + 居中内容（奖励/房间/进阶）。
//
// 职责边界（quest_prompts/THREE_UI_MIGRATION.md §4.2-2）：只做「把一组 widget 画出来 +
// 把点击路由成 action」，**不判断能不能点**（enabled 由快照下发），也不认识任何 run 状态。
// widget.action 原样交给宿主注入的 onIntent。
//
// 行流布局用**固定行高**而非测量烘焙结果：headless 下烘焙退化为占位尺寸，测量法会让布局
// 依赖 document 是否存在（契约测试就写不了）；固定行高确定、可断言。内容超出各自行框时
// **等比收敛**（文本/卡面），因此"行不重叠"是构造性保证。

import * as THREE from 'three';
import { TextBlockObject } from './TextBlockObject.js';
import { ButtonObject } from './ButtonObject.js';
import { CardObject } from './CardObject.js';
import { CARD_WIDTH, CARD_HEIGHT } from './cardMetrics.js';
import { WORLD_HEIGHT, UI_CAMERA_LOOK_AT_Y } from '../StageManager.js';

const PX_PER_WU = 10;
const HALF_UI_W = ((WORLD_HEIGHT * 16) / 9) / 2;
const UI_TOP = UI_CAMERA_LOOK_AT_Y + WORLD_HEIGHT / 2;

const Z = { PANEL: 60, BACKDROP: 80, CONTENT: 81 };

// 两种形态的几何（逻辑像素；沿用原 Vue 面板的观感尺寸）
const FORMS = {
  anchored: {
    width: 250, marginX: 12, marginY: 12, padX: 12, padY: 10,
    rowH: { title: 26, text: 18, sub: 14, button: 26, main: 38, gap: 8, tiles: 60, cards: 380 },
  },
  modal: {
    width: 760, padX: 24, padY: 20,
    rowH: { title: 36, text: 22, sub: 20, button: 34, main: 44, gap: 12, tiles: 104, cards: 300 },
  },
};
const CARD_SCALE = 0.8;      // 面板内卡面缩放（3 张一排：3×20.8 + 间隙 < 取景带 177.8）
const TILE = { width: 170, gap: 12 };

export class PanelObject extends THREE.Group {
  /**
   * @param {object} options
   *   form: 'anchored' | 'modal'
   *   onIntent: (action) => void  点击路由出口（宿主接 runController）
   *   bakeText / bakeButton / bakeFace: 注入烘焙（缺省浏览器实现，node 退化占位）
   */
  constructor({ form = 'anchored', onIntent = null, bakeText = null, bakeButton = null, bakeFace = null } = {}) {
    super();
    this.form = form;
    this._g = FORMS[form] ?? FORMS.anchored;
    this._onIntent = onIntent;
    this._bakeText = bakeText;
    this._bakeButton = bakeButton;
    this._bakeFace = bakeFace;
    this._picker = null;
    this._rows = [];          // { widget, object, top, h, contentH }
    this._buttons = new Map(); // pickId -> ButtonObject（含横向组瓦片）
    this._buttonActions = new Map(); // pickId -> { action, enabled }（点击路由的唯一来源）
    this._cardActions = new Map(); // pickId -> action（卡面点击）
    this._cards = [];         // CardObject（重烘用）
    this._hoveredId = null;
    this._backdrop = null;
    this.kind = null;
    if (form === 'modal') this.position.set(0, UI_CAMERA_LOOK_AT_Y, Z.PANEL);
    else this.position.set(-HALF_UI_W + this._g.marginX / PX_PER_WU,
      UI_TOP - this._g.marginY / PX_PER_WU, Z.PANEL);
  }

  get buttons() { return [...this._buttons.values()]; }
  get rowCount() { return this._rows.length; }
  /** 行几何（面板局部坐标系，wu）：供契约测试断言"不重叠且不越界"。 */
  get rows() {
    return this._rows.map(r => ({
      kind: r.widget.kind, top: r.top, bottom: r.top - r.h, h: r.h, contentH: r.contentH,
    }));
  }

  /** 装配/更新面板内容（幂等：先清场）。widgets 由各面板 builder 产出。 */
  setWidgets(kind, widgets = []) {
    this.kind = kind;
    this._clearRows();
    const g = this._g;
    const innerW = (g.width - g.padX * 2) / PX_PER_WU;
    // 局部原点：anchored = 面板左上；modal = 取景带中心（背板/居中布局都以此为基准）
    const flowTop = this.form === 'modal' ? WORLD_HEIGHT / 2 - g.padY / PX_PER_WU - 30 / PX_PER_WU : -g.padY / PX_PER_WU;
    const centerX = this.form === 'modal' ? 0 : g.padX / PX_PER_WU + innerW / 2;
    const left = this.form === 'modal' ? centerX - innerW / 2 : g.padX / PX_PER_WU;

    if (this.form === 'modal' && !this._backdrop) this._addBackdrop();

    let y = flowTop;
    for (const w of widgets) {
      if (w.kind === 'gap') { y -= this._g.rowH.gap / PX_PER_WU; continue; }
      const h = this._g.rowH[w.size] ?? this._g.rowH[w.kind] ?? this._g.rowH.text;
      const hWu = h / PX_PER_WU;
      if (w.kind === 'button') {
        const btn = new ButtonObject({
          id: w.id, width: w.width ?? (g.width - g.padX * 2), height: h,
          bakeButton: this._bakeButton, fontPx: w.fontPx ?? 15,
        });
        btn.setData({ label: w.label, sublabel: w.sublabel, enabled: w.enabled !== false, active: !!w.active });
        btn.placeCenter(centerX, y - hWu / 2);
        this.add(btn);
        this._buttons.set(w.id, btn);
        this._buttonActions.set(w.id, { action: w.action, enabled: w.enabled !== false });
        this._picker?.addPickable(btn.pickId, btn, { kind: 'button', space: 'ui' });
        // object 留 null：按钮统一由 _buttons 清理（横向组的瓦片也在同一张表里），避免二次释放
        this._rows.push({ widget: w, object: null, top: y, h: hWu, contentH: hWu });
      } else if (w.kind === 'tiles' || w.kind === 'cards') {
        const row = this._buildHorizontal(w, y, hWu, centerX, left, innerW);
        this._rows.push(row);
      } else {
        const text = new TextBlockObject({
          bakeText: this._bakeText,
          fontPx: w.kind === 'title' ? 20 : (w.kind === 'sub' ? 13 : 15),
          tint: w.tint ?? (w.kind === 'title' ? '#ffd75e' : '#cdd6f4'),
        });
        text.setText(w.text ?? '', { maxWidth: innerW });
        // 等比收进行框：烘焙高度由字号决定（fontPx×1.4），可能高于行高，不收敛会压到下一行
        const s = Math.min(1, hWu / text.scale.y, innerW / text.scale.x);
        text.scale.set(text.scale.x * s, text.scale.y * s, 1);
        if (this.form === 'modal' || w.align === 'center') text.placeCenterTop(centerX, y);
        else text.placeLeftTop(left, y);
        this.add(text);
        this._rows.push({ widget: w, object: text, top: y, h: hWu, contentH: text.scale.y });
      }
      y -= hWu;
      this._contentBottom = y;
    }
    this._panelHeight = (flowTop - y) + this._g.padY / PX_PER_WU;
  }

  get heightWu() { return this._panelHeight ?? 0; }

  /** 换/脱拾取器（舞台重连时由 MapStage.attachInput 调用）。 */
  attachPicker(picker) {
    for (const id of this._pickIds()) this._picker?.removePickable(id);
    this._picker = picker ?? null;
    if (!picker) return;
    for (const btn of this._buttons.values()) picker.addPickable(btn.pickId, btn, { kind: 'button', space: 'ui' });
    for (const { object, id } of this._cards) picker.addPickable(id, object, { kind: 'card', cardObject: object, space: 'ui' });
  }

  /** hover：按钮抬亮 / 卡面高亮（命中变化时先清旧的）。 */
  onHover(hit) {
    const id = (hit?.kind === 'button' && this._buttons.has(hit.id)) ? hit.id
      : (hit?.kind === 'card' || hit?.kind === 'token') && this._cardActions.has(hit.id) ? hit.id
        : null;
    if (id === this._hoveredId) return;
    this._hoveredId = id;
    for (const [bid, btn] of this._buttons) btn.setHovered(bid === id);
    for (const { object, id: cid } of this._cards) {
      object.setVisualState(cid === id ? 'highlighted' : 'normal');
    }
  }

  /** 点击路由：按钮（enabled）与整卡命中各自把 widget.action 交给宿主。 */
  onClick(hit) {
    if (hit?.kind === 'button') {
      const entry = this._buttonActions.get(hit.id);
      if (!entry || !entry.enabled) return false;
      this._onIntent?.(entry.action ?? null);
      return true;
    }
    if (hit?.kind === 'card' && this._cardActions.has(hit.id)) {
      this._onIntent?.(this._cardActions.get(hit.id));
      return true;
    }
    return false;
  }

  /** 命中是否落在本面板内（模态形态的"点背景关闭"判定用）。 */
  ownsHit(hit) {
    if (hit?.kind === 'button') return this._buttons.has(hit.id);
    if (hit?.kind === 'card' || hit?.kind === 'token') return this._cardActions.has(hit.id);
    return false;
  }

  get isModal() { return this.form === 'modal'; }
  /** 面板内是否有卡面（宿主据此决定要不要订阅"卡图到图重烘"）。 */
  get ownsCardArtWait() { return this._cards.length > 0; }

  /** 卡图异步到图后重烘（与战场 _rebakeCardFaces 同触发）。 */
  rebakeCards() {
    for (const { object, data } of this._cards) {
      if (data) object.setCard(data);
    }
  }

  dispose() {
    this.attachPicker(null);
    this._clearRows();
    if (this._backdrop) {
      this.remove(this._backdrop);
      this._backdrop.geometry.dispose();
      this._backdrop.material.dispose();
      this._backdrop = null;
    }
  }

  _pickIds() {
    return [...this._buttons.keys(), ...this._cardActions.keys()];
  }

  _addBackdrop() {
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_UI_W * 2, WORLD_HEIGHT),
      new THREE.MeshBasicMaterial({ color: 0x0a0b10, transparent: true, opacity: 0.86 }),
    );
    bg.position.set(0, 0, Z.BACKDROP); // 局部原点即取景带中心
    this.add(bg);
    this._backdrop = bg;
  }

  /** 横向组（瓦片/卡面）：整体在 centerX 居中，返回行记录。 */
  _buildHorizontal(w, y, hWu, centerX, left, innerW) {
    const items = w.items ?? [];
    const isCards = w.kind === 'cards';
    const itemW = isCards ? CARD_WIDTH * CARD_SCALE : TILE.width / PX_PER_WU;
    const gap = TILE.gap / PX_PER_WU;
    const total = items.length * itemW + Math.max(0, items.length - 1) * gap;
    const x0 = centerX - total / 2 + itemW / 2;
    let contentH = 0;
    items.forEach((item, i) => {
      const x = x0 + i * (itemW + gap);
      if (isCards) {
        const pickId = `${w.idPrefix}:${item.defId}`;
        const obj = new CardObject({
          uniqueID: pickId, cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, bakeFace: this._bakeFace,
        });
        // 卡面数据用 view 的副本：CardObject 只读烘焙字段，不回写
        obj.setCard(item.view ? { ...item.view, uniqueID: pickId, defId: item.defId } : item.defId);
        obj.position.set(x, y - hWu / 2, Z.CONTENT);
        obj.scale.set(CARD_SCALE, CARD_SCALE, 1);
        this.add(obj);
        this._cardActions.set(pickId, item.action ?? { action: 'claimReward', defId: item.defId });
        this._picker?.addPickable(pickId, obj, { kind: 'card', cardObject: obj, space: 'ui' });
        this._cards.push({ id: pickId, object: obj, data: item.view ? { ...item.view, uniqueID: pickId, defId: item.defId } : item.defId });
        contentH = Math.max(contentH, CARD_HEIGHT * CARD_SCALE);
      } else {
        const pickId = `${w.idPrefix}:${item.id}`;
        const btn = new ButtonObject({
          id: pickId, width: TILE.width, height: w.tileHeight ?? 96,
          bakeButton: this._bakeButton, fontPx: 15,
        });
        btn.setData({ label: item.name, sublabel: item.desc, enabled: item.enabled !== false });
        btn.placeCenter(x, y - hWu / 2);
        this.add(btn);
        this._buttons.set(pickId, btn);
        this._buttonActions.set(pickId, { action: item.action, enabled: item.enabled !== false });
        this._picker?.addPickable(pickId, btn, { kind: 'button', space: 'ui' });
        contentH = Math.max(contentH, (w.tileHeight ?? 96) / PX_PER_WU);
      }
    });
    return { widget: w, object: null, top: y, h: hWu, contentH };
  }

  _clearRows() {
    // 文本行：object 即面片，逐行释放
    for (const { object } of this._rows) {
      if (!object) continue;
      this.remove(object);
      object.dispose();
    }
    // 按钮（含横向组的瓦片）与卡面：统一按各自的表释放（行记录里不持 object，防二次释放）
    for (const [, btn] of this._buttons) {
      this._picker?.removePickable(btn.pickId);
      this.remove(btn);
      btn.dispose();
    }
    for (const { object, id } of this._cards) {
      this._picker?.removePickable(id);
      this.remove(object);
      object.dispose();
    }
    this._rows = [];
    this._buttons.clear();
    this._buttonActions.clear();
    this._cards = [];
    this._cardActions.clear();
    this._hoveredId = null;
  }
}
