// 程序化低多边形场景：高塔楼层大厅（STAGE_DESIGN §2'）——纯几何 + 灯光 + 粒子氛围，零外部 3D 资产。
// buildDungeon3D() → { group, torches, update(dt, particles), sampleStandeeTint(pos, out) }
//
// 设定：高塔之内，塔外永夜。**全场统一冷调（蓝白紫）**——石材蓝灰泛紫、环境光/月光冷蓝紫、
//   火焰也是蓝紫/冷白色的幽火（鬼火感，绿只留一丝、暖橙禁用），唯一的"亮"是左墙高窗泻入的冷月。
//   几何求丰富与不对称（断柱/倒柱/砖块/旗帜/石板错位），不做纹理细节。
//
// 布局（2026-08-01 五轮，用户定）：
//   **左墙（x=-95）= 月光墙**：真实墙体开出两扇尖拱窗洞（分段盒子拼出窗洞，castShadow），
//   月光平行光自左上方穿窗 → shadow map 在地板投出窗形光池；窗外是永夜背板（星点+冷月）；
//   体积光幕（渐变 alpha 平面，自窗口沿光向斜落地板）强化光路。
//   **正面墙（z=FLOOR_FAR_Z）= 素墙**：砖块补丁、尖拱 doorway、破幡×2、窄缝窗点缀。
//
// 场景学（小 FOV 透视、相机抬眼高斜视 y≈30）：
//   地板 = 正常水平面（y=FLOOR_Y）——真 3D 常理场景，不做任何"投影戏法"。
//   眼高高于场内一切水平面（地板/柱帽/窗棂），透视方向全场一致。
//   雾把远景没入深夜蓝黑；立牌不参与雾（UnitObject 材质 fog:false），
//   立牌的光照交互由 sampleStandeeTint 假采样（幽火光衰+闪烁+纵深压暗）在 tick 染色。
//
// update(dt, particles)：幽火闪烁（点光强度/火焰锥缩放）+ 火焰粒子与浮尘发射
//   + 破幡摆动 + 光幕呼吸。纯几何/灯光构造，node 单测可断（无 document 依赖——
//   光幕渐变纹理缺席时降级为纯色低透明，逻辑不变）。

import * as THREE from 'three';
import { buildSkydome } from './skydome.js';

// 水平地板高度（世界坐标）：单位站位/牌桌UI 都以此为地面参照
export const FLOOR_Y = -30;
// 地板范围：远端接墙脚，近端伸出画面底缘；左端止于左墙（x=-95），右侧伸出画外
const FLOOR_NEAR_Z = 95;
const FLOOR_FAR_Z = -45;
const LEFT_WALL_X = -95;
const LEFT_WALL_TH = 12; // 左墙厚度：必须 > 2 个 shadow texel（2048/400≈5wu/texel），否则 PCF 边缘漏光

const TORCH_LIGHT_BASE = 1150; // 幽火点光基准强度（three 物理光度学，candela；收敛光池只留灯周）
const CHANDELIER_LIGHT_BASE = 800;
const MOONLIGHT_BASE = 2.2;    // 月光平行光强度（穿窗投影的主角：窗形光池要读得出来）
const FLAME_RATE = 12;          // 每幽火火焰粒子 /秒
const DUST_RATE = 1.1;         // 浮尘 /秒

// 冷调调色板（蓝白紫：石材蓝灰泛紫 + 蓝紫/冷白幽火 + 冷月色；绿只留一丝在幽火芯）
const COL = {
  floor: 0x404042,   // 石板地面：灰
  slab: 0x48484a,    // 错位石板：略亮一档
  wall: 0x404042,    // 墙：灰
  brick: 0x48484a,   // 砖块补丁：比墙面亮半档
  stone: 0x3a415c,   // 柱/框/扶壁
  rock: 0x3d4358,    // 碎石
  iron: 0x4a4e64,    // 铁件
  bannerA: 0x5a4f40, // 破幡：红（暗墙上要读得出）
  bannerB: 0x3a5a6e, // 破幡：青绿
  night: 0x060a1a,   // 夜空色（窄缝窗/门洞等"通往塔外/深处"的暗槽）
  flameOut: 0xeef2ff, // 幽火外焰：冷白
  flameIn: 0xeef2ff,  // 幽火内焰：冷白
  flameLight: 0x7474a0,
};

// 地板高度（水平面，常数；保留函数形供贴地物件调用）
function floorY(_z) {
  return FLOOR_Y;
}

// 尖拱轮廓（哥特窗/门）：底部矩形 + 两侧二次曲线收尖。原点在底部中心，w/h = 宽/总高
function pointedArch(w, h) {
  const springY = h * 0.55; // 起拱线
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, springY);
  s.quadraticCurveTo(-w / 2, h * 0.92, 0, h);
  s.quadraticCurveTo(w / 2, h * 0.92, w / 2, springY);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

export function buildDungeon3D() {
  const group = new THREE.Group();
  group.name = 'dungeon3D';
  const torches = [];
  const banners = [];

  // ---- 材质（低多边形平色，靠灯光出氛围） ----
  const matFloor = new THREE.MeshStandardMaterial({ color: COL.floor, roughness: 0.95, flatShading: true });
  const matSlab = new THREE.MeshStandardMaterial({ color: COL.slab, roughness: 0.95, flatShading: true });
  const matWall = new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.98, flatShading: true });
  const matBrick = new THREE.MeshStandardMaterial({ color: COL.brick, roughness: 0.95, flatShading: true });
  const matStone = new THREE.MeshStandardMaterial({ color: COL.stone, roughness: 0.92, flatShading: true });
  const matRock = new THREE.MeshStandardMaterial({ color: COL.rock, roughness: 1, flatShading: true });
  const matIron = new THREE.MeshStandardMaterial({ color: COL.iron, roughness: 0.6, metalness: 0.4, flatShading: true });
  const matNight = new THREE.MeshBasicMaterial({ color: COL.night, fog: false });

  // ---- 地板：水平面（左端止于左墙内侧面；接月光阴影） ----
  const floorLeft = LEFT_WALL_X + LEFT_WALL_TH / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(140 - floorLeft, FLOOR_NEAR_Z - FLOOR_FAR_Z), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((140 + floorLeft) / 2, FLOOR_Y, (FLOOR_NEAR_Z + FLOOR_FAR_Z) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // ---- 错位石板（几何细节：薄板贴地、高度/角度不一；一块裂成两半） ----
  const slabSpots = [
    { x: -38, z: 14, w: 15, d: 10, r: 0.04, dy: 0.5 },
    { x: -8, z: 6, w: 12, d: 9, r: -0.03, dy: 0.3 },
    { x: 22, z: 16, w: 14, d: 8, r: 0.05, dy: 0.6 },
    { x: 48, z: 2, w: 11, d: 9, r: -0.04, dy: 0.4 },
    { x: -52, z: -12, w: 13, d: 8, r: -0.05, dy: 0.5 },
    { x: -16, z: -24, w: 12, d: 9, r: 0.03, dy: 0.3 },
    { x: 12, z: -12, w: 16, d: 10, r: -0.02, dy: 0.55 },
    { x: 38, z: -30, w: 12, d: 8, r: 0.06, dy: 0.4 },
    { x: 66, z: -18, w: 10, d: 7, r: -0.05, dy: 0.5 },
    { x: -68, z: 28, w: 12, d: 8, r: 0.04, dy: 0.35 },
  ];
  for (const s of slabSpots) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(s.w, 1, s.d), matSlab);
    slab.position.set(s.x, FLOOR_Y + s.dy, s.z);
    slab.rotation.y = s.r;
    slab.receiveShadow = true;
    group.add(slab);
  }
  // 裂板：两半错位互翘
  const crackA = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 9), matSlab);
  crackA.position.set(-30, FLOOR_Y + 0.7, -36);
  crackA.rotation.set(0.06, 0.1, 0.05);
  group.add(crackA);
  const crackB = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 8), matSlab);
  crackB.position.set(-23, FLOOR_Y + 0.4, -35);
  crackB.rotation.set(-0.05, -0.06, -0.04);
  group.add(crackB);

  // ---- 左墙（月光墙，x=-95，沿 z 走向）：分段盒子拼出两扇窗洞（全体 castShadow，
  //      月光穿洞在地板投出窗形光池）；窗洞内贴尖拱石框（矩形洞视觉上收尖） ----
  // 墙必须**高到盖住"越顶亮楔"**：月光是平行光（坡降 0.648），越顶光线在地板的落点
  // x = -93+(墙顶+30)/0.648，而**空气柱**是否被遮蔽取决于回溯高度 y+(x+93)*0.648 < 墙顶——
  // 墙顶 +110 时相机(y=80,x=52)回溯高 174 → 房间上半空气全亮，ray marching 全场发奶
  // （地板反而只亮 x>+123 一条，所以表面阴影看着正常、体积光全糊——调试实录）。
  // 墙顶 +460：连画面上缘斜升视线打到极远处的空气（y≈200 回溯高 ≈430）也被遮蔽——
  // 高塔内墙本就高耸出画，视觉零成本，只管往高里修；z 向加宽堵侧漏（光向 dz/dx≈0.106，
  // 房间远端漂移 ±25）。
  const LW = { x: LEFT_WALL_X, th: LEFT_WALL_TH, z0: -75, z1: 125, y0: FLOOR_Y, y1: FLOOR_Y + 490 };
  // 窗洞定义（z 区间 + y 区间；winA 大而低=主光路，winB 小而高）
  const winA = { z0: -33, z1: -17, sill: 24, top: 58 };  // y: FLOOR_Y+24 .. FLOOR_Y+58
  const winB = { z0: 9, z1: 21, sill: 30, top: 50 };
  const wallSegs = [
    // 底带（到较低窗台 winA.sill）
    { z0: LW.z0, z1: LW.z1, y0: LW.y0, y1: FLOOR_Y + winA.sill },
    // winA 左段 / 两窗间段 / winA 顶带
    { z0: LW.z0, z1: winA.z0, y0: FLOOR_Y + winA.sill, y1: LW.y1 },
    { z0: winA.z1, z1: winB.z0, y0: FLOOR_Y + winA.sill, y1: LW.y1 },
    { z0: winA.z0, z1: winA.z1, y0: FLOOR_Y + winA.top, y1: LW.y1 },
    // winB 下带 / 顶带 / 右段
    { z0: winB.z0, z1: winB.z1, y0: FLOOR_Y + winA.sill, y1: FLOOR_Y + winB.sill },
    { z0: winB.z0, z1: winB.z1, y0: FLOOR_Y + winB.top, y1: LW.y1 },
    { z0: winB.z1, z1: LW.z1, y0: FLOOR_Y + winA.sill, y1: LW.y1 },
  ];
  for (const seg of wallSegs) {
    const d = seg.z1 - seg.z0;
    const h = seg.y1 - seg.y0;
    if (d <= 0 || h <= 0) continue;
    const box = new THREE.Mesh(new THREE.BoxGeometry(LW.th, h, d), matWall);
    box.position.set(LW.x, seg.y0 + h / 2, (seg.z0 + seg.z1) / 2);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }
  // 窗洞尖拱石框 + 窗台（内侧面，面朝 +x）
  for (const win of [winA, winB]) {
    const w = win.z1 - win.z0;
    const sillY = FLOOR_Y + win.sill;
    const h = FLOOR_Y + win.top - sillY;
    const frameShape = pointedArch(w + 3.2, h + 3.2);
    frameShape.holes.push(new THREE.Path(pointedArch(w - 0.6, h - 0.4).getPoints(16)));
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(frameShape), matStone);
    frame.rotation.y = Math.PI / 2; // 面朝 +x（室内）
    frame.position.set(LW.x + LW.th / 2 + 0.4, sillY - 1.4, (win.z0 + win.z1) / 2);
    group.add(frame);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2, w + 4.5), matStone);
    sill.position.set(LW.x + LW.th / 2 + 0.8, sillY - 1, (win.z0 + win.z1) / 2);
    group.add(sill);
  }

  // ---- 程序化夜空穹顶（skydome shader：渐变夜空 + hash 星野 + 月亮/晕，
  //      包住整个场景——透过左墙窗洞看到的就是它，不再需要贴在窗外的几何背板） ----
  // 月亮放在高空（相机隔着墙看不到它——物理上与陡角入射的月光一致；
  // 窗洞里只见星野。用户：月亮不必出现在窗内）
  const skydome = buildSkydome({ moonDir: new THREE.Vector3(-0.55, 0.5, -0.45) });
  group.add(skydome);

  // ---- 正面墙（素墙，z=FLOOR_FAR_Z）：砖块补丁 + 尖拱 doorway + 破幡×2 + 窄缝窗 ----
  // 左端止于左墙内侧面（x=-93）——绝不能探过左墙，否则会挡住左墙窗洞里的夜空/冷月
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(233, 105), matWall);
  backWall.position.set(23.5, FLOOR_Y + 52.5, FLOOR_FAR_Z);
  backWall.receiveShadow = true;
  group.add(backWall);

  // 扶壁（不对称三根：墙面竖向节奏 + 深度）
  for (const b of [{ x: -86, h: 74 }, { x: -30, h: 66 }, { x: 80, h: 70 }]) {
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(6, b.h, 5), matStone);
    buttress.position.set(b.x, FLOOR_Y + b.h / 2, FLOOR_FAR_Z + 1.5);
    buttress.castShadow = true;
    group.add(buttress);
    const capStone = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 6.5), matStone);
    capStone.position.set(b.x, FLOOR_Y + b.h + 1, FLOOR_FAR_Z + 1.5);
    group.add(capStone);
  }

  // 砖块补丁（两片不对称：高处一大片、低处一小片，逐砖抖动）
  for (const patch of [
    { x0: -64, cols: 6, rows: 4, y0: FLOOR_Y + 30 },
    { x0: 56, cols: 4, rows: 3, y0: FLOOR_Y + 10 },
  ]) {
    for (let r = 0; r < patch.rows; r++) {
      for (let c = 0; c < patch.cols; c++) {
        if ((r + c) % 7 === 3) continue; // 缺砖
        const brick = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.4, 1.5), matBrick);
        brick.position.set(
          patch.x0 + c * 6 + (r % 2) * 2.5 + (Math.random() - 0.5) * 0.6,
          patch.y0 + r * 3 + (Math.random() - 0.5) * 0.5,
          FLOOR_FAR_Z + 0.9);
        group.add(brick);
      }
    }
  }

  // 尽头尖拱 doorway（塔内通道：黑洞 + 石框）
  const doorX = 30;
  const doorW = 13;
  const doorH = 22;
  const doorVoid = new THREE.Mesh(new THREE.ShapeGeometry(pointedArch(doorW, doorH)),
    new THREE.MeshBasicMaterial({ color: 0x04060e, fog: false }));
  doorVoid.position.set(doorX, FLOOR_Y, FLOOR_FAR_Z + 0.4);
  group.add(doorVoid);
  const doorFrameShape = pointedArch(doorW + 3, doorH + 3);
  doorFrameShape.holes.push(new THREE.Path(pointedArch(doorW, doorH).getPoints(16)));
  const doorFrame = new THREE.Mesh(new THREE.ShapeGeometry(doorFrameShape), matStone);
  doorFrame.position.set(doorX, FLOOR_Y - 1.5, FLOOR_FAR_Z + 0.9);
  group.add(doorFrame);

  // 窄缝窗（高塔感小点缀：暗槽 + 铁栅三棱）
  const slitX = -8;
  const slitY = FLOOR_Y + 54;
  const slit = new THREE.Mesh(new THREE.BoxGeometry(3.6, 13, 1), matNight);
  slit.position.set(slitX, slitY, FLOOR_FAR_Z + 0.5);
  group.add(slit);
  for (let i = -1; i <= 1; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 13, 0.8), matIron);
    bar.position.set(slitX + i * 1.1, slitY, FLOOR_FAR_Z + 1);
    group.add(bar);
  }
  const slitSill = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.6, 2.5), matStone);
  slitSill.position.set(slitX, slitY - 7.2, FLOOR_FAR_Z + 1.2);
  group.add(slitSill);

  // 破幡 ×2（挂扶壁，一紫一青蓝；update 里轻摆）
  const bannerDefs = [
    { x: -30, phase: 0, color: COL.bannerA },
    { x: 80, phase: 1.7, color: COL.bannerB },
  ];
  for (const bn of bannerDefs) {
    const mat = new THREE.MeshStandardMaterial({
      color: bn.color, roughness: 1, flatShading: true, side: THREE.DoubleSide,
    });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5, 19), mat);
    banner.geometry.translate(0, -9.5, 2); // 顶边锚定（摆动绕悬挂点）
    banner.position.set(bn.x, FLOOR_Y + 52, FLOOR_FAR_Z + 3.4);
    banner.rotation.z = 0.04;
    group.add(banner);
    banners.push({ mesh: banner, phase: bn.phase });
  }

  // ---- 吊灯（填补上半空间）：铁环 + 冷白烛焰 + 中央点光 ----
  const chandelier = new THREE.Group();
  chandelier.position.set(-8, 20, -20); // 偏心悬挂（不对称）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.8, 5, 12), matIron);
  ring.rotation.x = Math.PI / 2;
  chandelier.add(ring);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 34, 4), matIron);
  chain.position.y = 17;
  chain.rotation.z = 0.05;
  chandelier.add(chain);
  const candleMat = new THREE.MeshBasicMaterial({ color: COL.flameIn, fog: false });
  const candleFlames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.1, 5), candleMat);
    f.position.set(Math.cos(a) * 7, 2.3, Math.sin(a) * 7);
    chandelier.add(f);
    candleFlames.push(f);
  }
  const chandelierLight = new THREE.PointLight(0x848494, CHANDELIER_LIGHT_BASE, 95, 1.8);
  chandelierLight.position.y = 3;
  chandelier.add(chandelierLight);
  group.add(chandelier);

  // ---- 柱列（不对称：左列三根高低错落；右列一中柱断裂——残桩 + 倒柱段 + 柱帽残块） ----
  for (const p of [
    { x: -68, z: 5, h: 52, ry: 0.2 },
    { x: -69, z: -15, h: 44, ry: 0.7 },
    { x: -67, z: -35, h: 49, ry: 1.1 },
  ]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, p.h, 6), matStone);
    pillar.position.set(p.x, FLOOR_Y + p.h / 2, p.z);
    pillar.rotation.y = p.ry;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 4.6, 4, 6), matStone);
    cap.position.set(p.x, FLOOR_Y + p.h, p.z);
    cap.rotation.y = p.ry;
    cap.castShadow = true;
    group.add(cap);
  }
  for (const p of [
    { x: 68, z: 5, h: 47, ry: 0.4, tilt: 0.02 },
    { x: 67, z: -35, h: 50, ry: 0.9, tilt: -0.025 },
  ]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, p.h, 6), matStone);
    pillar.position.set(p.x, FLOOR_Y + p.h / 2, p.z);
    pillar.rotation.set(0, p.ry, p.tilt);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 4.6, 4, 6), matStone);
    cap.position.set(p.x + p.tilt * p.h, FLOOR_Y + p.h, p.z);
    cap.rotation.y = p.ry;
    cap.castShadow = true;
    group.add(cap);
  }
  // 断柱残桩（顶面斜茬）+ 倒柱段 + 柱帽残块
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 13, 6), matStone);
  stump.position.set(68, FLOOR_Y + 6.5, -15);
  stump.rotation.y = 0.3;
  stump.castShadow = true;
  group.add(stump);
  const stumpTop = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.4, 3.5, 6), matStone);
  stumpTop.position.set(67.4, FLOOR_Y + 14.2, -15);
  stumpTop.rotation.set(0.12, 0.5, 0.16);
  group.add(stumpTop);
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.3, 22, 6), matStone);
  fallen.position.set(52, FLOOR_Y + 3.6, -6);
  fallen.rotation.set(Math.PI / 2 - 0.06, 0.35, 0.1);
  fallen.castShadow = true;
  group.add(fallen);
  const fallenCap = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 4.5, 4, 6), matStone);
  fallenCap.position.set(41, FLOOR_Y + 2.6, -2);
  fallenCap.rotation.set(1.2, 0.4, 0.7);
  group.add(fallenCap);

  // ---- 幽火壁灯 ×8（柱列内侧 + doorway 两侧；蓝紫外焰 + 冷白内焰 + 点光 + 粒子锚） ----
  const torchSpots = [
    { x: -61, z: 5, dy: 24 }, { x: 61, z: 5, dy: 25 },
    { x: -61, z: -15, dy: 23 }, { x: 64, z: -13, dy: 15 }, // 残桩低挂
    { x: -61, z: -35, dy: 25 }, { x: 60, z: -36, dy: 22 },
    { x: 20, z: -43, dy: 16 }, { x: 41, z: -43, dy: 17 },  // doorway 两侧
  ];
  for (const spot of torchSpots) {
    const y = floorY(spot.z) + spot.dy;
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 6, 5), matIron);
    bracket.position.set(spot.x, y - 2.5, spot.z + 1);
    bracket.rotation.z = spot.x < 0 ? -0.3 : 0.3;
    group.add(bracket);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.2, 1.4, 6), matIron);
    bowl.position.set(spot.x, y + 0.2, spot.z + 1);
    group.add(bowl);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(1, 4.2, 6),
      new THREE.MeshBasicMaterial({ color: COL.flameOut, fog: false }));
    flame.position.set(spot.x, y + 3.5, spot.z + 1);
    group.add(flame);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 5),
      new THREE.MeshBasicMaterial({ color: COL.flameIn, fog: false }));
    inner.position.set(spot.x, y + 2.2, spot.z + 1);
    group.add(inner);

    const light = new THREE.PointLight(COL.flameLight, TORCH_LIGHT_BASE, 78, 1.8);
    light.position.set(spot.x, y + 3, spot.z + 4);
    group.add(light);

    torches.push({
      x: spot.x, y: y + 2.5, z: spot.z + 2,
      light, flame, inner, phase: Math.random() * Math.PI * 2,
      intensity: 1, emitterAcc: 0,
    });
  }

  // ---- 碎石（贴地散点；断柱区加一撮小碎块） ----
  const rockSpots = [
    { x: -45, z: 8, s: 2.4 }, { x: -20, z: -18, s: 1.8 }, { x: 12, z: 2, s: 2.8 },
    { x: 40, z: -24, s: 2.0 }, { x: 58, z: 6, s: 1.6 }, { x: -55, z: -30, s: 2.2 },
    { x: 60, z: -11, s: 1.3 }, { x: 55, z: -14, s: 0.9 }, { x: 63, z: -7, s: 1.1 },
    { x: 47, z: -13, s: 0.8 }, { x: -62, z: 18, s: 1.5 },
  ];
  for (const r of rockSpots) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r.s, 0), matRock);
    rock.position.set(r.x, floorY(r.z) + r.s * 0.6, r.z);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    group.add(rock);
  }

  // ---- 基础灯光：冷环境光 + 月光（左上穿窗，唯一投影光）+ 相机侧微弱补光 ----
  group.add(new THREE.AmbientLight(0x2e3442, 1.25));
  const moonlight = new THREE.DirectionalLight(0x9db4ec, MOONLIGHT_BASE);
  // position 对平行光只决定**阴影相机的深度原点**（光照方向 = position→target 不变）：
  // 必须沿光轴反向后移足够远，让整面高墙（到 +460）都落在阴影相机近平面之前——
  // 墙在 y≈49.5 以上沿光轴深度为负会被 near 裁掉，shadow map 缺上半墙，
  // 回溯打中上半墙的采样读空深度=恒亮（右上角漏光楔形的真凶，其边界即 y≈49.5 等高线）
  moonlight.position.set(LEFT_WALL_X - 145, 145, -29);
  moonlight.target.position.set(30, FLOOR_Y, 0);
  group.add(moonlight);
  group.add(moonlight.target);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(2048, 2048);
  const sc = moonlight.shadow.camera;
  sc.left = -200; sc.right = 200; sc.top = 600; sc.bottom = -120; // 须盖住加高加宽后的左墙+房间
  sc.near = 10; sc.far = 600;
  moonlight.shadow.bias = -0.0015;
  const fill = new THREE.DirectionalLight(0x66779e, 0.35);
  fill.position.set(30, 60, 200);
  group.add(fill);

  // ---- 运行时状态 ----
  let time = 0;
  let dustAcc = 0;
  const scratch = new THREE.Color();
  // 吊灯也参与立牌染色采样（幽火光斑，与 update 的闪烁同源）
  const chandelierGlow = { x: -8, y: 20, z: -17, intensity: 1 };

  /** 帧驱动：幽火闪烁 + 火焰粒子/浮尘发射 + 破幡轻摆 + skydome 相机同步。 */
  function update(dt, particles, camPos = null) {
    time += dt;
    if (camPos) skydome.updateSkydome(camPos);
    chandelierGlow.intensity = 1 + 0.1 * Math.sin(time * 9) + 0.06 * Math.sin(time * 21);
    chandelierLight.intensity = CHANDELIER_LIGHT_BASE * chandelierGlow.intensity;
    for (const f of candleFlames) {
      f.scale.y = 1 + 0.25 * Math.sin(time * 15 + f.position.x);
    }
    for (const bn of banners) {
      bn.mesh.rotation.z = 0.04 + 0.045 * Math.sin(time * 0.8 + bn.phase);
      bn.mesh.rotation.x = 0.05 * Math.sin(time * 0.6 + bn.phase * 1.3);
    }
    for (const t of torches) {
      t.intensity = 1
        + 0.16 * Math.sin(time * 11 + t.phase)
        + 0.08 * Math.sin(time * 23 + t.phase * 1.7);
      t.light.intensity = TORCH_LIGHT_BASE * t.intensity;
      t.flame.scale.set(
        1 + 0.12 * Math.sin(time * 17 + t.phase),
        1 + 0.22 * Math.sin(time * 13 + t.phase * 2.1),
        1,
      );
      t.inner.scale.y = 1 + 0.3 * Math.sin(time * 19 + t.phase * 0.7);
      if (particles) {
        t.emitterAcc += dt * FLAME_RATE;
        while (t.emitterAcc >= 1) {
          t.emitterAcc -= 1;
          particles.spawn(t.x + (Math.random() - 0.5) * 1.6, t.y + 1.2, {
            count: 1, z: t.z, color: Math.random() < 0.35 ? 0xcfd8ff : 0x8a9ae8,
            speed: 2.2, ttl: 0.6, gravity: 6, // 上浮
          });
        }
      }
    }
    if (particles) {
      dustAcc += dt * DUST_RATE;
      while (dustAcc >= 1) {
        dustAcc -= 1;
        particles.spawn((Math.random() - 0.5) * 130, FLOOR_Y + 4 + Math.random() * 42, {
          count: 1, z: -20 + Math.random() * 30, color: 0x2e3a6a,
          speed: 1.6, ttl: 3.2, gravity: 0.4,
        });
      }
    }
  }

  /**
   * 立牌光照假采样：冷蓝紫底环境 + 各幽火蓝紫光按 XY 距离衰减（含闪烁）+ 纵深压暗。
   * @param {THREE.Vector3|{x,y,z}} pos  单位世界位置
   * @param {THREE.Color} [out]  复用对象（缺省内部 scratch，调用方勿持有）
   */
  function sampleStandeeTint(pos, out = scratch) {
    out.setRGB(0.52, 0.55, 0.75); // 冷蓝紫底
    for (const t of [...torches, chandelierGlow]) {
      const d = Math.hypot(pos.x - t.x, pos.y - t.y);
      const f = t.intensity * Math.max(0, 1 - d / 58);
      // 蓝紫幽火：b 主导（冷调统一，火光也不许转暖）
      out.r += 0.16 * f;
      out.g += 0.20 * f;
      out.b += 0.48 * f;
    }
    // 纵深压暗（立牌不参与场景雾，用染色模拟没入黑暗）
    const dim = THREE.MathUtils.clamp(1 - Math.max(0, 8 - pos.z) * 0.008, 0.72, 1);
    out.multiplyScalar(dim);
    out.r = Math.min(out.r, 1.12);
    out.g = Math.min(out.g, 1.12);
    out.b = Math.min(out.b, 1.12);
    return out;
  }

  return { group, torches, update, sampleStandeeTint, moonlight, skydome };
}
