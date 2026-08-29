// tooltip 内容（Shell BattleHud 与 debug 页共用）：tooltip:* 协议载荷 → HTML。
// effect/skill 经注册表反查定义补信息（markup 里是显示名，按 name 匹配）；
// named（/named{} 热区）经 namedTerms 术语表反查描述（斩/衰败等通用机制词）；
// intention（意图图标条）按投影意图数据直译短句（UnitObject 意图条同语言）。

import { allEffects } from '../core/effects/registry.js';
import { allSkills } from '../core/skills/registry.js';
import { getNamedTerm } from '../core/skills/namedTerms.js';

export function tooltipHtml({ kind, name, powerDelta, payload }) {
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
  if (kind === 'named') {
    const term = getNamedTerm(name);
    return term ? `<b>${term.name}${term.param ?? ''}</b><br>${term.text}` : `<b>${name}</b>`;
  }
  if (kind === 'intention') {
    const p = payload ?? {};
    const title = p.name ? `<b>${p.name}的意图</b><br>` : '';
    return `${title}${intentionSentence(p.intention)}`;
  }
  // Shift 详情方标（卡牌详情卡面右下角）：提示文案由热区 payload 携带
  if (kind === 'shift') return `<b>${name}</b>`;
  return `[${kind}] ${name}`;
}

// 意图释义短句：kinds 最多两两组合 → 「下回合将…，…」；攻击附 N×M（多发带总量），
// 未知意图单独成句。文案与 UnitObject 意图条图标一一对应（剑/盾/升/降/?）。
const INTENTION_ACTS = Object.freeze({
  defend: '获得护盾',
  buff: '强化自身',
  debuff: '赋予负面效果',
});

function intentionSentence(intention) {
  const kinds = (intention?.kinds?.length ? intention.kinds : ['unknown']).slice(0, 2);
  if (kinds.includes('unknown')) return '下回合行动未知';
  const parts = kinds.map((k) => {
    if (k !== 'attack') return INTENTION_ACTS[k] ?? '行动';
    if (intention.damage == null) return '进行攻击';
    return intention.hits > 1
      ? `造成 ${intention.hits}×${intention.damage}（共 ${intention.hits * intention.damage}）点伤害`
      : `造成 ${intention.damage} 点伤害`;
  });
  return `下回合将${parts.join('，')}`;
}
