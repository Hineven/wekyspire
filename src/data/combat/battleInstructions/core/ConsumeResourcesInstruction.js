/**
 * ConsumeResourcesInstruction - 消耗资源元语
 * 
 * 消耗所需的资源：
 * - 行动力（actionPoints）
 * - 灵力（mana）
 * - 脉位耐力（durability）
 * - 真元（fundam）
 * 流程为：
 *   依次消耗指定量指定资源（如果资源不足，直接消耗到0）
 *   如果透支，展开透支指令ResourceOverdraftInstruction
 * 留存：
 * - 消耗总量
 * - 透支资源（如果有）
 */

import { BattleInstruction } from '../BattleInstruction.js';
import { submitInstruction } from '../globalExecutor.js';

export class ConsumeResourcesInstruction extends BattleInstruction {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {Player} config.player - 玩家对象
   * @param {Object} config.source - 消耗来源，一般为Skill或Acupoint
   * @param {Object} config.consumption - 消耗量对象，包含actionPoints, mana, durability, fundam, 默认值为0
   * @param {BattleInstruction|null} config.parentInstruction - 父元语引用
   */
  constructor({ player, source, consumption = { actionPoints: 0, mana: 0, durability: 0, fundam: 0 }, parentInstruction = null }) {
    super({ parentInstruction });
    
    if (!player) {
      throw new Error('ConsumeSkillResourcesInstruction: player is required');
    }
    if (!source) {
      throw new Error('ConsumeSkillResourcesInstruction: source is required');
    }
    
    this.player = player;
    this.source = source;
    this.consumption = consumption;
    this.overdraft = false;
    this.overdraftInstruction = null;
  }

  /**
   * 执行资源消耗
   * 
   * @returns {Promise<boolean>} 始终返回true（一次性完成）
   */
  async execute() {
    var overdraft = false;
    // 消耗行动力
    if (this.consumption.actionPoints > 0) {
        overdraft |= this.player.consumeActionPoints(this.consumption.actionPoints);
    }
    
    // 消耗魏启
    if (this.consumption.mana > 0) {
        overdraft |= this.player.consumeMana(this.consumption.mana);
    }
    
    // 消耗使用次数
    if (this.consumption.durability > 0) {
        overdraft |= this.player.consumeDurability(this.consumption.durability);
    }
    
    // 消耗真元
    if (this.consumption.fundam > 0) {
        overdraft |= this.player.consumeFundam(this.consumption.fundam);
    }
    
    this.overdraft = overdraft;
    
    if (this.overdraft) {
        // 展开透支指令
        const overdraftInstruction = new ResourceOverdraftInstruction({
            player: this.player,
            source: this.source,
            overdraft: overdraft,
            parentInstruction: this
        });
        this.overdraftInstruction = submitInstruction(overdraftInstruction);
    }
    // 一次完成
    return true;
  }

  /**
   * 获取调试信息
   * @returns {string}
   */
  getDebugInfo() {
    return `ConsumeResourcesInstruction: Player:${this.player.name} Source:${this.source.name} AP:${this.consumption.actionPoints} Mana:${this.consumption.mana} Durability:${this.consumption.durability} Fundam:${this.consumption.fundam}`;
  }
}
