/**
 * 枚举类
 * 
 * 集中管理游戏中的各种枚举常量，提高代码的类型安全性和可维护性。
 */

/**
 * 大境界枚举
 * 
 * 角色修为的高层级描述
 */
export class Realm {
  static QI_REFINING = '炼气期';
  static FOUNDATION = '筑基期';
  static CORE_FORMATION = '结丹期';
  static NASCENT_SOUL = '结婴期';
  static SPIRITUAL_ASCENSION = '化神期';

  static getAll() {
    return [
      Realm.QI_REFINING,
      Realm.FOUNDATION,
      Realm.CORE_FORMATION,
      Realm.NASCENT_SOUL,
      Realm.SPIRITUAL_ASCENSION
    ];
  }

  static isValid(realm) {
    return Realm.getAll().includes(realm);
  }

  static getNext(realm) {
    const realms = Realm.getAll();
    const currentIndex = realms.indexOf(realm);
    if (currentIndex === -1 || currentIndex >= realms.length - 1) {
      return null;
    }
    return realms[currentIndex + 1];
  }

  static getPrevious(realm) {
    const realms = Realm.getAll();
    const currentIndex = realms.indexOf(realm);
    if (currentIndex <= 0) {
      return null;
    }
    return realms[currentIndex - 1];
  }
}

/**
 * 角色类型枚举
 */
export class CharacterType {
  static PLAYER = 'player';
  static ENEMY = 'enemy';

  static getAll() {
    return [CharacterType.PLAYER, CharacterType.ENEMY];
  }

  static isValid(type) {
    return CharacterType.getAll().includes(type);
  }
}

/**
 * 脉位类型枚举
 */
export class AcupointType {
  static NORMAL = 'normal';
  static SPIRIT_ROOT = 'spiritRoot';
  static IMMORTAL_GATE = 'immortalGate';

  static getAll() {
    return [
      AcupointType.NORMAL,
      AcupointType.SPIRIT_ROOT,
      AcupointType.IMMORTAL_GATE
    ];
  }

  static isValid(type) {
    return AcupointType.getAll().includes(type);
  }
}

/**
 * 修正类型枚举
 */
export class ModificationType {
  static PRIMARY = 'primary';
  static SECONDARY = 'secondary';
  static BATTLE = 'battle';

  static getAll() {
    return [
      ModificationType.PRIMARY,
      ModificationType.SECONDARY,
      ModificationType.BATTLE
    ];
  }

  static isValid(type) {
    return ModificationType.getAll().includes(type);
  }
}

/**
 * 修正操作类型枚举
 */
export class ModificationOperation {
  static ADD = 'add';
  static MULTIPLY = 'multiply';
  static BOOLEAN = 'boolean';
  static CLIP = 'clip';

  static getAll() {
    return [
      ModificationOperation.ADD,
      ModificationOperation.MULTIPLY,
      ModificationOperation.BOOLEAN,
      ModificationOperation.CLIP
    ];
  }

  static isValid(operation) {
    return ModificationOperation.getAll().includes(operation);
  }
}

/**
 * 布尔操作符枚举
 */
export class BooleanOperator {
  static AND = 'and';
  static OR = 'or';
  static NOT = 'not';

  static getAll() {
    return [BooleanOperator.AND, BooleanOperator.OR, BooleanOperator.NOT];
  }

  static isValid(operator) {
    return BooleanOperator.getAll().includes(operator);
  }
}

/**
 * 一级属性枚举
 */
export class PrimaryAttribute {
  static ROOT_BONE = 'rootBone';
  static COMPREHENSION = 'comprehension';
  static TALENT = 'talent';
  static SPIRIT_ROOT = 'spiritRoot';

  static getAll() {
    return [
      PrimaryAttribute.ROOT_BONE,
      PrimaryAttribute.COMPREHENSION,
      PrimaryAttribute.TALENT,
      PrimaryAttribute.SPIRIT_ROOT
    ];
  }

  static isValid(attribute) {
    return PrimaryAttribute.getAll().includes(attribute);
  }

  static getDisplayName(attribute) {
    const names = {
      [PrimaryAttribute.ROOT_BONE]: '根骨',
      [PrimaryAttribute.COMPREHENSION]: '悟性',
      [PrimaryAttribute.TALENT]: '天赋',
      [PrimaryAttribute.SPIRIT_ROOT]: '灵根'
    };
    return names[attribute] || attribute;
  }
}

/**
 * 二级属性枚举
 */
export class SecondaryAttribute {
  static VITALITY = 'vitality';
  static STRENGTH = 'strength';
  static SPIRIT_POWER = 'spiritPower';
  static HP = 'hp';
  static MAX_HP = 'maxHp';
  static ESCAPE_SPEED = 'escapeSpeed';
  static RECOVERY = 'recovery';
  static QI_GAIN = 'qiGain';
  static QI_DISSIPATION = 'qiDissipation';
  static MAX_ACTIVATION_MULTIPLIER = 'maxActivationMultiplier';
  static SPEED = 'speed';
  static CONSCIOUSNESS = 'consciousness';

  static getAll() {
    return [
      SecondaryAttribute.VITALITY,
      SecondaryAttribute.STRENGTH,
      SecondaryAttribute.SPIRIT_POWER,
      SecondaryAttribute.HP,
      SecondaryAttribute.MAX_HP,
      SecondaryAttribute.ESCAPE_SPEED,
      SecondaryAttribute.RECOVERY,
      SecondaryAttribute.QI_GAIN,
      SecondaryAttribute.QI_DISSIPATION,
      SecondaryAttribute.MAX_ACTIVATION_MULTIPLIER,
      SecondaryAttribute.SPEED,
      SecondaryAttribute.CONSCIOUSNESS
    ];
  }

  static isValid(attribute) {
    return SecondaryAttribute.getAll().includes(attribute);
  }

  static getDisplayName(attribute) {
    const names = {
      [SecondaryAttribute.VITALITY]: '元气',
      [SecondaryAttribute.STRENGTH]: '力量',
      [SecondaryAttribute.SPIRIT_POWER]: '灵能',
      [SecondaryAttribute.HP]: '生命',
      [SecondaryAttribute.MAX_HP]: '最大生命',
      [SecondaryAttribute.ESCAPE_SPEED]: '遁速',
      [SecondaryAttribute.RECOVERY]: '恢复力',
      [SecondaryAttribute.QI_GAIN]: '灵气获取量',
      [SecondaryAttribute.QI_DISSIPATION]: '灵气散气速度',
      [SecondaryAttribute.MAX_ACTIVATION_MULTIPLIER]: '引动最大倍率',
      [SecondaryAttribute.SPEED]: '速度',
      [SecondaryAttribute.CONSCIOUSNESS]: '神识'
    };
    return names[attribute] || attribute;
  }
}

/**
 * 战斗状态枚举
 */
export class BattleState {
  static POWER_MULTIPLIER = 'powerMultiplier';
  static LUCK = 'luck';
  static DURABILITY_CONSUMPTION_MULTIPLIER = 'durabilityConsumptionMultiplier';
  static SPEED_MODIFIER = 'speedModifier';
  static DAMAGE_TAKEN_MULTIPLIER = 'damageTakenMultiplier';

  static getAll() {
    return [
      BattleState.POWER_MULTIPLIER,
      BattleState.LUCK,
      BattleState.DURABILITY_CONSUMPTION_MULTIPLIER,
      BattleState.SPEED_MODIFIER,
      BattleState.DAMAGE_TAKEN_MULTIPLIER
    ];
  }

  static isValid(state) {
    return BattleState.getAll().includes(state);
  }

  static getDisplayName(state) {
    const names = {
      [BattleState.POWER_MULTIPLIER]: '灵力倍率',
      [BattleState.LUCK]: '运气',
      [BattleState.DURABILITY_CONSUMPTION_MULTIPLIER]: '耐久消耗倍率',
      [BattleState.SPEED_MODIFIER]: '速度修正',
      [BattleState.DAMAGE_TAKEN_MULTIPLIER]: '伤害倍率'
    };
    return names[state] || state;
  }
}

/**
 * 行动类型枚举
 */
export class ActionType {
  static ACTIVATE = 'activate';
  static MOVE = 'move';
  static DISSIPATE = 'dissipate';
  static USE_SECRET_ART = 'useSecretArt';
  static START_SUPPRESS = 'startSuppress';
  static END_SUPPRESS = 'endSuppress';
  static DEPLOY_TREASURE = 'deployTreasure';
  static RECALL_TREASURE = 'recallTreasure';
  static ACTIVATE_TREASURE = 'activateTreasure';

  static getAll() {
    return [
      ActionType.ACTIVATE,
      ActionType.MOVE,
      ActionType.DISSIPATE,
      ActionType.USE_SECRET_ART,
      ActionType.START_SUPPRESS,
      ActionType.END_SUPPRESS,
      ActionType.DEPLOY_TREASURE,
      ActionType.RECALL_TREASURE,
      ActionType.ACTIVATE_TREASURE
    ];
  }

  static isValid(type) {
    return ActionType.getAll().includes(type);
  }
}

/**
 * 突破类型枚举
 */
export class BreakthroughType {
  static FOUNDATION = 'foundation';
  static CORE_FORMATION = 'coreFormation';
  static NASCENT_SOUL = 'nascentSoul';
  static SPIRITUAL_ASCENSION = 'spiritualAscension';

  static getAll() {
    return [
      BreakthroughType.FOUNDATION,
      BreakthroughType.CORE_FORMATION,
      BreakthroughType.NASCENT_SOUL,
      BreakthroughType.SPIRITUAL_ASCENSION
    ];
  }

  static isValid(type) {
    return BreakthroughType.getAll().includes(type);
  }

  static getRealmForType(type) {
    const realmMap = {
      [BreakthroughType.FOUNDATION]: Realm.FOUNDATION,
      [BreakthroughType.CORE_FORMATION]: Realm.CORE_FORMATION,
      [BreakthroughType.NASCENT_SOUL]: Realm.NASCENT_SOUL,
      [BreakthroughType.SPIRITUAL_ASCENSION]: Realm.SPIRITUAL_ASCENSION
    };
    return realmMap[type] || null;
  }
}

/**
 * 闭关日程类型枚举
 */
export class RetreatScheduleType {
  static COMPREHEND = 'comprehend';
  static ENTER_CULTIVATION = 'enterCultivation';
  static PRACTICE = 'practice';
  static HEAL = 'heal';
  static ATTEMPT_BREAKTHROUGH = 'attemptBreakthrough';

  static getAll() {
    return [
      RetreatScheduleType.COMPREHEND,
      RetreatScheduleType.ENTER_CULTIVATION,
      RetreatScheduleType.PRACTICE,
      RetreatScheduleType.HEAL,
      RetreatScheduleType.ATTEMPT_BREAKTHROUGH
    ];
  }

  static isValid(type) {
    return RetreatScheduleType.getAll().includes(type);
  }

  static getDisplayName(type) {
    const names = {
      [RetreatScheduleType.COMPREHEND]: '参悟',
      [RetreatScheduleType.ENTER_CULTIVATION]: '进入修炼',
      [RetreatScheduleType.PRACTICE]: '修习',
      [RetreatScheduleType.HEAL]: '疗伤',
      [RetreatScheduleType.ATTEMPT_BREAKTHROUGH]: '尝试突破'
    };
    return names[type] || type;
  }
}

/**
 * 大世界行动类型枚举
 */
export class WorldActionType {
  static EXPLORE = 'explore';
  static REST = 'rest';
  static RETREAT = 'retreat';
  static TRANSFER = 'transfer';
  static DECODE = 'decode';

  static getAll() {
    return [
      WorldActionType.EXPLORE,
      WorldActionType.REST,
      WorldActionType.RETREAT,
      WorldActionType.TRANSFER,
      WorldActionType.DECODE
    ];
  }

  static isValid(type) {
    return WorldActionType.getAll().includes(type);
  }

  static getDisplayName(type) {
    const names = {
      [WorldActionType.EXPLORE]: '探索',
      [WorldActionType.REST]: '休息',
      [WorldActionType.RETREAT]: '闭关',
      [WorldActionType.TRANSFER]: '转移',
      [WorldActionType.DECODE]: '破译'
    };
    return names[type] || type;
  }
}

/**
 * 物品类型枚举
 */
export class ItemType {
  static TECHNIQUE_SCROLL = 'techniqueScroll';
  static TREASURE = 'treasure';
  static MATERIAL = 'material';
  static SPECIAL = 'special';

  static getAll() {
    return [
      ItemType.TECHNIQUE_SCROLL,
      ItemType.TREASURE,
      ItemType.MATERIAL,
      ItemType.SPECIAL
    ];
  }

  static isValid(type) {
    return ItemType.getAll().includes(type);
  }

  static getDisplayName(type) {
    const names = {
      [ItemType.TECHNIQUE_SCROLL]: '功法卷轴',
      [ItemType.TREASURE]: '法宝',
      [ItemType.MATERIAL]: '材料',
      [ItemType.SPECIAL]: '特殊物品'
    };
    return names[type] || type;
  }
}

/**
 * 真气状态枚举
 */
export class TrueQiState {
  static NORMAL = 'normal';
  static IMMORTAL_FORM = 'immortalForm';

  static getAll() {
    return [TrueQiState.NORMAL, TrueQiState.IMMORTAL_FORM];
  }

  static isValid(state) {
    return TrueQiState.getAll().includes(state);
  }

  static getDisplayName(state) {
    const names = {
      [TrueQiState.NORMAL]: '普通',
      [TrueQiState.IMMORTAL_FORM]: '仙形'
    };
    return names[state] || state;
  }
}
