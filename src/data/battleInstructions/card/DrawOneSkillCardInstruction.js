// filepath: c:\Users\hineven\CLionProjects\rtvl_test\src\data\battleInstructions\card\DrawOneSkillCardInstruction.js
/**
 * DrawOneSkillCardInstruction - 抽一张牌元语
 *
 * 从牌库顶抽取1张卡到手牌，带动画与事件。
 */
import { BattleInstruction } from '../BattleInstruction.js';
import { enqueueState, captureSnapshot } from '../../animationInstructionHelpers.js';
import {enqueueAnimatableElementEnterTracking, enqueueCardAnimation} from '../../../utils/animationHelpers.js';
import backendEventBus, { EventNames } from '../../../backendEventBus.js';

export class DrawOneSkillCardInstruction extends BattleInstruction {
  constructor({ player, parentInstruction = null }) {
    super({ parentInstruction });
    if (!player) throw new Error('DrawOneSkillCardInstruction: player is required');
    this.player = player;
    this.drawnSkill = null;
  }

  async execute() {
    const mod = this.player.getModifiedPlayer ? this.player.getModifiedPlayer() : this.player;

    // 约束检查：手牌空间、抽卡上限、牌库是否有牌
    if (mod.frontierSkills.length >= mod.maxHandSize) return true;
    if (mod.maxDrawSkillCardCount <= 0) return true;
    if (!Array.isArray(this.player.backupSkills) || this.player.backupSkills.length === 0) return true;

    const skill = this.player.backupSkills.shift();
    if (!skill) return true;

    this.player.frontierSkills.push(skill);
    this.drawnSkill = skill;

    // 事件 + 状态快照 + 动画
    backendEventBus.emit(EventNames.Player.SKILL_DRAWN, { skillID: skill.uniqueID });
    enqueueState({ snapshot: captureSnapshot(), durationMs: 0 });
    // 1. 卡牌出现动画
    const appearTag = enqueueCardAnimation(skill.uniqueID, {
      from: {
        anchor: 'deck',
        scale: 0.6,
        opacity: 1
      },
      ease: 'power2.out'
    });
    // 2. 开启锚点跟踪，让卡牌自然从出现位置逐渐变大并飞入手牌
    enqueueAnimatableElementEnterTracking(skill.uniqueID, {
      waitTags: [appearTag],
      durationMs: 200
    });

    return true;
  }

  getDebugInfo() {
    return `${super.getDebugInfo()} Player:${this.player?.name} Drawn:${this.drawnSkill?.name || 'none'}`;
  }
}

