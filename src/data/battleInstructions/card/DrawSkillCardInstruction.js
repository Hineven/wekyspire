/**
 * DrawSkillCardInstruction - 抽卡元语
 * 
 * 从牌库抽取指定数量的卡牌到手牌
 * 
 * 功能：
 * 1. 从backupSkills移动卡牌到frontierSkills
 * 2. 入队卡牌出现动画
 * 3. 触发SKILL_DRAWN事件
 * 4. 检查手牌上限和牌库剩余
 */

import { BattleInstruction } from '../BattleInstruction.js';
import { submitInstruction } from '../globalExecutor.js';
import { DrawOneSkillCardInstruction } from './DrawOneSkillCardInstruction.js';

export class DrawSkillCardInstruction extends BattleInstruction {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @param {Player} config.player - 玩家对象
   * @param {number} config.count - 抽卡数量
   * @param {BattleInstruction|null} config.parentInstruction - 父元语引用
   */
  constructor({ player, count = 1, parentInstruction = null }) {
    super({ parentInstruction });
    
    if (!player) {
      throw new Error('DrawSkillCardInstruction: player is required');
    }
    if (typeof count !== 'number' || count < 0) {
      throw new Error('DrawSkillCardInstruction: count must be a non-negative number');
    }
    
    this.player = player;
    this.count = count;
    
    /**
     * 已抽取的卡牌列表
     * @type {Array<Skill>}
     */
    this.drawnSkills = [];
  }

  /**
   * 执行抽卡
   * 
   * @returns {Promise<boolean>} 始终返回true（一次性完成）
   */
  async execute() {
    const modPlayer = this.player.getModifiedPlayer ? this.player.getModifiedPlayer() : this.player;
    // 计算一次最多可尝试的抽卡次数（软上限），具体每张在单卡指令内再做边界判断
    const maxTry = Math.min(
      this.count,
      modPlayer.maxDrawSkillCardCount,
      modPlayer.maxHandSize - modPlayer.frontierSkills.length,
      modPlayer.backupSkills.length
    );
    if (maxTry <= 0) {
      return true;
    }

    for (let i = 0; i < maxTry; i++) {
      const inst = new DrawOneSkillCardInstruction({ player: this.player, parentInstruction: this });
      submitInstruction(inst);
    }
    return true;
  }

  /**
   * 获取调试信息
   * @returns {string}
   */
  getDebugInfo() {
    return `${super.getDebugInfo()} Player:${this.player.name} Count:${this.count} Drawn:${this.drawnSkills.length}`;
  }
}
