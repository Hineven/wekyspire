import { describe, it, expect } from 'vitest';
import { CardObject } from '../src/stage/objects/CardObject.js';

function makeBake(hitRegions = []) {
  let calls = 0;
  const bake = (cardData) => {
    calls++;
    return {
      texture: { dispose: () => { bake.disposed = (bake.disposed || 0) + 1; } },
      hitRegions,
      width: 20,
      height: 27,
    };
  };
  bake.getCalls = () => calls;
  return bake;
}

describe('CardObject', () => {
  it('setCard 重烘纹理并成对替换 hit map，旧纹理被 dispose', () => {
    const region = { type: 'named', payload: { name: '瑞米' }, rect: { x: 2, y: 3, w: 10, h: 6 } };
    const bake = makeBake([region]);
    const card = new CardObject({ uniqueID: 'c1', bakeFace: bake });
    card.setCard({ name: '斩击' });
    expect(bake.getCalls()).toBe(1);
    expect(card.hitRegions).toEqual([region]);
    card.setCard({ name: '斩击+' });
    expect(bake.getCalls()).toBe(2);
    expect(bake.disposed).toBe(1); // 旧纹理被释放
  });

  it('hitTestUV：uv 反算局部坐标命中热区', () => {
    // 热区 rect: x∈[2,12], y∈[3,9]（局部坐标，y 向下）；牌 20x27
    const region = { type: 'named', payload: { name: '瑞米' }, rect: { x: 2, y: 3, w: 10, h: 6 } };
    const card = new CardObject({ uniqueID: 'c1', bakeFace: makeBake([region]) });
    card.setCard({});
    // 局部 (7, 6) 应在热区内 → u=7/20=0.35, v=1-6/27
    expect(card.hitTestUV({ u: 0.35, v: 1 - 6 / 27 })).toEqual(region);
    // 局部 (15, 20) 在热区外
    expect(card.hitTestUV({ u: 0.75, v: 1 - 20 / 27 })).toBeNull();
  });

  it('状态视觉占位接口', () => {
    const card = new CardObject({ uniqueID: 'c1' });
    expect(card.visualState).toBe('normal');
    card.setVisualState('disabled');
    expect(card.visualState).toBe('disabled');
    card.setVisualState('normal');
    expect(card.visualState).toBe('normal');
  });
});
