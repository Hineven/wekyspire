// 道具资产登记表（WORKFLOW §3）：显式 import 逐件登记，禁 import.meta.glob。
// 契约测试按 fs 扫描自动发现（过门与登记解耦，支持并行生产）——本表只负责
// 陈列页/房型配方层的可用集合；新资产验收通过后由 orchestrator 按 id 排序插入。

import bottleRack from './bottleRack.js';
import candleStand from './candleStand.js';
import columnRound from './columnRound.js';
import pilasterHalf from './pilasterHalf.js';
import rubblePile from './rubblePile.js';
import statuePedestal from './statuePedestal.js';
import vaseClay from './vaseClay.js';
import wallTorch from './wallTorch.js';

const propRegistry = new Map();

function register(def) {
  if (!def?.id) throw new Error('props: 登记项缺 id');
  if (propRegistry.has(def.id)) throw new Error(`props: 重复登记 "${def.id}"`);
  propRegistry.set(def.id, def);
}

register(bottleRack);
register(candleStand);
register(columnRound);
register(pilasterHalf);
register(rubblePile);
register(statuePedestal);
register(vaseClay);
register(wallTorch);

/** 全部已登记资产（id → 契约对象）。 */
export { propRegistry };

/** 按 id 取资产定义；不存在抛错（拼写错误宁可炸）。 */
export function getProp(id) {
  const def = propRegistry.get(id);
  if (!def) throw new Error(`props: 未登记的资产 "${id}"`);
  return def;
}
