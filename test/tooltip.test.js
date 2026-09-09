import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { tooltipModel } from '../src/shell/tooltip.js';
import { tooltipState, tooltipShow, tooltipMove, tooltipHide } from '../src/shell/tooltipHub.js';

// tooltip 契约：tooltipModel(kind, payload) 是唯一内容解析器（渲染在 App.vue 的
// TooltipOverlay）；effect 优先 effectId 反查、缺省按显示名（markup 快照语义）；
// skill/named/shift/intention 各按契约；未注册回落方括号标识。
// tooltipHub 是 hover 生命周期状态机（同 token 抑制 / 跟随 / hide 后不复活）。

describe('tooltipModel：内容契约', () => {
  it('effect：优先 effectId 反查，缺省按显示名（含图标与描述）', () => {
    expect(tooltipModel('effect', { effectId: 'stall' }).title).toContain('滞气');
    expect(tooltipModel('effect', { effectId: 'stall' }).body).toContain('无法抽牌');
    expect(tooltipModel('effect', { name: '滞气' }).title).toContain('滞气');
    expect(tooltipModel('effect', { effectId: 'burn', name: '燃烧' }).title).toContain('燃烧');
  });

  it('skill：按名反查，含费用行与威力增量', () => {
    const m = tooltipModel('skill', { name: '收刃', powerDelta: 2 });
    expect(m.title).toBe('收刃');
    expect(m.delta).toBe(2);
    expect(m.body).toContain('AP2');
    expect(tooltipModel('skill', { name: '不存在' }).title).toBe('[skill] 不存在');
  });

  it('named：经术语表反查（参数插值），未注册回落原文标题', () => {
    expect(tooltipModel('named', { name: '瑞米' })).toEqual({ title: '瑞米', body: '' });
    expect(tooltipModel('named', { name: '斩' }))
      .toEqual({ title: '斩', body: '此卡打出后进阶；只在牌库中冷却充能' });
    expect(tooltipModel('named', { name: '衰败2' }))
      .toEqual({ title: '衰败2', body: '回合开始时，若在手牌中，反向冷却2' });
  });

  it('intention：标题带单位名 + 释义短句（与意图条图标同语言）', () => {
    expect(tooltipModel('intention', { intention: { kinds: ['attack'], hits: 1, damage: 6 }, unitName: '粘液怪' }))
      .toEqual({ title: '粘液怪的意图', body: '下回合将造成 6 点伤害' });
    expect(tooltipModel('intention', { intention: { kinds: ['attack'], hits: 3, damage: 5 }, unitName: '夜蝠' }).body)
      .toBe('下回合将造成 3×5（共 15）点伤害');
    expect(tooltipModel('intention', { intention: { kinds: ['debuff'] } }).body).toBe('下回合将赋予负面效果');
    expect(tooltipModel('intention', { intention: { kinds: ['attack', 'buff'], hits: 1, damage: 8 } }).body)
      .toBe('下回合将造成 8 点伤害，强化自身');
    expect(tooltipModel('intention', { intention: { kinds: ['unknown'] } }).body).toBe('下回合行动未知');
    expect(tooltipModel('intention', { intention: { kinds: ['defend'] } }).title).toBe('意图');
  });

  it('shift：详情方标提示直出热区携带的文案', () => {
    expect(tooltipModel('shift', { name: '按住 Shift 显示详细信息' }))
      .toEqual({ title: '按住 Shift 显示详细信息', body: '' });
  });

  it('未注册名：回落方括号标识不抛错', () => {
    expect(tooltipModel('effect', { name: '不存在' })).toEqual({ title: '[effect] 不存在', body: '' });
    expect(tooltipModel('whatever', { name: 'X' })).toEqual({ title: '[whatever] X', body: '' });
  });
});

describe('tooltipHub：hover 生命周期状态机', () => {
  it('show → 同 token 只跟随不重算；换 token 才换模型；hide 后 move 不复活', () => {
    tooltipHide();
    tooltipShow('effect', { effectId: 'burn' }, 10, 20);
    expect(tooltipState.visible).toBe(true);
    expect(tooltipState.model.title).toContain('燃烧');
    expect(tooltipState.x).toBe(24); // +14 指针偏移

    const model = tooltipState.model;
    tooltipShow('effect', { effectId: 'burn' }, 50, 60); // 同 token（内容相等的新对象）
    expect(tooltipState.model).toBe(model);              // 模型未重算
    expect(tooltipState.x).toBe(64);                     // 位置已跟随

    tooltipShow('effect', { effectId: 'stall' }, 70, 80); // 换 token → 重建模型
    expect(tooltipState.model).not.toBe(model);
    expect(tooltipState.model.title).toContain('滞气');

    tooltipHide();
    expect(tooltipState.visible).toBe(false);
    tooltipMove(99, 99); // 隐藏后 move 不复活
    expect(tooltipState.visible).toBe(false);
  });

  it('未 show 时 move 无操作；显示中 move 只跟随', () => {
    tooltipHide();
    tooltipMove(1, 1);
    expect(tooltipState.visible).toBe(false);
    tooltipShow('named', { name: '斩' }, 5, 5);
    tooltipMove(8, 8);
    expect(tooltipState.visible).toBe(true);
    expect(tooltipState.x).toBe(22);
    tooltipHide();
  });
});
