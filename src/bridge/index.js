import mitt from 'mitt';
import { createBattle, startBattle, isBattleFinished } from '../core/flow/battle.js';
import AnimationSequencer from '../core/anim/sequencer.js';
import { createBridgePresenter } from './presenter.js';
import { projectBattle } from './projection.js';
import { createIntents } from './intents.js';
import { createInteractionHandler } from './interactionHandler.js';
import { EventNames } from './events.js';

// Bridge 装配：把 Core 战斗接到协议事件流上。
//   const bridge = createBridge({ runState, enemies, seed, config });
//   bridge.backendBus.on(EventNames.STATE_DIRTY, render);
//   bridge.frontendBus.on(EventNames.ANIM_DAMAGE, playDamageTween);
//   bridge.start();
// 组成：两条总线 + 动画队列 + presenter 翻译层 + 状态投影（标脏+拉取）
//      + 意图层 + 结算期输入仲裁。
// frontendBus/sequencer 可注入（S2）：Shell 传入 run 级共享实例后，战斗指令与
// cutscene/房间/塔楼指令在同一队列定序（跨层演出链）；缺省自建（headless/测试）。
export function createBridge({
  runState, enemies = [], allies = [], seed = 1, config = {},
  frontendBus: injectedFrontendBus = null, sequencer: injectedSequencer = null,
} = {}) {
  const backendBus = mitt();
  const frontendBus = injectedFrontendBus ?? mitt();
  const sequencer = injectedSequencer
    ?? new AnimationSequencer({ bus: frontendBus, finishedEvent: EventNames.ANIMATION_INSTRUCTION_FINISHED });

  let dirty = true;
  let cachedProjection = null;
  // 显示状态兜底：每次标脏都记下来，队列排空时（或 tick 末）补一次 syncState——
  // Core 存在不经 presenter 的变更（意图/应答/轮转变更），保证前端显示状态
  // 在动画队列排空时必定追上后端，不会滞留
  let unsyncedChanges = false;
  let syncFallbackScheduled = false;
  let syncing = false; // syncIfIdle → syncState → markDirty 的递归守卫
  const syncIfIdle = () => {
    if (syncing || !unsyncedChanges || sequencer.pendingCount > 0) return;
    syncing = true;
    try { presenter.syncState(); } finally { syncing = false; }
  };
  const markDirty = () => {
    dirty = true;
    unsyncedChanges = true;
    backendBus.emit(EventNames.STATE_DIRTY);
    syncIfIdle(); // 队列空闲（即时链播完/无节拍变更）→ 立即追上显示状态
    if (!syncFallbackScheduled) {
      syncFallbackScheduled = true;
      setTimeout(() => {
        syncFallbackScheduled = false;
        syncIfIdle();
      }, 0);
    }
  };
  // 队列每完成一条指令都检查一次：排空即追上显示状态
  frontendBus.on(EventNames.ANIMATION_INSTRUCTION_FINISHED, () => syncIfIdle());

  // 状态投影：标脏后重算，否则走缓存（前端按需拉取，不订阅 Core）
  const getProjection = () => {
    interaction.sync();
    if (dirty) {
      cachedProjection = projectBattle(battle);
      dirty = false;
    }
    return cachedProjection;
  };

  // 前向引用：presenter 的 requestInput 要打到 interactionHandler，
  // 而 interactionHandler 需要 battle——用壳函数解环。
  const interactionRef = { current: null };
  const presenter = createBridgePresenter({
    sequencer, frontendBus, backendBus, markDirty,
    getSnapshot: () => { // sync 节拍 start 时拉取最新投影作快照；一次快照覆盖此前全部变更
      unsyncedChanges = false;
      return getProjection();
    },
    onRequestInput: (request) => interactionRef.current?.handleRequest(request),
  });

  const battle = createBattle({ runState, enemies, allies, seed, config, presenter });
  const interaction = createInteractionHandler({ battle, backendBus });
  interactionRef.current = interaction;
  const intents = createIntents(battle);

  // 投影缓存兜底：Core 存在不经 presenter 的状态迁移（如 UseSkill 收尾的 zone 迁移），
  // presenter 的 markDirty 覆盖不到。意图/应答是全部变更的统一入口，
  // 每次调用返回后强制标脏，保证下一次 getProjection 重算（中途标脏仍靠 presenter）。
  const rawIntents = intents;
  for (const key of Object.keys(rawIntents)) {
    if (typeof rawIntents[key] !== 'function' || key.startsWith('can')) continue;
    const fn = rawIntents[key];
    rawIntents[key] = (...args) => {
      const r = fn(...args);
      markDirty();
      syncIfIdle(); // 无节拍覆盖的意图变更（队列空闲时）立即追上显示状态
      return r;
    };
  }
  const rawRespond = interaction.respond.bind(interaction);
  interaction.respond = (...args) => {
    const r = rawRespond(...args);
    markDirty();
    syncIfIdle();
    return r;
  };

  return {
    battle,
    backendBus,
    frontendBus,
    sequencer,
    intents,
    interaction,

    start() {
      startBattle(battle);
      markDirty();
    },

    isFinished: () => isBattleFinished(battle),

    getProjection,
  };
}

export { EventNames };
