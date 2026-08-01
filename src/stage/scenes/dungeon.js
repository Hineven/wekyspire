// 场景定义：地牢长廊（STAGE_DESIGN §2）。
// battleLine：战线轴——槽位参数 t∈[0,1] 沿线 lerp 位置/缩放/z，
// 近端左下（友军，z>0 近镜头），远端右上（敌军，z<0 远镜头）；
// 小 FOV 透视下 z 差产生真实纵深，nearScale/farScale 只保留少量风格化夸张。
// 单位脚底锚定水平地板（y=FLOOR_Y），lane 为地面内横排偏移（轴法向，单位=格）。

import { buildDungeon3D, FLOOR_Y } from './dungeon3D.js';

export const DUNGEON = {
  id: 'dungeon',
  build3D: buildDungeon3D,
  battleLine: {
    near: { x: -50, y: FLOOR_Y, z: 22 },
    far: { x: 70, y: FLOOR_Y, z: -34 },
    nearScale: 1.05,
    farScale: 0.9,
    laneGap: 16, // 横排轴格宽（世界单位）：偏 z 向的偏移在透视下才有足够屏幕分离
  },
  slots: {
    player: { t: 0.0, lane: 0 },
    allies: [
      { t: 0.22, lane: 0.9 },   // 瑞米在主角右后方：前排（lane<0）会被手牌扇遮住下半身
      { t: 0.15, lane: 1.3 },
    ],
    enemies: [
      { t: 0.62, lane: 0.5 },
      { t: 0.74, lane: -0.7 },
      { t: 0.86, lane: 0.6 },
      { t: 0.96, lane: -0.4 },
    ],
  },
};
