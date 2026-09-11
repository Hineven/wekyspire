// 老虎机（休息房·赌厅主陈设）：立柜 + 三转轮窗 + 顶灯牌 + 侧拉杆。
// 原点=底面中心（y=0 落地），柜体宽约 3.6 / 深约 2.6 / 高约 8.2（与场景尺度口径一致：
// 门高 ~16、桌高 ~4.6，故机器高约两倍桌高、稍低于门窗）。
//
// 布光职责：机器**自带发光面**（转轮窗/顶灯牌/按钮用 unlit 族自发光），
// 并声明 `lamp` 标签——配方层据此在机器位置生成**无火焰的点光池**（见 lighting.js 的
// lampAnchors 通道：`lightSource` 会带火焰粒子，机器不该冒火，故单开一条通道）。
// 变体走 build(opts)：柜体高 bodyH / 转轮窗数 reels / 顶灯牌宽度 marqueeW。

import * as THREE from 'three';
import { P, K, shade } from '../kit/index.js';

export default {
  id: 'slotMachine',
  place: 'prop',
  mount: 'floor',
  tags: ['machine', 'metal', 'container', 'lamp', 'casino'],
  footprint: { x: 3.6, z: 2.6 },
  behaviors: [],
  build({ bodyH = 6.4, reels = 3, marqueeW = 3.2, rng } = {}) {
    const g = new THREE.Group();
    const r = rng ?? K.createRng('slotMachine');
    const W = 3.4, D = 2.4, T = 0.32;   // 柜体宽/深/板厚
    const iron = shade(P.iron, -0.08);

    // 底座与四足：抬高一点让柜体不全贴地（读作机器而非箱）
    g.add(K.put(K.box({ color: shade(P.iron, -0.18), size: [W + 0.3, 0.42, D + 0.2], family: 'metal' }),
      0, 0.21, 0));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(K.put(K.box({ color: shade(P.iron, -0.3), size: [0.42, 0.5, 0.42], family: 'metal' }),
          sx * (W / 2 - 0.3), 0.67, sz * (D / 2 - 0.3)));
      }
    }

    // 柜身：主板 + 背板（背板略暗，读作侧影）
    const y0 = 0.92;
    g.add(K.put(K.box({ color: iron, size: [W, bodyH, D], family: 'metal' }), 0, y0 + bodyH / 2, 0));
    g.add(K.put(K.box({ color: shade(iron, -0.22), size: [W - 0.4, bodyH - 0.5, 0.18], family: 'metal' }),
      0, y0 + bodyH / 2, -D / 2 - 0.06));
    // 金饰边框（冷金 P.gold：立柱 + 上下横箍）
    for (const sx of [-1, 1]) {
      g.add(K.put(K.box({ color: P.gold, size: [T * 0.8, bodyH, T * 0.8], family: 'metal' }),
        sx * (W / 2 - 0.12), y0 + bodyH / 2, D / 2 - 0.1));
    }
    g.add(K.put(K.box({ color: P.gold, size: [W, T * 0.7, T * 0.7], family: 'metal' }),
      0, y0 + 0.1, D / 2 - 0.1));
    g.add(K.put(K.box({ color: P.gold, size: [W, T * 0.7, T * 0.7], family: 'metal' }),
      0, y0 + bodyH - 0.1, D / 2 - 0.1));

    // 转轮窗：暗腔（night）+ 每格一发丝光条（unlit 自发光，三色分档读作三种图案）
    const winY = y0 + bodyH * 0.52;
    const winW = W - 1.0, winH = bodyH * 0.34;
    g.add(K.put(K.box({ color: P.night, size: [winW + 0.5, winH + 0.5, 0.3], family: 'metal' }),
      0, winY, D / 2 + 0.02));
    const reelColors = [P.potionRed, P.potionGreen, P.potionBlue];
    const cellW = winW / reels;
    for (let i = 0; i < reels; i++) {
      const cx = -winW / 2 + cellW * (i + 0.5);
      // 每格：幽色玻璃底（unlit 低亮）+ 中央符号条
      g.add(K.put(K.box({ color: shade(reelColors[i % reelColors.length], -0.12),
        size: [cellW - 0.22, winH, 0.14], family: 'unlit' }), cx, winY, D / 2 + 0.16));
      g.add(K.put(K.box({ color: P.flameCore, size: [cellW * 0.46, winH * 0.58, 0.1], family: 'unlit' }),
        cx, winY, D / 2 + 0.24));
    }

    // 顶灯牌：薄箱 + 一条发光带（赌厅的"营业中"光）
    const my = y0 + bodyH + 0.5;
    g.add(K.put(K.box({ color: shade(P.iron, -0.15), size: [marqueeW, 1.0, 0.6], family: 'metal' }),
      0, my, D / 2 - 0.3));
    g.add(K.put(K.box({ color: P.ember, size: [marqueeW - 0.5, 0.34, 0.1], family: 'unlit' }),
      0, my + 0.1, D / 2 + 0.02));

    // 操作台：斜面前沿 + 投币口（金）+ 三个按钮（unlit）
    const py = y0 + bodyH * 0.2;
    g.add(K.put(K.box({ color: shade(P.iron, 0.02), size: [W - 0.5, 0.5, 0.7], family: 'metal' }),
      0, py, D / 2 - 0.2));
    g.add(K.put(K.box({ color: P.gold, size: [0.7, 0.1, 0.24], family: 'metal' }),
      -0.5, py + 0.28, D / 2 + 0.06));
    for (let i = 0; i < 3; i++) {
      g.add(K.put(K.cyl({ color: [P.potionRed, P.gold, P.potionBlue][i], r: 0.18, h: 0.16, seg: 6, family: 'unlit' }),
        0.3 + i * 0.55, py + 0.3, D / 2 + 0.02));
    }
    // 出币盘：下沿开口 + 盘底（槽色 night）
    g.add(K.put(K.box({ color: P.night, size: [1.6, 0.7, 0.36], family: 'metal' }),
      0, y0 + 0.22, D / 2 + 0.08));
    g.add(K.put(K.box({ color: P.gold, size: [1.3, 0.12, 0.3], family: 'metal' }),
      0, y0 - 0.06, D / 2 + 0.08));

    // 侧拉杆：座 + 杆 + 球头（铜球）
    const lx = W / 2 + 0.28;
    g.add(K.put(K.box({ color: shade(P.iron, -0.2), size: [0.3, 0.5, 0.5], family: 'metal' }), W / 2 - 0.05, winY - 0.8, 0));
    const rod = K.cyl({ color: P.silver, r: 0.1, h: 1.9, seg: 5, family: 'metal' });
    K.tilt(rod, 0, 0, -0.28);
    g.add(K.put(rod, lx + 0.1, winY - 0.2, 0));
    g.add(K.put(K.sphereLo({ color: P.copper, r: 0.28, jitter: 0.03, rng: r, family: 'metal' }),
      lx + 0.42, winY + 0.62, 0));

    return g;
  },
};
