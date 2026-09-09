import { registerAlly } from '../allies/registry.js';
import Ally from '../state/ally.js';
import { firstAliveEnemy } from '../state/battleState.js';
import { DealDamageInstruction } from '../instructions/combat.js';

// 瑞米：每个玩家回合（先于玩家）对首个存活敌人造成 2 点伤害。
// 目标规则固定为「最靠前的存活敌人」（数组序），与主角的攻击选择无关——
// 意图预告（getIntention）与实际行动（act）共用同一数值与目标口径，所见即所算。
const REMI_DAMAGE = 2;

registerAlly({
  id: 'remi', name: 'remi',
  createUnit: () => new Ally({ defId: 'remi', name: 'remi', maxHp: 15 }),
  act(actx) {
    const target = firstAliveEnemy(actx.battleState);
    if (target) {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target, amount: REMI_DAMAGE,
      }));
    }
  },
  getIntention: () => ({
    kinds: ['attack'], hits: 1, damage: REMI_DAMAGE,
    note: '目标：最靠前的存活敌人', // 固定索敌规则说明（tooltip 附加行）
  }),
});
