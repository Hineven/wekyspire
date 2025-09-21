// filepath: c:\\Users\\hineven\\CLionProjects\\rtvl_test\\src\\data\\animationDispatcher.js
// animationDispatcher.js - 将后端状态的变化以动画节奏应用到显示层状态，并支持UI动作

import { watch } from 'vue';
import { backendGameState, displayGameState } from './gameState.js';
import frontendEventBus from '../frontendEventBus.js';

// 队列项类型：
// - { kind: 'state', snapshot, duration? }
// - { kind: 'ui', name: 'lockControl'|'unlockControl', payload?, duration? }
// - { kind: 'delay', duration }
const queue = [];
let processing = false;
let defaultStepMs = 300;
let scheduled = false;

function isWritableProperty(target, key) {
  const desc = Object.getOwnPropertyDescriptor(target, key);
  if (!desc) return true;
  if (typeof desc.get === 'function' && typeof desc.set !== 'function') return false;
  if (desc.writable === false) return false;
  return true;
}

// 应用后端快照到显示层（保持引用，逐层赋值）
function applySnapshotToDisplay(src, dst) {
  for (const key of Object.keys(src)) {
    const srcVal = src[key];
    if (!isWritableProperty(dst, key)) continue;
    if (typeof srcVal === 'function') continue;
    const dstVal = dst[key];
    if (Array.isArray(srcVal)) {
      if (!Array.isArray(dstVal) || srcVal.length !== dstVal.length || srcVal.some((v, i) => v !== dstVal[i])) {
        dst[key] = srcVal.slice();
      }
    } else if (srcVal && typeof srcVal === 'object') {
      if (!dstVal || typeof dstVal !== 'object') {
        dst[key] = srcVal;
      } else {
        applySnapshotToDisplay(srcVal, dstVal);
      }
    } else {
      if (dst[key] !== srcVal) {
        dst[key] = srcVal;
      }
    }
  }
}

function captureSnapshot() {
  // 直接引用backend对象（保留方法/原型），由apply函数递归赋值
  return backendGameState;
}

function scheduleNext(delay) {
  if(delay > 0) {
    console.log("delay", delay);
    setTimeout(processQueue, delay);
  } else processQueue();
}

function ensureScheduled() {
  if (!processing && !scheduled) {
    scheduled = true;
    // schedule on next macrotask to avoid synchronous recursive updates
    setTimeout(() => {
      scheduled = false;
      processQueue();
    }, 0);
  }
}

function processQueue() {
  if (processing) return;
  if (queue.length === 0) return;
  processing = true;
  const item = queue.shift();

  try {
    switch (item.kind) {
      case 'state':
        applySnapshotToDisplay(item.snapshot || captureSnapshot(), displayGameState);
        break;
      case 'ui':
        handleUIAction(item);
        break;
      case 'delay':
        // 纯延时，不做任何应用
        break;
      default:
        break;
    }
  } finally {
    processing = false;
    scheduleNext(item.duration ?? defaultStepMs);
  }
}

function handleUIAction(item) {
  const { name, payload } = item;
  switch (name) {
    case 'lockControl':
      displayGameState.controlDisableCount = (displayGameState.controlDisableCount || 0) + 1;
      break;
    case 'unlockControl':
      displayGameState.controlDisableCount = Math.max(0, (displayGameState.controlDisableCount || 0) - 1);
      break;
    case 'spawnParticles':
      frontendEventBus.emit('spawn-particles', payload?.particles || payload || []);
      break;
    case 'playSound':
      frontendEventBus.emit('play-sound', payload || {});
      break;
    case 'popMessage':
      frontendEventBus.emit('pop-message', payload || {});
      break;
    case 'displayDialog':
      frontendEventBus.emit('display-dialog', payload || []);
      break;
    case 'addBattleLog':
    case 'addBattleLogUI':
      // 将战斗日志作为UI动作排队到事件总线
      frontendEventBus.emit('add-battle-log', payload || {});
      break;
    case 'clearBattleLog':
    case 'clearBattleLogUI':
      // 清空战斗日志作为UI动作排队处理
      frontendEventBus.emit('clear-battle-log');
      break;
    default:
      break;
  }
}

// 外部API：入队
// 入队一个sisplayState修改
export function enqueueState(options = {}) {
  const { duration } = options;
  queue.push({ kind: 'state', snapshot: captureSnapshot(), duration });
  ensureScheduled();
}

// 入队一个UI动作
export function enqueueUI(name, payload = {}, options = {}) {
  const { duration } = options;
  queue.push({ kind: 'ui', name, payload, duration });
  ensureScheduled();
}

// 入队一个延时
export function enqueueDelay(duration = defaultStepMs) {
  queue.push({ kind: 'delay', duration });
  ensureScheduled();
}

export function clearQueue() {
  queue.length = 0;
}

export function initAnimationDispatcher({ stepMs = 0 } = {}) {
  defaultStepMs = stepMs;
  // 监听后端状态变化：每次变化入队一个state动作
  watch(
    () => backendGameState,
    (newVal, oldVal) => {
      console.log("state change detected");
      enqueueState();
    },
    { deep: true, flush: 'post' }
  );
}

export function stopAnimationDispatcher() {
  // 清理仅通过 clearQueue + 停止watch 外部控制；这里不保留interval
  // 已无interval，留空即可
}