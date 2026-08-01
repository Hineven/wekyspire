import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { StageAnimator, ANIMATOR_STATES } from '../src/stage/animator/StageAnimator.js';
import { LayoutEngine } from '../src/stage/layout/LayoutEngine.js';

// 同步假 tween：立即应用到位的值并同步回调，返回可 kill 句柄
function fakeTween(object3D, to, { onComplete } = {}) {
  if (to.x != null) object3D.position.x = to.x;
  if (to.y != null) object3D.position.y = to.y;
  if (to.z != null) object3D.position.z = to.z;
  if (to.scale != null) object3D.scale.set(to.scale, to.scale, 1);
  if (to.rotation != null) object3D.rotation.z = to.rotation;
  const handle = { killed: false, kill() { handle.killed = true; } };
  fakeTween.handles.push(handle);
  onComplete?.();
  return handle;
}
fakeTween.handles = [];

function make() {
  fakeTween.handles = [];
  const layout = new LayoutEngine();
  layout.registerContainer('hand', { centerX: 0, centerY: -35, width: 120, cardWidth: 20, cardHeight: 27 });
  const animator = new StageAnimator({ layoutEngine: layout, tween: fakeTween });
  return { layout, animator };
}

describe('StageAnimator 状态机', () => {
  it('register 后为 idle；unregister 清理', () => {
    const { animator } = make();
    animator.register('c1', new THREE.Group());
    expect(animator.getState('c1')).toBe(ANIMATOR_STATES.IDLE);
    animator.unregister('c1');
    expect(animator.getState('c1')).toBeNull();
  });

  it('enterTracking 立即向锚点归位', () => {
    const { layout, animator } = make();
    const obj = new THREE.Group();
    animator.register('c1', obj);
    layout.layoutHand('hand', ['c1', 'c2']);
    animator.enterTracking('c1');
    expect(animator.getState('c1')).toBe(ANIMATOR_STATES.TRACKING);
    expect(obj.position.x).toBeCloseTo(-10.75); // 左牌中心
    expect(obj.position.y).toBe(-35);
  });

  it('布局变化后 syncTracking 重新归位所有 tracking 元素', () => {
    const { layout, animator } = make();
    const obj = new THREE.Group();
    animator.register('c1', obj);
    layout.layoutHand('hand', ['c1', 'c2']);
    animator.enterTracking('c1');
    layout.layoutHand('hand', ['c1']); // 抽走一张，c1 应回中
    animator.syncTracking();
    expect(obj.position.x).toBeCloseTo(0);
  });

  it('animate 进入 animating，完成回调后回落 idle', () => {
    const { animator } = make();
    animator.register('c1', new THREE.Group());
    const seen = [];
    animator.animate('c1', { x: 5, y: 5 }, { onComplete: () => seen.push(animator.getState('c1')) });
    expect(seen).toEqual([ANIMATOR_STATES.IDLE]); // 回调时状态已回落 idle
    expect(animator.getObject('c1').position.x).toBe(5);
  });

  it('状态切换会 kill 进行中的 tween', () => {
    const { animator } = make();
    animator.register('c1', new THREE.Group());
    animator.animate('c1', { x: 5 });
    animator.enterDragging('c1');
    expect(fakeTween.handles[0].killed).toBe(true);
    expect(animator.getState('c1')).toBe(ANIMATOR_STATES.DRAGGING);
  });

  it('animateToAnchor 用命名锚点', () => {
    const { layout, animator } = make();
    layout.setNamedAnchor('deck', { x: 40, y: -35 });
    animator.register('c1', new THREE.Group());
    animator.animateToAnchor('c1', 'deck');
    expect(animator.getObject('c1').position.x).toBe(40);
  });

  it('未注册 id 的调用静默忽略', () => {
    const { animator } = make();
    expect(() => {
      animator.enterIdle('ghost');
      animator.enterTracking('ghost');
      animator.animate('ghost', { x: 1 });
    }).not.toThrow();
  });
});
