import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册效果定义（燃烧等），emoji/特征色解析依赖注册表
import { bakeCardFace, CARD_FACE_SIZE } from '../src/stage/richtext/cardFace.js';

// 全吸收 mock ctx：记录 fillText / 画布尺寸
function createMockCanvas() {
  const texts = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => new Proxy({
      fillText: (t) => texts.push(t),
      measureText: (t) => ({ width: t.length * 10 }),
    }, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => {}; // 吸收所有绘制调用与属性读取
      },
      set() { return true; }, // 吸收 fillStyle/font 等赋值
    }),
  };
  return { canvas, texts, factory: (w, h) => { canvas.width = w; canvas.height = h; return canvas; } };
}

const CARD = {
  defId: 'punch', name: '冲拳', power: 0,
  cost: { mana: 0, actionPoint: 1 },
  keywords: [], cardMode: 'normal', charges: null,
  text: '造成 6 点伤害。',
};

describe('cardFace', () => {
  it('返回固定布局盒尺寸 + CanvasTexture', () => {
    const mock = createMockCanvas();
    const r = bakeCardFace(CARD, {
      createCanvas: mock.factory, measure: (t) => t.length * 10, scale: 2,
    });
    expect(r.width).toBe(CARD_FACE_SIZE.width);
    expect(r.height).toBe(CARD_FACE_SIZE.height);
    expect(mock.canvas.width).toBe(400); // 200 * scale
    expect(mock.canvas.height).toBe(540);
    expect(r.texture).toBeTruthy();
  });

  it('正文热区加上正文区偏移', () => {
    const mock = createMockCanvas();
    const r = bakeCardFace({ ...CARD, text: '施加/effect{燃烧}' }, {
      createCanvas: mock.factory, measure: (t) => t.length * 10,
    });
    const region = r.hitRegions.find(h => h.type === 'effect');
    expect(region).toBeTruthy();
    expect(region.rect.x).toBe(12 + 20); // BODY_OFFSET.x + 前两个字
    expect(region.rect.y).toBe(56);      // BODY_OFFSET.y
    expect(region.payload.name).toBe('燃烧');
  });

  it('名称与费用被绘制', () => {
    const mock = createMockCanvas();
    bakeCardFace(CARD, { createCanvas: mock.factory, measure: (t) => t.length * 10 });
    expect(mock.texts).toContain('冲拳');
    expect(mock.texts).toContain('0'); // mana 徽章
    expect(mock.texts).toContain('1'); // AP 徽章
  });

  it('品阶徽章字母被绘制', () => {
    const mock = createMockCanvas();
    bakeCardFace({ ...CARD, tier: 'S' }, { createCanvas: mock.factory, measure: (t) => t.length * 10 });
    expect(mock.texts).toContain('S');
  });

  it('有卡图时正文区下移到图区之下', () => {
    const mock = createMockCanvas();
    const r = bakeCardFace({ ...CARD, text: '施加/effect{燃烧}' }, {
      createCanvas: mock.factory, measure: (t) => t.length * 10,
      art: { width: 100, height: 100 }, // 占位图（drawImage 被 mock 吸收）
    });
    const region = r.hitRegions.find(h => h.type === 'effect');
    expect(region.rect.y).toBe(142); // ART_RECT 底(134) + 8
  });

  it('/effect{} 渲染：emoji 图标 + 特征色名称文本（热区两段）', () => {
    const mock = createMockCanvas();
    const r = bakeCardFace({ ...CARD, text: '施加/effect{燃烧}' }, {
      createCanvas: mock.factory, measure: (t) => t.length * 10,
    });
    // emoji 图标（燃烧定义 icon=🔥）与名称文本都被绘制
    expect(mock.texts).toContain('🔥');
    expect(mock.texts).toContain('燃');
    expect(mock.texts).toContain('烧');
    // 图标 + 名称文本各一个热区
    const regions = r.hitRegions.filter(h => h.type === 'effect');
    expect(regions.length).toBe(2);
    expect(regions.every(h => h.payload.name === '燃烧')).toBe(true);
  });
});
