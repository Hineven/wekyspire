import { registerAbility } from '../abilities/registry.js';

// 战意：战斗开始时获得 1 层力量
registerAbility({
  id: 'battleFocus', name: '战意',
  description: '战斗开始时获得 1 层力量。',
  onBattleStart(ctx) {
    ctx.player.addEffect('strength', 1);
  },
});
