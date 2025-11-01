import Enemy from '../enemy.js';
import { addEnemyActionLog } from '../battleLogUtils.js';
import { createAndSubmitLaunchAttack, createAndSubmitGainShield, createAndSubmitDiscoverSkillCard } from '../battleInstructionHelpers.js';
import { SlimeCurse } from '../skills/curse/enemyCurses.js';

// 魔化瑞米（普通）
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
    this.description = '一只并不友善的瑞米。';
  }
  calculateDamage(attack, _) { return Math.max(1, attack); }
  getIntention() {
    const next = this.actionIndex % 4;
    if (next === 0) {
      return [{ type: 'attack', times: 1, damage: this.calculateDamage(this.attack) }];
    } else if (next === 1) {
      return [{ type: 'buff', name: '闪避+1' }];
    } else if (next === 2) {
      if (!this.moneyStolen) {
        return [{ type: 'special', name: '偷钱包(10金)' }, { type: 'attack', times: 1, damage: 3 }];
      }
      return [{ type: 'attack', times: 1, damage: this.calculateDamage(6 + this.attack) }];
    } else {
      return [{ type: 'buff', name: '闪避+1' }];
    }
  }
  act(player) {
    const step = this.actionIndex % 4;
    const exec = [
      () => {
        const dmg = this.calculateDamage(this.attack, player);
        addEnemyActionLog(`${this.name} 抓挠！`);
        createAndSubmitLaunchAttack(this, player, dmg);
      },
      () => {
        this.addEffect('闪避', 1);
        addEnemyActionLog(`${this.name} 进入了闪避状态！`);
      },
      () => {
        if (!this.moneyStolen) {
          this.moneyStolen = true;
          addEnemyActionLog(`${this.name} 开始搞事！`);
          const dmg = this.calculateDamage(3, player);
          createAndSubmitLaunchAttack(this, player, dmg);
          // 金钱扣除放在行动指令后（动画完成后也能正确显示）
          // 使用 Lambda 更稳妥，这里简化：直接改值
          player.money = Math.max(0, (player.money || 0) - 10);
          addEnemyActionLog(`${this.name} 偷偷吃掉了你的钱包，你失去了10金钱！`);
        } else {
          const dmg = this.calculateDamage(6 + this.attack, player);
          addEnemyActionLog(`${this.name} 咬人！`);
          createAndSubmitLaunchAttack(this, player, dmg);
        }
      },
      () => {
        this.addEffect('闪避', 1);
        addEnemyActionLog(`${this.name} 进入了闪避状态！`);
      }
    ][step];
    exec();
    this.actionIndex++;
  }
}

// 嗡嗡虫群（普通）
export class BuzzlingBugs extends Enemy {
  constructor(battleIntensity) {
    const hp = 5 + Math.floor(2 * battleIntensity);
    const attack = 1 + Math.floor(battleIntensity * 0.5);
    super('嗡嗡虫群', hp, attack, 0,
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.description = '一群烦恼的嗡嗡虫，你很难够到它们。';
    this.effects['闪避'] = 1;
  }
  calculateDamage(a, _) { return Math.max(1, a); }
  getIntention() {
    const next = this.actionIndex % 2;
    if (next === 0) return [{ type: 'buff', name: '闪避+1' }];
    return [{ type: 'attack', times: 4, damage: this.calculateDamage(this.attack) }];
  }
  act(player) {
    const step = this.actionIndex % 2;
    if (step === 0) {
      this.addEffect('闪避', 1);
      addEnemyActionLog(`${this.name} 高高飞起，你很难碰到他们！`);
    } else {
      addEnemyActionLog(`${this.name} 集结成群，向下俯冲！`);
      const dmg = this.calculateDamage(this.attack, player);
      for (let i = 0; i < 4; i++) {
        createAndSubmitLaunchAttack(this, player, dmg);
      }
    }
    this.actionIndex++;
  }
}

// 黏黏史莱姆（普通）
export class SlimySlime extends Enemy {
  constructor(battleIntensity) {
    const hp = 27 + Math.floor(6 * battleIntensity);
    const attack = 3 + Math.floor(battleIntensity * 0.6);
    super('黏黏史莱姆', hp, attack, 1,
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.description = '一只充满了粘液的史莱姆。';
  }
  calculateDamage(a, _) { return Math.max(1, a); }
  getIntention() {
    const next = this.actionIndex % 3;
    if (next === 0) return [{ type: 'special', name: '喷粘液(向你的牌库加入诅咒)' }];
    if (next === 1) return [{ type: 'attack', times: 1, damage: this.calculateDamage(this.attack) }];
    return [{ type: 'attack', times: 1, damage: this.calculateDamage(2 * this.attack) }];
  }
  act(player) {
    const step = this.actionIndex % 3;
    if (step === 0) {
      const curse = new SlimeCurse();
      createAndSubmitDiscoverSkillCard(player, curse, 'deck');
      addEnemyActionLog(`${this.name} 喷了你一脸，你的后备技能中多了一张/skill{${curse.name}}！`);
    } else if (step === 1) {
      addEnemyActionLog(`${this.name} 冲撞！`);
      const dmg = this.calculateDamage(this.attack, player);
      createAndSubmitLaunchAttack(this, player, dmg);
    } else {
      addEnemyActionLog(`${this.name} 强力冲撞！`);
      const dmg = this.calculateDamage(2 * this.attack, player);
      createAndSubmitLaunchAttack(this, player, dmg);
    }
    this.actionIndex++;
  }
}

// 腐食甲虫（普通）
export class StinkyBugs extends Enemy {
  constructor(battleIntensity) {
    const hp = 18 + Math.floor(4 * battleIntensity);
    const attack = 1 + Math.floor(battleIntensity * 0.2);
    super('腐食甲虫', hp, attack, 1,
      new URL('../../assets/enemies/slime.png', import.meta.url).href
    );
    this.battleIntensity = battleIntensity;
    this.actionIndex = 0;
    this.description = '一群散发着臭气的大甲虫，噫，好恶心。';
    this.effects['坚固'] = 2; // 初始坚固2
  }
  calculateDamage(a, _) { return Math.max(1, a); }
  getIntention() {
    return [{ type: 'attack', times: 1, damage: this.calculateDamage(this.attack) }, { type: 'debuff', name: '中毒x3' }];
  }
  act(player) {
    addEnemyActionLog(`${this.name} 撞击！`);
    const dmg = this.calculateDamage(this.attack, player);
    createAndSubmitLaunchAttack(this, player, dmg);
    player.addEffect('中毒', 3);
    addEnemyActionLog(`${this.name} 的臭气让你感到恶心，你中毒了！`);
    this.actionIndex++;
  }
}

