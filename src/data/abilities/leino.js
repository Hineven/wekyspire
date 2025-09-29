// 灵脉相关能力
import {Ability} from "../ability";
import {backendGameState} from "../gameState";

export class FireLeino extends Ability {
  constructor() {
    super('火灵脉', '能使用火系灵御技能，来自/effect{燃烧}的伤害减2', 5, 10);
  }

  apply(player) {
    player.leino.push('fire');
  }

  get spawnWeight() {
    // 只有当玩家还没有火灵脉时，才有生成权重
    if (!backendGameState.player.leino.includes('fire')) {
      // 玩家灵脉数量越少，生成权重越高
      let weight = super.spawnWeight;
      if(backendGameState.player.leino.length <= 1) {
        weight *= 10;
      }
      if(backendGameState.player.leino.length >= 2) {
        weight *= 0.05;
      }
      return weight;
    }
    return 0;
  }
}

export class WoodLeino extends Ability {
  constructor() {
    super('木灵脉', '能使用木系灵御技能', 5, 10);
  }

  apply(player) {
    player.leino.push('wood');
  }

  get spawnWeight() {
    // 只有当玩家还没有木灵脉时，才有生成权重
    if (!backendGameState.player.leino.includes('wood')) {
      // 玩家灵脉数量越少，生成权重越高
      let weight = super.spawnWeight;
      if(backendGameState.player.leino.length <= 1) {
        weight *= 10;
      }
      if(backendGameState.player.leino.length >= 2) {
        weight *= 0.05;
      }
      return weight;
    }
    return 0;
  }
}
