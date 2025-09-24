// 动画系统（animationDispatcher）— 设计说明与用法
//
// 核心目标
// - 以“队列 + 节拍”的方式，把后端状态（backendGameState）的变化按动画节奏映射到显示层（displayGameState）。
// - 保证每一次关键状态变化（S 子集）都有独立的可控展示顺序；纯 UI 动作（如日志、声音）也在同一队列中顺序播放。
//
// 核心机制
// 1) 三类队列项
//    - { kind: 'state', snapshot, duration? }：将“后端状态的投影快照”应用到显示层（见 S 规范）。
//    - { kind: 'ui', name, payload, duration? }：纯 UI 行为（日志、音效、飘字等），通过前端事件总线驱动。
//    - { kind: 'delay', duration }：纯延时，用于拉开动画节奏。
//
// 2) 入队策略（性能优化版）
//    - 初始仅在 init 时入队一次 S 投影快照，以完成首次同步。
//    - 使用 watch(() => backendGameState, { deep:true, flush:'sync' }) 仅标记 dirty=true，不立即入队；
//      当有“非零延时”的 UI 或 delay 入队时，若 dirty==true，则在它之前入队一条 state 快照（duration=0），随后将 dirty 置为 false。
//    - 在每个 macro tick 结束（setTimeout 0）也会检查 dirty；若仍为 true，则强制入队一条 state 快照（duration=0），避免遗漏同步。
//    - 这样 0ms 的 UI 事件天然被合并展示；只有出现节拍（非零 delay）或 tick 结束时，才把当下的状态切片进队列，显著降低快照频率与开销。
//
// 3) 投影（S）与应用
//    - projectToS(obj)：把后端状态按 S 规则抽取为“纯数据”快照。
//    - applyProjectionToDisplay(src, dst, backendNode)：把 S 快照就地合并到显示层：
//      - 对象：按键合并，删除快照中不存在的 S 键；保留实例与方法；必要时依据 backendNode 的原型创建承载对象，避免丢失原型链。
//      - 数组：优先按 id（uniqueID/id）对齐逐元素合并；若无 id 再回退索引合并；会对齐数组长度，且在创建新元素时按 backend 原型构造实例壳，避免方法丢失。
//      - 不会直接整体替换对象/实例，避免丢失方法（如 Skill.canUse）。
//
// S（共享投影子集）的规范
// - 目的：只把“前端需要渲染/动画的字段”纳入监听，剔除后端私有中间态，降低无关触发与拷贝成本。
// - 规则：
//   1) 仅包含“可枚举的自有属性”。
//   2) 排除所有函数（typeof v === 'function'）。
//   3) 排除所有“仅有 getter、无 setter”的只读属性（避免副作用求值）。
//   4) 排除所有以“_”结尾的属性名（视为后端私有中间态，不参与动画）。
//   5) 其余字段（标量、对象、数组）按结构递归纳入。
// - 建议：
//   - 后端用于 AI、计数器、缓存等与 UI 无关的字段，统一命名为 xxx_，避免进入 S，减少队列压力。
//   - 前端组件中如需调用实例方法（如 Skill.canUse），方法内部仅访问 S 字段，确保在显示层可用。
//
// 使用指南
// - 启动：initAnimationDispatcher({ stepMs })；可按需设置节拍间隔（默认 0ms）。
// - 入队 UI 动作：
//   - enqueueUI(name, payload, { duration })：当 duration>0 时，会在该 UI 前自动入队一条 state 快照（若 dirty==true）。
//   - enqueueDelay(duration)：当 duration>0 时，会在该 delay 前自动入队一条 state 快照（若 dirty==true）。
//   - enqueueState({ snapshot })：如需手动推进状态，也可直接入队投影快照（会清理 dirty）。
// - 不要直接修改 displayGameState；只修改 backendGameState（或发起 UI 事件）。
// - 在类（Skill/Enemy/Item/Ability 等）中：
//   - 非 UI 关键数据（hp、shield、effects、money、AP 等）作为普通字段进入 S。
//   - 仅后端使用的中间态字段请加“_”后缀（如 actionIndex_），避免触发动画。
//   - 方法如 canUse 只读取 S 字段（可从显示层读取），确保在显示层实例上正常运行。
//
// 常见坑与规避
// - 若完全没有非零延时，状态不会自动切片入队，显示层会在下一次出现非零延时前保持合并展示；这是预期的“帧间合并”。
// - 数组重排/插入/删除：为元素提供稳定 id（uniqueID/id），以避免回退到索引合并时的潜在错配。
// - 无关触发多：把纯后端中间态统一命名为 *_ 并确保是可枚举自有属性；这类字段不会被 S 监听到。
//
// 扩展点
// - 可为特定 UI 事件手动传入 { duration: X } 以强制切片当前状态，控制动画节拍。
// - 如需进一步减少冗余快照，可在入队前做“最近一次入队项是否已是 state”检查以去重。

// animationDispatcher.js - 将后端状态的变化以动画节奏应用到显示层状态，并支持UI动作

import { watch, toRaw } from 'vue';
import { backendGameState, displayGameState } from './gameState.js';
import frontendEventBus from '../frontendEventBus.js';

// 队列项类型：
// - { kind: 'state', snapshot, duration? }
// - { kind: 'ui', name: 'lockControl'|'unlockControl', payload?, duration? }
// - { kind: 'delay', duration }
const queue = [];
let processing = false;
let stalling = false;
let defaultStepMs = 0;
// 新增：脏位与 tick 末兜底检查
let dirty = false;
let endOfTickScheduled = false;
function scheduleEndOfTickCheck() {
  if (endOfTickScheduled) return;
  endOfTickScheduled = true;
  setTimeout(() => {
    endOfTickScheduled = false;
    if (dirty) {
      // tick 结束仍有未同步的变更，强制入队一次当前快照
      queue.push({ kind: 'state', snapshot: captureSnapshot(), duration: 0 });
      dirty = false;
      tryStartProcessQueue();
    }
  }, 0);
}

function isWritableProperty(target, key) {
  const desc = Object.getOwnPropertyDescriptor(target, key);
  if (!desc) return true;
  if (typeof desc.get === 'function' && typeof desc.set !== 'function') return false;
  if (desc.writable === false) return false;
  return true;
}

function isSKey(key) {
  return typeof key !== 'string' || !key.endsWith('_');
}

// 将 backendGameState 投影为子集 S（仅包含非函数、非 _ 结尾字段），保持为纯数据树
function projectToS(value, seen = new WeakMap()) {
  // 使用代理对象进行依赖收集；仅在需要取属性描述符时取 raw
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const arr = new Array(value.length);
    seen.set(value, arr);
    for (let i = 0; i < value.length; i++) {
      arr[i] = projectToS(value[i], seen);
    }
    return arr;
  }

  const out = {};
  seen.set(value, out);

  // 遍历可枚举自有属性（通过代理拿 keys，可建立依赖）
  for (const key of Object.keys(value)) {
    if (!isSKey(key)) continue;
    const raw = toRaw(value);
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (desc && typeof desc.get === 'function' && typeof desc.set !== 'function') continue;
    const v = value[key]; // 通过代理读取，建立依赖
    if (typeof v === 'function') continue;
    out[key] = projectToS(v, seen);
  }
  return out;
}

function getIdKeyFromArray(arr) {
  if (!Array.isArray(arr)) return null;
  for (const el of arr) {
    if (el && typeof el === 'object') {
      if ('uniqueID' in el) return 'uniqueID';
      if ('id' in el) return 'id';
    }
  }
  return null;
}

function createInstanceFromBackendNode(bEl) {
  if (bEl && typeof bEl === 'object') {
    const proto = Object.getPrototypeOf(toRaw(bEl));
    return Object.create(proto || Object.prototype);
  }
  return {};
}

function reconcileArrayById(sArr, dArr, bArr) {
  const idKey = getIdKeyFromArray(sArr) || getIdKeyFromArray(bArr);
  if (!idKey) return false; // no id available
  // Build id -> dest element map
  const dstMap = new Map();
  for (let i = 0; i < dArr.length; i++) {
    const el = dArr[i];
    if (el && typeof el === 'object' && idKey in el) {
      dstMap.set(el[idKey], el);
    }
  }
  const newArr = new Array(sArr.length);
  for (let i = 0; i < sArr.length; i++) {
    const sEl = sArr[i];
    const bEl = Array.isArray(bArr) ? bArr[i] : undefined;
    if (sEl && typeof sEl === 'object' && idKey in sEl) {
      const id = sEl[idKey];
      let target = dstMap.get(id);
      if (!target) {
        target = createInstanceFromBackendNode(bEl);
      }
      applyProjectionToDisplay(sEl, target, bEl);
      newArr[i] = target;
    } else if (sEl && typeof sEl === 'object') {
      // object but no id on this element: create/reuse by backend prototype
      let target = (Array.isArray(bArr) && bArr[i]) ? createInstanceFromBackendNode(bArr[i]) : {};
      applyProjectionToDisplay(sEl, target, Array.isArray(bArr) ? bArr[i] : undefined);
      newArr[i] = target;
    } else {
      // primitive
      newArr[i] = sEl;
    }
  }
  // In-place replace dArr contents to preserve reactive array reference
  dArr.splice(0, dArr.length, ...newArr);
  return true;
}

// 将 S 投影快照合并到显示层，仅写入/删除 S 字段，保留实例/方法
function applyProjectionToDisplay(src, dst, backendNode = undefined) {
  // 若为数组，执行就地元素级合并（优先按 id 对齐），尽量保持实例原型
  if (Array.isArray(src) && Array.isArray(dst)) {
    const bArr = Array.isArray(backendNode) ? backendNode : undefined;
    // Try keyed reconciliation first
    const done = reconcileArrayById(src, dst, bArr);
    if (done) return;

    // Fallback: index-based merge (best effort)
    const len = src.length;
    for (let i = 0; i < len; i++) {
      const sEl = src[i];
      const dEl = dst[i];
      const bEl = bArr ? bArr[i] : undefined;
      if (sEl && typeof sEl === 'object') {
        if (dEl && typeof dEl === 'object') {
          applyProjectionToDisplay(sEl, dEl, bEl);
        } else {
          const inst = createInstanceFromBackendNode(bEl);
          applyProjectionToDisplay(sEl, inst, bEl);
          dst[i] = inst;
        }
      } else {
        dst[i] = sEl;
      }
    }
    if (dst.length > len) dst.splice(len);
    return;
  }

  // 删除在 dst 中存在但在 src 中不存在的 S 字段（跳过函数与只读属性）
  for (const key of Object.keys(dst)) {
    if (!isSKey(key)) continue;
    const desc = Object.getOwnPropertyDescriptor(dst, key);
    if (desc && typeof desc.get === 'function' && typeof desc.set !== 'function') continue;
    if (typeof dst[key] === 'function') continue;
    if (!Object.prototype.hasOwnProperty.call(src, key)) {
      try { delete dst[key]; } catch (_) { /* ignore */ }
    }
  }

  // 写入/合并 src 中的字段
  for (const key of Object.keys(src)) {
    if (!isWritableProperty(dst, key)) continue;
    const sVal = src[key];
    const dVal = dst[key];
    const bVal = backendNode && typeof backendNode === 'object' ? backendNode[key] : undefined;

    if (Array.isArray(sVal)) {
      if (Array.isArray(dVal)) {
        applyProjectionToDisplay(sVal, dVal, bVal);
      } else {
        // 创建目标数组并逐元素合并，尽量保持实例原型
        const arr = new Array(0);
        dst[key] = arr;
        applyProjectionToDisplay(sVal, arr, bVal);
      }
      continue;
    }

    if (sVal && typeof sVal === 'object') {
      if (dVal && typeof dVal === 'object' && !Array.isArray(dVal)) {
        applyProjectionToDisplay(sVal, dVal, bVal);
      } else {
        // 以后端节点原型创建目标对象，保留方法；否则退回普通对象
        let obj;
        if (bVal && typeof bVal === 'object' && !Array.isArray(bVal)) {
          obj = Object.create(Object.getPrototypeOf(toRaw(bVal)));
        } else {
          obj = {};
        }
        applyProjectionToDisplay(sVal, obj, bVal);
        dst[key] = obj;
      }
      continue;
    }

    // 原始值：直接赋值
    if (dst[key] !== sVal) dst[key] = sVal;
  }
}

function captureSnapshot() {
  // 基于投影生成轻量快照，仅包含 S 字段
  return projectToS(backendGameState);
}

function scheduleNext(delay) {
  if(delay > 0) {
    setTimeout(processQueue, delay);
  } else processQueue();
}

function processQueue() {
  if (processing) return;
  if (queue.length === 0) return;
  processing = true;
  stalling = false;
  const item = queue.shift();
  try {
    switch (item.kind) {
      case 'state':
        applyProjectionToDisplay(item.snapshot || captureSnapshot(), displayGameState, backendGameState);
        break;
      case 'ui':
        handleUIAction(item);
        break;
      case 'delay':
        // 纯延时，不做任何应用
        stalling = true; // 在此期间，不启动额外processQueue
        break;
      default:
        break;
    }
  } finally {
    processing = false;
    scheduleNext(item.duration ?? defaultStepMs);
  }
}

function tryStartProcessQueue() {
  if(!stalling) {
    processQueue();
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
  }
}

// 外部API：入队
// 入队一个sisplayState修改
export function enqueueState(options = {}) {
  const {duration, snapshot} = options;
  queue.push({kind: 'state', snapshot: snapshot || captureSnapshot(), duration});
  // 快照已捕获，清除脏位
  dirty = false;
  tryStartProcessQueue();
}
// 入队一个UI动作
export function enqueueUI(name, payload = {}, options = {}) {
  const { duration = 0 } = options;
  // 若有非零延时，且存在未同步的后端变更，则在它之前切片一次状态
  if (duration > 0 && dirty) {
    queue.push({ kind: 'state', snapshot: captureSnapshot(), duration: 0 });
    dirty = false;
  }
  queue.push({ kind: 'ui', name, payload, duration });
  tryStartProcessQueue();
}

// 入队一个延时
export function enqueueDelay(duration = defaultStepMs) {
  // 若有非零延时，且存在未同步的后端变更，则在它之前切片一次状态
  if (duration > 0 && dirty) {
    queue.push({ kind: 'state', snapshot: captureSnapshot(), duration: 0 });
    dirty = false;
  }
  queue.push({ kind: 'delay', duration });
  tryStartProcessQueue();
}

export function clearQueue() {
  queue.length = 0;
}

export function initAnimationDispatcher({ stepMs = 0 } = {}) {
  defaultStepMs = stepMs;
  // 初始同步一次（避免空白）
  enqueueState({ snapshot: projectToS(backendGameState) });
  // 新增：监听后端状态变化，仅置脏，不立刻入队
  watch(
    () => backendGameState,
    () => {
      dirty = true;
      scheduleEndOfTickCheck();
    },
    { deep: true, flush: 'sync' }
  );
}

export function stopAnimationDispatcher() {
  // 清理仅通过 clearQueue + 停止watch 外部控制；这里不保留interval
  // 已无interval，留空即可
}