// dialogues.js - 对话事件管理
import backendEventBus, { EventNames } from '../backendEventBus.js'
import { getPlayerTierFromTierIndex } from './player.js';
import { enqueueUI } from './animationInstructionHelpers.js';

let isRemiPresent = false;
export function setIsRemiPresent(flag) {
  isRemiPresent = !!flag;
}

// 开场对话序列
const openingDialog = [
  {
    character: '瑞米',
    text: '你好啊，小/named{灵御}。',
    avatar: new URL('../assets/remi.png', import.meta.url).href
  },
  {
    character: '瑞米',
    text: '我负责接引你，看到你的/named{技能}了么？快打败那只史莱姆练练手吧！',
    avatar: new URL('../assets/remi.png', import.meta.url).href
  }
];

// 随机事件对话序列
const randomEvents = [
  [
    {
      character: '瑞米',
      text: '你好啊，小灵御，我又来拉！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    },
    {
      character: '瑞米',
      text: '一个超位的存在将我带到了这里。他告诉我，我们都在一场游戏中，而这个游戏似乎实际上还没开发好。',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    }
  ],
  [
    {
      character: '瑞米',
      text: '你好啊，小灵御，我又来拉！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    },
    {
      character: '瑞米',
      text: '哎呀，你认识其它灵御吗？',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    },
    {
      character: '瑞米',
      text: '有人让我随便找你聊点什么，我也不知道该聊点什么了~好吧，就这样吧！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    }
  ]
];

// Boss战后的特别对话
const postBossBattleEvents = [
  [
    {
      character: '瑞米',
      text: '芜湖，恭喜你打败了这个强大的Boss！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    }
  ],
  [
    {
      character: '瑞米',
      text: '好耶！你成功击败了Boss，再接再厉吧。',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    }
  ]
];

// 获取开场对话
function getOpeningDialog() {
  return openingDialog;
}

// 获取事件对话（战斗后）
// 参数: battleCount(战斗场次数), player(玩家状态), enemy(下一张战斗面对的敌人)
function getEventAfterBattle(battleCount, player, enemy, isVictory) {
  if(!isVictory) return null;
  // 检查是否是Boss战
  if (enemy && enemy.isBoss) {
    // 面对Boss时触发特别对话
    const bossEventIndex = Math.floor(Math.random() * postBossBattleEvents.length);
    return postBossBattleEvents[bossEventIndex];
  }
  // 否则，随机触发事件（5%）
  const u = Math.random();
  if(u < 0.05) {
    // 普通随机事件
    const eventIndex = Math.floor(Math.random() * randomEvents.length);
    return randomEvents[eventIndex];
  }
  return null;
}

// Boss战前的特别对话
const preBossBattleEventsRemi = [
  [
    {
      character: '瑞米',
      text: '小心，前方有一股强大的气息！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    },
    {
      character: '瑞米',
      text: '谨慎一些！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    }
  ],
  [
    {
      character: '瑞米',
      text: '我闻到了不祥的味道...',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    },
    {
      character: '瑞米',
      text: '那个敌人很强！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    },
    {
      character: '瑞米',
      text: '务必小心行事！',
      avatar: new URL('../assets/remi.png', import.meta.url).href
    }
  ]
];

const preBossBattleEventsBoss = {
  'MEFM-3': [
    {
      character: 'MEFM-3',
      text: '发现入侵者。开始清理。',
      avatar: new URL('../assets/enemies/mefm3.png', import.meta.url).href
    }
  ]
};

let metEnemyRemi = false;

// 标记玩家是否已经获得过可多次充能的技能
let playerLearnedMultiUseSkill = false;

// 获取事件对话（战斗前）
// 参数: battleCount(战斗场次数), player(玩家状态), enemy(下一张战斗面对的敌人)
function getEventBeforeBattle(battleCount, player, enemy) {

  // 检查是否是Boss战
  if (enemy && enemy.isBoss) {
    // 面对Boss时触发特别对话
    const bossEventIndex = Math.floor(Math.random() * preBossBattleEventsRemi.length);
    const remiEvents = preBossBattleEventsRemi[bossEventIndex];
    const bossEvents = preBossBattleEventsBoss[enemy.name];
    return remiEvents.concat(bossEvents);
  }

  // 特判事件
  // 第一次遇到魔化瑞米
  if(!metEnemyRemi && enemy.name === '魔化瑞米') {
    metEnemyRemi = true;
    return [
      {
        character: '瑞米',
        text: '这...这是...瑞米？',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '你好？额，看在同族的份上...',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '下手可以...轻一点吗？',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      }
    ];
  }
  
  // 否则，随机触发事件（5%）
  const u = Math.random();
  if(u < 0.05) {
    // 普通随机事件
    const eventIndex = Math.floor(Math.random() * randomEvents.length);
    return randomEvents[eventIndex];
  }
  return null;
}

function getTierUpgradedDialog(player) {
  if(player.tier === getPlayerTierFromTierIndex(1).tier) {
    // 第一次升级，瑞米提供关于升级的提示和教程
    return [
      {
        character: '瑞米',
        text: '哇！恭喜你！你通过战斗证明自己的实力，进行了一次/named{突破}！',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '你可能注意到了，现在你的/named{等级}已经是普通灵御了。',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '通过突破，你可以提升你的灵御等级，而灵御等级则是获得更多更强大技能的前提条件。',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '除此之外，突破还有其它的好处：你现在拥有更多/named{行动力}了！',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '嘿嘿，我再多送你一点/named{魏启}上限吧，激励一下你。',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: '努力升级吧！',
        avatar: new URL('../assets/remi.png', import.meta.url).href
      }
    ];
  }
  return null;
}

function getSkillUseDialog(player, skill, result) {
  if(!result) return;
  if(skill.name === '瑞米召唤术') {
    return [
      {
        character: '瑞米',
        text: `嗯？`,
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: `找我有事吗？`,
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: `什么？让我帮你战斗？？`,
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: `啊啊啊！不要啊！`,
        avatar: new URL('../assets/remi.png', import.meta.url).href
      },
      {
        character: '瑞米',
        text: `我什么都干不了呀！放过我吧！`,
        avatar: new URL('../assets/remi.png', import.meta.url).href
      }
    ];
  }
  return null;
}


// 初始化函数，在游戏开始时调用一次，注意eventBus监听
function registerListeners() {
  // 注册事件监听（使用后端事件总线）
  backendEventBus.on(EventNames.Game.PRE_BATTLE, (params) => {
    const {battleCount, player, enemy} = params;
    const sequence = getEventBeforeBattle(battleCount, player, enemy);
    if(sequence && isRemiPresent) {
      enqueueUI('displayDialog', sequence);
    }
  });
  backendEventBus.on(EventNames.Game.POST_BATTLE, (params) => {
    const {battleCount, player, enemy, isVictory} = params;
    const sequence = getEventAfterBattle(battleCount, player, enemy, isVictory);
    if(sequence && isRemiPresent) {
      enqueueUI('displayDialog', sequence);
    }
  });
  backendEventBus.on(EventNames.Game.PRE_GAME_START, () => {
    const openingDialog = getOpeningDialog();
    if(openingDialog && isRemiPresent) {
      enqueueUI('displayDialog', openingDialog);
    }
  });
  
  // 监听玩家获得技能事件
  backendEventBus.on(EventNames.Player.SKILL_REWARD_CLAIMED, (params) => {
    // 检查是否已经触发过教程
    if (!playerLearnedMultiUseSkill && isRemiPresent) {
      const { skill } = params;
      // 检查技能是否是可多次充能的（maxUses > 1 或者是无限的）
      if ((skill.maxUses !== undefined && skill.maxUses > 1) || skill.isInfiniteUse) {
        // 标记已经触发过教程
        playerLearnedMultiUseSkill = true;
        // 获取教程对话序列
        const sequence = getMultiUseSkillTutorial();
        if (sequence) {
          enqueueUI('displayDialog', sequence);
        }
      }
    }
  });

  // 监听玩家升级事件
  backendEventBus.on(EventNames.Player.TIER_UPGRADED, (player) => {
    // 触发升级对话
    const sequence = getTierUpgradedDialog(player);
    if (sequence && isRemiPresent) {
      enqueueUI('displayDialog', sequence);
    }
  });

  // 监听玩家使用技能事件
  backendEventBus.on(EventNames.Player.SKILL_USED, (params) => {
    const {player, skill, result} = params;
    const sequence = getSkillUseDialog(player, skill, result);
    if(sequence && isRemiPresent) {
      enqueueUI('displayDialog', sequence);
    }
  });
}

function unregisterListeners () {
  backendEventBus.off(EventNames.Game.PRE_BATTLE);
  backendEventBus.off(EventNames.Game.POST_BATTLE);
  backendEventBus.off(EventNames.Game.PRE_GAME_START);
  backendEventBus.off(EventNames.Player.SKILL_REWARD_CLAIMED);
  backendEventBus.off(EventNames.Player.TIER_UPGRADED);
  backendEventBus.off(EventNames.Player.SKILL_USED);
}

export function triggerBeforeGameStart() {
  backendEventBus.emit(EventNames.Game.PRE_GAME_START);
}

// 导出注册函数
export {registerListeners, unregisterListeners};