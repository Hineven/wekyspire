// 场景注册表（STAGE_DESIGN §2）：战斗 → 场景定义的映射入口。
// dungeon = 手工大厅（回退/对照）；pcg:* = 房型配方层 PCG 房间（P3/P4，
// 配方按章节/Boss 选，见 rooms/index.js 的 sceneIdForFloor）。未知 id 回退 dungeon。

import { DUNGEON } from './dungeon.js';
import { getRoomScene } from './rooms/index.js';

const SCENES = Object.freeze({
  dungeon: DUNGEON,
});

/**
 * @param id 场景 id：'dungeon' | 'pcg:fortress' | 'pcg:palace' | 'pcg:manor' | 'pcg:library' | 'pcg:boss' | 'pcg:mezzanine'
 * @param seed PCG 房间种子（run 种子 + 层号派生；同种子恒定同布局）——仅 pcg:* 使用
 */
export function getScene(id = 'dungeon', seed = 'dev') {
  if (id.startsWith('pcg:')) return getRoomScene(id.slice(4), seed);
  return SCENES[id] ?? DUNGEON;
}

// 槽位 → 世界变换：position = lerp(near, far, t) + laneVec·lane·laneGap，
// z 沿战线轴 lerp（真实纵深），scale 少量风格化夸张（透视纵深之外的补充）（目前关闭）。
// lane 横排轴 = 战线轴在**地面（XZ 平面）**上的法向（逆时针 90°）——单位贴水平地板
// 站位，横排只能在地面内平移，不许抬离地面（旧 XY 法向是假透视时代的屏幕空间做法）。
export function slotTransform(scene, side, index = 0) {
  const { battleLine: bl, slots } = scene;
  const slot = side === 'player' ? slots.player : (slots[side === 'ally' ? 'allies' : 'enemies'][index] ?? null);
  const t = slot?.t ?? 0.5;
  const lane = slot?.lane ?? 0;
  const x = bl.near.x + (bl.far.x - bl.near.x) * t;
  const y = bl.near.y + (bl.far.y - bl.near.y) * t; // near.y=far.y=地板高度（脚底锚定）
  const z = bl.near.z + (bl.far.z - bl.near.z) * t;
  const dx = bl.far.x - bl.near.x;
  const dz = bl.far.z - bl.near.z;
  const len = Math.hypot(dx, dz) || 1;
  // 法向取 (dz,-dx)：lane+ = 屏幕左，lane- = 屏幕右，
  // 与旧假透视的屏幕语义一致（瑞米 lane<0 在主角右前方朝敌一侧）
  return {
    x: x + lane * bl.laneGap,
    y,
    z: z, // z 不再随index移动，排成一排即可
    scale: bl.nearScale + (bl.farScale - bl.nearScale) * t,
  };
}
