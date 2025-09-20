// battleUtil.js - 提供战斗中的攻击结算、治疗结算等修改战斗状态相关助手函数，以供技能、敌人和效果结算逻辑调用

import eventBus from '../eventBus.js';
import { processPostAttackEffects, processAttackTakenEffects, processDamageTakenEffects, processAttackFinishEffects } from './effectProcessor.js';
import { addBattleLog, addDamageLog, addDeathLog, addHealLog } from './battleLogUtils.js';

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
  const passThoughDamage = finalDamage;
  let hpDamage = 0;


  if (finalDamage > 0) {
    // 优先伤害护盾（如果有）
    const shieldDamage = Math.min(target.shield, finalDamage);
    target.shield -= shieldDamage;
    finalDamage -= shieldDamage;
    hpDamage = finalDamage;
    target.hp = Math.max(target.hp - finalDamage, 0);
    if(finalDamage > 0) {
      if(attacker) {
        addDamageLog(`${attacker.name} 攻击了 ${target.name}，造成 /red{${finalDamage}} 点伤害！`);
      } else {
        addDamageLog(`你受到${finalDamage}点伤害！`);
      }
    } else {
      if(attacker) addBattleLog(`${attacker.name} 攻击了 ${target.name}，被护盾拦下了！`);
      else addBattleLog(`你的护盾挡下伤害！`);
    }
  } else {
    if(attacker) addBattleLog(`${attacker.name} 攻击了 ${target.name}，但不起作用！`);
    else addBattleLog(`你被攻击，但没有作用！`);
  }
  
  // 检查目标是否死亡
  if (target.hp <= 0) {
    addDeathLog(`${target.name} 被击败了！`);
    // 移除面向前端的事件通知（统一用状态触发动画）
    return {dead: true, passThoughDamage: passThoughDamage, hpDamage: hpDamage};
  }

  // 发射攻击完成事件，用于结算攻击特效等
  processAttackFinishEffects(attacker, target, hpDamage, passThoughDamage);
  
  // 移除 unit-hurt 与 update-skill-descriptions 事件（统一前端由状态变化驱动）
  
  return {dead: false, passThoughDamage: passThoughDamage, hpDamage: hpDamage};
}

// 造成伤害的结算逻辑（由skill和enemy调用），和发动攻击不同，跳过攻击方攻击相关结算。
// @return {dead: target是否死亡, passThoughDamage: 真实造成的对护盾和生命的伤害总和, hpDamage: 对生命造成的伤害}
export function dealDamage (source, target, damage, penetrateDefense = false) {
  let finalDamage = damage;
  // 处理受到伤害时的效果
  finalDamage = processDamageTakenEffects(target, finalDamage);
  // 固定防御减免
  if(!penetrateDefense) finalDamage = Math.max(finalDamage - target.defense, 0);
  const passThoughDamage = finalDamage;
  let hpDamage = 0;
  
  if (finalDamage > 0) {
    // 优先伤害护盾（如果有）
    const shieldDamage = Math.min(target.shield, finalDamage);
    target.shield -= shieldDamage;
    finalDamage -= shieldDamage;
    hpDamage = finalDamage;
    target.hp = Math.max(target.hp - finalDamage, 0);
    if(finalDamage > 0) {
      addDamageLog(`你${source ? `从${source.name}受到` : '受到'}${finalDamage}点伤害！`);
    } else {
      addBattleLog(`你的护盾挡下${source ? `自${source.name}` : ''}的伤害。`);
    }
  } else {
    addBattleLog(`你${source ? `从${source.name}受到` : '受到'}伤害，但不起作用！`);
  }
  
  // 检查目标是否死亡
  if (target.hp <= 0) {
    addDeathLog(`${target.name} 被击败了！`);
    return {dead: true, passThoughDamage: passThoughDamage, hpDamage: hpDamage};
  }
  
  // 移除 unit-hurt 与 update-skill-descriptions 事件（统一前端由状态变化驱动）
  
  return {dead: false, passThoughDamage: passThoughDamage, hpDamage: hpDamage};
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

// 手动更新所有技能描述（保留函数但不再通过事件触发）
export function updateSkillDescriptions() {
  // no-op: SkillCard将通过watchers基于状态自动更新描述
}

// 统一的效果添加入口
export function addEffect(target, effectName, stacks = 1) {
  if (stacks === 0) return;
  const previousStacks = target.effects[effectName] || 0;

  if (target.effects[effectName]) {
    target.effects[effectName] += stacks;
  } else {
    target.effects[effectName] = stacks;
  }

  const currStacks = target.effects[effectName] || 0;

  // 触发效果变化事件（统一payload键名）
  eventBus.emit('effect-change', {
    target: target,
    effectName: effectName,
    deltaStacks: stacks,
    currStacks: currStacks,
    previousStacks: previousStacks
  });

  // 如果需要，这里可以追加日志/描述更新
  // eventBus.emit('update-skill-descriptions');
}

// 统一的效果移除入口
export function removeEffect(target, effectName, stacks = 1) {
  addEffect(target, effectName, -stacks);
}

// 统一的治疗入口
export function applyHeal(target, heal) {
  if (heal > 0) {
    target.hp += heal;
    if (target.hp > target.maxHp) target.hp = target.maxHp;
    // 如需日志，可在此处添加，但为避免重复日志，保持静默
    // addHealLog(`${target.name}恢复了${heal}点生命！`);
  }
  // 更新技能描述（因为玩家状态可能已改变）
  // eventBus.emit('update-skill-descriptions');
}
