import { EventNames } from './events.js';

// 动画队列/执行器（自旧仓库 animationSequencer.js 迁入，语义零改动）：
// - 指令 { id, status, tags, waitTags, durationMs, start, meta }
// - 可执行判定：位于 X 之前且与 X.waitTags 有交集的指令全部 finished，X 才能 start
//   （默认 waitTags=['all'] = 等待所有前序；tags/waitTags 都自动含 'all'…
//    注意：'all' 标签使默认情况下指令严格串行；要并行需显式 waitTags: []）
// - 结束：总线收到 ANIMATION_INSTRUCTION_FINISHED { id }，或 durationMs 超时强杀
// 与旧版唯一差异：事件总线改为构造注入（不再 import 全局单例），可 headless 测试。
function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function hasIntersection(a, b) {
  for (const x of a) { if (b.has(x)) return true; }
  return false;
}

export default class AnimationSequencer {
  constructor({ bus }) {
    this._instructions = [];
    this._idToTimer = new Map();
    this._bus = bus;
    bus.on(EventNames.ANIMATION_INSTRUCTION_FINISHED, (payload = {}) => {
      if (payload?.id) this.finish(payload.id, 'frontend');
    });
  }

  enqueueInstruction({ tags = ['all'], waitTags, durationMs = Infinity, start, meta } = {}) {
    const id = genId();
    this._instructions.push({
      id,
      status: 'pending',
      tags: new Set([...(tags || []), 'all']),
      waitTags: new Set(waitTags === undefined ? ['all'] : (waitTags || [])),
      durationMs,
      start: typeof start === 'function' ? start : () => {},
      meta,
      _startedAt: 0,
    });
    this._pump();
    return id;
  }

  finish(id, reason = 'manual') {
    const instr = this._instructions.find(i => i.id === id);
    if (!instr) return false;
    if (instr.status === 'finished') return true;
    instr.status = 'finished';
    const t = this._idToTimer.get(id);
    if (t) {
      clearTimeout(t);
      this._idToTimer.delete(id);
    }
    this._instructions = this._instructions.filter(i => i.status !== 'finished');
    this._pump();
    return true;
  }

  // 当前未完成指令数（测试/调试）
  get pendingCount() {
    return this._instructions.length;
  }

  // 查询队列中首个满足条件的未完成指令（Stage 用：展示卡判断后续是否已有自己的
  // 离场节拍在排队——有则停留展示位等收，不回跟踪）。只读，不改状态
  findPending(predicate) {
    return this._instructions.find(i => i.status !== 'finished' && predicate(i)) ?? null;
  }

  _pump() {
    let startedAny = false;
    for (let i = 0; i < this._instructions.length; i++) {
      const ins = this._instructions[i];
      if (!ins || ins.status !== 'pending') continue;
      if (!this._canExecute(i)) continue;
      this._startInstruction(ins);
      startedAny = true;
    }
    return startedAny;
  }

  _canExecute(index) {
    const current = this._instructions[index];
    if (!current) return false;
    for (let j = 0; j < index; j++) {
      const prev = this._instructions[j];
      if (!prev || prev.status === 'finished') continue;
      if (hasIntersection(prev.tags, current.waitTags)) return false;
    }
    return true;
  }

  _startInstruction(instr) {
    instr.status = 'running';
    instr._startedAt = Date.now();
    try {
      instr.start({
        id: instr.id,
        meta: instr.meta,
        emit: (name, payload) => this._bus.emit(name, payload),
      });
    } catch (err) {
      console.error('[sequencer] start logic error:', err);
    }
    if (Number.isFinite(instr.durationMs) && instr.durationMs >= 0) {
      const timerId = setTimeout(() => this.finish(instr.id, 'timeout'), Math.max(0, instr.durationMs));
      this._idToTimer.set(instr.id, timerId);
    }
  }
}
