import { describe, it, expect } from 'vitest';
import { PlayerStatusObject, PLAYER_STATUS_LAYOUT } from '../src/stage/objects/PlayerStatusObject.js';

// 左下角玩家状态栏契约：底板/头像/资源点两排结构、左对齐布局、头像纹理裁切、销毁
describe('PlayerStatusObject 玩家状态栏', () => {
  it('结构：底板 + 头像 + 描边环 + AP/魏启两排（左对齐）+ 能力留位', () => {
    const bar = new PlayerStatusObject();
    expect(bar.getObjectByName('plate')).toBeTruthy();
    expect(bar.getObjectByName('avatar')).toBeTruthy();
    expect(bar.getObjectByName('avatarRing')).toBeTruthy();
    expect(bar.getObjectByName('abilities')).toBeTruthy(); // 能力/灵脉留位挂载点
    expect(bar.apPips.parent).toBe(bar);
    expect(bar.manaPips.parent).toBe(bar);
    // 两排左锚定在同一 x、AP 在上
    expect(bar.apPips.position.x).toBe(bar.manaPips.position.x);
    expect(bar.apPips.position.y).toBeGreaterThan(bar.manaPips.position.y);
    // node 无 document：底板退化纯色半透明
    expect(bar._plateMaterial.map).toBe(null);
    expect(bar._plateMaterial.opacity).toBeLessThan(1);
  });

  it('资源点左对齐：label 左缘锚定排原点（不再是整体居中）', () => {
    const bar = new PlayerStatusObject({
      bakeLabel: (text) => ({
        texture: null, width: text.length * 10, height: 20, // 100px 宽 → 10wu
      }),
    });
    bar.apPips.setValue(2, 3);
    // "AP 2/3" = 6 字符 × 10px = 60px → 6wu：左缘 = 排原点 x，中心 = +3
    expect(bar.apPips._label.position.x).toBeCloseTo(3, 5);
    // 点排紧跟文本之后（6 + 1.5 间隙 + 点半径 0.9 = 8.4）
    expect(bar.apPips._pips[0].position.x).toBeCloseTo(8.4, 5);
  });

  it('头像：setAvatar 按图比例做方形裁切（repeat/offset），旧纹理被销毁', () => {
    const bar = new PlayerStatusObject();
    const fake = { width: 400, height: 800 }; // 竖图
    bar.setAvatar(fake);
    const map = bar._avatarMaterial.map;
    expect(map).toBeTruthy();
    // 方形裁切：repeat.x * w_px == repeat.y * h_px；顶对齐（offset.y + repeat.y = 1）
    expect(map.repeat.x * 400).toBeCloseTo(map.repeat.y * 800, 5);
    expect(map.offset.y + map.repeat.y).toBeCloseTo(1, 5);
    // 水平居中
    expect(map.offset.x).toBeCloseTo((1 - map.repeat.x) / 2, 5);
    const first = map;
    bar.setAvatar(fake); // 重挂：旧纹理销毁
    expect(first.disposed ?? true).toBe(true); // three Texture.dispose 后无标志位，仅验证不抛错
    expect(bar._avatarMaterial.map).not.toBe(first);
    bar.setAvatar(null); // 非法输入静默忽略
    expect(bar._avatarMaterial.map).toBeTruthy();
  });

  it('布局常量自洽：面板能容纳头像与资源点排，且在 UI 底缘可视区内', () => {
    const L = PLAYER_STATUS_LAYOUT;
    // 头像（含环）在面板左半内
    expect(L.AVATAR_X - L.RING_R).toBeGreaterThan(-L.PANEL_W / 2);
    // 资源点排左锚点在头像右侧
    expect(L.ROW_X).toBeGreaterThan(L.AVATAR_X + L.RING_R - 1);
    // 两排在面板高度内
    expect(Math.abs(L.ROW_AP_Y)).toBeLessThan(L.PANEL_H / 2);
    expect(Math.abs(L.ROW_MANA_Y)).toBeLessThan(L.PANEL_H / 2);
  });

  it('dispose：资源点随父级销毁', () => {
    const bar = new PlayerStatusObject();
    bar.apPips.setValue(3, 3);
    expect(() => bar.dispose()).not.toThrow();
    expect(bar.apPips._pips).toHaveLength(0);
  });
});
