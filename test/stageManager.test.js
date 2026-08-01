import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { StageManager, WORLD_HEIGHT } from '../src/stage/StageManager.js';

function make() {
  const renders = [];
  const sm = new StageManager({
    createRenderer: () => ({
      render: (scene, camera) => renders.push({ scene, camera }),
      setSize: () => {},
      dispose: () => {},
    }),
  });
  sm.attach({});
  return { sm, renders };
}

describe('StageManager', () => {
  it('世界约定：屏幕高 = 100 世界单位，resize 只改相机', () => {
    const { sm } = make();
    sm.resize(1600, 900);
    expect(WORLD_HEIGHT).toBe(100);
    expect(sm.camera.top).toBe(50);
    expect(sm.camera.bottom).toBe(-50);
    expect(sm.camera.right).toBeCloseTo(50 * 1600 / 900);
    expect(sm.worldWidth).toBeCloseTo(100 * 1600 / 900);
  });

  it('screenToWorld：屏幕中心 = 原点，y 向上', () => {
    const { sm } = make();
    sm.resize(1000, 1000);
    expect(sm.screenToWorld(500, 500)).toEqual({ x: 0, y: 0 });
    expect(sm.screenToWorld(1000, 0)).toEqual({ x: 50, y: 50 });
    expect(sm.screenToWorld(0, 1000)).toEqual({ x: -50, y: -50 });
  });

  it('场景切换触发 onExit/onEnter 生命周期', () => {
    const { sm } = make();
    const calls = [];
    const a = { name: 'battle', scene: new THREE.Scene(), onEnter: () => calls.push('enter-a'), onExit: () => calls.push('exit-a') };
    const b = { name: 'rest', scene: new THREE.Scene(), onEnter: () => calls.push('enter-b') };
    sm.setStage(a);
    sm.setStage(b);
    expect(calls).toEqual(['enter-a', 'exit-a', 'enter-b']);
    expect(sm.stage).toBe(b);
  });

  it('同名场景重复 setStage 不重复触发生命周期', () => {
    const { sm } = make();
    let enters = 0;
    const a = { name: 'battle', scene: new THREE.Scene(), onEnter: () => enters++ };
    sm.setStage(a);
    sm.setStage(a);
    expect(enters).toBe(1);
  });
});
