// 道具资产登记表（WORKFLOW §3）：显式 import 逐件登记，禁 import.meta.glob。
// 契约测试按 fs 扫描自动发现（过门与登记解耦，支持并行生产）——本表只负责
// 陈列页/房型配方层的可用集合；新资产验收通过后由 orchestrator 按 id 排序插入。

import anvilStone from './anvilStone.js';
import armorStand from './armorStand.js';
import barrelStack from './barrelStack.js';
import barrelWood from './barrelWood.js';
import benchWood from './benchWood.js';
import bottleRack from './bottleRack.js';
import brazierFire from './brazierFire.js';
import candelabraFloor from './candelabraFloor.js';
import candleStand from './candleStand.js';
import chairHighback from './chairHighback.js';
import chandelierChain from './chandelierChain.js';
import chestLocked from './chestLocked.js';
import chestTreasure from './chestTreasure.js';
import columnRound from './columnRound.js';
import cotBed from './cotBed.js';
import crateStack from './crateStack.js';
import crateWood from './crateWood.js';
import pilasterHalf from './pilasterHalf.js';
import potionShelf from './potionShelf.js';
import rubblePile from './rubblePile.js';
import sacksGrain from './sacksGrain.js';
import statuePedestal from './statuePedestal.js';
import stoolThree from './stoolThree.js';
import tableLong from './tableLong.js';
import tableWood from './tableWood.js';
import vaseClay from './vaseClay.js';
import vaseTwinEar from './vaseTwinEar.js';
import wallTorch from './wallTorch.js';
import weaponRack from './weaponRack.js';

const propRegistry = new Map();

function register(def) {
  if (!def?.id) throw new Error('props: 登记项缺 id');
  if (propRegistry.has(def.id)) throw new Error(`props: 重复登记 "${def.id}"`);
  propRegistry.set(def.id, def);
}

register(anvilStone);
register(armorStand);
register(barrelStack);
register(barrelWood);
register(benchWood);
register(bottleRack);
register(brazierFire);
register(candelabraFloor);
register(candleStand);
register(chairHighback);
register(chandelierChain);
register(chestLocked);
register(chestTreasure);
register(columnRound);
register(cotBed);
register(crateStack);
register(crateWood);
register(pilasterHalf);
register(potionShelf);
register(rubblePile);
register(sacksGrain);
register(statuePedestal);
register(stoolThree);
register(tableLong);
register(tableWood);
register(vaseClay);
register(vaseTwinEar);
register(wallTorch);
register(weaponRack);

/** 全部已登记资产（id → 契约对象）。 */
export { propRegistry };

/** 按 id 取资产定义；不存在抛错（拼写错误宁可炸）。 */
export function getProp(id) {
  const def = propRegistry.get(id);
  if (!def) throw new Error(`props: 未登记的资产 "${id}"`);
  return def;
}
