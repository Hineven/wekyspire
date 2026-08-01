import { describe, it, expect } from 'vitest';
import { parseRichText } from '../src/stage/richtext/parser.js';
import { layoutRichText } from '../src/stage/richtext/layout.js';

// 假 measure：等宽 10px，icon 不经过 measure
const fakeMeasure = (text) => text.length * 10;
const layout = (text, opts = {}) =>
  layoutRichText(parseRichText(text), { maxWidth: 100, measure: fakeMeasure, ...opts });

describe('richtext/layout', () => {
  it('纯文本单行放置', () => {
    const r = layout('你好');
    expect(r.width).toBe(20);
    expect(r.height).toBe(22);
    expect(r.placements).toHaveLength(2);
    expect(r.placements[0]).toMatchObject({ kind: 'glyph', char: '你', x: 0, y: 0, width: 10 });
    expect(r.hitRegions).toEqual([]);
  });

  it('超宽自动换行', () => {
    const r = layout('一二三四五六七八九十甲乙'); // 12 字，每行最多 10
    expect(r.height).toBe(44);
    expect(r.placements[10]).toMatchObject({ char: '甲', x: 0, y: 22 });
  });

  it('named token 产出 hitRegion', () => {
    const r = layout('看 /named{瑞米} 吧');
    expect(r.hitRegions).toHaveLength(1);
    expect(r.hitRegions[0]).toEqual({
      type: 'named',
      payload: { name: '瑞米' },
      rect: { x: 20, y: 0, w: 20, h: 22 },
    });
  });

  it('named 跨行时每行各产一个 hitRegion', () => {
    const r = layout('一二三四五六七八九/named{甲乙丙丁}'); // named 从 x=90 开始，第二字换行
    expect(r.hitRegions).toHaveLength(2);
    expect(r.hitRegions[0].rect).toEqual({ x: 90, y: 0, w: 10, h: 22 });
    expect(r.hitRegions[1].rect).toEqual({ x: 0, y: 22, w: 30, h: 22 });
  });

  it('skill token = 图标 + 文字，两段都是热区', () => {
    const r = layout('/skill{斩击+2}');
    const icon = r.placements.find(p => p.kind === 'icon');
    expect(icon).toMatchObject({ iconType: 'skill', name: '斩击' });
    expect(r.hitRegions.length).toBe(2);
    expect(r.hitRegions.every(h => h.type === 'skill' && h.payload.powerDelta === 2)).toBe(true);
  });

  it('effect token 图标也是热区', () => {
    const r = layout('施加/effect{燃烧}吧');
    const region = r.hitRegions.find(h => h.type === 'effect');
    expect(region).toBeTruthy();
    expect(region.payload).toEqual({ name: '燃烧' });
    expect(region.rect.x).toBe(20); // 前两个字之后
  });

  it('颜色 token 不改变布局只改样式', () => {
    const r = layout('/red{危险}');
    expect(r.placements).toHaveLength(2);
    expect(r.placements[0].style.color).toBe('#ff4444');
  });

  it('缺 measure 抛错', () => {
    expect(() => layoutRichText([], { maxWidth: 100 })).toThrow();
  });
});
