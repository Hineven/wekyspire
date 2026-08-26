import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { MapStage } from '../src/stage/stages/MapStage.js';
import { PlayerStatusObject, PLAYER_STATUS_POS } from '../src/stage/objects/PlayerStatusObject.js';

// 地图舞台状态栏（与战斗内 PlayerStatusObject 共享）：
// node 下 bakeLabel 退化 1x1 占位、UnitArtCache 跳过，结构与数值契约可测。

describe('MapStage uiScene 状态栏（与战斗共享契约）', () => {
  it('uiScene 内含 PlayerStatusObject，摆位与战斗内一致', () => {
    const stage = new MapStage({});
    expect(stage.uiScene).toBeTruthy();
    const bar = stage.uiScene.children.find(c => c instanceof PlayerStatusObject);
    expect(bar).toBeTruthy();
    expect(bar.position.x).toBe(PLAYER_STATUS_POS.x);
    expect(bar.position.y).toBe(PLAYER_STATUS_POS.y);
    expect(bar.position.z).toBe(PLAYER_STATUS_POS.z);
  });

  it('setStatus 同步 AP/魏启/金币/瑞米到状态栏', () => {
    const stage = new MapStage({});
    const baked = [];
    stage.statusBar._bake = (text) => {
      baked.push(text);
      return { texture: {}, width: 10, height: 20 };
    };
    stage.setStatus({
      ap: 3, apMax: 3, mana: 2, manaMax: 3,
      money: 40, remi: { level: 1, fruits: 2, drivenOff: false },
    });
    expect(stage.statusBar.apPips.pipCount).toBe(3);
    expect(stage.statusBar.manaPips.pipCount).toBe(3);
    // 魏启 2/3：前两点充盈、第三点耗尽（灰）
    expect(stage.statusBar.manaPips.pipColor(2)).toBe(0x555555);
    // AP 满：首点为资源色（缺省黄）
    expect(stage.statusBar.apPips.pipColor(0)).toBe(0xf0c040);
    // 金币/瑞米行已烘焙
    expect(baked).toContain('金币 40');
    expect(baked).toContain('remi Lv.1 · 果 2');
  });

  it('onEnter 注册帧 tick 驱动资源点过渡；onExit 注销', () => {
    const stage = new MapStage({});
    const handlers = new Set();
    const manager = {
      onTick: (fn) => { handlers.add(fn); return () => handlers.delete(fn); },
    };
    stage.onEnter(manager);
    expect(handlers.size).toBe(1);
    // tick 可安全推进（颜色 lerp 不抛错）
    stage.setStatus({ ap: 3, apMax: 3, mana: 1, manaMax: 3 });
    for (const fn of handlers) fn(0.016);
    stage.onExit(manager);
    expect(handlers.size).toBe(0);
    // 重复 onExit 幂等
    stage.onExit(manager);
  });

  it('setFloor 塔身重建不受状态栏接入影响（回归）', () => {
    const stage = new MapStage({ totalFloors: 44 });
    stage.setFloor(1, 44);
    expect(stage._tower.children.length).toBe(6); // 底层窗口被截：1~6 层
    stage.setFloor(22, 44);
    expect(stage._tower.children.length).toBe(11); // 中层满窗口 VISIBLE_WINDOW
    // 当前层高亮（金色）
    const current = stage._tower.children.find(c => c.position.y === 0);
    expect(current.material.color.getHex()).toBe(0xffd75e);
  });

  it('dispose 释放塔身层块与星空（无几何/材质残留）', () => {
    const stage = new MapStage({ totalFloors: 44 });
    stage.setFloor(22, 44);
    expect(stage._tower.children.length).toBe(11);
    expect(stage._stars).toBeTruthy();
    stage.dispose();
    expect(stage._tower.children.length).toBe(0);            // 层块全部释放移除
    expect(stage.scene.children.includes(stage._stars)).toBe(false); // 星空移出场景
  });

  it('arriveFloor（S5）：当前层块自下而上长出，onDone 回执', async () => {
    const stage = new MapStage({ totalFloors: 44 });
    let done = false;
    stage.arriveFloor(5, 44, { onDone: () => { done = true; }, duration: 0.02 });
    const current = stage._tower.children.find(c => c.position.y === 0);
    expect(current).toBeTruthy();
    expect(current.scale.y).toBeLessThan(1); // 起始压缩态
    await new Promise(r => setTimeout(r, 150));
    expect(done).toBe(true);                 // 长出完成回执（sequencer 据此开闸）
    expect(current.scale.y).toBeCloseTo(1, 2);
  });
});
