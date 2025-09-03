import Enemy from '../enemy.js';

// 史莱姆敌人
export class Slime extends Enemy {
  constructor(battleIntensity) {
    const hp = 15 + 5 * battleIntensity;
    const attack = 1 + battleIntensity;
    super('史莱姆', hp, attack, 1, battleIntensity + 1);
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
  }

  // 执行行动
  act(player, battleLogs) {
    // const actions = [
    //   () => ({ type: 'attack', value: 3 + this.attack }),
    //   () => ({ type: 'attack', value: 2 * this.attack }),
    //   () => ({ type: 'defend', value: 2 + this.magic })
    // ];
    
    // const action = actions[this.actionIndex % actions.length];
    // this.actionIndex++;
    
    // return action();
  }
}

// 瑞米敌人
export class Remi extends Enemy {
  constructor(battleIntensity) {
    const hp = 20 + 5 * battleIntensity;
    const attack = 1 + battleIntensity;
    super('魔化瑞米', hp, attack, 1, battleIntensity + 1);
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.moneyStolen = false;
  }

  // 执行行动
  act(player, battleLogs) {
    // const actions = [
    //   () => ({ type: 'attack', value: 6 + this.attack }),
    //   () => ({ type: 'dodge', stacks: 1 }),
    //   () => {
    //     if (!this.moneyStolen) {
    //       this.moneyStolen = true;
    //       return { type: 'steal', damage: 3, money: 10 };
    //     } else {
    //       return { type: 'attack', value: 6 + this.attack };
    //     }
    //   },
    //   () => ({ type: 'dodge', stacks: 1 })
    // ];
    
    // const action = actions[this.actionIndex % actions.length];
    // this.actionIndex++;
    
    // return action();
  }
}