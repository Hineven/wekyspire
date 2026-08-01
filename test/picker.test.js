import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import mitt from 'mitt';
import { Picker } from '../src/stage/picker/Picker.js';
import { StageManager } from '../src/stage/StageManager.js';
import { CardObject } from '../src/stage/objects/CardObject.js';
import { EventNames } from '../src/bridge/events.js';

function make() {
  const sm = new StageManager({ createRenderer: () => ({ render() {}, setSize() {}, dispose() {} }) });
  sm.attach({});
  sm.resize(1000, 1000); // 世界 [-50,50]²，屏幕像素 1:10 世界单位
  const bus = mitt();
  const events = [];
  for (const name of [EventNames.TOOLTIP_SHOW, EventNames.TOOLTIP_MOVE, EventNames.TOOLTIP_HIDE, EventNames.CARD_HOVER, EventNames.CARD_LEAVE]) {
    bus.on(name, (p) => events.push({ name, payload: p }));
  }
  const picker = new Picker({ stageManager: sm, bus });
  const scene = new THREE.Scene();
  return { sm, bus, events, picker, scene };
}

// 世界坐标 → 屏幕像素（走 StageManager 投影，适配斜视相机；1000px ↔ z=0 平面 100 世界单位）
const toScreen = (sm, wx, wy, wz = 0) => sm.worldToScreen(wx, wy, wz);

function addCard(picker, scene, id, wx, wy, hitRegions = []) {
  const card = new CardObject({
    uniqueID: id,
    cardWidth: 20,
    cardHeight: 27,
    bakeFace: () => ({ texture: new THREE.Texture(), hitRegions, width: 20, height: 27 }),
  });
  card.position.set(wx, wy, 0);
  card.setCard({});
  card.updateMatrixWorld(true);
  scene.add(card);
  picker.addPickable(id, card, { kind: 'card', cardObject: card });
  return card;
}

describe('Picker', () => {
  it('命中整卡（无热区处）', () => {
    const { sm, picker, scene } = make();
    addCard(picker, scene, 'c1', 0, 0);
    const { x, y } = toScreen(sm, 0, 0);
    expect(picker.pick(x, y)).toEqual({ kind: 'card', id: 'c1' });
  });

  it('未命中任何对象 → background', () => {
    const { sm, picker, scene } = make();
    addCard(picker, scene, 'c1', 0, 0);
    const { x, y } = toScreen(sm, 40, 40);
    expect(picker.pick(x, y)).toEqual({ kind: 'background' });
  });

  it('token 热区优先于整卡', () => {
    const { sm, picker, scene } = make();
    // 热区：局部 x∈[0,10], y∈[0,10]（牌面左上 10x10）
    const region = { type: 'named', payload: { name: '瑞米' }, rect: { x: 0, y: 0, w: 10, h: 10 } };
    addCard(picker, scene, 'c1', 0, 0, [region]);
    // 局部 (5,5) → 世界 (-5, 8.5)：牌中心 (0,0)，宽 20 高 27，左上 (-10, 13.5)
    const { x, y } = toScreen(sm, -5, 8.5);
    const hit = picker.pick(x, y);
    expect(hit.kind).toBe('token');
    expect(hit.region).toEqual(region);
  });

  it('叠放时近处卡优先', () => {
    const { sm, picker, scene } = make();
    addCard(picker, scene, 'back', 0, 0);
    const front = addCard(picker, scene, 'front', 0, 0);
    front.position.z = 5;
    front.updateMatrixWorld(true);
    const { x, y } = toScreen(sm, 0, 0);
    expect(picker.pick(x, y)).toEqual({ kind: 'card', id: 'front' });
  });

  it('hover 事件流：token show → move → hide，整卡 hover/leave', () => {
    const { sm, picker, scene, events } = make();
    const region = { type: 'named', payload: { name: '瑞米' }, rect: { x: 0, y: 0, w: 10, h: 10 } };
    addCard(picker, scene, 'c1', 0, 0, [region]);
    const tokenPos = toScreen(sm, -5, 8.5);
    const cardPos = toScreen(sm, 5, -5); // 卡面右下角（热区外）
    const bgPos = toScreen(sm, 45, 45);

    picker.hover(tokenPos.x, tokenPos.y);
    picker.hover(tokenPos.x + 5, tokenPos.y + 5); // 同 token 内移动
    picker.hover(cardPos.x, cardPos.y);
    picker.hover(bgPos.x, bgPos.y);

    expect(events.map(e => e.name)).toEqual([
      EventNames.TOOLTIP_SHOW,
      EventNames.TOOLTIP_MOVE,
      EventNames.TOOLTIP_HIDE,
      EventNames.CARD_HOVER,
      EventNames.CARD_LEAVE,
    ]);
    expect(events[0].payload).toMatchObject({ kind: 'named', name: '瑞米' });
    expect(events[3].payload).toEqual({ uniqueID: 'c1' });
  });
});
