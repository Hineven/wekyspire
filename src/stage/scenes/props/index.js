// 道具资产登记表（WORKFLOW §3）：显式 import 逐件登记，禁 import.meta.glob。
// 契约测试按 fs 扫描自动发现（过门与登记解耦，支持并行生产）——本表只负责
// 陈列页/房型配方层的可用集合；新资产验收通过后由 orchestrator 按 id 排序插入。

import alcoveNiche from './alcoveNiche.js';
import anvilStone from './anvilStone.js';
import armorStand from './armorStand.js';
import bannerHerald from './bannerHerald.js';
import bannerLong from './bannerLong.js';
import bannerNiche from './bannerNiche.js';
import barrelStack from './barrelStack.js';
import barrelWood from './barrelWood.js';
import benchWood from './benchWood.js';
import blindArcade from './blindArcade.js';
import bloodStain from './bloodStain.js';
import boneScatter from './boneScatter.js';
import bottleRack from './bottleRack.js';
import brazierFire from './brazierFire.js';
import buttressWall from './buttressWall.js';
import candelabraFloor from './candelabraFloor.js';
import candleStand from './candleStand.js';
import chairHighback from './chairHighback.js';
import chandelierChain from './chandelierChain.js';
import chestLocked from './chestLocked.js';
import chestTreasure from './chestTreasure.js';
import coinScatter from './coinScatter.js';
import columnRound from './columnRound.js';
import cotBed from './cotBed.js';
import cracksFloor from './cracksFloor.js';
import crateStack from './crateStack.js';
import crateWood from './crateWood.js';
import crossedSwords from './crossedSwords.js';
import fireplaceBig from './fireplaceBig.js';
import gravelPatch from './gravelPatch.js';
import hooksRope from './hooksRope.js';
import lanternWall from './lanternWall.js';
import mossPatchFloor from './mossPatchFloor.js';
import mountedHead from './mountedHead.js';
import paintingGrand from './paintingGrand.js';
import paintingTilted from './paintingTilted.js';
import pilasterHalf from './pilasterHalf.js';
import plankRepair from './plankRepair.js';
import potionShelf from './potionShelf.js';
import puddleWater from './puddleWater.js';
import reliefBattle from './reliefBattle.js';
import reliefSigil from './reliefSigil.js';
import ritualCircle from './ritualCircle.js';
import rubblePile from './rubblePile.js';
import rubbleScatter from './rubbleScatter.js';
import runesScratch from './runesScratch.js';
import sacksGrain from './sacksGrain.js';
import sconceCandle from './sconceCandle.js';
import shieldWall from './shieldWall.js';
import skullPile from './skullPile.js';
import statuePedestal from './statuePedestal.js';
import stoolThree from './stoolThree.js';
import strawBedding from './strawBedding.js';
import tableLong from './tableLong.js';
import tableWood from './tableWood.js';
import tatteredCloth from './tatteredCloth.js';
import tilesUplift from './tilesUplift.js';
import torchSerpent from './torchSerpent.js';
import vaseClay from './vaseClay.js';
import vaseTwinEar from './vaseTwinEar.js';
import wallColumnStrip from './wallColumnStrip.js';
import wallGapRuin from './wallGapRuin.js';
import wallTorch from './wallTorch.js';
import weaponRack from './weaponRack.js';

const propRegistry = new Map();

function register(def) {
  if (!def?.id) throw new Error('props: 登记项缺 id');
  if (propRegistry.has(def.id)) throw new Error(`props: 重复登记 "${def.id}"`);
  propRegistry.set(def.id, def);
}

register(alcoveNiche);
register(anvilStone);
register(armorStand);
register(bannerHerald);
register(bannerLong);
register(bannerNiche);
register(barrelStack);
register(barrelWood);
register(benchWood);
register(blindArcade);
register(bloodStain);
register(boneScatter);
register(bottleRack);
register(brazierFire);
register(buttressWall);
register(candelabraFloor);
register(candleStand);
register(chairHighback);
register(chandelierChain);
register(chestLocked);
register(chestTreasure);
register(coinScatter);
register(columnRound);
register(cotBed);
register(cracksFloor);
register(crateStack);
register(crateWood);
register(crossedSwords);
register(fireplaceBig);
register(gravelPatch);
register(hooksRope);
register(lanternWall);
register(mossPatchFloor);
register(mountedHead);
register(paintingGrand);
register(paintingTilted);
register(pilasterHalf);
register(plankRepair);
register(potionShelf);
register(puddleWater);
register(reliefBattle);
register(reliefSigil);
register(ritualCircle);
register(rubblePile);
register(rubbleScatter);
register(runesScratch);
register(sacksGrain);
register(sconceCandle);
register(shieldWall);
register(skullPile);
register(statuePedestal);
register(stoolThree);
register(strawBedding);
register(tableLong);
register(tableWood);
register(tatteredCloth);
register(tilesUplift);
register(torchSerpent);
register(vaseClay);
register(vaseTwinEar);
register(wallColumnStrip);
register(wallGapRuin);
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
