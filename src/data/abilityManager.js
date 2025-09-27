import {Ability} from './ability.js';

// 能力管理器类
class AbilityManager {
  constructor() {
    this.abilities = [];
  }

  static async loadAllAbilities() {
    // 动态导入所有文件
    const abilityModules = [
      await import('./abilities/basic.js'),
      await import('./abilities/leino.js'),
    ];
    const abilityManager = this.getInstance();
    // 遍历所有模块并注册其中的技能
    for (const module of abilityModules) {
      // 遍历模块中的所有导出
      for (const [key, AbilityClass] of Object.entries(module)) {
        // 检查是否为Ability类的子类
        if (typeof AbilityClass === 'function' && AbilityClass !== Ability && AbilityClass.prototype instanceof Ability) {
          try {
            console.log('Registering ability:', key);
            abilityManager.registerAbility(AbilityClass);
          } catch (error) {
            console.error(`Failed to register ability: ${key}`, error);
          }
        }
      }
    }

    return abilityManager;
  }
  
  // 注册能力
  registerAbility(AbilityClass) {
    const ability = new AbilityClass();
    this.abilities.push({ name: ability.name, AbilityClass, tier: ability.tier});
  }
  
  // 获取所有能力
  getAllAbilities() {
    return this.abilities;
  }
  
  // 创建能力实例
  createAbility(abilityName) {
    const ability = this.abilities.find(a => a.name === abilityName);
    if (ability) {
      return new ability.AbilityClass();
    }
    throw new Error(`Unknown ability: ${abilityName}`);
  }
  
  // 单例
  static getInstance() {
    if (!this.instance) {
      this.instance = new AbilityManager();
    }
    return this.instance;
  }

  // 随机获取能力
  getRandomAbilities(count = 3, abundance = 1.0) {
    const allAbilities = this.abilities.map(a => ({
      name: a.name,
      tier: a.tier,
      spawnWeight: (new a.AbilityClass()).spawnWeight
    }));
    
    // 根据abundance、spawnWeight和tier计算每个能力的权重
    const weightedAbilities = allAbilities.map(ability => {
      
      let offset = Math.max(1, abundance * 2);
      const tierFactor = Math.pow(0.6, Math.max(ability.tier - offset, 0));
      const rarityFactor = ability.spawnWeight;

      const weight = tierFactor * rarityFactor;
      
      return { ...ability, weight };
    });
    

    // 根据权重随机选择能力
    const selected = [];
    let availableAbilities = weightedAbilities;
    const maxEntries = Math.min(count, availableAbilities.length);
    
    for (let i = 0; i < maxEntries; i++) {
      // 计算总权重
      const totalWeight = availableAbilities.reduce((sum, ability) => sum + ability.weight, 0);
      
      // 生成随机数
      let random = Math.random() * totalWeight;
      
      // 根据随机数选择能力
      let selectedIndex = 0;
      for (let j = 0; j < availableAbilities.length; j++) {
        random -= availableAbilities[j].weight;
        if (random <= 0) {
          selectedIndex = j;
          break;
        }
      }
      
      // 添加选中的能力
      const selectedAbility = this.createAbility(availableAbilities[selectedIndex].name);
      selected.push(selectedAbility);
      
      // 从可选列表中移除已选的能力
      availableAbilities.splice(selectedIndex, 1);
    }
    
    return selected;
  }
}

export default AbilityManager;