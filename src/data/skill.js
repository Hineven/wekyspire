import animationSequencer from './animation_sequencing/animationSequencer.js';
import {enqueueDelay, enqueueState} from "./animation_sequencing/animationInstructionHelpers.js";

// 技能抽象类
class Skill {
  constructor(name, type, tier,
    baseManaCost, baseDurationCost,
    skillSeriesName = undefined) {
    this.name = name; // 技能名称
    this.type = type; // 技能所属灵脉。特别地：'universal'（无属性）,'curse'（负面效果）
    this.tier = tier; // 技能等阶
    // 随机生成一个唯一ID。
    this.uniqueID = Math.random().toString(36).substring(2, 10);
    this.subtitle = ''; // 副标题，仅少量特殊技能拥有此条目
    this.baseManaCost = baseManaCost || 0; // 魏启消耗
    this.baseDurationCost = baseDurationCost || 0; // 脉位耐久消耗
    this.skillSeriesName = skillSeriesName || name; // 技能系列名称
  }

  // 简化：统一冷却事件，仅发送 'cooldown-tick'（不再区分 start/progress/end，也无 progress 数值）
  _emitCooldownTick (deltaCooldown = 1) {
    if(deltaCooldown === 0) return ; // 无变化不发动画（虽然后端仍然会有指令）
    try {
      const id = this.uniqueID;
      animationSequencer.enqueueInstruction({
        tags: ['skill-cd', `skill-${id}`],
        durationMs: 100,
        start: ({ emit }) => emit('skill-card-overlay-effect', { id, type: 'cooldown-tick', deltaCooldown: deltaCooldown }),
        meta: { skillId: id, overlay: true, phase: 'cooldown-tick' }
      });
      if(deltaCooldown !== 0) {
        enqueueDelay(0);
      }
    } catch (_) {}
  }

  // 升级覆盖层事件（升级闪光）
  _emitUpgradeFlash(deltaPower = 1) {
    try {
      const id = this.uniqueID;
      animationSequencer.enqueueInstruction({
        tags: ['skill-upgrade', `skill-${id}`],
        durationMs: 100,
        start: ({ emit }) => emit('skill-card-overlay-effect', { id, type: 'upgrade-flash', 'deltaPower': deltaPower }),
        meta: { skillId: id, overlay: true, phase: 'upgrade-flash' }
      });
    } catch (_) {}
  }

  get slowStart () {
    return this.baseSlowStart;
  }

  get manaCost () {
    return Math.max(this.baseManaCost, 0);
  }

  get maxUses () {
    return this.baseMaxUses;
  }

  get actionPointCost () {
    return Math.max(this.baseActionPointCost, 0);
  }

  get coldDownTurns() {
    return Math.max(this.baseColdDownTurns, 0);
  }

  canColdDown() {
    if(this.coldDownTurns === 0) return false;
    if(this.remainingUses === this.maxUses) return false;
    if(this.maxUses === Infinity) return false;
    return true;
  }

  // 回合开始时或被手动调用时，推进冷却流程
  coldDown(deltaStacks = 1) {
    if (this.coldDownTurns !== 0) {
      if (this.remainingUses !== this.maxUses) {
        this.remainingColdDownTurns = Math.max(this.remainingColdDownTurns - deltaStacks, 0);
        this.remainingColdDownTurns = Math.min(this.remainingColdDownTurns, this.coldDownTurns);
        let charged = false;
        if (this.remainingColdDownTurns <= 0) {
          this.remainingColdDownTurns = this.coldDownTurns;
          this.remainingUses = Math.min(this.remainingUses + 1, this.maxUses);
          charged = true;
        }
        // 无论是否完成一段充能，只要 remainingColdDownTurns 发生了变化就发一次 tick
        this._emitCooldownTick(deltaStacks);
      } else {
        this.resetColdDownProcess();
      }
    }
  }

  // power变化（升级/降级）
  powerUp(deltaPower = 1) {
    this.power += deltaPower;
    this._emitUpgradeFlash(deltaPower);
  }

  // 立刻冷却
  instantColdDown() {
    if (this.canColdDown()) {
      this.remainingUses = Math.min(this.remainingUses + 1, this.maxUses);
      this.resetColdDownProcess();
      // 重置后也算一次冷却状态变化
      this._emitCooldownTick();
    }
  }

  resetColdDownProcess() {
    this.remainingColdDownTurns = this.coldDownTurns;
  }

  getInBattleIndex (player) {
    return player.frontierSkills.findIndex(s=> s.uniqueID === this.uniqueID);
  }

  // 战斗开始时调用，用于初始化技能
  onBattleStart() {
    if(!this.slowStart) {
      this.remainingUses = this.maxUses;
      this.remainingColdDownTurns = this.coldDownTurns;
    } else {
      // 冷启动卡牌必须等待冷却后才能发动！
      this.remainingUses = 0;
      this.remainingColdDownTurns = this.coldDownTurns;
    }
    // 默认实现，子类可以重写
  }

  // 此卡进入战斗时调用
  onEnterBattle (player) {
    // 默认实现，子类可以重写
  }

  // 此卡离开战斗时调用
  onLeaveBattle (player) {
    // 默认实现，子类可以重写
  }

  // 使用技能
  // 此方法会被调用多次，直到返回值是bool类型
  // @param {Player} player: 玩家对象
  // @param {Enemy} enemy: 敌人对象
  // @param {Integer} stage: 此技能的使用阶段，默认为0，简单技能不需要考虑此参数。
  // @return {boolean} 如果返回true，表示技能使用完成，否然，stage增加一，反复调用此技能。
  use(player, enemy, stage) {
    return true;
  }

  consumeUses () {
    const prevUses = this.remainingUses;
    this.remainingUses--;
    // 使用技能本身不改变 remainingColdDownTurns，故不发送 tick；进入冷却的首个 tick 等待下一次 coldDown() 推进后发送
    try { if (prevUses === this.maxUses && this.canColdDown()) { /* 进入冷却但不发送事件 */ } } catch (_) {}
  }

  consumeResources (player) {
    player.consumeActionPoints(this.actionPointCost);
    player.consumeMana(this.manaCost);
    this.consumeUses()
  }

  // 重新生成技能描述（根据玩家状态计算具体数值）
  regenerateDescription(player) {
    // 默认实现，子类可以重写
    return '';
  }

  // 判断技能是否可用
  canUse(player) {
    // 默认实现：检查魏启和行动点是否足够
    return player.mana >= this.manaCost && player.remainingActionPoints >= this.actionPointCost && this.remainingUses > 0;
  }

  // 升级技能，子类可以重写此方法
  upgrade(deltaPower) {
    this.power += deltaPower;
    this._emitUpgradeFlash();
  }

  // 咏唱型技能启用/停用生命周期钩子（仅 cardMode === 'chant' 使用）
  onEnable(player) {
    this.isActivated = true;
    /* 默认无行为；子类可覆盖 */
  }
  onDisable(player, reason) {
    this.isActivated = false;
    /* 默认无行为；子类可覆盖 */
  }
}

export default Skill;