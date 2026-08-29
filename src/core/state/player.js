import Unit from './unit.js';

// 玩家：run 级实体，跨战斗存活。hp/money/deck/abilities/leino 是持久状态；
// 魏启（mana）为战斗内资源——入战置为上限一半、每回合开始 +1（battle.md §6），
// 字段寄存在此仅供战斗流程读写；shield/effects/actionPoints 同为战斗内重置与推进。
export default class Player extends Unit {
  constructor(opts = {}) {
    super({ name: '玩家', ...opts });
    this.side = 'player';
    this.maxMana = opts.maxMana ?? 3;
    this.mana = this.maxMana;
    this.maxActionPoints = opts.maxActionPoints ?? 3;
    this.actionPoints = this.maxActionPoints;
    this.money = opts.money ?? 0;
    this.deck = [];                 // run 级卡组：[skillRuntime]
    this.abilities = [];            // [abilityId]
    this.leino = {};                // 灵脉等级 { fire: 1, ... }
    this.chantSlotBase = opts.chantSlotBase ?? 1;  // 基础咏唱槽数（能力可加槽）
  }
}
