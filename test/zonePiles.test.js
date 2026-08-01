import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import * as THREE from 'three';
import Player from '../src/core/state/player.js';
import { createRunState } from '../src/core/state/runState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { createBridge } from '../src/bridge/index.js';
import { StageManager } from '../src/stage/StageManager.js';
import { BattleStage } from '../src/stage/stages/BattleStage.js';

// 区域图标与卡流动动画：牌库/坟墓图标计数、点击查看器、
// 生成（牌库处出现）与离场（飞向坟墓图标后销毁）的状态差分驱动模型。

// 记录型手动 tween：先记录目标，放行时才应用数值并回调（模拟"动画播完到位"）
function manualTween() {
  const pending = [];
  const records = [];
  const apply = (obj, to) => {
    if (to.x != null) obj.position.x = to.x;
    if (to.y != null) obj.position.y = to.y;
    if (to.z != null) obj.position.z = to.z;
    if (to.scale != null) obj.scale.set(to.scale, to.scale, 1);
  };
  const tween = (obj, to, opts = {}) => {
    records.push({ obj, to });
    pending.push(() => { apply(obj, to); opts?.onComplete?.(); });
    return { kill() {} };
  };
  tween.records = records;
  tween.completeNext = () => pending.shift()?.();
  tween.completeAll = () => { while (pending.length) pending.shift()(); };
  return tween;
}

const fakeBake = () => ({ texture: new THREE.Texture(), hitRegions: [], width: 200, height: 270 });
const fakeBakeLabel = () => ({ texture: new THREE.Texture(), width: 100, height: 30 });
const fakeBakeIcon = () => ({ texture: new THREE.Texture(), width: 160, height: 200 });

function make(deck = ['punch', 'punch', 'punch', 'punch', 'guard', 'guard', 'guard', 'guard']) {
  const runState = createRunState({
    player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }),
  });
  runState.player.deck = deck.map(d => createSkillRuntime(d));
  const bridge = createBridge({
    runState,
    enemies: [getEnemyDefinition('slime').createUnit()],
    seed: 1,
  });
  const sm = new StageManager({ createRenderer: () => ({ render() {}, setSize() {}, dispose() {} }) });
  sm.attach({});
  sm.resize(1000, 1000);
  const tween = manualTween();
  const stage = new BattleStage({
    bridge, stageManager: sm,
    bakeFace: fakeBake, bakeLabel: fakeBakeLabel, tween,
  });
  // 替换默认 pile 的浏览器烘焙（node 无 document 时已是占位，这里显式注入便于断言）
  return { bridge, sm, stage, tween };
}

const toScreen = (wx, wy) => ({ x: (wx + 50) * 10, y: (50 - wy) * 10 });
function click(stage, worldPos) {
  const p = toScreen(...worldPos);
  stage.handlePointerDown(p.x, p.y);
  stage.handlePointerUp(p.x, p.y);
}

describe('区域图标与卡流动动画', () => {
  it('牌库/坟墓图标计数与投影一致', () => {
    const { bridge, stage } = make();
    bridge.start();
    const proj = bridge.getProjection();
    expect(stage._piles.deck.count).toBe(proj.counts.deck);
    expect(stage._piles.discard.count).toBe(0);
  });

  it('抽牌生成模型：新卡在牌库图标处出现，经跟踪飞入手牌', () => {
    const { bridge, stage, tween } = make();
    bridge.start();
    // 起手 4 张：每张都有向扇形锚点的跟踪 tween（tween 未放行时仍在牌库图标处）
    const proj = bridge.getProjection();
    for (const c of proj.hand) {
      const obj = stage._cards.get(c.uniqueID).object;
      expect(obj.position.x).toBe(76);  // 牌库图标位置
      expect(obj.position.y).toBe(-35);
    }
    tween.completeAll(); // 放行跟踪 → 飞入扇形
    const xs = proj.hand.map(c => stage._cards.get(c.uniqueID).object.position.x);
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
  });

  it('离场模型：打出的卡等自己的离场节拍才飞向坟墓，sync 后坟堆计数才+1', () => {
    const { bridge, stage, tween } = make();
    bridge.start();
    tween.completeAll();
    const first = bridge.getProjection().hand[0];
    bridge.intents.playCard(first.uniqueID);

    // 显示状态未推进（sync 排在节拍链之后）：卡仍在手牌对象集，未起飞，坟堆数字未提前+1
    expect(stage._cards.has(first.uniqueID)).toBe(true);
    expect(stage._piles.discard.count).toBe(0);
    const flightBefore = tween.records.find(r => r.obj.uniqueID === first.uniqueID && r.to.x === 76 && r.to.y === -13);
    expect(flightBefore).toBeUndefined();

    tween.completeAll(); // 发动展示 → 伤害 → 离场节拍飞行 → sync 应用
    const flight = tween.records.find(r => r.obj.uniqueID === first.uniqueID && r.to.x === 76 && r.to.y === -13);
    expect(flight).toBeTruthy();
    expect(stage._cards.has(first.uniqueID)).toBe(false);
    expect(stage.animator.getObject(first.uniqueID)).toBeNull();
    expect(stage.scene.children.includes(flight.obj)).toBe(false);
    expect(stage._piles.discard.count).toBe(1); // 飞进坟堆后数字才+1
  });

  it('点牌库图标开查看器（列出牌库全部卡），任意点击关闭', () => {
    const { bridge, stage, tween } = make();
    bridge.start();
    tween.completeAll();
    const deckCount = bridge.getProjection().counts.deck;
    expect(deckCount).toBeGreaterThan(0);

    click(stage, [76, -35]); // 牌库图标
    expect(stage._viewer).toBeTruthy();
    expect(stage._viewer.zone).toBe('deck');
    // bg + 每张卡一个对象
    expect(stage._viewer.group.children.length).toBe(1 + deckCount);

    click(stage, [-70, 40]); // 点背景任意处
    expect(stage._viewer).toBeNull();
  });

  it('查看器打开期间不响应出牌拖拽', () => {
    const { bridge, stage, tween } = make();
    bridge.start();
    tween.completeAll();
    click(stage, [76, -35]); // 开查看器
    const handBefore = bridge.getProjection().hand.length;
    const first = bridge.getProjection().hand[0];
    const obj = stage._cards.get(first.uniqueID).object;
    const p = toScreen(obj.position.x, obj.position.y);
    stage.handlePointerDown(p.x, p.y);
    expect(stage._dragging).toBeNull();
    expect(bridge.getProjection().hand.length).toBe(handBefore);
  });

  it('显示状态推进（sync 节拍应用）时查看器自动关闭（内容失效）', () => {
    const { bridge, stage, tween } = make();
    bridge.start();
    tween.completeAll();
    click(stage, [76, -35]);
    expect(stage._viewer).toBeTruthy();
    bridge.intents.endTurn(); // 状态变更 → 节拍链 → sync 应用 → reconcile 关查看器
    tween.completeAll();
    expect(stage._viewer).toBeNull();
  });
});
