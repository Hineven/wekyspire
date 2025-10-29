// filepath: c:\Users\hineven\CLionProjects\rtvl_test\src\data\battleInstructions\turnEffects\ProcessEndOfTurnEffectsInstruction.js
import { BattleInstruction } from '../BattleInstruction.js';
import { processEndOfTurnEffects } from '../../effectProcessor.js';

export class ProcessEndOfTurnEffectsInstruction extends BattleInstruction {
  constructor({ target, parentInstruction = null }) {
    super({ parentInstruction });
    this.target = target;
  }

  async execute() {
    processEndOfTurnEffects(this.target);
    return true;
  }

  getDebugInfo() {
    return `${super.getDebugInfo()} ProcessEndOfTurnEffects(${this.target?.name||'?'})`;
  }
}

