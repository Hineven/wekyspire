import { registerAlly } from '../allies/registry.js';
import Ally from '../state/ally.js';
import { firstAliveEnemy } from '../state/battleState.js';
import { DealDamageInstruction } from '../instructions/combat.js';

// 瑞米：每个玩家回合（先于玩家）对首个存活敌人造成 2 点伤害
registerAlly({
  id: 'remi', name: '瑞米',
  createUnit: () => new Ally({ defId: 'remi', name: '瑞米', maxHp: 15 }),
  act(actx) {
    const target = firstAliveEnemy(actx.battleState);
    if (target) {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target, amount: 2,
      }));
    }
  },
});
