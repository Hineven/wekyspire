import BattleInstruction, { WAIT } from './BattleInstruction.js';

export const MAX_TRIGGER_DEPTH = 32;

// 结算内核：指令树 DFS 泵 + 订阅注册表 + 取消三动词（veto / abort / inspect）。
//
// 订阅 = { when, phase, filter?, window?, priority?, react, owner? }
//   when     指令类（instanceof 匹配）或谓词 (instr, ctx) => bool
//   phase    'pre' | 'post'
//   filter   (instr, ctx) => bool，可选；zone 限定等写在这里
//   window   'battle'（默认）| 'turn' | 'once'，由 clearWindow/触发后自动注销
//   priority 降序；同优先级按注册序
//   react    pre: 可调用 instr.setPayload / kernel.veto；post: 提交反应指令
//
// 铁律：
//   - POST 反应作为已完成节点的子节点提交：节点弹出前结算完全部后果。
//   - 被 veto 的节点从未执行，不触发任何 POST。
//   - 取消入口只在本内核（veto / abort / 终局检查），外部不得直写 cancelled。
export default class BattleKernel {
  constructor({ isBattleOver = null, onWaitingCancelled = null, getAbortTarget = null } = {}) {
    this.stack = [];
    this.subscriptions = [];
    this._subSeq = 0;
    this._reactionDepth = 0;
    this.isBattleOver = isBattleOver;           // (ctx) => 'victory' | 'defeat' | null
    this.onWaitingCancelled = onWaitingCancelled; // WAIT 节点被取消时的撤回钩子（如收回输入请求）
    this.getAbortTarget = getAbortTarget;       // 终局 abort 的目标节点（默认栈底根；战斗装配指定 TurnLoop，让战后清理指令能正常执行）
    this.verdict = null;                        // 最近一次终局判定结果
    this.currentInstruction = null;             // 正在执行的指令（submitInstruction 的默认父节点）
  }

  // ---- 提交 ----

  submitInstruction(instr, parent = this.currentInstruction) {
    if (this._reactionDepth > 0) instr._triggerDepth = this._reactionDepth;
    if (parent) {
      instr.parentInstruction = parent;
      parent.children.push(instr);
    } else {
      this.stack.push(instr);
    }
    return instr;
  }

  // ---- 订阅注册表 ----

  addSubscription(sub) {
    const entry = {
      priority: 0,
      window: 'battle',
      filter: null,
      owner: null,
      ...sub,
      seq: this._subSeq++,
    };
    this.subscriptions.push(entry);
    return entry;
  }

  removeSubscription(entry) {
    const i = this.subscriptions.indexOf(entry);
    if (i >= 0) this.subscriptions.splice(i, 1);
  }

  clearWindow(window) {
    this.subscriptions = this.subscriptions.filter(s => s.window !== window);
  }

  // 按 owner 批量注销（如咏唱卡停止时注销其 activated 订阅）
  removeSubscriptionsByOwner(owner) {
    this.subscriptions = this.subscriptions.filter(s => s.owner !== owner);
  }

  // ---- 取消 ----

  // veto：仅 PRE 阶段、针对尚未执行的节点。节点弹掉、不触发 POST；
  // replacements 插入父节点中原位置（取消与替换统一）。
  veto(instr, reason, replacements = []) {
    instr.cancelled = true;
    instr.cancelReason = reason;
    const parent = instr.parentInstruction;
    if (parent && replacements.length) {
      parent.children.splice(parent._nextChildIndex, 0, ...replacements);
      for (const r of replacements) r.parentInstruction = parent;
    }
  }

  // abort：中止某个祖先，取消沿父链向下传播。规约上仅用于终局。
  abort(ancestor, reason) {
    ancestor.cancelled = true;
    ancestor.cancelReason = reason;
  }

  // ---- 泵 ----

  // 启动：以 root 为唯一根开始结算。
  run(root, ctx) {
    this.stack = [root];
    this._pump(ctx);
  }

  // 恢复：解除某 WAIT 节点的挂起并继续泵。
  resume(node, ctx) {
    node._waiting = false;
    this._pump(ctx);
  }

  _pump(ctx) {
    while (this.stack.length) {
      const top = this.stack[this.stack.length - 1];

      // 死节点（含被 veto / 祖先被 abort）：弹掉，不触发 POST
      if (!top.isAlive()) {
        if (top._waiting && this.onWaitingCancelled) this.onWaitingCancelled(top);
        this.stack.pop();
        continue;
      }

      // 有未访问子节点：压栈（DFS）
      if (top._nextChildIndex < top.children.length) {
        this.stack.push(top.children[top._nextChildIndex++]);
        continue;
      }

      // 已完成且子节点全部结算：弹出
      if (top._isCompleted) {
        this.stack.pop();
        this.currentInstruction = this.stack.length ? this.stack[this.stack.length - 1] : null;
        continue;
      }

      // 挂起：暂停泵
      if (top._waiting) return;

      // 首次执行前：构建 payload + PRE 订阅（只跑一次）
      if (!top._prepared) {
        top._prepared = true;
        top.buildPayload(ctx);
        this._runPhaseSubscriptions(top, 'pre', ctx);
        if (top.cancelled) { // 被 veto：从未执行，直接弹掉
          this.stack.pop();
          continue;
        }
      }

      this.currentInstruction = top;
      const r = top.execute(ctx);

      if (r === WAIT) {
        top._waiting = true;
        return;
      }
      if (r === true) {
        top._isCompleted = true;
        // 弹出前先结算全部 POST 反应（作为本节点的子节点追加）
        this._runPhaseSubscriptions(top, 'post', ctx);
        this._afterInstructionCompleted(ctx);
        continue;
      }
      // false：多阶段，留栈进入下一 stage
      top._stage++;
    }
    this.currentInstruction = null;
  }

  _afterInstructionCompleted(ctx) {
    if (!this.isBattleOver) return;
    const verdict = this.isBattleOver(ctx);
    if (verdict) {
      this.verdict = verdict;
      const target = this.getAbortTarget ? this.getAbortTarget() : this.stack[0];
      if (target && !target.cancelled) this.abort(target, verdict);
    }
  }

  // ---- 订阅匹配与执行 ----

  _matches(entry, instr, ctx) {
    const w = entry.when;
    const typeOk = (w === BattleInstruction || w.prototype instanceof BattleInstruction)
      ? instr instanceof w
      : !!w.call(null, instr, ctx);
    return typeOk && (!entry.filter || entry.filter(instr, ctx));
  }

  _collect(instr, phase, ctx) {
    return this.subscriptions
      .filter(e => e.phase === phase && this._matches(e, instr, ctx))
      .sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  }

  _runPhaseSubscriptions(instr, phase, ctx) {
    for (const entry of this._collect(instr, phase, ctx)) {
      if (phase === 'post') {
        const depth = (instr._triggerDepth || 0) + 1;
        if (depth > MAX_TRIGGER_DEPTH) {
          throw new Error(`触发链深度超限（>${MAX_TRIGGER_DEPTH}），疑似订阅死循环`);
        }
        this._reactionDepth = depth;
        entry.react(instr, ctx);
        this._reactionDepth = 0;
      } else {
        entry.react(instr, ctx);
      }
      if (entry.window === 'once') this.removeSubscription(entry);
      if (instr.cancelled) break; // 被 veto 后不再触发后续 PRE
    }
  }
}
