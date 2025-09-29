// battleUtil.js - 提供战斗中的攻击结算、治疗结算等修改战斗状态相关助手函数，以供技能、敌人和效果结算逻辑调用

import {
  processPostAttackEffects, processAttackTakenEffects, processDamageTakenEffects, processAttackFinishEffects
} from './effectProcessor.js';
import { addBattleLog, addDamageLog, addDeathLog, addHealLog } from './battleLogUtils.js';
import {enqueueUI} from "./animationDispatcher";
import backendEventBus, {EventNames} from "../backendEventBus";

// 将护盾/生命结算 + 日志输出 + 死亡判定抽象为通用助手
function applyDamageAndLog(target, mitigatedDamage, { mode = 'attack', attacker = null, source = null } = {}) {
  const passThoughDamage = mitigatedDamage;
  let hpDamage = 0;

  if (mitigatedDamage > 0) {
    // 先打护盾
    const shieldDamage = Math.min(target.shield, mitigatedDamage);
    target.shield -= shieldDamage;
    mitigatedDamage -= shieldDamage;
    hpDamage = mitigatedDamage;
    target.hp = Math.max(target.hp - mitigatedDamage, 0);

    if (mitigatedDamage > 0) {
      if (mode === 'attack') {
        if (attacker) {
          addDamageLog(`${attacker.name} 攻击了 ${target.name}，造成 /red{${mitigatedDamage}} 点伤害！`);
        } else {
          addDamageLog(`你受到${mitigatedDamage}点伤害！`);
        }
      } else {
        // direct（dealDamage）风格
        addDamageLog(`你${source ? `从${source.name}受到` : '受到'}${mitigatedDamage}点伤害！`);
      }
    } else {
      if (mode === 'attack') {
        if (attacker) addBattleLog(`${attacker.name} 攻击了 ${target.name}，被护盾拦下了！`);
        else addBattleLog(`你的护盾挡下伤害！`);
      } else {
        addBattleLog(`你的护盾挡下${source ? `自${source.name}` : ''}的伤害。`);
      }
    }
  } else {
    if (mode === 'attack') {
      if (attacker) addBattleLog(`${attacker.name} 攻击了 ${target.name}，但不起作用！`);
      else addBattleLog(`你被攻击，但没有作用！`);
    } else {
      addBattleLog(`你${source ? `从${source.name}受到` : '受到'}伤害，但不起作用！`);
    }
  }

  // 所有伤害结算完毕，处理受到伤害时的效果
  processDamageTakenEffects(target, passThoughDamage, hpDamage)

  if (target.hp <= 0) {
    addDeathLog(`${target.name} 被击败了！`);
    return { dead: true, passThoughDamage, hpDamage };
  }

  return { dead: false, passThoughDamage, hpDamage };
}

// 任意攻击的结算逻辑（由skill、enemy和effect结算调用）
// @return {dead: target是否死亡, passThoughDamage: 真实造成的对护盾和生命的伤害总和, hpDamage: 对生命造成的伤害}
export function launchAttack (attacker, target, damage) {

  // 攻击者对攻击的后处理
  let finalDamage = damage + attacker.attack;
  if (attacker) {
    finalDamage = processPostAttackEffects(attacker, target, damage);
  }
  // 处理受到攻击时的效果
  finalDamage = processAttackTakenEffects(target, finalDamage);
  // 固定防御减免
  finalDamage = Math.max(finalDamage - target.defense, 0);

  const result = applyDamageAndLog(target, finalDamage, { mode: 'attack', attacker });

  if (!result.dead) {
    // 发射攻击完成事件，用于结算攻击特效等
    processAttackFinishEffects(attacker, target, result.hpDamage, result.passThoughDamage);
  }

  return result;
}

// 造成伤害的结算逻辑（由skill和enemy调用），和发动攻击不同，跳过攻击方攻击相关结算。
// @return {dead: target是否死亡, passThoughDamage: 真实造成的对护盾和生命的伤害总和, hpDamage: 对生命造成的伤害}
export function dealDamage (source, target, damage, penetrateDefense = false) {
  let finalDamage = damage;
  // 固定防御减免
  if(!penetrateDefense) finalDamage = Math.max(finalDamage - target.defense, 0);

  return applyDamageAndLog(target, finalDamage, { mode: 'direct', source });
}

// 任意获得护盾的结算逻辑
export function gainShield (caster, target, shield) {
  target.shield += shield;
  if(caster === target) {
    addHealLog(`${target.name}获得了${shield}点护盾！`);
  } else {
    addHealLog(`${target.name}从${caster.name}获得了${shield}点护盾！`);
  }
  // 移除事件通知，改由状态变化驱动UI
}

// 统一的效果添加入口（通过动画队列事件）
export function addEffect(target, effectName, stacks = 1) {
  if (stacks === 0) return;
  const previousStacks = target.effects[effectName] || 0;

  if (target.effects[effectName]) {
    target.effects[effectName] += stacks;
  } else {
    target.effects[effectName] = stacks;
  }

  const currStacks = target.effects[effectName] || 0;

}

// 统一的效果移除入口
export function removeEffect(target, effectName, stacks = 1) {
  addEffect(target, effectName, -stacks);
}
// 统一的治疗入口（通过 changeHp，考虑到上限）
export function applyHeal(target, heal) {
  // 统一的治疗入口
  const canHeal = Math.max(0, target.maxHp - target.hp);
  const delta = Math.min(canHeal, heal);
  target.hp += heal;
  if (target.hp > target.maxHp) target.hp = target.maxHp;
  // 如需日志，可在此处添加，但为避免重复日志，保持静默
  // addHealLog(`${target.name}恢复了${heal}点生命！`);
}

export function drawSkillCard(player, number = 1) {
  for (let i = 0; i < number; i++) {
    if (player.frontierSkills.length >= player.maxHandSize) {
      // addBattleLog('你的手牌已满，无法抽取更多卡牌！');
      break;
    }
    if (player.backupSkills.length === 0) {
      // addBattleLog('你的后备技能已空，无法抽取更多卡牌！');
      break;
    }
    // 对于入手而言，动画是自动编排的，所以这里无需手动触发

    const firstSkill = player.backupSkills.shift();
    player.frontierSkills.push(firstSkill);

  }
}

export function dropSkillCard(player, skillID) {
  const index = player.frontierSkills.findIndex(skill => skill.uniqueID === skillID);
  if (index !== -1) {
    // 播放动画
    enqueueUI('animateCardById', {id: skillID, kind: 'drop'});
    // 执行逻辑
    const [droppedSkill] = player.frontierSkills.splice(index, 1);
    player.backupSkills.push(droppedSkill);
    // 触发技能丢弃事件
    backendEventBus.emit(EventNames.Player.SKILL_DROPPED, { skill: droppedSkill });
  } else {
    console.warn(`技能 ${skillID} 不在前台技能列表中，无法丢弃。`);
  }
}

export function burnSkillCard(player, skillID) {
  if(!skillID) {
    console.warn('未指定技能ID，无法焚烧技能。');
    return;
  }
  const frontierIndex = player.frontierSkills.findIndex(skill => skill.uniqueID === skillID);
  const backupIndex = player.backupSkills.findIndex(skill => skill.uniqueID === skillID);
  if(frontierIndex === -1 && backupIndex === -1) {
    console.warn(`技能ID为 ${skillID} 的技能不在前台或后备技能列表中，无法焚烧。`);
    return;
  }
  // 播放动画
  enqueueUI('animateCardById', {id: skillID, kind: 'burn'});
  let exhaustedSkill = null;
  if (frontierIndex !== -1) {
    exhaustedSkill = player.frontierSkills.splice(frontierIndex, 1)[0];
    // 从玩家技能列表中移除该技能
    const skillListIndex = player.skills.findIndex(skill => skill === exhaustedSkill);
    if (skillListIndex !== -1) {
      player.skills.splice(skillListIndex, 1);
    }
  }
  if (backupIndex !== -1) {
    exhaustedSkill = player.backupSkills.splice(backupIndex, 1)[0];
    // 从玩家技能列表中移除该技能
    const skillListIndex = player.skills.findIndex(skill => skill === exhaustedSkill);
    if (skillListIndex !== -1) {
      player.skills.splice(skillListIndex, 1);
    }
  }
  // 触发技能焚毁事件
  backendEventBus.emit(EventNames.Player.SKILL_BURNT, { skill: exhaustedSkill });
}