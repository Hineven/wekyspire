// filepath: c:\Users\hineven\CLionProjects\rtvl_test\src\data\battleInstructions\turnEffects\ProcessStartOfTurnEffectsInstruction.js
import { BattleInstruction } from '../BattleInstruction.js';
import { processStartOfTurnEffects } from '../../effectProcessor.js';

export class ProcessStartOfTurnEffectsInstruction extends BattleInstruction {
  constructor({ target, parentInstruction = null }) {
    super({ parentInstruction });
    this.target = target;
    this.isStunned = false;
  }

  async execute() {
    this.isStunned = !!processStartOfTurnEffects(this.target);
    return true;
  }

  getDebugInfo() {
    return `${super.getDebugInfo()} ProcessStartOfTurnEffects(${this.target?.name||'?'})`;
  }
}

