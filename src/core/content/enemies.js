import { registerEnemy } from '../enemies/registry.js';
import Enemy from '../state/enemy.js';
import { DealDamageInstruction, GainShieldInstruction } from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';

// ① 固定行动序列杂鱼：攻 3 → 盾 4 循环
registerEnemy({
  id: 'slime', name: '史莱姆',
  createUnit: () => new Enemy({ defId: 'slime', name: '史莱姆', maxHp: 20 }),
  act(actx) {
    if (actx.unit.actionIndex % 2 === 0) {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 3,
      }));
    } else {
      actx.kernel.submitInstruction(new GainShieldInstruction({ target: actx.unit, amount: 4 }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 2 === 0
    ? { type: 'attack', value: 3 }
    : { type: 'defend', value: 4 }),
});

// ② 带效果联动的小 Boss：每第三次行动给玩家上 2 层燃烧，其余时间攻 5
registerEnemy({
  id: 'pyro', name: '燃焰术士',
  createUnit: () => new Enemy({ defId: 'pyro', name: '燃焰术士', maxHp: 30 }),
  act(actx) {
    if (actx.unit.actionIndex % 3 === 2) {
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.player, effectId: 'burn', stacks: 2,
      }));
    } else {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 5,
      }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 3 === 2
    ? { type: 'effect', description: '施加 2 层燃烧' }
    : { type: 'attack', value: 5 }),
});
