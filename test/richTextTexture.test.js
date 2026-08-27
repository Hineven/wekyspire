import { describe, it, expect } from 'vitest';
import { renderRichTextBlock } from '../src/stage/richtext/texture.js';

// mock canvas：记录调用，验证烘焙序列与成对替换契约
function createMockCanvas() {
  const calls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      calls,
      scale: (s) => calls.push(['scale', s]),
      fillText: (ch, x, y) => calls.push(['fillText', ch, x, y]),
      measureText: (t) => ({ width: t.length * 10 }),
      set font(v) {}, set fillStyle(v) {}, set textBaseline(v) {},
    }),
  };
  return {
    calls,
    canvas,
    factory: (w, h) => { canvas.width = w; canvas.height = h; return canvas; },
  };
}

describe('richtext/texture', () => {
  it('产出 texture + hitRegions 成对结果', () => {
    const mock = createMockCanvas();
    const r = renderRichTextBlock('看/named{瑞米}', {
      measure: (t) => t.length * 10,
      createCanvas: mock.factory,
      scale: 2,
    });
    expect(r.texture).toBeTruthy();
    expect(r.hitRegions).toHaveLength(1);
    expect(r.hitRegions[0].payload.name).toBe('瑞米');
    // 排版尺寸是局部坐标（与 scale 无关）
    expect(r.width).toBe(30);
    // canvas 内部像素是 scale 倍
    expect(mock.canvas.width).toBe(60);
  });
});
