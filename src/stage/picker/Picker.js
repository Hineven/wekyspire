// Picker（§4.7）：raycast 拾取 + hit map 二级查询 + hover 事件。
// 优先级铁律：token 热区 > 整卡 > 场景按钮 > 背景。
// 命中 token 热区 → 发 tooltip:*（Shell 消费）；未命中 → 整卡 hover（card:hover/leave）。
// 拖拽由 BattleStage 在 Picker 的 card 命中基础上驱动（射线与牌桌平面求交），不在本模块内。
//
// 双相机路由：pickable 带 space（'world'|'ui'，缺省 world）——UI pass 用专用 uiCamera
// 渲染且永远盖在世界 pass 上方，故拾取也先查 UI（uiCamera 射线）再查世界（camera 射线），
// UI 命中即返回。three 的 Raycaster 是纯数学，node 单测可用真实射线 + 真实 plane 验证优先级。

import * as THREE from 'three';
import { EventNames } from '../../bridge/events.js';

export class Picker {
  /**
   * @param {object} options
   *   stageManager: StageManager   相机（世界 + UI）与 viewSize 来源
   *   bus: 事件总线（tooltip/card-hover 协议事件的出口，接哪条总线由装配层定）
   */
  constructor({ stageManager, bus }) {
    this._sm = stageManager;
    this._bus = bus;
    this._raycaster = new THREE.Raycaster();
    this._pickables = new Map(); // id -> { object3D, kind:'card'|'button'|'unit', space, cardObject? }
    this._hoverToken = null;     // { id, region }
    this._hoverCard = null;      // id
  }

  addPickable(id, object3D, { kind = 'card', cardObject = null, space = 'world' } = {}) {
    object3D.userData.pickableId = id;
    this._pickables.set(id, { object3D, kind, cardObject, space });
  }

  removePickable(id) {
    this._pickables.delete(id);
    if (this._hoverCard === id) this._hoverCard = null;
    if (this._hoverToken?.id === id) this._hoverToken = null;
  }

  /**
   * 拾取查询（纯函数，不发事件）。
   * @param {object} filter  kinds: 只取这些 kind 的 pickable；excludeIds: 排除的 id（如拖拽中的卡）
   * @returns { kind:'token', id, region } | { kind:'card'|'button'|'unit'|'pile'|'viewer', id } | { kind:'background' }
   */
  pick(screenX, screenY, { kinds = null, excludeIds = null } = {}) {
    const { width, height } = this._sm.viewSize;
    const ndc = new THREE.Vector2(
      (screenX / width) * 2 - 1,
      -((screenY / height) * 2 - 1),
    );
    // UI 先世界后（UI pass 渲染次序即覆盖次序）
    for (const space of ['ui', 'world']) {
      const camera = space === 'ui' ? this._sm.uiCamera : this._sm.camera;
      const entries = [...this._pickables.entries()]
        .filter(([id, p]) => (p.space ?? 'world') === space
          && (!kinds || kinds.includes(p.kind)) && !excludeIds?.includes(id));
      if (!camera || !entries.length) continue;
      camera.updateMatrixWorld(); // 相机不在场景图内，matrixWorld 需手动刷新
      this._raycaster.setFromCamera(ndc, camera);
      const hits = this._raycaster.intersectObjects(entries.map(([, p]) => p.object3D), true);
      for (const hit of hits) {
        const owner = this._findPickable(hit.object);
        if (!owner) continue;
        // 单位效果行二级查询（行网格 userData.effectRow 与卡面 hitRegion 同构）：
        // 悬停（无 kinds 过滤）→ 返回 token 命中走 tooltip:* 协议；
        // 拖牌/瞄准（kinds 指定 unit）→ 仍返回整单位，行区域也是合法出牌落点
        if (owner.entry.kind === 'unit' && hit.object.userData?.effectRow
          && (!kinds || kinds.includes('token'))) {
          return { kind: 'token', id: owner.id, region: hit.object.userData.effectRow };
        }
        // 整卡命中后做 hit map 二级查询（仅卡面面片）
        if (owner.entry.kind === 'card' && owner.entry.cardObject && hit.uv) {
          const region = owner.entry.cardObject.hitTestUV({ u: hit.uv.x, v: hit.uv.y });
          if (region) return { kind: 'token', id: owner.id, region };
        }
        return { kind: owner.entry.kind, id: owner.id };
      }
    }
    return { kind: 'background' };
  }

  /** hover 轮询：按命中变化发 tooltip:* / card:hover/leave。 */
  hover(screenX, screenY) {
    const hit = this.pick(screenX, screenY);

    if (hit.kind === 'token') {
      const same = this._hoverToken && this._hoverToken.id === hit.id && this._hoverToken.region === hit.region;
      this._leaveCard();
      if (!same) {
        this._hoverToken = { id: hit.id, region: hit.region };
        this._bus.emit(EventNames.TOOLTIP_SHOW, {
          kind: hit.region.type,
          name: hit.region.payload.name,
          powerDelta: hit.region.payload.powerDelta,
          x: screenX,
          y: screenY,
        });
      } else {
        this._bus.emit(EventNames.TOOLTIP_MOVE, { x: screenX, y: screenY });
      }
      return hit;
    }

    this._leaveToken();
    if (hit.kind === 'card') {
      if (this._hoverCard !== hit.id) {
        this._leaveCard();
        this._hoverCard = hit.id;
        this._bus.emit(EventNames.CARD_HOVER, { uniqueID: hit.id });
      }
    } else {
      this._leaveCard();
    }
    return hit;
  }

  _leaveToken() {
    if (this._hoverToken) {
      this._hoverToken = null;
      this._bus.emit(EventNames.TOOLTIP_HIDE, {});
    }
  }

  _leaveCard() {
    if (this._hoverCard) {
      const id = this._hoverCard;
      this._hoverCard = null;
      this._bus.emit(EventNames.CARD_LEAVE, { uniqueID: id });
    }
  }

  _findPickable(object) {
    let cur = object;
    while (cur) {
      const id = cur.userData?.pickableId;
      if (id != null && this._pickables.has(id)) return { id, entry: this._pickables.get(id) };
      cur = cur.parent;
    }
    return null;
  }
}
