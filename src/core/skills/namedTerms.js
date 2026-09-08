// named 术语表：/named{术语} 热区的资料来源（tooltip 文案 + 卡面特征色）。
// 术语是跨卡的通用机制词汇（区别于 effect/skill 的注册表实体），静态表即可；
// 新的通用机制关键词在此补一行，卡面描述只写短词、长机制进 tooltip。
// 名称可带尾缀数字参数（/named{衰败2} → 基名「衰败」+ param 2），查表时剥离并插值。

const TERMS = {
  // 斩（刀法总纲）：苛刻点在冷却——只在牌库中冷却充能（FIFO 下打出回牌库底是全局通则，
  // 斩不给手牌滞留的余地）；局内进阶链（斩→…→断神斩）待 modifier 系统落地后接入
  '斩': {
    color: '#9fb4cc',
    describe: () => '此卡打出后进阶；只在牌库中冷却充能',
  },
  // 衰败：在手渡过回合的代价——冷却计时反向推进（越攥越钝，回牌库才能回充）
  '衰败': {
    color: '#c87070',
    describe: (n) => `回合开始时，若在手牌中，反向冷却${n ?? 'N'}`,
  },
  // 固有：起手保障——游戏（战斗）开始时在牌库中即直接入手，不占初始抽牌位
  '固有': {
    color: '#8fbf9f',
    describe: () => '此卡在游戏开始时，若在牌库中，进入手牌',
  },
};

/**
 * 解析 named 引用。
 * @param {string} ref 热区/标记携带的引用名（可含尾缀数字，如「衰败2」）
 * @returns {{ name:string, param:number|null, color:string, text:string } | null}
 *   未知术语返回 null（调用方回落通用呈现）
 */
export function getNamedTerm(ref) {
  const m = String(ref ?? '').match(/^(.+?)(\d+)$/);
  const name = m ? m[1] : String(ref ?? '');
  const def = TERMS[name];
  if (!def) return null;
  const param = m ? parseInt(m[2], 10) : null;
  return { name, param, color: def.color, text: def.describe(param) };
}
