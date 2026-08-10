import { createRegistry } from '../registryFactory.js';

// 技能定义注册表。定义为 plain object，字段契约见计划文档 §2.4：
// { id, name, type, tier, series, subtitle, keywords, cost, charges,
//   cardMode, activated?, subscriptions?, canUse?, use, describe, meta }
// tier 取值：'D'|'C'|'B'|'A'（晋升阶梯，升序）|'S'（特级，阶梯外）|'Z'（诅咒，阶梯外）。
// 见 SKILL_DESIGN_PRINCIPLES.md「养成与等阶」节。
const reg = createRegistry('技能');

export const registerSkill = reg.register;
export const getSkillDefinition = reg.get;
export const hasSkill = reg.has;
export const clearSkillRegistry = reg.clear;
export const allSkills = reg.all;
