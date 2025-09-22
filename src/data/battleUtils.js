// battleUtil.js - 提供战斗中的攻击结算、治疗结算等修改战斗状态相关助手函数，以供技能、敌人和效果结算逻辑调用

import { processPostAttackEffects, processAttackTakenEffects, processDamageTakenEffects, processAttackFinishEffects } from './effectProcessor.js';
import { addBattleLog, addDamageLog, addDeathLog, addHealLog } from './battleLogUtils.js';

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
  // 处理受到伤害时的效果
  finalDamage = processDamageTakenEffects(target, finalDamage);
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
  // 处理受到伤害时的效果
  finalDamage = processDamageTakenEffects(target, finalDamage);
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