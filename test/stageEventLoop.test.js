import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import * as THREE from 'three';
import Player from '../src/core/state/player.js';
import { createRunState } from '../src/core/state/runState.js';
import { createSkillRuntime } from '../src/core/state/skillRuntime.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { createBridge, EventNames } from '../src/bridge/index.js';
import { StageAnimator } from '../src/stage/animator/StageAnimator.js';

// Stage 事件闭环契约测试：frontendBus ANIM_* → StageAnimator → finish 回调 → 队列推进。
// BattleStage 的正式视觉导演逻辑落地前，用 fake Stage 验证这条链路：
// 每个动画事件都由 StageAnimator 播放，完成（onComplete）后才回 ANIMATION_INSTRUCTION_FINISHED。

// 手动完成的假 tween：记录 onComplete，由测试逐条放行
function manualTween() {
  const pending = [];
  const tween = (object3D, to, { onComplete } = {}) => {
    if (to.x != null) object3D.position.x = to.x;
    if (to.y != null) object3D.position.y = to.y;
    const handle = { kill() { const i = pending.indexOf(done); if (i >= 0) pending.splice(i, 1); } };
    const done = () => onComplete?.();
    pending.push(done);
    return handle;
  };
  tween.completeNext = () => { const d = pending.shift(); d?.(); };
  tween.pendingCount = () => pending.length;
  return tween;
}

function makeBridge() {
  const runState = createRunState({
    player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }),
  });
  runState.player.deck = ['punch', 'punch', 'punch', 'punch'].map(d => createSkillRuntime(d));
  return createBridge({
    runState,
    enemies: [getEnemyDefinition('slime').createUnit()],
    seed: 1,
  });
}

// fake Stage：监听全部 ANIM_*，用 StageAnimator 播放，完成后回 finish
function attachFakeStage(bridge, tween) {
  const animator = new StageAnimator({ tween });
  const received = [];
  const objects = new Map();
  const objectFor = (payload) => {
    const key = payload?.uniqueID || payload?.unitId || 'table';
    if (!objects.has(key)) {
      const obj = new THREE.Group();
      objects.set(key, obj);
      animator.register(key, obj);
    }
    return key;
  };
  bridge.frontendBus.on('*', (type, payload) => {
    if (!type.startsWith('anim:')) return;
    received.push(type);
    const key = objectFor(payload);
    animator.animate(key, { x: 1 }, {
      onComplete: () => bridge.frontendBus.emit(EventNames.ANIMATION_INSTRUCTION_FINISHED, { id: payload._animId }),
    });
  });
  return { animator, received };
}

describe('Stage 事件闭环', () => {
  it('动画严格串行：前一条 finish 前，后一条不下发', () => {
    const bridge = makeBridge();
    const tween = manualTween();
    const { received } = attachFakeStage(bridge, tween);

    bridge.start();
    while (tween.pendingCount() > 0) tween.completeNext(); // 放干起手动画（含 state-sync 节拍）
    const base = received.length;

    bridge.intents.playCard(bridge.getProjection().hand[0].uniqueID);
    expect(received.length).toBe(base + 1); // 出牌节拍链只下发第一条（skillUsed 前的 sync）

    // 每次 finish 至多推进一条（严格串行，无并发下发）
    let after = received.length;
    tween.completeNext();
    expect(received.length).toBeLessThanOrEqual(after + 1);
    after = received.length;
    tween.completeNext();
    expect(received.length).toBeLessThanOrEqual(after + 1);
  });

  it('finish 链路驱动战斗推进：出牌动画全部完成后伤害已结算', () => {
    const bridge = makeBridge();
    const tween = manualTween();
    attachFakeStage(bridge, tween);
    bridge.start();

    // 放干起手动画
    while (tween.pendingCount() > 0) tween.completeNext();

    const slime = bridge.battle.battleState.enemies[0];
    const hpBefore = slime.hp;
    bridge.intents.playCard(bridge.getProjection().hand[0].uniqueID);

    // 动画未放行前，结算可以已经做完（Core 不等动画），但队列必须逐条消耗
    let guard = 100;
    while (tween.pendingCount() > 0 && guard-- > 0) tween.completeNext();
    expect(guard).toBeGreaterThan(0);
    expect(slime.hp).toBeLessThan(hpBefore);
  });

  it('StageAnimator 在动画期间处于 animating，完成后回 idle', () => {
    const bridge = makeBridge();
    const tween = manualTween();
    const { animator } = attachFakeStage(bridge, tween);
    bridge.start();

    const states = [];
    for (const [id] of animator._registry) states.push(animator.getState(id));
    expect(states).toContain('animating');

    while (tween.pendingCount() > 0) tween.completeNext();
    for (const [id] of animator._registry) {
      expect(animator.getState(id)).toBe('idle');
    }
  });
});
