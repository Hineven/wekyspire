import { registerAbility } from '../abilities/registry.js';

// 战意：战斗开始时获得 1 层力量。**不再作为初始能力授予**（2026-09 移除初始配置），
// 保留定义供旧档兼容与后续奖励/事件投放使用。
registerAbility({
  id: 'battleFocus', name: '战意',
  description: '战斗开始时获得 1 层力量。',
  onBattleStart(ctx) {
    ctx.player.addEffect('strength', 1);
  },
});
