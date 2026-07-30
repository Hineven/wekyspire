import BattleInstruction from '../kernel/BattleInstruction.js';

// 伤害结算：防御减免 → 护盾吸收（pierce 跳过护盾与防御）→ 扣 HP。
// payload 白名单 ['damage', 'pierce']：PRE 订阅可改伤害/穿透（斩灭翻倍、易伤加深等）。
// POST 订阅经 result 读结算明细（暴怒反击、受伤联动等）。
export class DealDamageInstruction extends BattleInstruction {
  constructor({ source = null, target, amount, pierce = false }, opts = {}) {
    super(opts);
    this.source = source;       // Unit | null（环境伤害等无来源）
    this.target = target;       // Unit
    this.amount = amount;       // 基础伤害（不含攻击面板；攻击面板由调用方算入或经 PRE）
    this.basePierce = pierce;
  }

  get modifiablePayload() { return ['damage', 'pierce']; }

  buildPayload() {
    this.payload.damage = this.amount;
    this.payload.pierce = this.basePierce;
  }

  execute(ctx) {
    const target = this.target;
    const defense = this.payload.pierce ? 0 : target.getStat('defense');
    let dmg = Math.max(this.payload.damage - defense, 0);
    const defenseBlocked = this.payload.damage - dmg;

    let shieldAbsorbed = 0;
    if (!this.payload.pierce && target.shield > 0) {
      shieldAbsorbed = Math.min(target.shield, dmg);
      target.shield -= shieldAbsorbed;
      dmg -= shieldAbsorbed;
    }

    target.hp = Math.max(target.hp - dmg, 0);

    this.result = {
      damage: this.payload.damage,
      defenseBlocked,
      shieldAbsorbed,
      dealt: dmg,
      targetDead: target.isDead(),
    };

    // history（以我方阵营视角统计：瑞米等我方单位的输出/承伤都算在内）
    if (this.source?.side === 'player') {
      ctx.battleState.history.turn.damageDealt += dmg;
      ctx.battleState.history.battle.damageDealt += dmg;
    }
    if (target.side === 'player') {
      ctx.battleState.history.turn.damageTaken += dmg;
      ctx.battleState.history.battle.damageTaken += dmg;
    }

    ctx.presenter?.damage?.({
      source: this.source, target, dealt: dmg,
      defenseBlocked, shieldAbsorbed, pierce: this.payload.pierce,
    });
    if (target.isDead()) ctx.presenter?.unitDeath?.({ unit: target });
    return true;
  }
}

// 治疗：白名单 ['amount']，不超过 maxHp。
export class ApplyHealInstruction extends BattleInstruction {
  constructor({ target, amount }, opts = {}) {
    super(opts);
    this.target = target;
    this.amount = amount;
  }

  get modifiablePayload() { return ['amount']; }

  buildPayload() {
    this.payload.amount = this.amount;
  }

  execute(ctx) {
    const target = this.target;
    const before = target.hp;
    target.hp = Math.min(target.hp + this.payload.amount, target.maxHp);
    const healed = target.hp - before;
    this.result = { healed };

    if (target.side === 'player') {
      ctx.battleState.history.turn.healing += healed;
      ctx.battleState.history.battle.healing += healed;
    }
    ctx.presenter?.heal?.({ target, healed });
    return true;
  }
}

// 获得护盾：白名单 ['amount']。
export class GainShieldInstruction extends BattleInstruction {
  constructor({ target, amount }, opts = {}) {
    super(opts);
    this.target = target;
    this.amount = amount;
  }

  get modifiablePayload() { return ['amount']; }

  buildPayload() {
    this.payload.amount = this.amount;
  }

  execute(ctx) {
    this.target.shield += this.payload.amount;
    this.result = { gained: this.payload.amount };
    ctx.presenter?.shield?.({ target: this.target, gained: this.payload.amount });
    return true;
  }
}
