// BattleStage：单场战斗的场景组装（§4 各基座模块的黏合层）。
// 职责：
//   1. reconcile：显示状态快照 → 建/销/更新 CardObject、UnitObject、ZonePileObject、按钮。
//      快照只在 ANIM_STATE_SYNC 节拍应用（见下）；STATE_DIRTY 不再直接驱动场景
//   2. 视觉模型（继承老版 animationSequencer + 两套状态设计的精髓）：
//      **后端状态与前端显示状态分离，显示状态只在 ANIM_STATE_SYNC 节拍推进**——
//      sync 是专有动画指令（tags:['state']），与动画节拍的相对入队位置表达时序：
//      效果类先动画后 sync（演完再变数字）、入场类先 sync 后动画（先转移再播）、
//      离场类先飞行动画后 sync（飞进坟堆数字才+1）。
//      **全局唯一卡牌**：一张卡任何时候恰有一个视觉实体，发动展示用卡本体，无替身无瞬移；
//      离场飞行是阻塞节拍（播完才回 finish），节拍次序全部由 sequencer 编排——
//      sequencer 是 command queue（多指令可并发 running，tags/waitTags 定阻塞），
//      参与时序的 non-trivial 动画都由它编排，fire-and-forget 小特效（粒子/脉冲）才旁路。
//   3. 输入：Picker hover（tooltip/手牌撑开）+ 拖拽出牌（拖过 PLAY_LINE_Y 松手=打出）
//      + 结算期输入（点选候选卡 → respond）+ 区域图标点击（开/关查看器）。
// 不做：日志、tooltip 渲染（Shell/调试页消费 bus 事件）、rest 阶段。
//
// 布局（世界坐标，屏幕高=100，y 向上，16:9 世界宽≈177.8）：
//   手牌 y=-35 居中扇形；咏唱槽屏幕左侧纵列（x=-74，自 y=32 向下，z 低于手牌）；
//   玩家 (-30,5)，瑞米 (-13,5)，敌人 x=14+18i y=10；
//   主按钮 (44,-12)；牌库图标 (62,-35)，坟墓图标 (62,-13)；出牌线 y=-20。

import * as THREE from 'three';
import { EventNames } from '../../bridge/events.js';
import { CardObject } from '../objects/CardObject.js';
import { UnitObject } from '../objects/UnitObject.js';
import { ZonePileObject } from '../objects/ZonePileObject.js';
import { ResourcePipsObject } from '../objects/ResourcePipsObject.js';
import { ParticleSystem } from '../particles/ParticleSystem.js';
import { LayoutEngine } from '../layout/LayoutEngine.js';
import { StageAnimator, ANIMATOR_STATES, gsapTween } from '../animator/StageAnimator.js';
import { Picker } from '../picker/Picker.js';
import { renderRichTextBlock } from '../richtext/texture.js';
import { bakeCardFace } from '../richtext/cardFace.js';
import { CardArtCache } from '../art/cardArtCache.js';

export const CARD_WIDTH = 20;
export const CARD_HEIGHT = 27;
export const PLAY_LINE_Y = -20;

const UNIT_SLOTS = {
  player: { x: -30, y: 5 },
  ally: { x: -13, y: 5, dx: 17 },     // 队友横排在玩家右侧
  enemy: { x: 14, y: 10, dx: 18 },    // 敌人横排右侧
};
const BUTTON_POS = { x: 44, y: -12, w: 18, h: 9 };
const PILE_POSITIONS = {
  deck: { x: 76, y: -35 },      // 牌库图标（手牌右侧下；手牌扇区最大 ±65，避让开）
  discard: { x: 76, y: -13 },   // 坟墓图标（牌库上方）
};

export class BattleStage {
  /**
   * @param {object} options
   *   bridge: createBridge 产物
   *   stageManager: StageManager
   *   bus: UI 事件出口（tooltip/card-hover），缺省 bridge.frontendBus
   *   bakeFace(cardProjection) / bakeLabel(text)：烘焙函数，缺省浏览器 canvas 实现（可注入 fake）
   *   tween: StageAnimator 的 tween 工厂（缺省 gsap，测试注入手动版）
   */
  constructor({ bridge, stageManager, bus = null, bakeFace = null, bakeLabel = null, tween = undefined }) {
    this.bridge = bridge;
    this.name = 'battle';
    this.scene = new THREE.Scene();
    this._bus = bus || bridge.frontendBus;
    // 卡图缓存仅浏览器端创建（node 单测注入 fake bakeFace，不走卡图链路）
    this._artCache = (!bakeFace && typeof document !== 'undefined')
      ? new CardArtCache({ onLoad: () => this._rebakeCardFaces() })
      : null;
    this._bakeFace = bakeFace || ((card) => bakeCardFace(card, { scale: 2, art: this._artCache?.get(card) ?? null }));
    this._bakeLabel = bakeLabel || ((text) => renderRichTextBlock(text, { maxWidth: 220, style: { fontSize: 16, lineHeight: 20 } }));

    this.layout = new LayoutEngine();
    this.layout.registerContainer('hand', { centerX: 0, centerY: -35, width: 130, cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT });
    // 咏唱槽：屏幕左侧固定纵列，z 区间低于手牌（不遮挡、不抢层级）
    this.layout.registerContainer('chant', { centerX: -74, topY: 32, cardHeight: CARD_HEIGHT, gap: 3, zBase: 4 });
    this.layout.setNamedAnchor('deck', PILE_POSITIONS.deck);
    this.layout.setNamedAnchor('discard', PILE_POSITIONS.discard);

    this.animator = new StageAnimator({ layoutEngine: this.layout, tween });
    // FX tween（overlay 脉冲等不进注册表、不阻塞队列的小动画）：与 animator 同源可注入
    this._tweenFactory = tween ?? gsapTween;
    this.picker = new Picker({ stageManager, bus: this._bus });
    this._sm = stageManager;

    this._cards = new Map();   // uniqueID -> { object, zone: 'hand'|'chant', signature }
    this._units = new Map();   // uniqueID -> UnitObject
    this._snapshot = null;     // 显示状态快照：只在 ANIM_STATE_SYNC 节拍推进（两套状态设计——
                               // 后端状态即时变，显示状态随队列节拍变，时序由 sync 指令位置表达）
    this._displayCard = null;          // 正在做发动展示的卡 { id }（全局唯一卡牌：展示用本体，无替身）
    // 展示完毕、已有离场节拍在排队的卡：停留在展示位等节拍来收（不回手牌跟踪，
    // 否则会出现"飞回手牌→又被离场节拍拉进坟堆"的折返跑）；节拍到达时取出清除
    this._heldCards = new Set();
    this._inFlight = new Map();        // 离场飞行中的卡 uniqueID -> object（同 id 重生时清尸）
    this._hoveredCardId = null;
    this._dragging = null;     // { id }
    this._dragTargetId = null; // 拖牌指定的高亮目标（存活敌人）
    this._pressChant = null;   // 咏唱卡点按候选 { id }（up 在同卡 = 停止咏唱）
    this._inputSelection = [];
    this._viewer = null;       // { zone, group, bg } 区域查看器

    // 粒子系统（受伤/治疗等演出）与卡牌持续特效（咏唱流光），由 StageManager 帧回调驱动
    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.sprites); // 文本/贴图粒子层
    this._unsubTick = stageManager.onTick((dt) => {
      this.particles.update(dt);
      for (const entry of this._cards.values()) entry.object.updateGlow(dt);
      this._resources.ap.update(dt);
      this._resources.mana.update(dt);
    });

    // 区域图标（牌库/坟墓）：点击开查看器，计数经 reconcile 同步
    this._piles = {
      deck: new ZonePileObject({ zoneKey: 'deck', label: '牌库', color: '#5aa2e8' }),
      discard: new ZonePileObject({ zoneKey: 'discard', label: '坟墓', color: '#a0855a' }),
    };
    for (const [key, pile] of Object.entries(this._piles)) {
      pile.position.set(PILE_POSITIONS[key].x, PILE_POSITIONS[key].y, 5);
      this.scene.add(pile);
      this.picker.addPickable(`pile:${key}`, pile, { kind: 'pile' });
      this.animator.register(`pile:${key}`, pile);
    }

    this._button = new CardObject({ uniqueID: 'btn:main', cardWidth: BUTTON_POS.w, cardHeight: BUTTON_POS.h, bakeFace: this._bakeButtonFace.bind(this) });
    this._button.position.set(BUTTON_POS.x, BUTTON_POS.y, 0);
    this._button.setCard({ label: '结束回合', enabled: false });
    this.scene.add(this._button);
    this.picker.addPickable('btn:main', this._button, { kind: 'button' });

    // 玩家资源显示（手牌栏上方）：AP 黄点 / 魏启 蓝点，耗尽点变灰常驻
    this._resources = {
      ap: new ResourcePipsObject({ name: 'AP', color: 0xf0c040, bakeLabel: this._bakeLabel }),
      mana: new ResourcePipsObject({ name: '魏启', color: 0x4a8fe8, bakeLabel: this._bakeLabel }),
    };
    this._resources.ap.position.set(0, -14.5, 6);
    this._resources.mana.position.set(0, -18, 6);
    this.scene.add(this._resources.ap);
    this.scene.add(this._resources.mana);

    this._unsubs = [
      bridge.frontendBus.on('*', (type, payload) => this._direct(type, payload)),
      this._bus.on(EventNames.CARD_HOVER, ({ uniqueID }) => this._setHoveredCard(uniqueID)),
      this._bus.on(EventNames.CARD_LEAVE, () => this._setHoveredCard(null)),
    ];
  }

  // ========== reconcile：显示状态快照 → 场景对象 ==========

  // 显示状态只在两处推进：ANIM_STATE_SYNC 节拍（队列编排的正常路径）。
  // 快照是投影的引用——投影不可变（每次重算生成新对象），存引用即可
  _applySnapshot(snapshot) {
    if (!snapshot) return;
    this._snapshot = snapshot;
    this.reconcile();
  }

  reconcile() {
    const proj = this._snapshot;
    if (!proj) return;
    this._closeViewer(); // 状态已变，查看器内容失效
    this._syncUnits(proj);
    this._syncCardZone('hand', proj.hand.map(c => c.uniqueID));
    this._syncCardZone('chant', proj.chant.slots.map(c => c.uniqueID));
    this._syncCardContents(proj);
    this._syncButton(proj);
    this._resources.ap.setValue(proj.player.actionPoints, proj.player.maxActionPoints);
    this._resources.mana.setValue(proj.player.mana, proj.player.maxMana);
    this._piles.deck.setCount(proj.counts.deck);
    this._piles.discard.setCount(proj.counts.discard);
    this._layoutAndTrack();
    this._updatePendingPips(); // 悬浮卡可能已离场/资源已变，重算高亮
  }

  _syncUnits(proj) {
    const seen = new Set();
    const place = (unitProj, side, index) => {
      seen.add(unitProj.uniqueID);
      let obj = this._units.get(unitProj.uniqueID);
      if (!obj) {
        obj = new UnitObject({ uniqueID: unitProj.uniqueID, side, bakeLabel: this._bakeLabel });
        this._units.set(unitProj.uniqueID, obj);
        this.scene.add(obj);
        this.animator.register(unitProj.uniqueID, obj);
        this.picker.addPickable(unitProj.uniqueID, obj, { kind: 'unit' });
      }
      const slot = UNIT_SLOTS[side];
      obj.position.set(slot.x + (slot.dx || 0) * index, slot.y, 0);
      obj.setUnit(unitProj);
    };
    place(proj.player, 'player', 0);
    proj.allies.forEach((a, i) => place(a, 'ally', i));
    proj.enemies.forEach((e, i) => place(e, 'enemy', i));
    for (const [id, obj] of this._units) {
      if (!seen.has(id)) {
        this.picker.removePickable(id);
        this.animator.unregister(id);
        this.scene.remove(obj);
        obj.dispose();
        this._units.delete(id);
      }
    }
  }

  _syncCardZone(zone, ids) {
    for (const id of ids) {
      if (!this._cards.has(id)) {
        // 同 uniqueID 的离场飞行还没播完就重生了（如从弃牌堆捞回）：清掉旧尸体，防泄漏
        const stale = this._inFlight.get(id);
        if (stale) {
          this._inFlight.delete(id);
          this.scene.remove(stale);
          stale.dispose();
        }
        const object = new CardObject({ uniqueID: id, cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, bakeFace: this._bakeFace });
        const deck = this.layout.getNamedAnchor('deck');
        object.position.set(deck.x, deck.y, 0);
        object.scale.set(0.5, 0.5, 1); // 从牌库图标大小长开（跟踪补间到锚点 scale 1），不凭空全尺寸出现
        this._cards.set(id, { object, zone });
        this.scene.add(object);
        this.animator.register(id, object);
        this.picker.addPickable(id, object, { kind: 'card', cardObject: object });
      }
      this._cards.get(id).zone = zone;
    }
  }

  _syncCardContents(proj) {
    const full = new Map();
    for (const c of proj.hand) full.set(c.uniqueID, c);
    for (const c of proj.chant.slots) full.set(c.uniqueID, c);

    // 离开 hand/chant 显示状态的卡：正常路径已被自己的离场节拍取走销毁（sync 排在
    // 离场节拍之后，队列串行保证），走到这里 = 无节拍覆盖的防御路径——直接收尸
    for (const [id, entry] of this._cards) {
      if (!full.has(id)) {
        this._cards.delete(id);
        this._heldCards.delete(id);
        this.picker.removePickable(id);
        this.animator.unregister(id);
        this.scene.remove(entry.object);
        entry.object.dispose();
      }
    }

    for (const [id, cardProj] of full) {
      const entry = this._cards.get(id);
      const sig = JSON.stringify([cardProj.defId, cardProj.name, cardProj.power, cardProj.text, cardProj.isActivated, cardProj.cost]);
      if (entry.signature !== sig) {
        entry.signature = sig;
        entry.object.setCard(cardProj);
        // 威力提升 → 金色脉冲（non-blocking，不进动画队列）
        if (entry.prevPower != null && (cardProj.power ?? 0) > entry.prevPower) {
          this._pulseCard(id, 0xffd34c);
        }
      }
      entry.prevPower = cardProj.power ?? 0;
      // 咏唱已激活 → 边缘流光（幂等）
      entry.object.setActiveGlow(entry.zone === 'chant' && !!cardProj.isActivated);
    }
  }

  // 离场节拍：播放该卡的离场飞行并**阻塞本节拍**（onDone 才回 finish）——
  // "发动 → 效果 → 离场"的次序由 sequencer 队列编排（sync 节拍在离场之后，
  // 坟堆数字因此飞进才+1），Stage 不做任何额外计时。
  // 落点取自节拍载荷（toZone /  burnt），不读投影——显示状态此时尚未同步，投影里卡还在原地
  _departureBeat(id, type, payload, finish) {
    const entry = id != null ? this._cards.get(id) : null;
    if (!entry) { // 无载体（未来机制/异常）：脉冲落点图标打节拍
      if (type === EventNames.ANIM_CARD_BURNT) return finish();
      const zone = payload?.toZone === 'deck' ? 'deck' : 'discard';
      return this._pulsePile(zone, finish);
    }
    this._cards.delete(id);
    this._heldCards.delete(id); // 停留展示位的卡由本节拍取走
    this.picker.removePickable(id);
    let to;
    if (type === EventNames.ANIM_CARD_BURNT) {
      to = { scale: 0.01 }; // 焚毁：原地溶解占位（shader 版后补）
    } else if (payload?.toZone === 'deck') {
      to = { ...PILE_POSITIONS.deck, z: 40, scale: 0.5 };
    } else {
      to = { ...PILE_POSITIONS.discard, z: 40, scale: 0.5 };
    }
    this._flyOut(id, entry.object, to, { onDone: finish });
  }

  // 离场飞行本体：飞往落点（弃/回库/焚毁溶解），播完销毁注销并回 finish
  _flyOut(id, object, to, { onDone = null } = {}) {
    this._inFlight.set(id, object);
    this.animator.animate(id, to, {
      durationMs: 300,
      onComplete: () => {
        this._inFlight.delete(id);
        this.animator.unregister(id);
        this.scene.remove(object);
        object.dispose();
        onDone?.();
      },
    });
  }

  _syncButton(proj) {
    const pending = proj.pendingInput?.request ?? null;
    let label = '结束回合';
    let enabled = proj.waitingPlayerInput && !pending;
    if (pending?.kind === 'confirm') { label = '确认'; enabled = true; }
    else if (pending?.kind?.startsWith('select')) {
      if ((pending.count ?? 1) > 1) { label = `确认(${this._inputSelection.length}/${pending.count})`; enabled = this._inputSelection.length === pending.count; }
      else { label = '选择目标'; enabled = false; }
    }
    const sig = label + enabled;
    if (this._buttonSig !== sig) {
      this._buttonSig = sig;
      this._button.setCard({ label, enabled });
      this._button.setVisualState(enabled ? 'normal' : 'disabled');
    }
  }

  _layoutAndTrack() {
    // 保持显示状态快照中的手牌顺序（_cards 插入序≠手牌序）
    const proj = this._snapshot;
    if (!proj) return;
    const orderedHand = proj.hand.map(c => c.uniqueID).filter(id => this._cards.has(id));
    const orderedChant = proj.chant.slots.map(c => c.uniqueID).filter(id => this._cards.has(id));
    this.layout.layoutHand('hand', orderedHand, this._hoveredCardId);
    this.layout.layoutColumn('chant', orderedChant);
    for (const [id, entry] of this._cards) {
      // 停留展示位等离场节拍的卡不回跟踪（防"飞回手牌→再被拉进坟堆"的折返）
      const st = this.animator.getState(id);
      if (st === ANIMATOR_STATES.IDLE && !this._heldCards.has(id)) this.animator.enterTracking(id);
      // 视觉态优先级：结算期选卡（候选高亮/其余压灰）> 手牌可发动性（不可发动淡灰白）> normal
      const pending = proj.pendingInput?.request;
      if (pending?.candidates) {
        entry.object.setVisualState(pending.candidates.includes(id) ? 'highlighted' : 'disabled');
      } else if (entry.zone === 'hand' && !pending) {
        entry.object.setVisualState(this.bridge.intents.canPlayCard(id) ? 'normal' : 'disabled');
      } else {
        entry.object.setVisualState('normal');
      }
    }
    this.animator.syncTracking();
  }

  // ========== 视觉导演：ANIM_* → 补间 → finish ==========

  _direct(type, payload) {
    if (!type.startsWith('anim:')) return;
    const finish = () => {
      this.bridge.frontendBus.emit(EventNames.ANIMATION_INSTRUCTION_FINISHED, { id: payload?._animId });
    };

    // 状态同步节拍：显示状态在此推进（应用快照 + reconcile），立即 finish
    if (type === EventNames.ANIM_STATE_SYNC) {
      this._applySnapshot(payload?.snapshot);
      return finish();
    }

    // 卡牌离场节拍（弃/焚/迁移/停咏唱）：播放该卡的离场飞行并阻塞本节拍——
    // 离场时序完全由 sequencer 编排（sync 节拍排在离场之后，坟堆数字飞进才+1）
    if (type === EventNames.ANIM_CARD_DISCARDED || type === EventNames.ANIM_CARD_BURNT
      || type === EventNames.ANIM_CARD_MOVED || type === EventNames.ANIM_CHANT_STOPPED) {
      const id = payload?.card?.uniqueID ?? payload?.skill?.uniqueID ?? payload?.uniqueID ?? null;
      return this._departureBeat(id, type, payload, finish);
    }
    // 入手/造牌：视觉由状态差分完成（新卡从牌库长开+跟踪飞入），这里只脉冲区域图标打节拍
    if (type === EventNames.ANIM_CARD_DRAWN || type === EventNames.ANIM_CARD_ADDED) {
      return this._pulsePile('deck', finish);
    }
    if (type === EventNames.ANIM_CARD_SWAPPED) {
      return this._pulsePile('discard', finish);
    }
    if (type === EventNames.ANIM_SKILL_USED) return this._skillDisplay(payload, finish);
    // 咏唱激活：不播 scale 脉冲——会打断入槽的跟踪飞行把卡晾在半路；
    // 激活表达由边缘流光（状态差分）承担，这里只打节拍
    if (type === EventNames.ANIM_CHANT_STARTED) return finish();
    // 冷却推进：绿色脉冲，立即 finish——non-blocking，不占队列节拍
    // （反向冷却/强冷却的差异化着色等 presenter 载荷带 delta 后再做）
    if (type === EventNames.ANIM_COOLDOWN_TICK) {
      this._pulseCard(payload?.skill?.uniqueID, 0x66ff99);
      return finish();
    }

    const target = this._findAnimTarget(payload);
    if (type === EventNames.ANIM_DAMAGE && target) return this._damageHit(target, payload, finish);
    if (type === EventNames.ANIM_UNIT_DEATH && target) {
      this.particles.spawn(target.position.x, target.position.y, { count: 22, color: 0x999999, speed: 16, ttl: 0.8 });
      this.animator.animate(target.uniqueID, { scale: 0.01 }, { durationMs: 300, onComplete: finish });
      return;
    }
    // 治疗/护盾/效果：目标脉冲 + 对应色粒子；治疗追加 +N 绿色文本粒子（无重力上飘）
    if (target && (type === EventNames.ANIM_HEAL || type === EventNames.ANIM_SHIELD || type === EventNames.ANIM_EFFECT)) {
      const fx = {
        [EventNames.ANIM_HEAL]: { color: 0x55ff88, gravity: 25 },
        [EventNames.ANIM_SHIELD]: { color: 0x66aaff, gravity: 0 },
        [EventNames.ANIM_EFFECT]: { color: 0xffd34c, gravity: 0 },
      }[type];
      this.particles.spawn(target.position.x, target.position.y, { count: 10, speed: 10, ttl: 0.6, ...fx });
      if (type === EventNames.ANIM_HEAL && (payload?.healed ?? 0) > 0) {
        this.particles.spawnText(
          target.position.x + (Math.random() - 0.5) * 3,
          target.position.y + 4,
          `+${payload.healed}`,
          {
            fontSize: Math.min(30 + payload.healed * 2, 72), color: '#4ade80',
            vx: (Math.random() - 0.5) * 6, vy: 14,
            gravity: 0, drag: 1.2, ttl: 1.0, scalePop: 0.4,
          },
        );
      }
    }
    if (!target) { finish(); return; }
    // 通用脉冲：放大→平滑回程→finish（不硬切 scale）。
    // 目标是还在桌上的卡：重回跟踪（补间回锚点，含悬浮 scale）；单位：补间回 1
    const targetId = target.uniqueID;
    this.animator.animate(targetId, { scale: 1.2 }, {
      durationMs: 150,
      onComplete: () => {
        if (this._cards.has(targetId)) {
          this.animator.enterTracking(targetId);
          finish();
        } else {
          this.animator.animate(targetId, { scale: 1.0 }, { durationMs: 120, onComplete: finish });
        }
      },
    });
  }

  // 发动展示（全局唯一卡牌：展示用本体，无替身无瞬移）：
  // 卡本体从当前位置（手牌/松手点）飞到中央放大 → 停留 → 节拍 finish。
  // 收尾分两路：已有离场节拍在排队（正常打出/焚毁）→ 停留展示位等收（不回手牌）；
  // 否则（咏唱入槽 / 结算期输入挂起，离场节拍尚未产生）→ 回锚点跟踪
  _skillDisplay(payload, finish) {
    const id = payload?.skill?.uniqueID;
    const entry = id != null ? this._cards.get(id) : null;
    if (!entry) { finish(); return; } // 非手牌来源（未来机制）：无展示载体，直接打节拍
    const object = entry.object;
    this._displayCard = { id };
    this.animator.animate(id, { x: 0, y: -2, z: 60, scale: 1.15 }, {
      durationMs: 180,
      onComplete: () => {
        this.animator.animate(id, {}, { // 停留节拍（纯延迟 tween）
          delayMs: 380,
          onComplete: () => {
            this._displayCard = null;
            finish(); // 发动节拍结束；离场由后续 ANIM_CARD_* 节拍驱动
            if (!this._cards.has(id)) return;
            if (this._hasDepartureBeatQueued(id)) this._heldCards.add(id);
            else this.animator.enterTracking(id);
          },
        });
      },
    });
  }

  // 队列中是否已有该卡的离场节拍（弃/焚/迁移/停咏唱）——读队列编排计划，不读后端状态
  _hasDepartureBeatQueued(id) {
    return !!this.bridge.sequencer.findPending(ins => {
      const { event, payload } = ins.meta ?? {};
      if (event !== EventNames.ANIM_CARD_DISCARDED && event !== EventNames.ANIM_CARD_BURNT
        && event !== EventNames.ANIM_CARD_MOVED && event !== EventNames.ANIM_CHANT_STOPPED) return false;
      const pid = payload?.card?.uniqueID ?? payload?.skill?.uniqueID ?? payload?.uniqueID;
      return pid === id;
    });
  }

  // 受伤演出：闪红 + 粒子爆发 + 伤害数字文本粒子迸射 + 短促击退震动
  // （短暂停留由队列节拍保证；HP 数字的显示状态变化在本节拍后的 sync 才应用——先演后变）
  _damageHit(unit, payload, finish) {
    unit.flash?.(0xff2222);
    this.particles.spawn(unit.position.x, unit.position.y + 2, { count: 16, color: 0xff5533, speed: 22 });
    // 伤害数字：从受伤源向上迸射、受重力下坠（老版配方演进：字号随伤害缩放 + 出生弹跳）
    const dealt = payload?.dealt ?? 0;
    if (dealt > 0) {
      this.particles.spawnText(
        unit.position.x + (Math.random() - 0.5) * 3,
        unit.position.y + 4 + Math.random() * 1.5,
        `-${dealt}`,
        {
          fontSize: Math.min(34 + dealt * 2.4, 96), color: '#ff4d4d',
          vx: (Math.random() - 0.5) * 10, vy: 22 + Math.random() * 8,
          gravity: -65, ttl: Math.min(0.85 + dealt * 0.02, 1.3), scalePop: 0.5,
        },
      );
    }
    // 护盾吸收：独立灰色数字（较小、偏移开），全挡时只有它
    const absorbed = payload?.shieldAbsorbed ?? 0;
    if (absorbed > 0) {
      this.particles.spawnText(
        unit.position.x + 2.5 + (Math.random() - 0.5) * 2,
        unit.position.y + 3,
        `-${absorbed}`,
        {
          fontSize: Math.min(26 + absorbed * 1.6, 48), color: '#8fb3d9',
          vx: (Math.random() - 0.5) * 8, vy: 16 + Math.random() * 6,
          gravity: -50, ttl: 0.85, scalePop: 0.3,
        },
      );
    }
    const id = unit.uniqueID;
    const x0 = unit.position.x;
    this.animator.animate(id, { x: x0 + 1.8 }, {
      durationMs: 80,
      ease: 'power1.in',
      onComplete: () => {
        this.animator.animate(id, { x: x0 }, {
          durationMs: 220,
          onComplete: () => {
            unit.restoreColor?.();
            finish();
          },
        });
      },
    });
  }

  // 牌面脉冲（non-blocking FX）：overlay 发光片从放大缩回原位后隐藏，不进注册表、不占队列
  _pulseCard(id, color) {
    const obj = this._cards.get(id)?.object;
    if (!obj) return;
    const overlay = obj.ensureOverlay();
    overlay.material.color.set(color);
    overlay.visible = true;
    overlay.scale.set(1.2, 1.2, 1);
    overlay.userData.fxTween?.kill?.();
    overlay.userData.fxTween = this._tweenFactory(overlay, { scale: 1.0 }, {
      durationMs: 220,
      onComplete: () => { overlay.visible = false; },
    });
  }

  _pulsePile(zone, onComplete) {
    const pile = this._piles[zone];
    if (!pile) { onComplete(); return; }
    this.animator.animate(`pile:${zone}`, { scale: 1.15 }, {
      durationMs: 120,
      onComplete: () => {
        this.animator.animate(`pile:${zone}`, { scale: 1.0 }, { durationMs: 120, onComplete });
      },
    });
  }

  _findAnimTarget(payload) {
    if (!payload) return null;
    if (payload.kind === 'mana' || payload.kind === 'actionPoint') {
      return this._units.get(this._snapshot?.player.uniqueID) ?? null;
    }
    const id = payload.target?.uniqueID ?? payload.unit?.uniqueID
      ?? payload.skill?.uniqueID ?? payload.card?.uniqueID
      ?? payload.cards?.[0]?.uniqueID ?? payload.uniqueID ?? null;
    return this._units.get(id) ?? this._cards.get(id)?.object ?? null;
  }

  // ========== 区域查看器（点牌库/坟墓图标开，任意点击关） ==========

  _openViewer(zone) {
    this._closeViewer();
    const proj = this._snapshot;
    if (!proj) return;
    const list = proj.zones[zone] ?? [];
    const group = new THREE.Group();

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(this._sm.worldWidth || 178, 100),
      new THREE.MeshBasicMaterial({ color: 0x0a0b10, transparent: true, opacity: 0.85 }),
    );
    bg.position.z = 80;
    group.add(bg);

    const scale = 0.6;
    const cols = 6;
    const gapX = CARD_WIDTH * scale + 2;
    const gapY = CARD_HEIGHT * scale + 3;
    list.forEach((cardProj, i) => {
      const obj = new CardObject({ uniqueID: `viewer:${cardProj.uniqueID}`, cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, bakeFace: this._bakeFace });
      obj.setCard(cardProj);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowCount = Math.min(cols, list.length - row * cols);
      obj.position.set((col - (rowCount - 1) / 2) * gapX, 28 - row * gapY, 81);
      obj.scale.set(scale, scale, 1);
      group.add(obj);
    });

    this.scene.add(group);
    this.picker.addPickable('viewer:bg', bg, { kind: 'viewer' });
    this._viewer = { zone, group, bg };
  }

  _closeViewer() {
    if (!this._viewer) return;
    const { group, bg } = this._viewer;
    this.picker.removePickable('viewer:bg');
    for (const child of [...group.children]) {
      if (child !== bg) child.dispose?.();
    }
    bg.geometry.dispose();
    bg.material.dispose();
    this.scene.remove(group);
    this._viewer = null;
  }

  // ========== 指针输入（调用方传屏幕像素坐标） ==========

  handlePointerMove(x, y) {
    if (this._viewer) return;
    this.scene.updateMatrixWorld(true);
    if (this._dragging) {
      const world = this._worldAt(x, y);
      const obj = this._cards.get(this._dragging.id)?.object;
      if (obj) obj.position.set(world.x, world.y, 30);
      this._dragging.moved = true;
      // 拖牌掠过存活敌人 → 目标标注高亮（排除拖拽中的卡自身遮挡）
      const hit = this.picker.pick(x, y, { kinds: ['unit'], excludeIds: [this._dragging.id] });
      this._setDragTarget(this._targetableEnemyId(hit));
      return;
    }
    this.picker.hover(x, y);
  }

  handlePointerDown(x, y) {
    if (this._viewer) return;
    this.scene.updateMatrixWorld(true);
    const hit = this.picker.pick(x, y);
    const proj = this._snapshot;
    if (hit.kind === 'card' && !proj?.pendingInput) {
      if (this.bridge.intents.canPlayCard(hit.id)) {
        this._dragging = { id: hit.id, moved: false };
        this.animator.enterDragging(hit.id);
      } else if (this._cards.get(hit.id)?.zone === 'chant' && this.bridge.intents.canStopChant(hit.id)) {
        this._pressChant = { id: hit.id }; // 咏唱卡点按候选（up 在同一卡上 = 停止咏唱）
      }
    }
  }

  handlePointerUp(x, y) {
    this.scene.updateMatrixWorld(true);
    if (this._viewer) {
      this._closeViewer();
      return;
    }
    const proj = this._snapshot;
    const pending = proj?.pendingInput?.request ?? null;

    if (this._dragging) {
      const { id } = this._dragging;
      this._dragging = null;
      this._setDragTarget(null);
      const world = this._worldAt(x, y);
      // 松手点在存活敌人身上 → 指定目标打出；否则过出牌线 → 默认目标打出
      const hit = this.picker.pick(x, y, { kinds: ['unit'], excludeIds: [id] });
      const targetId = this._targetableEnemyId(hit);
      const played = (targetId || world.y > PLAY_LINE_Y) && this.bridge.intents.playCard(id, targetId);
      if (!played) this.animator.enterTracking(id); // 回原位
      return;
    }

    if (this._pressChant) {
      const { id } = this._pressChant;
      this._pressChant = null;
      const hit = this.picker.pick(x, y);
      // 点按落在同一咏唱卡上（整卡或卡面 token）→ 停止咏唱
      if (hit.id === id && (hit.kind === 'card' || hit.kind === 'token')) {
        this.bridge.intents.stopChant(id);
      }
      return;
    }

    const hit = this.picker.pick(x, y);
    if (hit.kind === 'pile') {
      this._openViewer(hit.id.slice(5)); // 'pile:deck' → 'deck'
      return;
    }
    if (hit.kind === 'button' && hit.id === 'btn:main') {
      if (pending?.kind === 'confirm') this.bridge.interaction.respond(true);
      else if (pending?.kind?.startsWith('select') && (pending.count ?? 1) > 1) this.bridge.interaction.respond([...this._inputSelection]);
      else this.bridge.intents.endTurn();
      this._inputSelection = [];
      return;
    }
    if (hit.kind === 'card' && pending?.kind?.startsWith('select')) {
      if (!pending.candidates || pending.candidates.includes(hit.id)) {
        if ((pending.count ?? 1) === 1) {
          this.bridge.interaction.respond([hit.id]);
        } else {
          const i = this._inputSelection.indexOf(hit.id);
          if (i >= 0) this._inputSelection.splice(i, 1);
          else if (this._inputSelection.length < pending.count) this._inputSelection.push(hit.id);
          this.reconcile(); // 刷新按钮计数
        }
      }
    }
  }

  _worldAt(x, y) {
    // Picker 内部已有 screenToWorld；拖拽直接复用 stageManager 换算
    return this.picker._sm.screenToWorld(x, y);
  }

  // 拖牌目标：pick 命中存活敌人才作数（尸体/友方/玩家不算；按显示状态快照判定）
  _targetableEnemyId(hit) {
    if (hit?.kind !== 'unit') return null;
    const alive = (this._snapshot?.enemies ?? []).some(e => e.uniqueID === hit.id && !e.isDead);
    return alive ? hit.id : null;
  }

  // 目标标注：最多一个单位高亮，随拖拽移动切换/清除
  _setDragTarget(uniqueID) {
    if (this._dragTargetId === uniqueID) return;
    this._dragTargetId = uniqueID;
    for (const [id, unit] of this._units) unit.setHighlight(id === uniqueID);
  }

  _bakeButtonFace({ label }) {
    // 浏览器环境：固定布局盒 180x90 ↔ 18x9 世界（10px/wu，与牌面同约定）；
    // 单测注入的 fake bakeLabel 直接透传
    if (typeof document === 'undefined') return this._bakeLabel(label);
    return renderRichTextBlock(label, {
      maxWidth: 170,
      fixedSize: { width: 180, height: 90 },
      style: { fontSize: 40, lineHeight: 48 },
      scale: 2,
    });
  }

  _setHoveredCard(uniqueID) {
    if (this._hoveredCardId === uniqueID) return;
    this._hoveredCardId = uniqueID;
    this._layoutAndTrack();
    this._updatePendingPips();
  }

  // 悬浮手牌 → 按其 cost 高亮"即将消耗"的资源点（脉动）；咏唱卡费用已付，不高亮。
  // 拖拽中 hover 保持（picker 不重算），出牌/离场后由 reconcile 清除
  _updatePendingPips() {
    let ap = 0;
    let mana = 0;
    if (this._hoveredCardId != null) {
      const card = (this._snapshot?.hand ?? []).find(c => c.uniqueID === this._hoveredCardId);
      if (card?.cost) {
        ap = card.cost.actionPoint ?? 0;
        mana = card.cost.mana ?? 0;
      }
    }
    this._resources.ap.setPending(ap);
    this._resources.mana.setPending(mana);
  }

  // 卡图异步加载完成后：重烘全部在场景牌面（纹理与 hit map 成对替换）
  _rebakeCardFaces() {
    for (const entry of this._cards.values()) {
      if (entry.object.cardData) entry.object.setCard(entry.object.cardData);
    }
  }

  dispose() {
    this._closeViewer();
    this._unsubTick?.();
    this._unsubs.forEach(off => off?.());
    this._unsubs = [];
    this._resources.ap.dispose();
    this._resources.mana.dispose();
  }
}
