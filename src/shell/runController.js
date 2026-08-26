import { reactive, markRaw } from 'vue';
import mitt from 'mitt';
import AnimationSequencer from '../core/anim/sequencer.js';
import Player from '../core/state/player.js';
import { createSkillRuntime } from '../core/state/skillRuntime.js';
import {
  createRun, enterBattle, finishBattle, completeRewards, completeRoom,
  assembleBattle, isBossFloor, advanceFloor,
} from '../core/run/runFlow.js';
import { chooseSkillReward } from '../core/run/rewards.js';
import { getSkillDefinition } from '../core/skills/registry.js';
import { getEnemyDefinition } from '../core/enemies/registry.js';
import { createBridge, EventNames } from '../bridge/index.js';
import { BattleStage } from '../stage/stages/BattleStage.js';
import { trainingMode, upgradableCards, trainUpgrade, trainDrawChoices, trainDraw } from '../core/run/rooms/training.js';
import { campOptions, campRest, campRecoverRemi, campUpgrade } from '../core/run/rooms/camp.js';
import { SLOT_PLACEHOLDER, spinSlot } from '../core/run/rooms/slotMachine.js';
import { playEvent } from '../core/run/rooms/event.js';
import { chooseAscension, LEINO_DIMENSIONS } from '../core/run/ascension.js';
import { equipRelic, unequipRelic, prepUseRelic } from '../core/run/prep.js';
import { RunEvents } from './runEvents.js';
import { createCutscenePlayer } from './overlay/cutscenePlayer.js';
import { recordSave } from './saves.js';

export { RunEvents };

// run 层 Shell 编排器：Vue 薄壳与 core run 状态机之间的唯一通道。
// run 本体经 reactive() 暴露（状态只存 id 与数字，代理安全）；
// 每次阶段迁移经 runBus 发事件——阶段 8 的 cutscene/剧情在此订阅注入。

const DEFAULT_DECK = ['punch', 'punch', 'guard', 'inflame', 'focusChant'];

// 存档快照 → run：advanceFloor 推进层数（遭遇/房间按 seed 确定性，无需回放），
// 再覆盖养成字段。存档语义 = 检查点：落盘只在 prep，故恢复后必处 prep。
function restoreFromSave(run, save) {
  while (run.floor < save.floor) advanceFloor(run);
  // rng 状态直存直取：回放 advanceFloor 不消耗 run.rng（遭遇用派生种子），
  // 若不恢复状态，读档后的房间派发会偏离活局时间线（旧档无此字段=维持回放语义）
  if (save.rngState != null) run.rng.setState(save.rngState);
  const p = run.player;
  const sp = save.player;
  p.hp = sp.hp; p.maxHp = sp.maxHp;
  p.mana = sp.mana; p.maxMana = sp.maxMana;
  p.maxActionPoints = sp.maxActionPoints; p.actionPoints = sp.maxActionPoints;
  p.money = sp.money;
  p.deck = sp.deck.map(rt => ({ ...rt }));
  p.abilities = [...sp.abilities];
  p.relics = [...sp.relics];
  p.equippedRelics = [...sp.equippedRelics];
  p.relicSlots = sp.relicSlots;
  p.leino = { ...sp.leino };
  p.trainingCount = sp.trainingCount;
  p.ascensionCount = sp.ascensionCount;
  p.chantSlotBase = sp.chantSlotBase;
  Object.assign(run.remi, save.remi);
  run.pendingCardRemoval = save.pendingCardRemoval;
  run.relicUses = { ...save.relicUses };
}

export function createRunController({ seed = (Date.now() >>> 0), stageManager = null, mapStage = null, save = null, storyMode = false } = {}) {
  const runBus = mitt();
  // run 级共享演出队列（S2）：battle / room / tower / cutscene 指令在同一队列定序，
  // 跨层演出链（终局动画 → 幕间黑幕 → 塔楼抵达）由此成为可表达的结构
  const animBus = mitt();
  const runSequencer = new AnimationSequencer({ bus: animBus, finishedEvent: EventNames.ANIMATION_INSTRUCTION_FINISHED });
  const isStory = save?.storyMode ?? storyMode; // 读档优先用存档自身的模式
  const run = reactive(createRun({
    seed: save?.seed ?? seed,
    player: new Player({ maxHp: 30, maxMana: 3, maxActionPoints: 3 }),
  }));
  if (save) restoreFromSave(run, save);
  else {
    run.player.deck = DEFAULT_DECK.map(id => createSkillRuntime(id));
    run.player.abilities = ['battleFocus'];
  }
  run.storyMode = isStory; // 模式只影响剧情演出（对话剧本）；战斗内瑞米机制两模式一致

  let battleBridge = null;   // markRaw：战斗桥含 kernel/three 引用，不入响应式
  let battleStage = null;
  const log = reactive([]);  // 战斗日志（Shell 展示用）

  // three.js 状态栏（两舞台共享 PlayerStatusObject）：战斗外 AP 恒满，魏启 = run 持久值；
  // 金币/瑞米两舞台同源。战斗内 AP/魏启由 bridge reconcile 接管，此处只补金币/瑞米。
  const syncMapStatus = () => {
    mapStage?.setStatus({
      ap: run.player.maxActionPoints, apMax: run.player.maxActionPoints,
      mana: run.player.mana, manaMax: run.player.maxMana,
      money: run.player.money, remi: run.remi,
    });
    battleStage?.statusBar.setMoney(run.player.money);
    battleStage?.statusBar.setRemi(run.remi);
  };
  syncMapStatus(); // 初始同步一次（后续随 notify 自动跟随）
  if (run.gameStage === 'prep' || run.gameStage === 'end') recordSave(run); // 初始即检查点（首层开局/读档落位）
  const notify = () => {
    syncMapStatus(); // 状态栏数值跟随每次迁移（魏启变化/层数推进）
    // 存档检查点：prep（层首）与 end（终局）落盘；战斗内退出 = 回到本层战前。
    if (run.gameStage === 'prep' || run.gameStage === 'end') recordSave(run);
    runBus.emit(RunEvents.STAGE_CHANGED, { stage: run.gameStage, floor: run.floor });
  };
  let logSeq = 0;
  const pushLog = ({ text, kind }) => {
    log.unshift({ id: ++logSeq, text, kind }); // 稳定 key（unshift 列表用 index key 会全量重渲）
    if (log.length > 30) log.pop();
  };

  // ---- cutscene（游戏流程手动驱动：对话剧本 + 幕间转场）----
  // S3：剧本 step 编译为 run sequencer 指令——与战斗/房间/塔楼演出同一时钟
  const cutscene = createCutscenePlayer({ sequencer: runSequencer });
  // 按当前 run 状态查触发规则并逐条播放（幂等；阻塞靠流程侧 await）
  const playPendingCutscenes = async () => {
    const ctx = { stage: run.gameStage, floor: run.floor, storyMode: run.storyMode };
    for (const id of cutscene.pendingTriggers(ctx)) {
      await cutscene.play(id);
    }
  };
  playPendingCutscenes(); // 开场剧本（故事模式 prep 第 1 层；肉鸽模式/读档不命中）

  // ---- 战斗 ----
  // 进场：战前剧本（如 preBoss）→ 幕间转场（全黑中点切舞台）→ 战斗
  let battlePending = false; // 防重入：转场 pending 期间连点「进入战斗」只开一场
  function startBattle() {
    if (battlePending || run.gameStage !== 'prep') return;
    battlePending = true;
    const doSwap = () => {
      enterBattle(run);
      const { enemies, allies, seed } = assembleBattle(run); // 装配单一事实源（与 headless 共用）
      const bridge = createBridge({ runState: run, enemies, allies, seed, frontendBus: animBus, sequencer: runSequencer });
      bridge.backendBus.on(EventNames.BATTLE_LOG, pushLog);
      bridge.backendBus.on(EventNames.BATTLE_END, ({ result }) => endBattle(result, bridge));
      battleBridge = markRaw(bridge);
      if (stageManager) {
        battleStage?.dispose(); // 上一场舞台即刻释放（场景图 + composer 渲染目标）
        battleStage = new BattleStage({ bridge, stageManager });
        stageManager.setStage(battleStage);
      }
      bridge.start();
      log.length = 0;
      notify();
    };
    (async () => {
      await playPendingCutscenes(); // prep 阶段命中项（Boss 层 = preBoss）
      if (stageManager) await cutscene.sceneTransition(doSwap);
      else doSwap(); // headless/无舞台：直切
    })().finally(() => { battlePending = false; });
  }

  // 退场：幕间转场（全黑中点回写 run + 切回地图）→ 塔楼抵达动画（同队列串行）→ 战后剧本
  function endBattle(result, bridge) {
    const doSwap = () => {
      finishBattle(run, result, bridge.battle); // 回写 run（含瑞米打跑检测）
      battleBridge = null;
      if (stageManager && mapStage) {
        mapStage.setFloor(run.floor, run.totalFloors); // 黑幕后即落位；高亮生长由抵达动画接管
        stageManager.setStage(mapStage);
      }
      battleStage?.dispose(); // 战斗舞台随退场释放（此前引用滞留至下一场被静默覆盖）
      battleStage = null;
    };
    (async () => {
      if (stageManager) await cutscene.sceneTransition(doSwap);
      else doSwap(); // headless/无舞台：直切
      // 塔楼抵达（S5）：排在黑幕 reveal 之后（同一队列串行），当前层高亮块长出
      if (stageManager && mapStage) {
        await new Promise(resolve => {
          runSequencer.enqueueInstruction({
            meta: { event: 'tower:floor-arrive', floor: run.floor },
            durationMs: 4000, // 前端卡死保险丝
            start: ({ id, emit }) => mapStage.arriveFloor(run.floor, run.totalFloors, {
              onDone: () => emit(EventNames.ANIMATION_INSTRUCTION_FINISHED, { id }),
            }),
          });
        });
      }
      await playPendingCutscenes(); // reward 阶段命中项（Boss 层 = postBoss）
      notify();
    })();
  }

  // ---- reward ----
  function claimReward(defId = null) {
    if (run.gameStage !== 'reward') return; // 防迟到重复点击
    chooseSkillReward(run, defId);
    completeRewards(run);
    if (run.gameStage === 'room') { slot.lastSpin = null; slot.anim = null; eventRoom.result = null; } // 进新房清上一房瞬态
    notify();
  }

  // ---- rooms（每房一次免费操作后即离房；消费/重复交互待后续细化）----
  // 各入口先查 gameStage：连点/迟到点击会让核心变更先落地、completeRoom 再抛错，造成重复结算
  function trainingUpgrade(uniqueID) {
    if (run.gameStage !== 'room') return;
    trainUpgrade(run, uniqueID);
    completeRoom(run);
    notify();
  }
  function trainingDrawRoll() {
    if (run.gameStage !== 'room' || run.roomData) return;
    trainDrawChoices(run);
    notify();
  }
  function trainingDraw(defId = null) {
    if (run.gameStage !== 'room') return;
    trainDraw(run, defId);
    completeRoom(run);
    notify();
  }
  function campChoose(option, uniqueID = null) {
    if (run.gameStage !== 'room') return;
    if (option === 'rest') campRest(run);
    else if (option === 'recoverRemi') campRecoverRemi(run);
    else if (option === 'upgrade') campUpgrade(run, uniqueID);
    completeRoom(run);
    notify();
  }
  const slot = reactive({ lastSpin: null, anim: null }); // anim: { id, prize } 播放中（roll 动画）
  let slotFinish = null; // 当前 roll 指令回执句柄（UI animationend → reportSlotAnimDone）
  function spin() { // 可重复消费（每次扣费）；roll 动画经 run sequencer 串行编排
    if (run.gameStage !== 'room' || run.currentRoom !== 'slot') return;
    const outcome = spinSlot(run); // 逻辑先行：扣费/入账立即结算，演出随后揭示
    runSequencer.enqueueInstruction({
      meta: { event: 'room:slot-spin', prize: outcome.type },
      durationMs: 4000, // 前端卡死保险丝（UI 未回执时兜底推进）
      start: ({ id, emit }) => {
        slot.anim = { id, prize: outcome };
        slotFinish = (reportId) => {
          if (reportId !== id) return false;
          slot.anim = null;
          slot.lastSpin = outcome; // 结果文字在动画落定后揭示（渐进揭示语义）
          slotFinish = null;
          emit(EventNames.ANIMATION_INSTRUCTION_FINISHED, { id });
          return true;
        };
      },
    });
    notify();
  }
  function reportSlotAnimDone(reportId) { return slotFinish?.(reportId) ?? false; }
  function leaveSlot() {
    if (run.gameStage !== 'room') return;
    completeRoom(run);
    notify();
  }
  const eventRoom = reactive({ result: null });
  function triggerEvent() {
    if (run.gameStage !== 'room' || run.currentRoom !== 'event' || eventRoom.result) return; // 已探索不重复结算
    eventRoom.result = playEvent(run);
    notify();
  }
  function leaveEvent() {
    if (run.gameStage !== 'room') return;
    completeRoom(run);
    notify();
  }

  // ---- ascension ----
  function chooseAscensionDimension(dimension) {
    if (run.gameStage !== 'ascension') return;
    chooseAscension(run, dimension);
    notify();
  }

  // ---- prep ----
  function equip(relicId) { equipRelic(run, relicId); notify(); }
  function unequip(relicId) { unequipRelic(run, relicId); notify(); }
  function useRelic(relicId) { prepUseRelic(run, relicId); notify(); }

  // 离局清理（App.toTitle/newGame 调用）：战斗舞台释放 + 挂起演出瞬落
  // （动画不可序列化——重进/读档由检查点重建稳态）
  function dispose() {
    battleStage?.dispose();
    battleStage = null;
    runSequencer.cancelAll();
  }

  return {
    run, runBus, log, slot, eventRoom, cutscene,
    sequencer: runSequencer, animBus, dispose,
    LEINO_DIMENSIONS, SLOT_PLACEHOLDER,
    skillName: (id) => getSkillDefinition(id)?.name ?? id,
    enemyName: (id) => getEnemyDefinition(id)?.name ?? id,
    isBossFloor,
    trainingMode: () => trainingMode(run),
    upgradableCards: () => upgradableCards(run),
    campOptions: () => campOptions(run),
    getBattleBridge: () => battleBridge,
    getBattleStage: () => battleStage,
    startBattle, claimReward,
    trainingUpgrade, trainingDrawRoll, trainingDraw,
    campChoose, spin, reportSlotAnimDone, leaveSlot, triggerEvent, leaveEvent,
    chooseAscensionDimension,
    equip, unequip, useRelic,
  };
}
