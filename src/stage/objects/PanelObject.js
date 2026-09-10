// PanelObject：休息阶段面板容器（UI pass 空间）。
//
// 阶段一（本次）只实现**锚定形态**：无背板、贴左上角、定宽竖排行流——即原
// PrepPanel 的形态（`position:fixed; left:12px; top:12px; width:250px`）。
// **模态形态**（背板 + 居中 + 点背景关闭）等到 RewardPanel 迁移时再加，
// 泛化自 objects/CardGalleryObject.js——不提前写没有消费者的形态。
//
// 职责边界（quest_prompts/THREE_UI_MIGRATION.md §4.2-2）：本对象只做「把一组
// widget 画出来 + 把点击路由成 action」，**不判断能不能点**（enabled 由快照下发），
// 也不认识任何 run 状态。widget.action 原样交给宿主注入的 onIntent。
//
// 行流布局用**固定行高**而非测量烘焙结果：headless 下烘焙退化为占位尺寸，
// 测量法会让布局依赖 document 是否存在（契约测试就写不了）；固定行高确定、
// 可断言，符合"占位实现"的当前阶段。

import * as THREE from 'three';
import { TextBlockObject } from './TextBlockObject.js';
import { ButtonObject } from './ButtonObject.js';
import { WORLD_HEIGHT, UI_CAMERA_LOOK_AT_Y } from '../StageManager.js';

const PX_PER_WU = 10;
const HALF_UI_W = ((WORLD_HEIGHT * 16) / 9) / 2;
const UI_TOP = UI_CAMERA_LOOK_AT_Y + WORLD_HEIGHT / 2;

// 锚定面板几何（逻辑像素，沿用原 Vue 面板的 12px 边距 / 250px 宽）
const PANEL = {
  width: 250,
  marginX: 12,
  marginY: 12,
  padX: 12,
  padY: 10,
  rowH: { title: 26, text: 18, sub: 14, button: 26, main: 38, gap: 8 },
  z: 60, // 高于状态栏(z=6)/资源行：休息面板盖在世界层之上，低于模态层(80)
};

export class PanelObject extends THREE.Group {
  /**
   * @param {object} options
   *   onIntent: (action) => void  点击路由出口（宿主接 runController）
   *   bakeText / bakeButton: 注入烘焙（缺省浏览器实现，node 退化占位）
   */
  constructor({ onIntent = null, bakeText = null, bakeButton = null } = {}) {
    super();
    this._onIntent = onIntent;
    this._bakeText = bakeText;
    this._bakeButton = bakeButton;
    this._picker = null;
    this._rows = [];      // { widget, object }（object 为 TextBlockObject | ButtonObject）
    this._buttons = new Map(); // id -> ButtonObject
    this._hoveredId = null;
    this.kind = null;
    // 锚点：左上角贴取景带左上（与旧 Vue 面板同位）
    this.position.set(-HALF_UI_W + PANEL.marginX / PX_PER_WU,
      UI_TOP - PANEL.marginY / PX_PER_WU, PANEL.z);
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
    let y = -PANEL.padY;              // 面板局部：原点在左上，y 向下为负
    const left = PANEL.padX / PX_PER_WU;
    const innerW = (PANEL.width - PANEL.padX * 2) / PX_PER_WU;
    for (const w of widgets) {
      if (w.kind === 'gap') { y -= PANEL.rowH.gap / PX_PER_WU; continue; }
      const h = PANEL.rowH[w.size] ?? PANEL.rowH[w.kind] ?? PANEL.rowH.text;
      const hWu = h / PX_PER_WU;
      if (w.kind === 'button') {
        const btn = new ButtonObject({
          id: w.id, width: PANEL.width - PANEL.padX * 2, height: h,
          bakeButton: this._bakeButton, fontPx: w.fontPx ?? 15,
        });
        btn.setData({ label: w.label, sublabel: w.sublabel, enabled: w.enabled !== false, active: !!w.active });
        // 按钮面片几何原点在中心：行内水平居中、垂直按行高落位（几何尺寸即行框，天然贴合）
        btn.placeCenter(left + innerW / 2, y - hWu / 2);
        this.add(btn);
        this._buttons.set(w.id, btn);
        this._registerPickable(btn);
        this._rows.push({ widget: w, object: btn, top: y, h: hWu, contentH: hWu });
      } else {
        const text = new TextBlockObject({
          bakeText: this._bakeText,
          fontPx: w.kind === 'title' ? 20 : (w.kind === 'sub' ? 13 : 15),
          tint: w.tint ?? (w.kind === 'title' ? '#ffd75e' : '#cdd6f4'),
        });
        text.setText(w.text ?? '', { maxWidth: innerW });
        // 把烘焙结果**等比收进行框**：烘焙高度由字号决定（fontPx×1.4），可能高于行高，
        // 不收敛就会压到下一行；同时受面板内宽约束（长文本不横向溢出）。
        const s = Math.min(1, hWu / text.scale.y, innerW / text.scale.x);
        text.scale.set(text.scale.x * s, text.scale.y * s, 1);
        text.placeLeftTop(left, y);
        this.add(text);
        this._rows.push({ widget: w, object: text, top: y, h: hWu, contentH: text.scale.y });
      }
      y -= hWu;
    }
    this._panelHeight = -y + PANEL.padY / PX_PER_WU; // 供测试/模态形态使用
  }

  get heightWu() { return this._panelHeight ?? 0; }

  /** 换/脱拾取器（舞台重连时由 MapStage.attachInput 调用）。 */
  attachPicker(picker) {
    for (const id of this._buttons.keys()) this._picker?.removePickable(id);
    this._picker = picker ?? null;
    for (const btn of this._buttons.values()) this._registerPickable(btn);
  }

  /** hover 路由：命中本面板按钮 → 抬亮；其余 → 全部复位。 */
  onHover(hit) {
    const id = hit?.kind === 'button' && this._buttons.has(hit.id) ? hit.id : null;
    if (id === this._hoveredId) return;
    this._hoveredId = id;
    for (const [bid, btn] of this._buttons) btn.setHovered(bid === id);
  }

  /** 点击路由：命中按钮且 enabled → 把 widget.action 交给宿主。 */
  onClick(hit) {
    if (hit?.kind !== 'button') return false;
    const row = this._rows.find(r => r.widget.kind === 'button' && r.widget.id === hit.id);
    if (!row || row.widget.enabled === false) return false;
    this._onIntent?.(row.widget.action ?? null);
    return true;
  }

  /** 命中是否落在本面板内（模态形态的点背景关闭判定用；锚定形态供宿主兜底）。 */
  ownsHit(hit) {
    return hit?.kind === 'button' && this._buttons.has(hit.id);
  }

  dispose() {
    this.attachPicker(null);
    this._clearRows();
  }

  _registerPickable(btn) {
    this._picker?.addPickable(btn.pickId, btn, { kind: 'button', space: 'ui' });
  }

  _clearRows() {
    for (const { object } of this._rows) {
      if (object instanceof ButtonObject) {
        this._picker?.removePickable(object.pickId);
        this._buttons.delete(object.pickId);
      }
      this.remove(object);
      object.dispose();
    }
    this._rows = [];
    this._buttons.clear();
    this._hoveredId = null;
  }
}
