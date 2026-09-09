import { registerEnemy, getEnemyDefinition } from '../enemies/registry.js';
import Enemy from '../state/enemy.js';
import {
  DealDamageInstruction, GainShieldInstruction, ApplyHealInstruction,
} from '../instructions/combat.js';
import { AddEffectInstruction } from '../instructions/effects.js';
import { UnitSpawnInstruction } from '../instructions/units.js';
import { aliveEnemies } from '../state/battleState.js';

// 敌人定义总集。约定：
//   * 行动序列固定循环，按 unit.actionIndex 取模分支；行动即提交指令，无特判；
//   * 攻击数值一律走「基数 + unit.attack 面板」（battle.md F1 同源算式）——
//     floorEnemyGenerator 按楼层抬高 attack 面板即可全场统一缩放，
//     getIntention 的 damage 用同一算式（意图预告 = 实际数值，所见即所算）；
//   * getIntention(unit, battleState) 返回 { kinds, hits?, damage? }：kinds 是基础
//     意图集合（最多两两组合）——'attack'（附 hits×damage，hits=1 时前端省略次数）/
//     'defend' / 'buff'（自我/友军增强，含再生/荆棘/蓄势/自愈）/ 'debuff'（赋予
//     玩家削弱，含燃烧/虚弱/滞气）/ 'summon'（召唤援军，附 unitSpawned）。
//     前端只按种类画图标，不写详细信息。

// ① 固定行动序列杂鱼：攻 6 → 盾 4 循环
registerEnemy({
  id: 'slime', name: '史莱姆',
  createUnit: () => new Enemy({ defId: 'slime', name: '史莱姆', maxHp: 20 }),
  act(actx) {
    if (actx.unit.actionIndex % 2 === 0) {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 6 + actx.unit.getStat('attack'),
      }));
    } else {
      actx.kernel.submitInstruction(new GainShieldInstruction({ target: actx.unit, amount: 4 }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 2 === 0
    ? { kinds: ['attack'], hits: 1, damage: 6 + unit.getStat('attack') }
    : { kinds: ['defend'], note: '自身护盾+4' }),
});

// ①' 大史莱姆：条件召唤者——场上无存活史莱姆、敌排有空位（enemies 未满
// config.maxEnemies，与前端槽位数对齐）、且上一回合没召唤过（lastSummonTurn
// 冷却一整轮：召唤 → 打一轮 → 视局面再召唤），满足三条才召唤；否则攻 10 + 盾 5。
// 召唤出的史莱姆尾插 enemies（本回合行动循环快照已取，下回合起参战）。
function bigSlimeCanSummon(unit, battleState, atTurn = battleState.turn.count) {
  const noSlime = !aliveEnemies(battleState).some(e => e.defId === 'slime');
  const hasSlot = battleState.enemies.length < (battleState.config?.maxEnemies ?? 4);
  // atTurn：行动侧传缺省（当前回合）；意图预告传 turn.count+1（预告发生在敌方回合末，
  // 为下一回合预告——冷却闸门按行动时点的回合计算，否则系统性差一拍「预告攻击、
  // 实际召唤」）。noSlime/hasSlot 仍可能被玩家回合行动改变，属预告的天然残差）
  const notSummonedLastTurn = unit.lastSummonTurn !== atTurn - 1;
  return noSlime && hasSlot && notSummonedLastTurn;
}
registerEnemy({
  id: 'bigSlime', name: '大史莱姆',
  createUnit: () => new Enemy({ defId: 'bigSlime', name: '大史莱姆', maxHp: 44 }),
  act(actx) {
    const { unit, battleState: bs } = actx;
    if (bigSlimeCanSummon(unit, bs)) {
      unit.lastSummonTurn = bs.turn.count;
      actx.kernel.submitInstruction(new UnitSpawnInstruction({
        unit: getEnemyDefinition('slime').createUnit(),
        source: unit,
      }));
      return;
    }
    actx.kernel.submitInstruction(new DealDamageInstruction({
      source: unit, target: actx.player, amount: 10 + unit.getStat('attack'),
    }));
    actx.kernel.submitInstruction(new GainShieldInstruction({ target: unit, amount: 5 }));
  },
  getIntention: (unit, battleState) => (bigSlimeCanSummon(unit, battleState, battleState.turn.count + 1)
    ? { kinds: ['summon'], note: '召唤史莱姆' }
    : { kinds: ['attack', 'defend'], hits: 1, damage: 10 + unit.getStat('attack'), note: '并获护盾5' }),
});

// ② 带效果联动的小 Boss：每第三次行动给玩家上 2 层燃烧，其余时间攻 10
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
        source: actx.unit, target: actx.player, amount: 10 + actx.unit.getStat('attack'),
      }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 3 === 2
    ? { kinds: ['debuff'], note: '赋予玩家燃烧2' }
    : { kinds: ['attack'], hits: 1, damage: 10 + unit.getStat('attack') }),
});

// ③ 针鼠：先竖刺（荆棘+2）后进攻——惩罚无脑打脸，逼玩家读意图择时出手
registerEnemy({
  id: 'hedgehog', name: '针鼠',
  createUnit: () => new Enemy({ defId: 'hedgehog', name: '针鼠', maxHp: 18 }),
  act(actx) {
    if (actx.unit.actionIndex % 2 === 0) {
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.unit, effectId: 'thorns', stacks: 2,
      }));
    } else {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 6 + actx.unit.getStat('attack'),
      }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 2 === 0
    ? { kinds: ['buff'], note: '自身荆棘+2' }
    : { kinds: ['attack'], hits: 1, damage: 6 + unit.getStat('attack') }),
});

// ④ 暗影刺客：蓄势滚雪球——攻 → 蓄势+2（每层攻击+1）→ 突袭（高基数），
// 拖久了威胁线性上升，逼玩家集火或速杀
registerEnemy({
  id: 'shadowblade', name: '暗影刺客',
  createUnit: () => new Enemy({ defId: 'shadowblade', name: '暗影刺客', maxHp: 26 }),
  act(actx) {
    const phase = actx.unit.actionIndex % 3;
    if (phase === 1) {
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.unit, effectId: 'focus', stacks: 2,
      }));
    } else {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player,
        amount: (phase === 0 ? 6 : 14) + actx.unit.getStat('attack'),
      }));
    }
  },
  getIntention: (unit) => {
    const phase = unit.actionIndex % 3;
    if (phase === 1) return { kinds: ['buff'], note: '自身蓄势+2（攻击+2）' };
    return { kinds: ['attack'], hits: 1, damage: (phase === 0 ? 6 : 14) + unit.getStat('attack') };
  },
});

// ⑤ 怨灵：攻 → 咒（虚弱2：玩家攻击-2）循环——削弱玩家的输出轴，长线磨损
registerEnemy({
  id: 'wraith', name: '怨灵',
  createUnit: () => new Enemy({ defId: 'wraith', name: '怨灵', maxHp: 22 }),
  act(actx) {
    if (actx.unit.actionIndex % 2 === 1) {
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.player, effectId: 'weaken', stacks: 2,
      }));
    } else {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 8 + actx.unit.getStat('attack'),
      }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 2 === 1
    ? { kinds: ['debuff'], note: '赋予玩家虚弱2（攻击-2）' }
    : { kinds: ['attack'], hits: 1, damage: 8 + unit.getStat('attack') }),
});

// ⑥ 石像卫士：高防厚血 + 再生续航——再生3 → 攻 → 盾 循环，考验破防与斩杀线
registerEnemy({
  id: 'gargoyle', name: '石像卫士',
  createUnit: () => new Enemy({ defId: 'gargoyle', name: '石像卫士', maxHp: 34, defense: 2 }),
  act(actx) {
    const phase = actx.unit.actionIndex % 3;
    if (phase === 0) {
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.unit, effectId: 'regen', stacks: 3,
      }));
    } else if (phase === 1) {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 10 + actx.unit.getStat('attack'),
      }));
    } else {
      actx.kernel.submitInstruction(new GainShieldInstruction({ target: actx.unit, amount: 6 }));
    }
  },
  getIntention: (unit) => {
    const phase = unit.actionIndex % 3;
    if (phase === 0) return { kinds: ['buff'], note: '自身再生3' };
    if (phase === 1) return { kinds: ['attack'], hits: 1, damage: 10 + unit.getStat('attack') };
    return { kinds: ['defend'], note: '自身护盾+6' };
  },
});

// ⑦ 夜蝠：汲血（攻击并自愈）×2 → 尖啸（滞气1：玩家下回合无法抽牌）
// 滞气尖啸是节奏型威胁——被叫到的回合要么硬打要么吃伤害
registerEnemy({
  id: 'nightbat', name: '夜蝠',
  createUnit: () => new Enemy({ defId: 'nightbat', name: '夜蝠', maxHp: 24 }),
  act(actx) {
    if (actx.unit.actionIndex % 3 === 2) {
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.player, effectId: 'stall', stacks: 1,
      }));
    } else {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 8 + actx.unit.getStat('attack'),
      }));
      actx.kernel.submitInstruction(new ApplyHealInstruction({
        target: actx.unit, amount: 3,
      }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 3 === 2
    ? { kinds: ['debuff'], note: '赋予玩家滞气1（下回合无法抽牌）' }
    : { kinds: ['attack', 'buff'], hits: 1, damage: 8 + unit.getStat('attack'), note: '攻击并自愈3' }),
});

// ⑧ 岩甲龟：龟缩（盾7 + 荆棘1）→ 重击 循环——盾棘一体的防御压迫，
// 打盾要吃反伤，绕盾要挨重击
registerEnemy({
  id: 'rockshell', name: '岩甲龟',
  createUnit: () => new Enemy({ defId: 'rockshell', name: '岩甲龟', maxHp: 30, defense: 1 }),
  act(actx) {
    if (actx.unit.actionIndex % 2 === 0) {
      actx.kernel.submitInstruction(new GainShieldInstruction({ target: actx.unit, amount: 7 }));
      actx.kernel.submitInstruction(new AddEffectInstruction({
        target: actx.unit, effectId: 'thorns', stacks: 1,
      }));
    } else {
      actx.kernel.submitInstruction(new DealDamageInstruction({
        source: actx.unit, target: actx.player, amount: 10 + actx.unit.getStat('attack'),
      }));
    }
  },
  getIntention: (unit) => (unit.actionIndex % 2 === 0
    ? { kinds: ['defend', 'buff'], note: '自身护盾7 + 荆棘1' }
    : { kinds: ['attack'], hits: 1, damage: 10 + unit.getStat('attack') }),
});
