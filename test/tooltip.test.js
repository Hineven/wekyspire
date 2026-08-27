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

  it('named：通用加粗呈现（/named{} 热区）', () => {
    expect(tooltipHtml({ kind: 'named', name: '瑞米' })).toBe('<b>瑞米</b>');
  });

  it('shift：详情方标提示直出热区携带的文案', () => {
    expect(tooltipHtml({ kind: 'shift', name: '按住 Shift 显示详细信息' }))
      .toBe('<b>按住 Shift 显示详细信息</b>');
  });

  it('未注册名：回落方括号标识不抛错', () => {
    expect(tooltipHtml({ kind: 'effect', name: '不存在' })).toBe('[effect] 不存在');
    expect(tooltipHtml({ kind: 'skill', name: '不存在' })).toBe('[skill] 不存在');
    expect(tooltipHtml({ kind: 'whatever', name: 'X' })).toBe('[whatever] X');
  });
});
