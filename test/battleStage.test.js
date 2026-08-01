import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import * as THREE from 'three';
import Player from '../src/core/state/player.js';
import { createRunState } from '../src/core/state/runState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { registerSkill } from '../src/core/skills/registry.js';
import AwaitPlayerInputInstruction from '../src/core/instructions/input.js';
import { DiscardCardInstruction } from '../src/core/instructions/cards.js';
import { createBridge, EventNames } from '../src/bridge/index.js';
import { StageManager } from '../src/stage/StageManager.js';
import { BattleStage, BUTTON_POSITIONS } from '../src/stage/stages/BattleStage.js';

// BattleStage 无头联调：真 bridge + 真场景图，fake 烘焙 + 同步 tween。
// 验证 reconcile 建销、拖拽出牌、按钮结束回合、结算期点选输入 的完整链路。

registerSkill({
  id: 'askDiscardStage', name: '问询·台',
  cost: { mana: 0, actionPoint: 1 },
  use(sctx, stage) {
    if (stage === 0) {
      sctx.self._input = new AwaitPlayerInputInstruction({
        request: {
          kind: 'selectHandCard', count: 1,
          candidates: sctx.battleState.zones.hand
            .filter(c => c.uniqueID !== sctx.self.uniqueID).map(c => c.uniqueID),
        },
      });
      sctx.kernel.submitInstruction(sctx.self._input);
      return false;
    }
    const [uniqueID] = sctx.self._input.result.selection;
    sctx.self._input = null;
    sctx.kernel.submitInstruction(new DiscardCardInstruction({ uniqueID }));
    return true;
  },
});

// 同步假 tween：立即应用并同步回调
function instantTween(object3D, to, { onComplete } = {}) {
  if (to.x != null) object3D.position.x = to.x;
  if (to.y != null) object3D.position.y = to.y;
  if (to.z != null) object3D.position.z = to.z;
  if (to.scale != null) object3D.scale.set(to.scale, to.scale, 1);
  onComplete?.();
  return { kill() {} };
}

const fakeBake = () => ({ texture: new THREE.Texture(), hitRegions: [], width: 200, height: 270 });
const fakeBakeLabel = () => ({ texture: new THREE.Texture(), width: 100, height: 30 });

function make(deck = ['punch', 'punch', 'punch', 'punch'], enemyCount = 1) {
  const runState = createRunState({
    player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }),
  });
  runState.player.deck = deck.map(d => createSkillRuntime(d));
  const bridge = createBridge({
    runState,
    enemies: Array.from({ length: enemyCount }, () => getEnemyDefinition('slime').createUnit()),
    seed: 1,
  });
  const sm = new StageManager({ createRenderer: () => ({ render() {}, setSize() {}, dispose() {} }) });
  sm.attach({});
  sm.resize(1000, 1000);
  const stage = new BattleStage({
    bridge, stageManager: sm,
    bakeFace: fakeBake, bakeLabel: fakeBakeLabel, tween: instantTween,
  });
  return { bridge, sm, stage };
}

// 世界 → 屏幕像素：走相机投影（透视下 z≠0 的点投影位置不同，必须带真实 z）。
// 双相机：单位在世界 pass 用世界相机（斜视）；卡牌/按钮/图标在 UI pass 用 uiCamera（正直）。
const toScreen = (stage, wx, wy, wz = 0) => stage._sm.worldToScreen(wx, wy, wz);
const toScreenUI = (stage, wx, wy, wz = 0) => stage._sm.worldToScreen(wx, wy, wz, stage._sm.uiCamera);

// 模拟一次完整拖拽：从 (fromWorld) 拖到 (toWorld) 松手（两端均为 UI 空间坐标）
function drag(stage, fromWorld, toWorld) {
  const a = toScreenUI(stage, ...fromWorld);
  const b = toScreenUI(stage, ...toWorld);
  stage.handlePointerDown(a.x, a.y);
  stage.handlePointerMove(b.x, b.y);
  stage.handlePointerUp(b.x, b.y);
}

function click(stage, worldPos) {
  const p = toScreenUI(stage, ...worldPos);
  stage.handlePointerDown(p.x, p.y);
  stage.handlePointerUp(p.x, p.y);
}

// 推进资源点动画至收敛（颜色渐变/弹跳衰减完成）
function settlePips(stage, seconds = 1.5) {
  const steps = Math.ceil(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    stage._resources.ap.update(0.05);
    stage._resources.mana.update(0.05);
  }
}

describe('BattleStage 无头联调', () => {
  it('start 后按投影建场景：手牌对象 + 单位对象 + 锚点归位', () => {
    const { bridge, stage } = make();
    bridge.start();

    const proj = bridge.getProjection();
    expect(stage._cards.size).toBe(proj.hand.length);
    expect(stage._units.size).toBe(2); // player + slime

    // 手牌已跟踪到扇形锚点：4 张牌整体居中、互不重叠
    const xs = proj.hand.map(c => stage._cards.get(c.uniqueID).object.position.x).sort((a, b) => a - b);
    expect(xs[0] + xs[3]).toBeCloseTo(0);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it('免目标卡（格挡）旧式拖拽：拖过出牌线松手 = 打出，卡随指针走', () => {
    const { bridge, stage } = make(['guard', 'punch', 'punch', 'punch']);
    bridge.start();
    const player = bridge.battle.ctx.player;
    const guard = bridge.getProjection().hand.find(c => c.defId === 'guard');
    expect(guard.targetMode).toBe('none'); // 投影带交互声明
    const cardPos = stage._cards.get(guard.uniqueID).object.position;

    // 拖拽中：卡随指针走（旧 behavior）
    const a = toScreenUI(stage, cardPos.x, cardPos.y, cardPos.z);
    const b = toScreenUI(stage, 0, 0);
    stage.handlePointerDown(a.x, a.y);
    stage.handlePointerMove(b.x, b.y);
    expect(stage._dragging?.id).toBe(guard.uniqueID);
    expect(stage._aiming).toBeNull();
    expect(stage._arrow.visible).toBe(false);
    expect(stage._cards.get(guard.uniqueID).object.position.y).toBeGreaterThan(-5); // 已离开手牌扇区（≈0，z=30 平面反投影略有透视偏移）

    stage.handlePointerUp(b.x, b.y); // 过线松手 → 打出
    expect(player.shield).toBe(5);
    expect(stage._cards.has(guard.uniqueID)).toBe(false);
    expect(stage._cards.size).toBe(bridge.getProjection().hand.length);
  });

  it('选目标卡（冲拳）瞄准：卡留手牌高亮，松手不在敌人身上 = 取消（过线也不打出）', () => {
    const { bridge, stage } = make();
    bridge.start();
    const slime = bridge.battle.battleState.enemies[0];
    const firstCard = bridge.getProjection().hand[0];
    expect(firstCard.targetMode).toBe('enemy');
    const obj = stage._cards.get(firstCard.uniqueID).object;
    const home = obj.position.clone();

    const a = toScreenUI(stage, home.x, home.y, home.z);
    const b = toScreenUI(stage, 0, 0); // 桌面中央（y=0 > 出牌线，但不在敌人身上）
    stage.handlePointerDown(a.x, a.y);
    stage.handlePointerMove(b.x, b.y);

    // 瞄准中：卡不随指针走（留在手牌区），箭头显示且未锁定目标
    expect(stage._aiming?.id).toBe(firstCard.uniqueID);
    expect(stage._dragging).toBeNull();
    expect(stage._arrow.visible).toBe(true);
    expect(stage._arrow.targetValid).toBe(false);
    expect(obj.position.y).toBeLessThan(-25); // 仍在手牌扇区（home.y≈-40，撑开抬升有限）
    expect(obj.visualState).toBe('highlighted');

    stage.handlePointerUp(b.x, b.y); // 松手不在敌人身上 → 取消
    expect(slime.hp).toBe(slime.maxHp);
    expect(stage._cards.has(firstCard.uniqueID)).toBe(true);
    expect(stage._arrow.visible).toBe(false);
    expect(stage._aiming).toBeNull();
    // 取消后回到扇形锚点（去高亮、收撑开）
    expect(obj.position.x).toBeCloseTo(home.x);
    expect(obj.position.y).toBeCloseTo(home.y);
    expect(obj.visualState).toBe('normal');
  });

  it('拖回手牌区松手 = 取消：牌回锚点，不掉血', () => {
    const { bridge, stage } = make();
    bridge.start();
    const slime = bridge.battle.battleState.enemies[0];
    const hpBefore = slime.hp;
    const firstCard = bridge.getProjection().hand[0];
    const home = stage._cards.get(firstCard.uniqueID).object.position.clone();

    drag(stage, [home.x, home.y], [0, -45]); // 拖到下方又松手（y=-45 < -20）

    expect(slime.hp).toBe(hpBefore);
    const pos = stage._cards.get(firstCard.uniqueID).object.position;
    expect(pos.x).toBeCloseTo(home.x);
    expect(pos.y).toBeCloseTo(home.y);
  });

  it('瞄准到指定敌人身上：箭头锁定变色 + 目标高亮，伤害落在该敌人', () => {
    const { bridge, stage } = make(['punch', 'punch', 'punch', 'punch'], 2);
    bridge.start();
    const [e0, e1] = bridge.battle.battleState.enemies;
    const first = bridge.getProjection().hand[0];
    const obj = stage._cards.get(first.uniqueID).object;
    const cardPos = obj.position;

    // 拖到第二个敌人身上（槽位由 scene 战线轴换算，读对象实际位置而非硬编码）
    const e1Pos = stage._units.get(e1.uniqueID).position;
    const a = toScreenUI(stage, cardPos.x, cardPos.y, cardPos.z);
    const b = toScreen(stage, e1Pos.x, e1Pos.y + 4, e1Pos.z); // 立牌下半身（组原点在脚底锚点；单位在世界空间）
    stage.handlePointerDown(a.x, a.y);
    stage.handlePointerMove(b.x, b.y);

    // 掠过 → 只有 e1 高亮，箭头锁定变色；卡本体仍留在手牌区
    expect(stage._dragTargetId).toBe(e1.uniqueID);
    expect(stage._units.get(e1.uniqueID).highlighted).toBe(true);
    expect(stage._units.get(e0.uniqueID).highlighted).toBe(false);
    expect(stage._arrow.visible).toBe(true);
    expect(stage._arrow.targetValid).toBe(true);
    expect(obj.position.y).toBeLessThan(-25);

    stage.handlePointerUp(b.x, b.y);
    expect(e1.hp).toBeLessThan(e1.maxHp);  // 指定目标受伤
    expect(e0.hp).toBe(e0.maxHp);          // 首个敌人未受牵连
    expect(stage._units.get(e1.uniqueID).highlighted).toBe(false); // 高亮已清
    expect(stage._arrow.visible).toBe(false);
  });
  it('点主按钮 = 结束回合：敌人行动，玩家掉血', () => {
    const { bridge, stage } = make();
    bridge.start();
    const hpBefore = bridge.battle.ctx.player.hp;
    click(stage, [BUTTON_POSITIONS.main.x, BUTTON_POSITIONS.main.y]);
    expect(bridge.battle.ctx.player.hp).toBeLessThan(hpBefore);
  });

  it('换卡按钮：进模式手牌高亮 → 点手牌换出（弃1抽1，费用递增）', () => {
    // 牌库需多于初始抽牌数，否则换牌弃牌会立刻被洗回牌库
    const { bridge, stage } = make(['punch', 'punch', 'punch', 'punch', 'punch', 'punch']);
    bridge.start();
    const proj0 = bridge.getProjection();
    expect(proj0.swapCost).toBe(0);
    // 换卡按钮初始可用（自由行动窗 + 手牌非空 + 费用够）
    expect(stage._buttons.swap.cardData).toMatchObject({ label: '换卡', enabled: true });

    // 点换卡按钮进入换卡模式：按钮激活态、手牌全部高亮
    click(stage, [BUTTON_POSITIONS.swap.x, BUTTON_POSITIONS.swap.y]);
    expect(stage._swapMode).toBe(true);
    expect(stage._buttons.swap.cardData.active).toBe(true);
    for (const c of bridge.getProjection().hand) {
      expect(stage._cards.get(c.uniqueID).object.visualState).toBe('highlighted');
    }

    // 点一张手牌换出：手牌数不变、弃牌+1、换卡费用递增、模式退出
    const target = bridge.getProjection().hand[0];
    const handBefore = bridge.getProjection().hand.length;
    const discardBefore = bridge.getProjection().counts.discard;
    const tPos = stage._cards.get(target.uniqueID).object.position;
    click(stage, [tPos.x, tPos.y, tPos.z]);

    const proj1 = bridge.getProjection();
    expect(stage._swapMode).toBe(false);
    expect(proj1.hand.length).toBe(handBefore);          // 抽回 1 张
    expect(proj1.counts.discard).toBe(discardBefore + 1); // 换出的牌进弃牌堆
    expect(proj1.hand.some(c => c.uniqueID === target.uniqueID)).toBe(false);
    expect(proj1.swapCost).toBe(1);
    // 退出模式后手牌恢复可发动性着色（不再是换卡高亮）
    for (const c of proj1.hand) {
      expect(stage._cards.get(c.uniqueID).object.visualState).not.toBe('highlighted');
    }
  });

  it('换卡模式可再点按钮取消；换卡模式下点手牌不会误触发拖拽', () => {
    const { bridge, stage } = make();
    bridge.start();
    click(stage, [BUTTON_POSITIONS.swap.x, BUTTON_POSITIONS.swap.y]);
    expect(stage._swapMode).toBe(true);

    // 模式下按住手牌移动：不构成拖拽（down 被模式拦截）
    const card = bridge.getProjection().hand[0];
    const cPos = stage._cards.get(card.uniqueID).object.position;
    const a = toScreen(stage, cPos.x, cPos.y, cPos.z);
    stage.handlePointerDown(a.x, a.y);
    expect(stage._dragging).toBeNull();
    expect(stage._aiming).toBeNull();
    stage.handlePointerUp(a.x, a.y); // 点按 = 换出

    // 再进模式 → 再点按钮取消
    click(stage, [BUTTON_POSITIONS.swap.x, BUTTON_POSITIONS.swap.y]);
    expect(stage._swapMode).toBe(true);
    click(stage, [BUTTON_POSITIONS.swap.x, BUTTON_POSITIONS.swap.y]);
    expect(stage._swapMode).toBe(false);
    expect(stage._buttons.swap.cardData.active).toBe(false);
  });

  it('结算期选卡输入：候选高亮，点选候选牌即应答', () => {
    const { bridge, stage } = make(['askDiscardStage', 'punch', 'punch', 'punch']);
    bridge.start();
    const ask = bridge.getProjection().hand.find(c => c.defId === 'askDiscardStage');
    const askPos = stage._cards.get(ask.uniqueID).object.position;
    drag(stage, [askPos.x, askPos.y, askPos.z], [0, 0]); // 打出问询

    const proj = bridge.getProjection();
    expect(proj.pendingInput?.request.kind).toBe('selectHandCard');
    const candidateId = proj.pendingInput.request.candidates[0];
    expect(stage._cards.get(candidateId).object.visualState).toBe('highlighted');

    const discardBefore = proj.counts.discard;
    const cPos = stage._cards.get(candidateId).object.position;
    click(stage, [cPos.x, cPos.y, cPos.z]); // 点选候选牌

    expect(bridge.getProjection().pendingInput).toBeNull();
    // +2：候选牌弃掉 + 问询卡本身在 stage 2 收尾进弃牌堆
    expect(bridge.getProjection().counts.discard).toBe(discardBefore + 2);
  });

  it('hover 手牌触发扇形撑开（布局重排）', () => {
    const { bridge, stage } = make();
    bridge.start();
    const hand = bridge.getProjection().hand;
    const mid = hand[1];
    const before = stage._cards.get(mid.uniqueID).object.scale.x;

    const pos = stage._cards.get(mid.uniqueID).object.position;
    const p = toScreen(stage, pos.x, pos.y, pos.z);
    stage.handlePointerMove(p.x, p.y);

    expect(stage._hoveredCardId).toBe(mid.uniqueID);
    expect(stage._cards.get(mid.uniqueID).object.scale.x).toBeGreaterThan(before - 1e-6);
    expect(stage._cards.get(mid.uniqueID).object.scale.x).toBeCloseTo(1.08);
  });

  it('可发动性着色：AP 充足 normal，AP 耗尽后淡灰白 disabled', () => {
    const { bridge, stage } = make();
    bridge.start();
    const hand = bridge.getProjection().hand;
    expect(stage._cards.get(hand[0].uniqueID).object.visualState).toBe('normal');

    // 3 AP 打 3 张冲拳，剩下的牌 AP 不足 → 不可发动
    for (let i = 0; i < 3; i++) bridge.intents.playCard(hand[i].uniqueID);
    expect(bridge.getProjection().player.actionPoints).toBe(0);
    expect(stage._cards.get(hand[3].uniqueID).object.visualState).toBe('disabled');
  });

  it('咏唱卡：左侧纵列锚点 + z 低于手牌 + 激活边缘流光', () => {
    const { bridge, stage } = make(['focusChant', 'punch', 'punch', 'punch']);
    bridge.start();
    const chant = bridge.getProjection().hand.find(c => c.defId === 'focusChant');
    bridge.intents.playCard(chant.uniqueID);

    const entry = stage._cards.get(chant.uniqueID);
    expect(entry.zone).toBe('chant');
    const anchor = stage.layout.getAnchor(chant.uniqueID);
    expect(anchor.x).toBe(-74);          // 屏幕左侧固定列
    expect(anchor.y).toBe(32);           // 列顶
    expect(anchor.z).toBeLessThan(10);   // z 区间低于手牌

    // 已激活 → 边缘流光开启，且随帧推进
    expect(entry.object.hasActiveGlow).toBe(true);
    const dot = entry.object._glowDot;
    const p0 = { x: dot.position.x, y: dot.position.y };
    entry.object.updateGlow(0.4);
    expect(dot.position.x !== p0.x || dot.position.y !== p0.y).toBe(true);

    // 停止咏唱 → 卡离场（流光随对象销毁）
    bridge.intents.stopChant(chant.uniqueID);
    expect(stage._cards.has(chant.uniqueID)).toBe(false);
  });

  it('资源点状显示：AP/魏启 数字+横排点，消耗后耗尽点变灰常驻', () => {
    const { bridge, stage } = make();
    bridge.start();
    // 开局 3/3：各 3 点全亮（黄/蓝）
    expect(stage._resources.ap.pipCount).toBe(3);
    expect(stage._resources.mana.pipCount).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(stage._resources.ap.pipColor(i)).toBe(0xf0c040);
      expect(stage._resources.mana.pipColor(i)).toBe(0x4a8fe8);
    }

    bridge.intents.playCard(bridge.getProjection().hand[0].uniqueID); // 冲拳 -1AP
    // AP 2/3：消耗瞬间第 3 点触发弹跳动效，颜色经 update 渐变为灰（不消失）
    expect(stage._resources.ap.pipCount).toBe(3);
    expect(stage._resources.ap._pips[2].userData.pop).toBeGreaterThan(0);
    settlePips(stage);
    expect(stage._resources.ap.pipColor(0)).toBe(0xf0c040);
    expect(stage._resources.ap.pipColor(1)).toBe(0xf0c040);
    expect(stage._resources.ap.pipColor(2)).toBe(0x555555);
    // 弹跳随帧衰减回 1
    expect(stage._resources.ap._pips[2].scale.x).toBe(1);
    // 魏启未消耗：仍全蓝
    expect(stage._resources.mana.pipColor(2)).toBe(0x4a8fe8);
  });

  it('悬浮卡牌：按 cost 高亮即将消耗的资源点（脉动），离开平滑恢复', () => {
    const { bridge, stage } = make();
    bridge.start();
    const punch = bridge.getProjection().hand[0]; // 冲拳 cost: 1AP 0魏启

    bridge.frontendBus.emit(EventNames.CARD_HOVER, { uniqueID: punch.uniqueID });
    // AP 3/3 悬浮 1AP 卡 → 末尾 1 点高亮；魏启 cost 0 → 无高亮
    expect(stage._resources.ap.isPending(2)).toBe(true);
    expect(stage._resources.ap.isPending(1)).toBe(false);
    expect(stage._resources.mana.isPending(2)).toBe(false);

    // 高亮点目标色脉动 → 偏离资源基色；未高亮点保持基色
    stage._resources.ap.update(0.3);
    expect(stage._resources.ap.pipColor(2)).not.toBe(0xf0c040);
    expect(stage._resources.ap.pipColor(1)).toBe(0xf0c040);

    // 离开悬浮 → 高亮清除，颜色渐变回基色
    bridge.frontendBus.emit(EventNames.CARD_LEAVE, {});
    expect(stage._resources.ap.isPending(2)).toBe(false);
    settlePips(stage);
    expect(stage._resources.ap.pipColor(2)).toBe(0xf0c040);
  });

  it('点按咏唱卡 = 停止咏唱（卡进坟墓）；点到别处不触发', () => {
    const { bridge, stage } = make(['focusChant', 'punch', 'punch', 'punch']);
    bridge.start();
    const chant = bridge.getProjection().hand.find(c => c.defId === 'focusChant');
    bridge.intents.playCard(chant.uniqueID);
    expect(bridge.getProjection().chant.slots).toHaveLength(1);

    // 按下在咏唱卡上、松手在别处 → 不触发
    const down = toScreenUI(stage, -74, 32, 4); // 咏唱列 z≈4（UI 空间）
    const away = toScreenUI(stage, 0, -45);
    stage.handlePointerDown(down.x, down.y);
    stage.handlePointerUp(away.x, away.y);
    expect(bridge.getProjection().chant.slots).toHaveLength(1);

    // 同一卡上点按 → 停止咏唱，卡进坟墓
    click(stage, [-74, 32, 4]);
    expect(bridge.getProjection().chant.slots).toHaveLength(0);
    expect(bridge.getProjection().counts.discard).toBe(1);
  });

  it('打出 → 发动展示 → 敌人受伤 → 离场飞行：离场节拍排在效果之后', () => {
    const { bridge, stage } = make();
    bridge.start();
    const order = [];
    const [origDisplay, origDamage, origFly] = [
      stage._skillDisplay.bind(stage), stage._damageHit.bind(stage), stage._flyOut.bind(stage)];
    stage._skillDisplay = (p, f) => { order.push('display'); return origDisplay(p, f); };
    stage._damageHit = (...args) => { order.push('damage'); return origDamage(...args); };
    stage._flyOut = (...args) => { order.push('flyOut'); return origFly(...args); };

    bridge.intents.playCard(bridge.getProjection().hand[0].uniqueID); // 冲拳
    // sequencer 编排：发动节拍 → 伤害节拍 → 离场节拍（各自阻塞，instantTween 同步播完）
    expect(order).toEqual(['display', 'damage', 'flyOut']);
    expect(stage._cards.size).toBe(3);        // 打出的卡已销毁离场
    expect(stage._piles.discard.count).toBe(1); // 飞进坟堆后 sync 才 +1
  });

  it('结算期输入挂起时卡不离场；应答后打出卡与被弃卡依次离场', () => {
    const { bridge, stage } = make(['askDiscardStage', 'punch', 'punch', 'punch']);
    bridge.start();
    const ask = bridge.getProjection().hand.find(c => c.defId === 'askDiscardStage');
    bridge.intents.playCard(ask.uniqueID);

    // 结算暂停等玩家选卡：打出的卡仍在桌上（回手牌位等待），未起飞
    expect(bridge.getProjection().pendingInput).toBeTruthy();
    expect(stage._cards.has(ask.uniqueID)).toBe(true);
    expect(stage._inFlight.size).toBe(0);

    const victim = bridge.getProjection().pendingInput.request.candidates[0];
    bridge.interaction.respond([victim]);
    // 应答后：被弃卡的 cardDiscarded 节拍 + 打出卡的 cardMoved 节拍依次播完
    expect(stage._cards.has(victim)).toBe(false);
    expect(stage._cards.has(ask.uniqueID)).toBe(false);
    expect(stage._inFlight.size).toBe(0);
    expect(bridge.getProjection().counts.discard).toBe(2);
  });
});
