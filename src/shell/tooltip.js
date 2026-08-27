// tooltip 内容（Shell BattleHud 与 debug 页共用）：tooltip:* 协议载荷 → HTML。
// effect/skill 经注册表反查定义补信息（markup 里是显示名，按 name 匹配）；
// named（/named{} 热区，如"瑞米"）暂为通用呈现，专属资料表后续接入。

import { allEffects } from '../core/effects/registry.js';
import { allSkills } from '../core/skills/registry.js';

export function tooltipHtml({ kind, name, powerDelta }) {
  if (kind === 'effect') {
    const def = allEffects().find(d => d.name === name);
    return def ? `<b>${def.icon ?? ''}${def.name}</b><br>${def.description ?? ''}` : `[effect] ${name}`;
  }
  if (kind === 'skill') {
    const def = allSkills().find(d => d.name === name);
    const delta = powerDelta ? `（威力 ${powerDelta > 0 ? '+' : ''}${powerDelta}）` : '';
    if (!def) return `[skill] ${name}${delta}`;
    const cost = def.cost ? `费${def.cost.mana} AP${def.cost.actionPoint}` : '';
    return `<b>${def.name}</b>${delta}<br><span style="color:#8af">${cost}</span>`;
  }
  if (kind === 'named') return `<b>${name}</b>`;
  // Shift 详情方标（卡牌详情卡面右下角）：提示文案由热区 payload 携带
  if (kind === 'shift') return `<b>${name}</b>`;
  return `[${kind}] ${name}`;
}
