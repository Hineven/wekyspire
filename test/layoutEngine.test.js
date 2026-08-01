import { describe, it, expect } from 'vitest';
import { LayoutEngine } from '../src/stage/layout/LayoutEngine.js';

const HAND = { centerX: 0, centerY: -35, width: 120, cardWidth: 20, cardHeight: 27 };

function make() {
  const le = new LayoutEngine();
  le.registerContainer('hand', HAND);
  return le;
}

describe('LayoutEngine 手牌布局', () => {
  it('单牌居中', () => {
    const le = make();
    const m = le.layoutHand('hand', ['a']);
    expect(m.get('a')).toMatchObject({ x: 0, y: -35, scale: 1 });
  });

  it('默认间隙平铺且整体居中', () => {
    const le = make();
    const m = le.layoutHand('hand', ['a', 'b', 'c']);
    // 3 张 20 宽 + 2 个 1.5 间隙 = 63 总宽，中心对称
    expect(m.get('a').x).toBeCloseTo(-21.5);
    expect(m.get('b').x).toBeCloseTo(0);
    expect(m.get('c').x).toBeCloseTo(21.5);
  });

  it('牌多时间隙压缩，极限时间距不小于 MIN_STEP', () => {
    const le = make();
    const ids = Array.from({ length: 40 }, (_, i) => `c${i}`);
    const m = le.layoutHand('hand', ids);
    // 40 张 * 20 宽远超容器 120：间隙压到 -17（= -20 + 3），相邻中心距 = 3
    for (let i = 1; i < ids.length; i++) {
      expect(m.get(ids[i]).x - m.get(ids[i - 1]).x).toBeCloseTo(3);
    }
  });

  it('悬浮撑开：悬浮牌放大且两侧间隙扩大、整体仍居中', () => {
    const le = make();
    const ids = ['a', 'b', 'c', 'd'];
    const m = le.layoutHand('hand', ids, 'b');
    expect(m.get('b').scale).toBeCloseTo(1.08);
    expect(m.get('b').z).toBeGreaterThan(m.get('a').z + 10); // 悬浮 z 抬升（世界坐标，相机 z=100 以下）
    // 对称性：首尾距中心等距
    expect(m.get('a').x + m.get('d').x).toBeCloseTo(0);
    // b-c 间距 > a-b 无悬浮时的基础间距
    const plain = make().layoutHand('hand', ids);
    expect(m.get('c').x - m.get('b').x).toBeGreaterThan(plain.get('c').x - plain.get('b').x);
  });

  it('锚点登记与容器注销', () => {
    const le = make();
    le.layoutHand('hand', ['a', 'b']);
    expect(le.getAnchor('a')).toBeTruthy();
    le.unregisterContainer('hand');
    expect(le.getAnchor('a')).toBeNull();
  });

  it('命名锚点', () => {
    const le = make();
    le.setNamedAnchor('deck', { x: 40, y: -35 });
    expect(le.getNamedAnchor('deck')).toEqual({ x: 40, y: -35 });
    expect(le.getNamedAnchor('nope')).toBeNull();
  });

  it('未注册容器抛错', () => {
    expect(() => new LayoutEngine().layoutHand('x', ['a'])).toThrow();
  });
});
