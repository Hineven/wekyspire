// 老虎机（休息房·赌厅**可动组件**）：立柜 + 三转轮 + 顶灯牌 + 侧拉杆 + 屏幕彩灯。
// 原点=底面中心（y=0 落地），柜体宽约 3.4 / 深约 2.4 / 高约 8.4。
//
// **可动件契约**（用户定 2026-09-11：老虎机/银行机是场景中有复杂动画的可动组件）：
//   build() 返回的 Group 上挂 `userData.parts`，供 `interactive/slotMachineRig.js` 驱动：
//     parts.body       整体（中奖激动时整体抖动）
//     parts.leverPivot 拉杆枢轴（绕 Z 旋转 = 拉下/弹起；杆与球头是它的子件）
//     parts.reels[]    三个转轮组（绕 X 旋转 = 换面；每组 userData.symbols 是图案色序，
//                      子件是绕轴排布的色块板——**纯色块占位**，等图像资产到位再换纹理面）
//     parts.bulbs[]    屏幕一圈彩灯（每个**独立材质**，中奖灯效逐灯改色/明灭）
//   ⚠ 本件因此**不得进静态合批**（配方的 guaranteed 条目加 `live: true`，composeRoom 会
//   放进非合批的 liveRoot 并登记到 `room.interactives`）。
//
// 布光职责：自带 unlit 发光面 + `lamp` 标签（配方层出无火焰点光池）。

import * as THREE from 'three';
import { P, K, shade } from '../kit/index.js';

// 转轮图案（占位色块）：五档，三轮回转面数一致
export const SLOT_SYMBOLS = [P.potionRed, P.potionGreen, P.potionBlue, P.gold];

/** 轮面色块的高（按半径与面数算，使相邻面几乎相接）。 */
const faceHeight = (winH, radius) =>
  Math.max(0.3, Math.min(winH * 0.62, (2 * Math.PI * radius) / SLOT_SYMBOLS.length * 0.92));

export default {
  id: 'slotMachine',
  place: 'prop',
  mount: 'floor',
  tags: ['machine', 'metal', 'container', 'lamp', 'casino', 'interactive'],
  footprint: { x: 4.4, z: 3.6 },
  behaviors: [],
  build({ bodyH = 6.4, reelCount = 3, marqueeW = 3.2, rng } = {}) {
    const g = new THREE.Group();
    const r = rng ?? K.createRng('slotMachine');
    const W = 3.4, D = 2.4, T = 0.32;   // 柜体宽/深/板厚
    const iron = shade(P.iron, -0.08);

    // ---- 静态柜体 ----
    g.add(K.put(K.box({ color: shade(P.iron, -0.18), size: [W + 0.3, 0.42, D + 0.2], family: 'metal' }),
      0, 0.21, 0));
    const y0 = 0.92;
    g.add(K.put(K.box({ color: iron, size: [W, bodyH, D], family: 'metal' }), 0, y0 + bodyH / 2, 0));
    g.add(K.put(K.box({ color: shade(iron, -0.22), size: [W - 0.4, bodyH - 0.5, 0.18], family: 'metal' }),
      0, y0 + bodyH / 2, -D / 2 - 0.06));
    for (const sx of [-1, 1]) {
      g.add(K.put(K.box({ color: P.gold, size: [T * 0.8, bodyH, T * 0.8], family: 'metal' }),
        sx * (W / 2 - 0.12), y0 + bodyH / 2, D / 2 - 0.1));
    }
    g.add(K.put(K.box({ color: P.gold, size: [W, T * 0.7, T * 0.7], family: 'metal' }), 0, y0 + 0.1, D / 2 - 0.1));
    g.add(K.put(K.box({ color: P.gold, size: [W, T * 0.7, T * 0.7], family: 'metal' }), 0, y0 + bodyH - 0.1, D / 2 - 0.1));

    // ---- 转轮窗 + 三个可动转轮 ----
    const winY = y0 + bodyH * 0.52;
    const winW = W - 1.0, winH = bodyH * 0.34;
    g.add(K.put(K.box({ color: P.night, size: [winW + 0.5, winH + 0.5, 0.3], family: 'metal' }),
      0, winY, D / 2 + 0.02));
    const cellW = winW / reelCount;
    const reels = [];
    for (let i = 0; i < reelCount; i++) {
      const cx = -winW / 2 + cellW * (i + 0.5);
      const drum = new THREE.Group();          // 绕 X 旋转（轴向横置）换面
      drum.position.set(cx, winY, D / 2 + 0.14);
      const radius = Math.min(winH * 0.42, 0.62);
      SLOT_SYMBOLS.forEach((color, k) => {
        const a = (k / SLOT_SYMBOLS.length) * Math.PI * 2;
        // 占位图案 = kit 图元色块（unlit 族顶点色；材质由 rig 换成独立实例以便逐轮驱动）
        const mesh = K.box({ color, size: [cellW - 0.26, faceHeight(winH, radius), 0.08], family: 'unlit' });
        mesh.position.set(0, Math.sin(a) * radius, Math.cos(a) * radius);
        mesh.rotation.x = -a;                   // 面向外侧（读作鼓面）
        mesh.userData.animRole = 'reelFace';
        drum.add(mesh);
      });
      drum.userData.symbols = SLOT_SYMBOLS;
      drum.userData.index = 0;
      g.add(drum);
      reels.push(drum);
    }

    // ---- 屏幕彩灯（一圈独立材质的小灯：中奖灯效逐灯驱动）----
    const bulbs = [];
    // 屏幕四边各两颗（8 颗；网格预算内）：位置相对**屏幕中心**（winY），绕窗一圈
    const bx0 = -winW / 2 - 0.45, bx1 = winW / 2 + 0.45;
    const by0 = -winH / 2 - 0.45, by1 = winH / 2 + 0.45;
    const ring = [
      [bx0, by1], [bx1, by1], [bx0, by0], [bx1, by0],          // 四角
      [0, by1], [0, by0], [bx0, (by0 + by1) / 2], [bx1, (by0 + by1) / 2],  // 四边中点
    ];
    for (const [bx, by] of ring) {
      const mesh = K.sphereLo({ color: shade(P.gold, -0.3), r: 0.17, family: 'unlit' });
      mesh.position.set(bx, winY + by, D / 2 + 0.2);
      mesh.userData.animRole = 'bulb';
      g.add(mesh);
      bulbs.push(mesh);
    }

    // ---- 顶灯牌 ----
    const my = y0 + bodyH + 0.5;
    g.add(K.put(K.box({ color: shade(P.iron, -0.15), size: [marqueeW, 1.0, 0.6], family: 'metal' }),
      0, my, D / 2 - 0.3));
    g.add(K.put(K.box({ color: P.ember, size: [marqueeW - 0.5, 0.34, 0.1], family: 'unlit' }),
      0, my + 0.1, D / 2 + 0.02));

    // ---- 操作台 / 出币盘（静态） ----
    const py = y0 + bodyH * 0.2;
    g.add(K.put(K.box({ color: shade(P.iron, 0.02), size: [W - 0.5, 0.5, 0.7], family: 'metal' }),
      0, py, D / 2 - 0.2));
    g.add(K.put(K.box({ color: P.gold, size: [0.7, 0.1, 0.24], family: 'metal' }),
      -0.5, py + 0.28, D / 2 + 0.06));
    for (let i = 0; i < 3; i++) {
      g.add(K.put(K.cyl({ color: [P.potionRed, P.gold, P.potionBlue][i], r: 0.18, h: 0.16, seg: 6, family: 'unlit' }),
        0.3 + i * 0.55, py + 0.3, D / 2 + 0.02));
    }
    g.add(K.put(K.box({ color: P.night, size: [1.6, 0.7, 0.36], family: 'metal' }), 0, y0 + 0.22, D / 2 + 0.08));
    g.add(K.put(K.box({ color: P.gold, size: [1.3, 0.12, 0.3], family: 'metal' }), 0, y0 - 0.06, D / 2 + 0.08));

    // ---- 侧拉杆（枢轴在座：绕 Z 旋转 = 拉下/弹起）----
    g.add(K.put(K.box({ color: shade(P.iron, -0.2), size: [0.3, 0.5, 0.5], family: 'metal' }),
      W / 2 - 0.05, winY - 0.8, 0));
    const leverPivot = new THREE.Group();
    leverPivot.position.set(W / 2 - 0.05, winY - 0.8, 0);   // 枢轴 = 座心
    leverPivot.add(K.put(K.cyl({ color: P.silver, r: 0.1, h: 1.9, seg: 5, family: 'metal' }), 0.24, 0.85, 0));
    leverPivot.add(K.put(K.sphereLo({ color: P.copper, r: 0.28, jitter: 0.03, rng: r, family: 'metal' }),
      0.44, 1.72, 0));
    g.add(leverPivot);

    g.userData.parts = { body: g, leverPivot, reels, bulbs };
    g.userData.interactive = 'slot';
    return g;
  },
};
