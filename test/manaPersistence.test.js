import { describe, it, expect } from 'vitest';
import '../src/core/content/index.js'; // 注册全部最小内容
import { BattleDriver } from '../src/core/sdk/driver.js';
import { createRecordingPresenter } from '../src/core/presenter.js';
import { getEnemyDefinition } from '../src/core/enemies/registry.js';
import { createBattle, startBattle } from '../src/core/flow/battle.js';

// 魏启（mana）= 跨战斗持久的纯存量资源：战前不回满、回合开始不回满。
// 回复途径只有营地/进阶/卡牌手段（见 RUN_DESIGN §2）。
describe('魏启无自然恢复', () => {
  it('回合开始不回满魏启', () => {
    const d = new BattleDriver({ deck: ['inflame', 'inflame', 'punch'], enemies: ['slime'], seed: 3 });
    d.start().play('inflame');
    expect(d.player.mana).toBe(2);
    d.endTurn(); // 敌方回合 → 第二玩家回合
    expect(d.player.mana).toBe(2); // 不回满
    d.play('inflame');
    expect(d.player.mana).toBe(1);
    d.endTurn();
    expect(d.player.mana).toBe(1);
  });

  it('跨战斗持久：下一场战斗战前不回满', () => {
    const d = new BattleDriver({ deck: ['inflame'], enemies: ['slime'], seed: 5 });
    d.start().play('inflame');
    expect(d.player.mana).toBe(2);

    // 复用同一 runState 开启第二场战斗（模拟爬塔进入下一层）
    const battle2 = createBattle({
      runState: d.ctx.runState,
      enemies: [getEnemyDefinition('slime').createUnit()],
      seed: 6,
      presenter: createRecordingPresenter(),
    });
    startBattle(battle2);
    expect(d.player.mana).toBe(2); // 战前不回满
    expect(battle2.ctx.player).toBe(d.player);
  });
});
