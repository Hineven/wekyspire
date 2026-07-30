import Unit from './unit.js';

// AI 驱动单位基类：敌人（Enemy）与我方队友（Ally，如瑞米）共用。
// 行为（行动序列/act/意图文案）在定义侧（enemies|allies/definitions），
// 实例只持有状态：defId + 行动游标 + 当前意图。阵营由 side 区分。
export default class AIUnit extends Unit {
  constructor(opts = {}) {
    super(opts);
    this.defId = opts.defId ?? null;
    this.intention = null;      // { type: 'attack'|'defend'|'effect'|..., value?, description? }
    this.actionIndex = 0;       // 固定行动序列游标（状态）；推进逻辑在定义/指令侧
  }
}
