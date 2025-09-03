<template>
  <div id="app">
    <!-- 开始游戏界面 -->
    <StartScreen 
      v-if="gameState === 'start'" 
      @start-game="startGame"
    />
    
    <!-- 战斗界面 -->
    <BattleScreen 
      v-if="gameState === 'battle'"
      :player="player"
      :enemy="enemy"
      :battle-logs="battleLogs"
      @use-skill="useSkill"
      @end-turn="endPlayerTurn"
    />
    <!-- 休整界面 -->
    <RestScreen 
      v-if="gameState === 'rest'"
      :player="player"
      :rewards="rewards"
      :shop-items="shopItems"
      @claim-money="claimMoney"
      @show-skill-rewards="showSkillRewards"
      @show-ability-rewards="showAbilityRewards"
      @buy-item="buyItem"
      @end-rest="endRest"
    />
    
    <AbilityRewardPanel
      v-if="isAbilityRewardVisible"
      :abilities="abilityRewards"
      @select-ability="claimAbility"
      @close="closeAbilityRewards"
    />
    
    <SkillRewardPanel
      v-if="isSkillRewardVisible"
      :skills="skillRewards"
      @select-skill="claimSkill"
      @close="closeSkillRewards"
    />
    
    <!-- 结束界面 -->
    <EndScreen 
      v-if="gameState === 'end'" 
      :is-victory="isVictory"
      @restart-game="restartGame"
    />
    
    <!-- 对话界面 -->
    <DialogScreen 
      :is-visible="isDialogVisible" 
      :current-dialog="currentDialog"
      @next-dialog="nextDialog"
    />
  </div>
</template>

<script>
import StartScreen from './components/StartScreen.vue'
import BattleScreen from './components/BattleScreen.vue'
import RestScreen from './components/RestScreen.vue'
import EndScreen from './components/EndScreen.vue'
import DialogScreen from './components/DialogScreen.vue'
import EnemyFactory from './data/enemyFactory.js'
import SkillManager from './data/skillManager.js'
import AbilityManager from './data/abilityManager.js'
import { processStartOfTurnEffects, processEndOfTurnEffects, processSkillActivationEffects, processDamageTakenEffects, processDamageDealtEffects, processPostAttackEffects } from './utils/effectProcessor.js'
import AbilityRewardPanel from './components/AbilityRewardPanel.vue'
import SkillRewardPanel from './components/SkillRewardPanel.vue'

export default {
  name: 'App',
  components: {
    StartScreen,
    BattleScreen,
    RestScreen,
    EndScreen,
    DialogScreen,
    AbilityRewardPanel,
    SkillRewardPanel
  },
  data() {
      return {
        gameState: 'start', // 'start', 'battle', 'rest', 'end'
        isDialogVisible: false,
        currentDialog: {},
        dialogSequence: [], // 存储当前对话序列
        dialogIndex: 0, // 当前对话索引
        isVictory: false,
        
        // 回合控制
        isEnemyTurn: false,
        
        // 玩家数据
        player: {
          hp: 40,
          maxHp: 40,
          mana: 0,
          maxMana: 0,
          actionPoints: 4,
          maxActionPoints: 4,
          baseAttack: 3,
          baseMagic: 3,
          baseDefense: 0,
          money: 0,
          tier: 0, // 等阶
          maxNumSkills: 5, // 玩家技能数上限
          skills: [],
          effects: {}, // 合并effects到player对象中
          skillManager: SkillManager.getInstance(),
          
          // 初始化时添加回调函数
          init() {
            // 初始化逻辑（如果需要）
          },
          // 应用治疗
          applyHeal(heal) {
            if (heal > 0) {
              this.hp += heal;
              this.hp = Math.min(this.hp, this.maxHp);
            }
          },
          // 计算属性
          get attack() {
            return this.baseAttack + (this.effects['力量'] || 0);
          },
          get magic() {
            return this.baseMagic + (this.effects['集中'] || 0);
          },
          get defense() {
            return this.baseDefense + (this.effects['防御'] || 0);
          },
          
          // 添加效果方法
          addEffect(effectName, stacks = 1) {
            const previousStacks = this.effects[effectName] || 0;
            if (this.effects[effectName]) {
              this.effects[effectName] += stacks;
            } else {
              this.effects[effectName] = stacks;
            }
            // 触发效果变化事件
            import('./eventBus.js').then(eventBus => {
              console.log({effectName, stacks, previousStacks});
              eventBus.default.emit('effectChange', {
                target: 'player',
                effectName: effectName,
                stacks: stacks,
                previosStacks: previousStacks
              });
            });
            
            // 处理连带效果
            // 这里保留原来的调用方式，因为它是用于处理效果添加时的连带效果
            // 在新的effectProcessor中，这类效果已经在添加时处理了
      
          },
          
          // 移除效果方法
          removeEffect(effectName, stacks = 1) {
            const previousStacks = this.effects[effectName] || 0;
            if (this.effects[effectName]) {
              this.effects[effectName] -= stacks;
              if (this.effects[effectName] <= 0) {
                delete this.effects[effectName];
              }
              
              // 触发效果变化事件
              import('./eventBus.js').then(eventBus => {
                eventBus.default.emit('effectChange', {
                  target: 'player',
                  effectName: effectName,
                  stacks: -stacks,
                  previosStacks: previousStacks
                });
              });
            }
          },
        },
        
        // 敌人数据
        enemy: {
          name: '',
          hp: 0,
          maxHp: 0,
          baseAttack: 0,
          baseMagic: 0,
          baseDefense: 0,
          effects: {}, // 保留敌人的effects对象
          
          // 初始化方法
          init() {
            // 敌人的初始化逻辑（如果需要）
          },
          
          // 计算属性
          get attack() {
            return this.baseAttack + (this.effects['力量'] || 0);
          },
          get magic() {
            return this.baseMagic + (this.effects['集中'] || 0);
          },
          get defense() {
            return this.baseDefense + (this.effects['防御'] || 0);
          },
          
          // 添加效果方法
          addEffect(effectName, stacks = 1) {
            if (this.effects[effectName]) {
              this.effects[effectName] += stacks;
            } else {
              this.effects[effectName] = stacks;
            }
            
            // 触发效果变化事件
            import('./eventBus.js').then(eventBus => {
              eventBus.default.emit('effectChange', {
                target: 'enemy', effectName: effectName, stacks:stacks, previousStacks: this.effects[effectName] - stacks
              });
            });
          },
          
          // 移除效果方法
          removeEffect(effectName, stacks = 1) {
            if (this.effects[effectName]) {
              this.effects[effectName] -= stacks;
              if (this.effects[effectName] <= 0) {
                delete this.effects[effectName];
              }
              
              // 触发效果变化事件
              import('./eventBus.js').then(eventBus => {
                eventBus.default.emit('effectChange', {
                  target:'enemy', effectName: effectName, stacks: -stacks, previousStacks: this.effects[effectName] + stacks
                });
              });
            }
          }
        },
        
        // 战斗日志
        battleLogs: [],
        
        // 奖励数据
        rewards: {
          money: 0,
          skill: false,
          ability: false
        },
        
        // 商店物品
        shopItems: [
          { name: '恢复生命', description: '恢复40生命值', price: 13 },
          { name: '恢复魏启', description: '恢复40魏启值', price: 13 },
          { name: '技能位', description: '增加技能数上限', price: 80 }
        ],
        
        // 战斗场次数
        battleCount: 0,
        
        // 能力奖励相关
        isAbilityRewardVisible: false,
        abilityRewards: [],
        
        // 技能奖励相关
        isSkillRewardVisible: false,
        skillRewards: []
      }
    },
  mounted() {
    // 初始化玩家效果管理器
    this.player.init();
  },
  methods: {
    // 更新所有技能的描述
    updateSkillDescriptions() {
      this.player.skills.forEach(skill => {
        if (typeof skill.regenerateDescription === 'function') {
          // 重新生成描述，传入玩家对象
          skill.description = skill.regenerateDescription(this.player);
        }
      });
    },
    
    startGame() {
      // 触发开场事件
      this.dialogSequence = [
        {
          character: '艾纳',
          text: '你好呀，小灵御。',
          avatar: ''
        },
        {
          character: '艾纳',
          text: '我负责接引你，看到你的技能了吗？快打败那只史莱姆练练手吧！',
          avatar: ''
        }
      ];
      this.dialogIndex = 0;
      this.currentDialog = this.dialogSequence[this.dialogIndex];
      this.isDialogVisible = true;
      
      // 为玩家添加初始技能
      const initialSkill = this.player.skillManager.constructor.createSkill('拳打脚踢');
      this.player.skillManager.addSkill(initialSkill);
      this.player.skills.push(initialSkill);
      
      this.gameState = 'battle';
      // 注意：不在这里调用startBattle()，而是在对话结束后调用
    },
    
    startBattle() {
      this.battleCount++;
      
      // 生成敌人
      this.generateEnemy();
      
      // 重置玩家回合
      this.player.actionPoints = this.player.maxActionPoints;
      
      // 调用技能的onBattleStart方法
      this.player.skills.forEach(skill => {
        skill.onBattleStart();
      });
      
      
      // 恢复技能使用次数
      this.player.skillManager.resetAllSkillUses();
      
      // 更新技能描述
      this.updateSkillDescriptions();
      
      // 添加战斗日志
      this.battleLogs = [`战斗 #${this.battleCount} 开始！`, `遭遇了 ${this.enemy.name}！`];
      
      // 开始游戏主循环
      this.gameState = 'battle';
      this.startPlayerTurn();
    },
    
    startPlayerTurn() {
      // 回合开始时结算效果
      const isStunned = processStartOfTurnEffects(this.player, this.battleLogs);
      if (isStunned) {
        this.battleLogs.push('玩家被眩晕，跳过回合！');
        this.endPlayerTurn();
        return;
      }
      
      // 重置行动力和技能使用次数
      this.player.actionPoints = this.player.maxActionPoints;
      this.player.skillManager.resetAllSkillUses();
      
      // 更新技能描述
      this.updateSkillDescriptions();
      
      // 强制刷新操作面板渲染
      this.$forceUpdate();
      
      // 等待玩家操作
      // 玩家操作通过BattleScreen组件的事件处理
    },
    
    generateEnemy() {
      // 根据战斗场次数生成敌人
      const battleIntensity = this.battleCount;
      
      // 简单实现：在第5、10、15场战斗时生成Boss
      if (this.battleCount === 5 || this.battleCount === 10 || this.battleCount === 15) {
        this.enemy = EnemyFactory.generateRandomEnemy(battleIntensity, true);
      } else {
        // 普通敌人
        this.enemy = EnemyFactory.generateRandomEnemy(battleIntensity, false);
      }
      
      // 初始化敌人效果管理器
      this.enemy.init();
    },
    
    // 计算攻击伤害
    calculateAttackDamage(attacker, defender, baseDamage) {
      let damage = Math.max(1, baseDamage - defender.defense);
      // 发动攻击时结算效果
      processDamageDealtEffects(attacker, damage, this.battleLogs);
      return damage;
    },
    
    // 应用伤害
    applyDamage(target, damage, attacker = null) {
      // 处理受到伤害时的效果
      const finalDamage = processDamageTakenEffects(target, damage, this.battleLogs);
      
      if (finalDamage > 0) {
        target.hp -= finalDamage;
        this.battleLogs.push(`${attacker ? attacker.name : '未知'} 攻击了 ${target.name}，造成了 /red{${finalDamage}} 点伤害！`);
        
        // 攻击后效果处理
        if (attacker) {
          processPostAttackEffects(attacker, target, finalDamage, this.battleLogs);
        }
      } else {
        this.battleLogs.push(`${attacker ? attacker.name : '未知'} 攻击了 ${target.name}，但不起作用！`);
      }
      
      // 检查目标是否死亡
      if (target.hp <= 0) {
        this.battleLogs.push(`/${target.name} 被击败了！`);
        return true;
      }
      
      // 更新技能描述（因为玩家状态可能已改变）
      this.updateSkillDescriptions();
      
      return false;
    },
    
    useSkill(skill) {
      // 使用技能逻辑
      this.battleLogs.push(`玩家使用了 /blue{${skill.name}}！`);
      
      // 技能发动时结算效果
      processSkillActivationEffects(this.player, this.battleLogs);
      
      // 执行技能效果
      // console.log(this.player);
      // console.log(skill);
      const result = skill.use(this.player, this.enemy);
      
      // 消耗行动力和魏启
      this.player.actionPoints -= 1;
      this.player.mana -= skill.manaCost;
      skill.remainingUses -= 1;
      
      // 检查敌人是否死亡（技能可能造成了伤害）
      if (this.enemy.hp <= 0) {
        this.battleLogs.push(`/${this.enemy.name} 被击败了！`);
        this.endBattle(true);
        return;
      }
      
      // 更新技能描述（因为玩家状态可能已改变）
      this.updateSkillDescriptions();
      
      // 强制刷新操作面板渲染
      this.$forceUpdate();
    },
    
    enemyTurn() {
      // 敌人行动逻辑
      this.battleLogs.push(`/red{${this.enemy.name}} 的回合！`);
      
      // 回合开始时结算效果
      const isStunned = processStartOfTurnEffects(this.enemy, this.battleLogs);
      if (isStunned) {
        this.battleLogs.push('敌人被眩晕，跳过回合！');
        this.startNextTurn();
        return;
      }
      
      this.enemy.act(this.player, this.battleLogs);

      // 应用伤害
      const isPlayerDead = this.player.hp <= 0;
      
      if (isPlayerDead) {
        this.endBattle(false);
        return;
      }
      
      // 敌人行动结束后开始新回合
      this.startNextTurn();
    },
    
    endPlayerTurn() {
      // 回合结束时结算效果
      processEndOfTurnEffects(this.player, this.battleLogs);
      
      // 检查玩家是否死亡
      if (this.player.hp <= 0) {
        this.endBattle(false);
        return;
      }
      
      // 执行敌人回合
      this.enemyTurn();
    },
    
    startNextTurn() {
      // 检查游戏是否结束
      if (this.player.hp <= 0) {
        this.endBattle(false);
        return;
      }
      
      if (this.enemy.hp <= 0) {
        this.endBattle(true);
        return;
      }
      
      // 开始新回合
      this.startPlayerTurn();
    },
    
    endBattle(isVictory) {
      // 清空玩家身上的所有效果
      this.player.effects = {};
      
      if (isVictory) {
        // 计算奖励
        this.calculateRewards();
        this.gameState = 'rest';
      } else {
        // 玩家失败
        this.isVictory = false;
        this.gameState = 'end';
      }
    },
    
    calculateRewards() {
      // 计算战斗奖励
      this.rewards.money = Math.floor(Math.random() * 20) + 10;
      this.rewards.skill = true;
      
      // 奇数次战斗后获得能力奖励
      this.rewards.ability = this.battleCount % 2 === 1;
    },
    
    claimMoney() {
      this.player.money += this.rewards.money;
      this.rewards.money = 0;
    },
    
    showAbilityRewards() {
      // 显示能力奖励面板
      this.isAbilityRewardVisible = true;
      // 生成随机能力
      this.abilityRewards = AbilityManager.getRandomAbilities(3);
    },
    
    claimAbility(ability) {
      // 领取能力奖励
      ability.apply(this.player);
      this.rewards.ability = false;
      this.isAbilityRewardVisible = false;
      this.battleLogs.push(`获得了能力：${ability.name}`);
    },
    
    closeAbilityRewards() {
      // 关闭能力奖励面板
      this.isAbilityRewardVisible = false;
      this.rewards.ability = false;
    },
    
    showSkillRewards() {
      // 显示技能奖励面板
      this.isSkillRewardVisible = true;
      // 生成随机技能，排除玩家已有的技能和同系列的技能
      console.log('Generating skill rewards...');
      this.skillRewards = SkillManager.getRandomSkills(3, this.player.skills);
      console.log('Generated skill rewards:', this.skillRewards);
    },
    
    claimSkill(skill) {
      // 领取技能奖励
      if (!skill || !skill.name) {
        console.error('Invalid skill object or missing name:', skill);
        return;
      }
      
      // 检查技能是否已存在
      const existingSkill = this.player.skills.find(s => s.name === skill.name);
      if (existingSkill) {
        console.warn('Skill already exists:', skill.name);
        // 可以选择不添加重复技能
        // return;
      }
      
      // 检查是否超过技能数上限
      if (this.player.skills.length >= this.player.maxNumSkills) {
        // 如果超过上限，需要移除一个技能
        console.warn(`技能数已达到上限 ${this.player.maxNumSkills}，需要移除一个技能`);
        // 这里应该打开一个面板让用户选择要移除的技能
        // 暂时先移除第一个技能作为示例
        this.player.skills.shift();
      }
      
      const newSkill = SkillManager.createSkill(skill.name);
      this.player.skillManager.addSkill(newSkill);
      this.player.skills.push(newSkill);
      this.rewards.skill = false;
      this.isSkillRewardVisible = false;
      this.battleLogs.push(`获得了技能：${skill.name}`);
    },
    
    closeSkillRewards() {
      // 关闭技能奖励面板
      this.isSkillRewardVisible = false;
      this.rewards.skill = false;
    },
    
    buyItem(item) {
      if (this.player.money >= item.price) {
        this.player.money -= item.price;
        this.battleLogs.push(`购买了 ${item.name}`);
        
        // 根据物品类型执行不同操作
        if (item.name === '恢复生命') {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
        } else if (item.name === '恢复魏启') {
          this.player.mana = this.player.maxMana;
        } else if (item.name === '技能位') {
          // 增加技能数上限的逻辑
          this.player.maxNumSkills++;
        }
      }
    },
    
    endRest() {
      // 检查是否完成第15场战斗
      if (this.battleCount >= 15) {
        this.isVictory = true;
        this.gameState = 'end';
      } else {
        // 20%概率触发随机事件
        if (Math.random() < 0.2) {
          // 随机选择一个事件
          const randomEvents = [
            [
              {
                character: '艾纳',
                text: '你好呀，小灵御，我又来拉！',
                avatar: ''
              },
              {
                character: '艾纳',
                text: '一个超位的存在将我带到了这里。他告诉我，我们都在一场游戏中，而这个游戏似乎实际上还没开发好。',
                avatar: ''
              }
            ],
            [
              {
                character: '艾纳',
                text: '你好呀，小灵御，我又来拉！',
                avatar: ''
              },
              {
                character: '艾纳',
                text: '哎呀，你认识Hineven吗？他让我随便找你聊点什么，我也不知道该聊点什么了~好吧，就这样吧！',
                avatar: ''
              }
            ]
          ];
          const eventIndex = Math.floor(Math.random() * randomEvents.length);
          this.dialogSequence = randomEvents[eventIndex];
          this.dialogIndex = 0;
          this.currentDialog = this.dialogSequence[this.dialogIndex];
          this.isDialogVisible = true;
        }
        // 开始下一场战斗
        this.gameState = 'battle';
        this.startBattle();
      }
    },
    
    restartGame() {
      // 重置游戏状态
      this.gameState = 'start';
      this.isVictory = false;
      this.battleCount = 0;
      this.player.hp = this.player.maxHp;
      this.player.mana = 0;
      this.player.actionPoints = this.player.maxActionPoints;
      this.player.money = 0;
      this.player.skills = [];
      this.player.effects = {};
      this.player.skillManager = SkillManager.getInstance();
      this.battleLogs = [];
      
      // 为玩家添加初始技能
      const initialSkill = SkillManager.createSkill('拳打脚踢');
      this.player.skillManager.addSkill(initialSkill);
      this.player.skills.push(initialSkill);
    },
    
    nextDialog() {
      // 检查是否还有更多对话
      if (this.dialogIndex < this.dialogSequence.length - 1) {
        // 显示下一个对话
        this.dialogIndex++;
        this.currentDialog = this.dialogSequence[this.dialogIndex];
      } else {
        // 对话结束，隐藏对话框
        this.isDialogVisible = false;
        this.dialogSequence = [];
        this.dialogIndex = 0;
        
        // 如果是开场事件，开始战斗
        if (this.gameState === 'battle' && this.battleCount === 0) {
          this.startBattle();
        }
      }
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>