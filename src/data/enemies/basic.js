import { launchAttack, gainShield } from '../battleUtils.js';
import Enemy from '../enemy.js';
import { addEnemyActionLog } from '../battleLogUtils.js';

// 史莱姆敌人
export class Slime extends Enemy {
  constructor(battleIntensity) {
    const hp = 27 + Math.floor(6 * battleIntensity);
    const attack = 3 + Math.floor(battleIntensity * 0.6);
    super('史莱姆', hp, attack, 1, 
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.description = "一只史莱姆，很可爱捏。";
  }

  // 计算伤害
  calculateDamage(attack, target) {
    return Math.max(1, attack);
  }

  // 执行行动
  act(player, battleLogs) {
    // 史莱姆行动序列：
    // 1. 攻击，造成【1 + 攻击力】伤害。
    // 2. 攻击，造成【2 * 攻击力】伤害。
    // 3. 防御，获得【2 + 灵能强度】护盾。
    
    const actions = [
      () => {
        addEnemyActionLog(`${this.name} 冲撞！`);
        // 攻击，造成【攻击力】伤害
        const damage = this.calculateDamage(this.attack, player);
        launchAttack(this, player, damage);
      },
      () => {
        addEnemyActionLog(`${this.name} 强力冲撞！`);
        // 攻击，造成【2 * 攻击力】伤害
        const damage = this.calculateDamage(2 * this.attack, player);
        launchAttack(this, player, damage);
      },
      () => {
        // 防御，获得【2 + 灵能强度】护盾
        const shieldAmount = 2 + this.magic;
        gainShield(this, this, shieldAmount);
        addEnemyActionLog(`${this.name} 进入防御状态，获得了 ${shieldAmount} 点护盾！`);
      }
    ];
    
    const action = actions[this.actionIndex % actions.length];
    this.actionIndex++;
    
    // 执行行动
    action();
    return {
      endTurn: true
    }
  }
}

// 瑞米敌人
export class Remi extends Enemy {
  constructor(battleIntensity) {
    const hp = 23 + 5 * battleIntensity;
    const attack = 6 + Math.floor(battleIntensity * 0.8);
    super('魔化瑞米', hp, attack, 1, 
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.moneyStolen = false;
    this.description = "一只并不友善的瑞米。";
    this.inTurnAction = 0;
  }

  // 计算伤害
  calculateDamage(attack, target) {
    return Math.max(1, attack);
  }

  // 执行行动
  act(player, battleLogs) {
    // 魔化瑞米行动序列：
    // 1. 攻击，造成【攻击力】伤害。
    // 2. 获得1层闪避。
    // 3. 吃你的钱包，造成【3】伤害，玩家失去10金钱。
    // 4. 获得1层闪避。
    
    let advanceAction = 1;

    const actions = [
      () => {
        // 攻击，造成【攻击力】伤害
        const damage = this.calculateDamage(this.attack, player);
        addEnemyActionLog(`${this.name} 抓挠！`);
        launchAttack(this, player, damage);
      },
      () => {
        // 获得1层闪避
        this.addEffect('闪避', 1);
        addEnemyActionLog(`${this.name} 进入了闪避状态！`);
      },
      () => {
        // 吃你的钱包，造成【3】伤害，玩家失去10金钱
        if (!this.moneyStolen) {
          if(this.inTurnAction == 0) {
            addEnemyActionLog(`${this.name} 开始搞事！`);
            this.inTurnAction = 1;
            advanceAction = 0;
          } else {
            this.moneyStolen = true;
            const damage = this.calculateDamage(3, player);
            const attackResult = launchAttack(this, player, damage);
            if(attackResult.hpDamage > 0) {
              player.money = Math.max(0, player.money - 10);
              addEnemyActionLog(`${this.name} 偷偷吃掉了你的钱包，你失去了10金钱！`);
            } else {
              addEnemyActionLog(`${this.name} 尝试吃你的钱包，但被挡住了！`);
            }
            this.inTurnAction = 0;
          }
        } else {
          // 如果已经偷过钱包，则执行普通攻击
          const damage = this.calculateDamage(6 + this.attack, player);
          addEnemyActionLog(`${this.name} 咬人！`);
          launchAttack(this, player, damage);
        }
      },
      () => {
        // 获得1层闪避
        this.addEffect('闪避', 1);
        addEnemyActionLog(`${this.name} 进入了闪避状态！`);
      }
    ];
    
    const action = actions[this.actionIndex % actions.length];
    
    // 执行行动
    action();
    this.actionIndex += advanceAction;
    
    return {
      endTurn: advanceAction === 0 ? false : true
    }
  }
}

// 嗡嗡虫敌人
export class BuzzlingBugs extends Enemy {
  constructor(battleIntensity) {
    const hp = 5 + Math.floor(2 * battleIntensity);
    const attack = 1 + Math.floor(battleIntensity * 0.5);
    super('嗡嗡虫群', hp, attack, 0, 
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.description = "一群烦恼的嗡嗡虫，你很难够到它们。";
    this.inTurnAction = 0;

    this.addEffect('闪避', 2);
  }

  // 计算伤害
  calculateDamage(attack, target) {
    return Math.max(1, attack);
  }

  // 执行行动
  act(player, battleLogs) {
    let advanceAction = 0;
    // 嗡嗡虫群行动序列：
    // 1. 高飞，获得 4 层闪避。
    // 2. 攻击，造成4 x 攻击力伤害。
    let actions = [
      () => {
        // 高飞，获得 4 层闪避。
        this.addEffect('闪避', 4);
        addEnemyActionLog(`${this.name} 高高飞起，你很难碰到他们！`);
        advanceAction = 1;
        return {};
      },
      () => {
        // 攻击，造成4 x 攻击力伤害。
        const damage = this.calculateDamage(this.attack, player);
        if(this.inTurnAction == 0) {
          addEnemyActionLog(`${this.name} 集结成群，向下俯冲！`);
          this.inTurnAction ++;
        } else {
          this.inTurnAction ++;
          launchAttack(this, player, damage);
          if(this.inTurnAction >= 5) {
            this.inTurnAction = 0;
            advanceAction = 1;
          }
        }
        return {};
      }
    ];

    const action = actions[this.actionIndex % actions.length];
    action();
    this.actionIndex += advanceAction;
    
    return {
      endTurn: advanceAction === 0 ? false : true,
      latency: 400
    };
  }
}

// 黏黏史莱姆敌人
import { SlimeCurse } from '../skills/curses.js';

export class SlimySlime extends Enemy {
  constructor(battleIntensity) {
    const hp = 27 + Math.floor(6 * battleIntensity);
    const attack = 3 + Math.floor(battleIntensity * 0.6);
    super('黏黏史莱姆', hp, attack, 1, 
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.description = "一只充满了粘液的史莱姆。";
  }

  // 计算伤害
  calculateDamage(attack, target) {
    return Math.max(1, attack);
  }

  // 执行行动
  act(player, battleLogs) {
    // 史莱姆行动序列：
    // 1. 诅咒，为玩家添加粘液后备技能。
    // 2. 攻击，造成【1 + 攻击力】伤害。
    // 3. 攻击，造成【2 * 攻击力】伤害。
    
    const actions = [
      () => {
        // 诅咒
        player.addBackupSkill(new SlimeCurse());
        addEnemyActionLog(`${this.name} 喷了你一脸，你的后备技能中多了一张/skill{粘液}！`);
      },
      () => {
        addEnemyActionLog(`${this.name} 冲撞！`);
        // 攻击，造成【攻击力】伤害
        const damage = this.calculateDamage(this.attack, player);
        launchAttack(this, player, damage);
      },
      () => {
        addEnemyActionLog(`${this.name} 强力冲撞！`);
        // 攻击，造成【2 * 攻击力】伤害
        const damage = this.calculateDamage(2 * this.attack, player);
        launchAttack(this, player, damage);
      }
    ];
    
    const action = actions[this.actionIndex % actions.length];
    this.actionIndex++;
    
    // 执行行动
    action();
    return {
      endTurn: true
    }
  }
}
