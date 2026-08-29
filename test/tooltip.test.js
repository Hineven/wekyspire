import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js';
import { tooltipHtml } from '../src/shell/tooltip.js';

// tooltip 内容（BattleHud 与 debug 页共享）：tooltip:* 协议载荷 → HTML。
// effect/skill 按显示名反查注册表；named 通用呈现；未注册回落方括号标识。

describe('tooltipHtml', () => {
  it('effect：反查效果定义，含图标与描述', () => {
    const html = tooltipHtml({ kind: 'effect', name: '滞气' });
    expect(html).toContain('<b>');
    expect(html).toContain('滞气');
    expect(html).toContain('无法抽牌');
  });

  it('skill：反查技能定义，含费用与威力增量', () => {
    const html = tooltipHtml({ kind: 'skill', name: '收刃', powerDelta: 2 });
    expect(html).toContain('<b>收刃</b>');
    expect(html).toContain('威力 +2');
    expect(html).toContain('AP2');
  });

  it('named：经术语表反查（斩/衰败N 参数插值），未注册回落加粗', () => {
    expect(tooltipHtml({ kind: 'named', name: '瑞米' })).toBe('<b>瑞米</b>');
    expect(tooltipHtml({ kind: 'named', name: '斩' }))
      .toBe('<b>斩</b><br>此卡打出后进阶，以进入牌库代替焚毁');
    expect(tooltipHtml({ kind: 'named', name: '衰败2' }))
      .toBe('<b>衰败2</b><br>回合开始时，若在手牌中，反向冷却2');
  });

  it('shift：详情方标提示直出热区携带的文案', () => {
    expect(tooltipHtml({ kind: 'shift', name: '按住 Shift 显示详细信息' }))
      .toBe('<b>按住 Shift 显示详细信息</b>');
  });

  it('intention：攻击释义（单发数值 / 多发 N×M 带总量），标题带单位名', () => {
    expect(tooltipHtml({
      kind: 'intention', payload: { name: '粘液怪', intention: { kinds: ['attack'], hits: 1, damage: 6 } },
    })).toBe('<b>粘液怪的意图</b><br>下回合将造成 6 点伤害');
    expect(tooltipHtml({
      kind: 'intention', payload: { name: '夜蝠', intention: { kinds: ['attack'], hits: 3, damage: 5 } },
    })).toBe('<b>夜蝠的意图</b><br>下回合将造成 3×5（共 15）点伤害');
  });

  it('intention：非攻击种类与两两组合；未知意图单独成句', () => {
    expect(tooltipHtml({ kind: 'intention', payload: { intention: { kinds: ['defend'] } } }))
      .toBe('下回合将获得护盾');
    expect(tooltipHtml({ kind: 'intention', payload: { intention: { kinds: ['debuff'] } } }))
      .toBe('下回合将赋予负面效果');
    expect(tooltipHtml({
      kind: 'intention', payload: { intention: { kinds: ['attack', 'buff'], hits: 1, damage: 8 } },
    })).toBe('下回合将造成 8 点伤害，强化自身');
    expect(tooltipHtml({ kind: 'intention', payload: { intention: { kinds: ['unknown'] } } }))
      .toBe('下回合行动未知');
  });

  it('未注册名：回落方括号标识不抛错', () => {
    expect(tooltipHtml({ kind: 'effect', name: '不存在' })).toBe('[effect] 不存在');
    expect(tooltipHtml({ kind: 'skill', name: '不存在' })).toBe('[skill] 不存在');
    expect(tooltipHtml({ kind: 'whatever', name: 'X' })).toBe('[whatever] X');
  });
});
