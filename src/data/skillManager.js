import Skill from './skill.js';

// 技能管理器类
class SkillManager {
  constructor() {
    this.skills = [];
    this.skillRegistry = new Map(); // 新增技能注册表
    
  }
  // 注册技能
  registerSkill(SkillClass) {
    const skillName = (new SkillClass()).name;
    this.skillRegistry.set(skillName, SkillClass);
  }

  static async loadAllSkills() {
    
    const skillManager = SkillManager.getInstance();

    // 动态导入所有技能文件
    const skillModules = [
      await import('./skills/basic.js'),
      await import('./skills/blast.js'),
      await import('./skills/cMinus.js'),
      await import('./skills/concentration.js'),
      await import('./skills/fireAssist.js'),
      await import('./skills/fireControl.js'),
      await import('./skills/heal.js'),
      await import('./skills/levitation.js'),
      await import('./skills/punchKicks.js'),
      await import('./skills/refuelWeky.js'),
      await import('./skills/shielding.js'),
      await import('./skills/speedThinking.js'),
      // await import('./skills/remi.js'),
      // await import('./skills/lumi.js')
    ];
    
    // 遍历所有模块并注册其中的技能
    for (const module of skillModules) {
      // 遍历模块中的所有导出
      for (const [key, SkillClass] of Object.entries(module)) {
        // 检查是否为Skill类的子类
        if (typeof SkillClass === 'function' && SkillClass !== Skill && SkillClass.prototype instanceof Skill) {
          try {
            skillManager.registerSkill(SkillClass);
          } catch (error) {
            console.error(`Failed to register skill: ${key}`, error);
          }
        }
      }
    }
  }
  
  // 创建技能实例
  createSkill(skillName) {
    // 使用注册表创建技能实例
    const SkillClass = this.skillRegistry.get(skillName);
    if (SkillClass) {
      const obj = new SkillClass();
      obj.description = obj.regenerateDescription();
      return obj;
    }
    throw new Error(`Unknown skill: ${skillName}`);
  }
  
  // 获取SkillManager实例
  static getInstance() {
    if (!this.instance) {
      this.instance = new SkillManager();
    }
    return this.instance;
  }
  
  // 获取随机技能
  getRandomSkills(count, playerLeino= ['normal'], playerSkillSlots = [], playerTier = 0, bestQuality = false) {
    const allSkills = Array.from(this.skillRegistry.entries()).map(([name, SkillClass]) => {
      // 创建临时实例以获取技能系列名称和等阶
      const tempSkill = new SkillClass();
      return {
        name: name,
        series: tempSkill.skillSeriesName,
        tier: tempSkill.tier,
        spawnWeight: tempSkill.spawnWeight
      };
    });

    const playerNonEmptySkillSlots = playerSkillSlots.filter(skill => skill !== null);
    const playerSkills = playerNonEmptySkillSlots.map(slot => slot);
    // console.log(playerSkills);

    // 获取玩家已有的技能系列
    const playerSkillSeries = playerSkills.map(skill => skill.skillSeriesName);
    const playerSkillNames = playerSkills.map(skill => skill.name);

    // 过滤掉玩家已有的技能和同系列的技能，以及等阶大于玩家等阶的技能
    const baseAvailableSkills = allSkills.filter(skill =>
      !playerSkillNames.includes(skill.name) &&
      !playerSkillSeries.includes(skill.series) &&
      skill.tier <= playerTier
    );

    // —— 收集玩家技能可升级目标（upgradeTo，可为字符串或数组）并加入奖池 ——
    const upgradeTargetNames = new Set();
    const upgradeSourceMap = new Map(); // targetName -> sourceSkillName
    for(const ownedSkill of playerSkills) {
      const upgradeTo = ownedSkill.upgradeTo;
      if(!upgradeTo) continue;
      if(Array.isArray(upgradeTo)) {
        upgradeTo.forEach(name => {
          if(name && name !== ownedSkill.name) {
            upgradeTargetNames.add(name);
            if(!upgradeSourceMap.has(name)) upgradeSourceMap.set(name, ownedSkill.name);
          }
        });
      } else if (typeof upgradeTo === 'string') {
        if(upgradeTo && upgradeTo !== ownedSkill.name) {
          upgradeTargetNames.add(upgradeTo);
          if(!upgradeSourceMap.has(upgradeTo)) upgradeSourceMap.set(upgradeTo, ownedSkill.name);
        }
      }
    }

    // 根据名称找到元数据并追加到可用列表（即使同系列也允许，因为这是升级路径）
    for(const targetName of upgradeTargetNames) {
      if(playerSkillNames.includes(targetName)) continue; // 已拥有不再加入
      // 查找此技能的元数据
      const meta = allSkills.find(s => s.name === targetName);
      if(!meta) continue; // 注册表中不存在
      if(meta.tier > playerTier) continue; // 仍然遵守等阶限制（如需忽略，可移除此行）
      // 避免重复
      if(!baseAvailableSkills.some(s => s.name === meta.name)) {
        baseAvailableSkills.push({ ...meta, isUpgradeCandidate: true, upgradedFrom: upgradeSourceMap.get(targetName) });
      }
    }

    const availableSkills = baseAvailableSkills; // 之后流程对 availableSkills 操作

    // 计算每个技能的出现权重
    const weightedSkills = availableSkills.map(skill => {
      const tierDifference = playerTier - skill.tier;
      let modifyFactor = 1;

      // 高等级技能出现权重降低
      if (skill.tier >= 8) modifyFactor *= 0.7;
      if (skill.tier >= 5) modifyFactor *= 0.8;

      // 等级太低的技能出现权重大幅降低
      if (tierDifference > 7) {
        modifyFactor = 0.15;
      }  else if (tierDifference > 6) {
        modifyFactor = 0.40;
      } else if (tierDifference > 5) {
        modifyFactor = 0.70;
      }

      // 增加当前等阶的技能出现权重
      if(tierDifference < 1) modifyFactor *= 1.2;

      // 高质量奖励中，贴近玩家等级上限技能概率大幅提升
      if(bestQuality && tierDifference < 1) modifyFactor *= 5;
      if(bestQuality && tierDifference < 2) modifyFactor *= 3;

      // console.log(playerLeino);
      // 特殊的，关于技能属性和灵脉属性对权重进行修正
      if(playerLeino.findIndex(skill.type) !== -1) {
        modifyFactor *= 2; // 技能属性匹配，权重翻倍
      } else {
        // 否然默认权重仅有 1/10
        modifyFactor *= 0.1;
        // 对于相对玩家的高阶异属性灵脉技能，根本无法学习
        if(tierDifference < 2) modifyFactor = 0;
      }

      // 升级候选技能稍微再提升一点（避免被其它随机权重稀释）
      if(skill.isUpgradeCandidate) modifyFactor *= 2;

      return {
        ...skill,
        weight: skill.spawnWeight * modifyFactor
      };
    });
    
    const selectedSkills = [];
    
    // 确保不会选择超过可用技能数量的技能
    const actualCount = Math.min(count, weightedSkills.length);
    
    // 带权不放回抽选
    for (let i = 0; i < actualCount; i++) {
      // 计算总权重
      const totalWeight = weightedSkills.reduce((sum, skill) => sum + skill.weight, 0);
      
      // 如果没有权重可供选择，提前跳出
      if(totalWeight <= 0) break;

      // 生成随机数
      const random = Math.random() * totalWeight;
      
      // 选择技能
      let currentWeight = 0;
      let selectedIndex = 0;
      
      for (let j = 0; j < weightedSkills.length; j++) {
        currentWeight += weightedSkills[j].weight;
        if (random <= currentWeight) {
          selectedIndex = j;
          break;
        }
      }
      
      // 获取选中的技能
      const skillInfo = weightedSkills[selectedIndex];
      const skill = this.createSkill(skillInfo.name);
      if(skillInfo.isUpgradeCandidate) {
        skill.isUpgradeCandidate = true; // 标记（目前 UI 未使用）
        if(skillInfo.upgradedFrom) skill.upgradedFrom = skillInfo.upgradedFrom; // 记录来源技能名称
      }
      selectedSkills.push(skill);
      
      // 从可选技能中移除已选择的技能
      weightedSkills.splice(selectedIndex, 1);
    }
    
    return selectedSkills;
  }
}

export default SkillManager;