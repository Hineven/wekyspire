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
//   3. 输入：Picker hover（tooltip/手牌撑开）+ 双模式出牌 + 结算期输入（点选候选卡 → respond）
//      + 区域图标点击（开/关查看器）。出牌交互按投影 targetMode 分流：
//      'enemy'（需选目标）= 杀戮尖塔式瞄准——卡留手牌高亮+撑开，曲线箭头追随指针，
//      松手在存活敌人身上才打出（否则取消）；'none'（免目标）= 旧拖拽——卡随指针走，
//      拖过 PLAY_LINE_Y 松手=打出。
// 不做：日志、tooltip 渲染（Shell/调试页消费 bus 事件）、rest 阶段。
//
// 布局（世界坐标，z=0 平面屏幕高≈100，y 向上，相机抬眼高斜视，16:9 世界宽≈177.8）：
//   手牌 y=-40 居中扇形（压低给战场让位）；咏唱槽屏幕左侧纵列（x=-74，自 y=18 向下，z 低于手牌）；
//   单位脚底锚定场景水平地板（scene.battleLine y=FLOOR_Y，slotTransform 换算）；
//   按钮纵列（主/换卡）x=46 y=-8/-16；牌库图标 (76,-35)，坟墓图标 (76,-13)；出牌线 y=-20；
//   背景 = 程序化 3D 场景（dungeon3D）。

import * as THREE from 'three';
import { EventNames } from '../../bridge/events.js';
import { CardObject } from '../objects/CardObject.js';
import { UnitObject } from '../objects/UnitObject.js';
import { ZonePileObject } from '../objects/ZonePileObject.js';
import { ResourcePipsObject } from '../objects/ResourcePipsObject.js';
import { TargetingArrowObject } from '../objects/TargetingArrowObject.js';
import { ParticleSystem } from '../particles/ParticleSystem.js';
import { LayoutEngine } from '../layout/LayoutEngine.js';
import { StageAnimator, ANIMATOR_STATES, gsapTween } from '../animator/StageAnimator.js';
import { Picker } from '../picker/Picker.js';
import { renderRichTextBlock } from '../richtext/texture.js';
import { bakeCardFace } from '../richtext/cardFace.js';
import { bakeButtonFace } from '../richtext/buttonFace.js';
import { CardArtCache } from '../art/cardArtCache.js';
import { UnitArtCache, unitHeightFactor, STANDEE_BASE_HEIGHT } from '../art/unitArt.js';
import { getScene, slotTransform } from '../scenes/index.js';
import { createVolumetricMoonlight } from '../scenes/volumetricMoon.js';

export const CARD_WIDTH = 20;
export const CARD_HEIGHT = 27;
export const PLAY_LINE_Y = -20;
const ARROW_Z = 45; // 瞄准箭头所在平面：高于手牌扇（z≤33），viewer（z=80）打开时 aiming 不可达

const BUTTON_SIZE = { w: 15, h: 6 };
// 按钮纵列：主按钮（结束回合/确认）在上，换卡按钮在下（右下自由区，避让人群与手牌扇）
export const BUTTON_POSITIONS = {
  main: { x: 74, y: -4 },
  swap: { x: 74, y: -12 },
};
const PILE_POSITIONS = {
  deck: { x: 80, y: -55 },      // 牌库图标（手牌右侧下；手牌扇区最大 ±65，避让开）
  discard: { x: 80, y: -38 },   // 坟墓图标（牌库上方）
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
  constructor({ bridge, stageManager, bus = null, bakeFace = null, bakeLabel = null, tween = undefined, scene = 'dungeon' }) {
    this.bridge = bridge;
    this.name = 'battle';
    this.scene = new THREE.Scene();   // 3D 世界 pass：场景/单位/粒子（与地板正确深度交互）
    this.uiScene = new THREE.Scene(); // UI pass：卡牌/按钮/图标/资源点（清深度后渲染，不被地板 z-test 裁掉）
    this._bus = bus || bridge.frontendBus;
    this._sceneDef = getScene(scene);
    // 卡图缓存仅浏览器端创建（node 单测注入 fake bakeFace，不走卡图链路）
    this._artCache = (!bakeFace && typeof document !== 'undefined')
      ? new CardArtCache({ onLoad: () => this._rebakeCardFaces() })
      : null;
    // 立牌缓存同理：异步到图后补挂纹理
    this._unitArt = (typeof document !== 'undefined')
      ? new UnitArtCache({ onLoad: () => this._applyUnitArt() })
      : null;
    this._bakeFace = bakeFace || ((card) => bakeCardFace(card, { scale: 2, art: this._artCache?.get(card) ?? null }));
    this._bakeLabel = bakeLabel || ((text) => renderRichTextBlock(text, { maxWidth: 220, style: { fontSize: 16, lineHeight: 20 } }));

    // 程序化 3D 场景（低多边形 + 灯光 + 氛围粒子锚点），node 单测同样可建
    this._scene3D = this._sceneDef.build3D ? this._sceneDef.build3D() : null;
    if (this._scene3D) {
      this.scene.add(this._scene3D.group);
      // 雾：远景没入永夜蓝黑但保留墙/窗剪影（相机 (0,30,235) 斜视；立牌材质 fog:false 不受影响）
      this.scene.fog = new THREE.Fog(0x060a14, 215, 320);
    }
    // 体积月光 composer（ray marching，场景带投影月光且 renderer 支持 RT 时接管世界 pass；
    // 单测假 renderer 无 setRenderTarget → null，StageManager 回退直接渲染）
    const renderer = stageManager._renderer;
    if (this._scene3D?.moonlight && renderer && typeof renderer.setRenderTarget === 'function') {
      this._composer = createVolumetricMoonlight({ light: this._scene3D.moonlight });
      this.composeScene = ({ scene, camera }) => this._composer.render(renderer, scene, camera);
      this.composeResize = (w, h) => this._composer.resize(w, h);
      this.composeResize(stageManager.viewSize.width || 2, stageManager.viewSize.height || 2);
    }
    this._tintScratch = new THREE.Color();

    this.layout = new LayoutEngine();
    this.layout.registerContainer('hand', { centerX: 0, centerY: -50, width: 130, cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT });
    // 咏唱槽：屏幕左侧固定纵列，z 区间低于手牌（不遮挡、不抢层级）。
    // topY 受正交取景上限约束：可视顶 y=35，卡半高 13.5 → topY≤21.5 才不被上缘裁掉
    this.layout.registerContainer('chant', { centerX: -74, topY: 18, cardHeight: CARD_HEIGHT, gap: 3, zBase: 4 });
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
    this._dragging = null;     // 免目标卡（targetMode 'none'）旧式拖拽 { id }
    this._aiming = null;       // 选目标卡（targetMode 'enemy'）瞄准中 { id }：卡留手牌，箭头指指针
    this._dragTargetId = null; // 拖牌/瞄准指定的高亮目标（存活敌人）
    this._pressChant = null;   // 咏唱卡点按候选 { id }（up 在同卡 = 停止咏唱）
    this._inputSelection = [];
    this._viewer = null;       // { zone, group, bg } 区域查看器

    // 粒子系统（受伤/治疗等演出）与卡牌持续特效（咏唱流光），由 StageManager 帧回调驱动
    this.particles = new ParticleSystem();
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.sprites); // 世界内贴图粒子层（3D 场景演出）
    this.uiScene.add(this.particles.spritesUI); // 读数文本粒子层（前景，恒定屏幕尺寸）
    this._unsubTick = stageManager.onTick((dt) => {
      this._scene3D?.update(dt, this.particles, this._sm.camera.position);
      this.particles.update(dt);
      for (const entry of this._cards.values()) entry.object.updateGlow(dt);
      for (const unit of this._units.values()) {
        unit.update(dt);
        let fwd = this._sm.camera.localToWorld(new THREE.Vector3(0, 0, 1));
        fwd.sub(this._sm.camera.position).normalize();
        unit.faceCamera(fwd); // 立牌形 billboard：斜视下立牌 yaw 朝向相机
        // 立牌光照交互：火把光衰+闪烁+纵深压暗的假采样染色（闪红窗口内不覆盖）
        if (this._scene3D) unit.applyLightTint(this._scene3D.sampleStandeeTint(unit.position, this._tintScratch));
      }
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
      this.uiScene.add(pile);
      this.picker.addPickable(`pile:${key}`, pile, { kind: 'pile', space: 'ui' });
      this.animator.register(`pile:${key}`, pile);
    }

    this._buttons = {};
    for (const [key, pos] of Object.entries(BUTTON_POSITIONS)) {
      const btn = new CardObject({
        uniqueID: `btn:${key}`, cardWidth: BUTTON_SIZE.w, cardHeight: BUTTON_SIZE.h,
        bakeFace: this._bakeButtonFace.bind(this),
      });
      btn.position.set(pos.x, pos.y, 0);
      btn.setCard({ label: '—', enabled: false });
      this.uiScene.add(btn);
      this.picker.addPickable(`btn:${key}`, btn, { kind: 'button', space: 'ui' });
      this._buttons[key] = btn;
    }
    this._buttonSigs = {};
    this._swapMode = false; // 换卡模式：点换卡按钮进入，手牌高亮，点一张手牌换出

    // 选目标瞄准箭头（杀戮尖塔式）：UI pass 覆盖层，指针追随物，不进队列/注册表
    this._arrow = new TargetingArrowObject();
    this._arrow.position.z = ARROW_Z;
    this.uiScene.add(this._arrow);

    // 玩家资源显示（手牌栏上方）：AP 黄点 / 魏启 蓝点，耗尽点变灰常驻
    this._resources = {
      ap: new ResourcePipsObject({ name: 'AP', color: 0xf0c040, bakeLabel: this._bakeLabel }),
      mana: new ResourcePipsObject({ name: '魏启', color: 0x4a8fe8, bakeLabel: this._bakeLabel }),
    };
    this._resources.ap.position.set(0, -14.5, 6);
    this._resources.mana.position.set(0, -18, 6);
    this.uiScene.add(this._resources.ap);
    this.uiScene.add(this._resources.mana);

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
    this._syncButtons(proj);
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
        obj = new UnitObject({
          uniqueID: unitProj.uniqueID, side,
          standeeHeight: STANDEE_BASE_HEIGHT * unitHeightFactor(unitProj.defId, side),
          bakeLabel: this._bakeLabel,
        });
        obj._defId = unitProj.defId;
        this._units.set(unitProj.uniqueID, obj);
        this.scene.add(obj);
        this.animator.register(unitProj.uniqueID, obj);
        this.picker.addPickable(unitProj.uniqueID, obj, { kind: 'unit' });
        this._applyUnitArtTo(obj);
      }
      // 战线轴槽位：位置/缩放/z 由 scene 定义换算（假透视：近大远小、近处压远处）。
      // 死亡单位不重放 scale——否则 reconcile 会把死亡收殓补间踩回去
      const tr = slotTransform(this._sceneDef, side, index);
      obj.position.set(tr.x, tr.y, tr.z);
      obj._baseScale = tr.scale;
      if (!unitProj.isDead) obj.scale.set(tr.scale, tr.scale, 1);
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
          this.uiScene.remove(stale);
          stale.dispose();
        }
        const object = new CardObject({ uniqueID: id, cardWidth: CARD_WIDTH, cardHeight: CARD_HEIGHT, bakeFace: this._bakeFace });
        const deck = this.layout.getNamedAnchor('deck');
        object.position.set(deck.x, deck.y, 0);
        object.scale.set(0.5, 0.5, 1); // 从牌库图标大小长开（跟踪补间到锚点 scale 1），不凭空全尺寸出现
        this._cards.set(id, { object, zone });
        this.uiScene.add(object);
        this.animator.register(id, object);
        this.picker.addPickable(id, object, { kind: 'card', cardObject: object, space: 'ui' });
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
        this.uiScene.remove(entry.object);
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
        this.uiScene.remove(object);
        object.dispose();
        onDone?.();
      },
    });
  }

  _syncButtons(proj) {
    const pending = proj.pendingInput?.request ?? null;

    // 主按钮：结束回合；结算期退化为确认/选择提示
    let label = '结束回合';
    let enabled = proj.waitingPlayerInput && !pending;
    if (pending?.kind === 'confirm') { label = '确认'; enabled = true; }
    else if (pending?.kind?.startsWith('select')) {
      if ((pending.count ?? 1) > 1) { label = `确认(${this._inputSelection.length}/${pending.count})`; enabled = this._inputSelection.length === pending.count; }
      else { label = '选择目标'; enabled = false; }
    }
    this._setButtonState('main', { label, enabled });

    // 换卡模式只在自由行动窗存活：窗口关闭（结算输入/回合外）自动退出
    if (!proj.waitingPlayerInput || pending) this._swapMode = false;
    const cost = proj.swapCost;
    const canSwap = proj.waitingPlayerInput && !pending && proj.hand.length > 0
      && proj.player.actionPoints >= cost;
    this._setButtonState('swap', {
      label: '换卡', sublabel: `⚡${cost}`, enabled: canSwap, active: this._swapMode,
    });
  }

  // 按钮数据签名去抖：内容不变不重烘（牌面烘焙有 canvas 成本）
  _setButtonState(key, data) {
    const sig = JSON.stringify(data);
    if (this._buttonSigs[key] === sig) return;
    this._buttonSigs[key] = sig;
    const btn = this._buttons[key];
    btn.setCard(data);
    btn.setVisualState(data.enabled ? 'normal' : 'disabled');
  }

  _setSwapMode(on) {
    if (this._swapMode === on || !this._snapshot) return;
    this._swapMode = on;
    this._syncButtons(this._snapshot); // 激活态上按钮面
    this._layoutAndTrack();            // 手牌高亮态
  }

  // 立牌纹理补挂：缓存命中才设置，未命中等 onLoad 回调统一补
  _applyUnitArtTo(obj) {
    const img = this._unitArt?.get(obj._defId, obj.side);
    if (img && !obj.hasArt) obj.setArt(img);
  }

  _applyUnitArt() {
    for (const obj of this._units.values()) this._applyUnitArtTo(obj);
  }

  _layoutAndTrack() {
    // 保持显示状态快照中的手牌顺序（_cards 插入序≠手牌序）
    const proj = this._snapshot;
    if (!proj) return;
    const orderedHand = proj.hand.map(c => c.uniqueID).filter(id => this._cards.has(id));
    const orderedChant = proj.chant.slots.map(c => c.uniqueID).filter(id => this._cards.has(id));
    // 瞄准中的卡视作"被撑开"对象：位置不变但抬升放大、两侧排开（瞄准时不响应 hover 切换）
    const spreadId = this._aiming?.id ?? this._hoveredCardId;
    this.layout.layoutHand('hand', orderedHand, spreadId);
    this.layout.layoutColumn('chant', orderedChant);
    for (const [id, entry] of this._cards) {
      // 停留展示位等离场节拍的卡不回跟踪（防"飞回手牌→再被拉进坟堆"的折返）
      const st = this.animator.getState(id);
      if (st === ANIMATOR_STATES.IDLE && !this._heldCards.has(id)) this.animator.enterTracking(id);
      // 视觉态优先级：瞄准中（高亮）> 结算期选卡（候选高亮/其余压灰）> 换卡模式（可换手牌高亮）
      // > 手牌可发动性（不可发动淡灰白）> normal
      const pending = proj.pendingInput?.request;
      if (this._aiming?.id === id) {
        entry.object.setVisualState('highlighted');
      } else if (pending?.candidates) {
        entry.object.setVisualState(pending.candidates.includes(id) ? 'highlighted' : 'disabled');
      } else if (this._swapMode && entry.zone === 'hand') {
        entry.object.setVisualState(this.bridge.intents.canSwapCard(id) ? 'highlighted' : 'disabled');
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
      this.particles.spawn(target.position.x, target.position.y, { count: 22, color: 0x999999, speed: 16, ttl: 0.8, z: target.position.z });
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
      this.particles.spawn(target.position.x, target.position.y, { count: 10, speed: 10, ttl: 0.6, z: target.position.z ?? 0, ...fx });
      if (type === EventNames.ANIM_HEAL && (payload?.healed ?? 0) > 0) {
        const p = this._unitToUI(target, (Math.random() - 0.5) * 3, 4);
        this.particles.spawnText(
          p.x, p.y,
          `+${payload.healed}`,
          {
            fontSize: Math.min(30 + payload.healed * 2, 72), color: '#4ade80',
            vx: (Math.random() - 0.5) * 6, vy: 14,
            gravity: 0, drag: 1.2, ttl: 1.0, scalePop: 0.4,
            space: 'ui',
          },
        );
      }
    }
    if (!target) { finish(); return; }
    // 通用脉冲：放大→平滑回程→finish（不硬切 scale）。单位带槽位 baseScale（假透视），
    // 脉冲围绕 baseScale 起伏；还在桌上的卡重回跟踪（补间回锚点，含悬浮 scale）
    const targetId = target.uniqueID;
    const bs = target._baseScale ?? 1;
    this.animator.animate(targetId, { scale: bs * 1.15 }, {
      durationMs: 150,
      onComplete: () => {
        if (this._cards.has(targetId)) {
          this.animator.enterTracking(targetId);
          finish();
        } else {
          this.animator.animate(targetId, { scale: bs }, { durationMs: 120, onComplete: finish });
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

  // 单位世界坐标（含偏移）→ UI 世界坐标：伤害/治疗读数文本走 uiScene 前景层
  // （恒定屏幕尺寸、不被场景遮挡）。桥接路径：世界相机投影到屏幕像素 →
  // UI 相机反投影到 z=70 平面（spawnText 缺省 z=70，恰落在该平面上，无深度差）。
  // 单测 StageManager 无视口尺寸（viewWidth=0）时退化为世界坐标直用，保数值有限。
  _unitToUI(unit, dx = 0, dy = 0) {
    const sm = this._sm;
    const wx = unit.position.x + dx;
    const wy = unit.position.y + dy;
    if (!sm.viewSize.width) return { x: wx, y: wy };
    const px = sm.worldToScreen(wx, wy, unit.position.z, sm.camera);
    return sm.screenToWorld(px.x, px.y, 70, sm.uiCamera);
  }

  // 受伤演出：按伤害落点分流——
  //   生命值受伤（dealt>0）：闪红 + 红色火花 + 伤害数字 + 短促击退（节拍阻塞）；
  //   护盾吸收（absorbed>0）：蓝色火花 + 灰色吸收数字（较小、偏移开）；
  //     吸穿护盾的最后一击（显示盾量 - 吸收 ≤ 0）追加破碎粒子——破碎只由伤害驱动，
  //     自然消失（回合开始清零）只是保护框随 sync 静默隐去；
  //   无生命值伤害不翻红不击退（用户定），节拍短停即收。
  // HP/盾量数字的显示状态变化在本节拍后的 sync 才应用——先演后变
  _damageHit(unit, payload, finish) {
    const dealt = payload?.dealt ?? 0;
    const absorbed = payload?.shieldAbsorbed ?? 0;

    if (absorbed > 0) {
      // 点粒子是真 3D：z 必须取单位实际深度（缺省 z=70 是旧 2D 特效层，斜相机下投影错位）
      this.particles.spawn(unit.position.x, unit.position.y + 2, {
        count: 12, color: 0x7fb8ff, speed: 16, ttl: 0.6, z: unit.position.z,
      });
      const p = this._unitToUI(unit, 2.5 + (Math.random() - 0.5) * 2, 3);
      this.particles.spawnText(
        p.x, p.y,
        `-${absorbed}`,
        {
          fontSize: Math.min(26 + absorbed * 1.6, 48), color: '#8fb3d9',
          vx: (Math.random() - 0.5) * 8, vy: 16 + Math.random() * 6,
          gravity: -50, ttl: 0.85, scalePop: 0.3,
          space: 'ui',
        },
      );
      if (this._displayShieldOf(unit.uniqueID) - absorbed <= 0) this._shieldBreakFx(unit);
    }

    if (dealt > 0) {
      unit.flash?.(0xff2222);
      this.particles.spawn(unit.position.x, unit.position.y + 2, {
        count: 16, color: 0xff5533, speed: 22, z: unit.position.z,
      });
      // 伤害数字：UI 前景层读数（恒定屏幕尺寸、不被场景遮挡），从受伤源向上迸射、受重力下坠
      const p = this._unitToUI(unit, (Math.random() - 0.5) * 3, 4 + Math.random() * 1.5);
      this.particles.spawnText(
        p.x, p.y,
        `-${dealt}`,
        {
          fontSize: Math.min(34 + dealt * 2.4, 96), color: '#ff4d4d',
          vx: (Math.random() - 0.5) * 10, vy: 22 + Math.random() * 8,
          gravity: -65, ttl: Math.min(0.85 + dealt * 0.02, 1.3), scalePop: 0.5,
          space: 'ui',
        },
      );
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
      return;
    }
    // 全吸收：无击退链，短停一拍让吸收数字可读后收节拍
    this.animator.animate(unit.uniqueID, {}, { delayMs: 220, onComplete: finish });
  }

  // 显示状态（上一 sync 快照）里某单位的盾量——判断本击是否吸穿护盾的依据
  _displayShieldOf(unitId) {
    const p = this._snapshot;
    if (!p) return 0;
    if (p.player?.uniqueID === unitId) return p.player.shield ?? 0;
    return [...(p.allies ?? []), ...(p.enemies ?? [])]
      .find(u => u.uniqueID === unitId)?.shield ?? 0;
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

  // 护盾破碎演出：蓝白碎粒自血条处迸射——只在伤害节拍里被驱动（吸收击穿护盾的
  // 最后一击），保护框本身随后续 sync 静默隐去；自然消失（回合清零）无碎粒。
  // 碎粒是真 3D（传单位实际 z）
  _shieldBreakFx(unit) {
    const s = unit._baseScale ?? 1;
    const y = unit.position.y + 3.4 * s; // hpBar 在脚底上方 3.4（local）
    const z = unit.position.z;
    this.particles.spawn(unit.position.x, y, {
      count: 24, color: 0x7fb8ff, speed: 15, ttl: 0.75, gravity: -30, size: 1.0, z,
    });
    this.particles.spawn(unit.position.x, y, {
      count: 10, color: 0xd8eaff, speed: 9, ttl: 0.55, gravity: -20, size: 0.7, z,
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

    this.uiScene.add(group);
    this.picker.addPickable('viewer:bg', bg, { kind: 'viewer', space: 'ui' });
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
    this.uiScene.remove(group);
    this._viewer = null;
  }

  // ========== 指针输入（调用方传屏幕像素坐标） ==========

  handlePointerMove(x, y) {
    if (this._viewer) return;
    this.scene.updateMatrixWorld(true);
    this.uiScene.updateMatrixWorld(true);
    // 瞄准模式：卡留手牌不动，箭头从卡牌延伸到指针；掠过存活敌人 → 高亮 + 箭头变色
    if (this._aiming) {
      const obj = this._cards.get(this._aiming.id)?.object;
      if (!obj) { this._cancelAiming(); return; } // 卡在瞄准中离场（异常路径）：收尾
      const world = this._worldAt(x, y, ARROW_Z);
      this._arrow.update(obj.position, world);
      const hit = this.picker.pick(x, y, { kinds: ['unit'] });
      const targetId = this._targetableEnemyId(hit);
      this._setDragTarget(targetId);
      this._arrow.setTargetValid(!!targetId);
      return;
    }
    if (this._dragging) {
      const world = this._worldAt(x, y, 30); // 与拖拽卡同深（z=30），防透视视差
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
    this.uiScene.updateMatrixWorld(true);
    const hit = this.picker.pick(x, y);
    const proj = this._snapshot;
    // 换卡模式下点手牌是"点按换出"，不进入拖拽
    if (hit.kind === 'card' && !proj?.pendingInput && !this._swapMode) {
      if (this.bridge.intents.canPlayCard(hit.id)) {
        // 按投影 targetMode 分流：选目标卡进瞄准（卡留手牌），免目标卡旧式拖拽（卡随指针）
        const targetMode = proj?.hand.find(c => c.uniqueID === hit.id)?.targetMode ?? 'none';
        if (targetMode === 'enemy') {
          this._aiming = { id: hit.id };
          this._arrow.show(this._cards.get(hit.id).object.position);
          this._arrow.setTargetValid(false);
          this._layoutAndTrack(); // 瞄准卡高亮 + 撑开两侧
        } else {
          this._dragging = { id: hit.id, moved: false };
          this.animator.enterDragging(hit.id);
        }
      } else if (this._cards.get(hit.id)?.zone === 'chant' && this.bridge.intents.canStopChant(hit.id)) {
        this._pressChant = { id: hit.id }; // 咏唱卡点按候选（up 在同一卡上 = 停止咏唱）
      }
    }
  }

  handlePointerUp(x, y) {
    this.scene.updateMatrixWorld(true);
    this.uiScene.updateMatrixWorld(true);
    if (this._viewer) {
      this._closeViewer();
      return;
    }
    const proj = this._snapshot;
    const pending = proj?.pendingInput?.request ?? null;

    // 瞄准松手：指针在存活敌人身上 → 指定目标打出；否则取消（卡本就在锚点，只清状态）
    if (this._aiming) {
      const { id } = this._aiming;
      const hit = this.picker.pick(x, y, { kinds: ['unit'] });
      const targetId = this._targetableEnemyId(hit);
      this._cancelAiming();
      if (targetId) this.bridge.intents.playCard(id, targetId);
      return;
    }

    if (this._dragging) {
      const { id } = this._dragging;
      this._dragging = null;
      this._setDragTarget(null);
      const world = this._worldAt(x, y, 30); // 出牌线判定与拖拽同深
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
    if (hit.kind === 'button' && hit.id === 'btn:swap') {
      // 换卡按钮：模式开关（再点一次取消）；可用性以按钮面当前状态为准
      if (this._swapMode) this._setSwapMode(false);
      else if (this._buttons.swap.cardData?.enabled) this._setSwapMode(true);
      return;
    }
    if (hit.kind === 'card' && this._swapMode) {
      // 换卡模式点手牌：换出（弃 1 抽 1）；不可换的卡（咏唱/费用不足）保持模式
      if (this.bridge.intents.canSwapCard(hit.id)) {
        this.bridge.intents.swapCard(hit.id);
        this._setSwapMode(false);
      }
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

  _worldAt(x, y, planeZ = 0) {
    // 射线与指定 z 平面求交（拖拽出牌用 planeZ=30 与卡面同深，避免透视视差）；
    // 卡牌在 UI pass → 必须用 uiCamera 反投影，否则世界相机的斜视会把落点算歪
    return this.picker._sm.screenToWorld(x, y, planeZ, this.picker._sm.uiCamera);
  }

  // 瞄准收尾：清状态 + 藏箭头 + 重排手牌（去高亮/收撑开）。卡全程未离锚点，无需归位
  _cancelAiming() {
    this._aiming = null;
    this._arrow.hide();
    this._setDragTarget(null);
    this._layoutAndTrack();
    this._updatePendingPips();
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

  _bakeButtonFace(data) {
    // 浏览器：圆角风格化按钮（10px/wu ↔ 15x6 世界，与牌面同约定）；
    // 单测注入的 fake bakeLabel 直接透传
    if (typeof document === 'undefined') return this._bakeLabel(data.label);
    return bakeButtonFace(data, { width: BUTTON_SIZE.w * 10, height: BUTTON_SIZE.h * 10, scale: 2 });
  }

  _setHoveredCard(uniqueID) {
    if (this._hoveredCardId === uniqueID) return;
    this._hoveredCardId = uniqueID;
    this._layoutAndTrack();
    this._updatePendingPips();
  }

  // 悬浮/瞄准手牌 → 按其 cost 高亮"即将消耗"的资源点（脉动）；咏唱卡费用已付，不高亮。
  // 拖拽/瞄准中 hover 保持（picker 不重算），出牌/离场后由 reconcile 清除
  _updatePendingPips() {
    let ap = 0;
    let mana = 0;
    const pendingId = this._aiming?.id ?? this._hoveredCardId;
    if (pendingId != null) {
      const card = (this._snapshot?.hand ?? []).find(c => c.uniqueID === pendingId);
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
    this._composer?.dispose();
    this._composer = null;
    this.composeScene = null;
    this.composeResize = null;
    this._unsubTick?.();
    this._unsubs.forEach(off => off?.());
    this._unsubs = [];
    this._arrow.dispose();
    this._resources.ap.dispose();
    this._resources.mana.dispose();
  }
}
