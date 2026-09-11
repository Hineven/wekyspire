// 休息房陈列页（用户定 2026-09-11）：**休息阶段场景的视觉门**——与 roomGallery 同范式，
// 但多两件休息房专属的调试层：
//   1. **UI 安全区**：休息面板将覆盖画面下方（配方 anchors.uiSafe.bottomRatio，缺省 0.42），
//      用斜纹带标出——构图不该在这一带放精细件；
//   2. **交互锚点**：把配方的 anchors（老虎机/银行机/柜台）投影到屏幕并画圈标注，
//      用来核对「设施是否落在安全区之上、是否可读地分开、朝向是否朝相机」。
// 打开：npm run dev 后访问 /restGallery.html?recipe=casino&seed=demo
// 调参 knob：?seed= ｜ ?ui=0|0.55（安全区比例）｜ ?anchors=1|0 ｜ ?orbit=1（自由观察）
//   ｜ 布光 knob 同 roomGallery：?hemi=&moon=&fill=&ba=&bb=&glow=&glowd=&cf=&cfd=&fire=&fired=&lamp=&lampd=

import * as THREE from 'three';
import { composeRoom } from '../stage/scenes/rooms/composeRoom.js';
import { RECIPES } from '../stage/scenes/rooms/presets.js';
import { createVolumetricMoonlight } from '../stage/scenes/volumetricMoon.js';
import { LIGHTING_PRESETS } from '../stage/scenes/rooms/lighting.js';

const params = new URLSearchParams(location.search);

// ---- 布光实时调参（与 roomGallery 同口径；多两条 lamp 通道 knob）----
function applyLightingTune(recipe) {
  const preset = LIGHTING_PRESETS[recipe?.lighting];
  if (!preset) return;
  const num = (k) => (params.has(k) ? Number(params.get(k)) : null);
  const apply = (v, fn) => { if (v !== null && Number.isFinite(v)) fn(v); };
  apply(num('hemi'), v => { preset.hemi[2] = v; });
  apply(num('moon'), v => { preset.moon = v; });
  apply(num('fill'), v => { preset.fill = v; });
  apply(num('ba'), v => { preset.bounce[0][0] = v; });
  apply(num('bb'), v => { preset.bounce[1][0] = v; });
  apply(num('glow'), v => { preset.battleGlow[1] = v; });
  apply(num('glowd'), v => { preset.battleGlow[2] = v; });
  apply(num('cf'), v => { preset.centerFill[1] = v; });
  apply(num('cfd'), v => { preset.centerFill[2] = v; });
  apply(num('fire'), v => { preset.fire.base = v; });
  apply(num('fired'), v => { preset.fire.dist = v; });
  apply(num('lamp'), v => { if (preset.lamp) preset.lamp.base = v; });
  apply(num('lampd'), v => { if (preset.lamp) preset.lamp.dist = v; });
}

const canvas = document.createElement('canvas');
canvas.id = 'room-canvas';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a12);

const camera = new THREE.PerspectiveCamera(24, 1, 1, 900);
const orbit = {
  az: 0.593, el: 0.349,
  dist: Number(params.get('dist')) || 185.8,
  target: new THREE.Vector3(0, -15, 0),
};

let room = null;
let composer = null;
let time = 0;

const info = document.getElementById('room-info');
const selector = document.getElementById('recipe-select');
const seedInput = document.getElementById('seed-input');
const safeEl = document.getElementById('ui-safe');
const anchorLayer = [];

// 配方下拉：默认列出全部配方（含战斗四型——休息房只是其中一族，便于对比手感）
for (const id of Object.keys(RECIPES)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = id + (id === 'casino' ? '（休息房）' : '');
  selector.appendChild(opt);
}
selector.value = params.get('recipe') || 'casino';
seedInput.value = params.get('seed') || 'demo';

function clearAnchors() {
  for (const el of anchorLayer) el.remove();
  anchorLayer.length = 0;
}

function rebuild() {
  const recipeId = selector.value;
  const seed = seedInput.value || 'demo';
  const recipe = RECIPES[recipeId];
  if (room) { scene.remove(room.group); room = null; }
  if (composer) { composer.dispose?.(); composer = null; }
  clearAnchors();

  applyLightingTune(recipe);
  room = composeRoom(recipeId, seed);           // 契约对象 { group, update, moonlight, recipe, grading, placements }
  scene.add(room.group);
  // 特殊色调（grading 契约）：曝光恒生效；tint 走 composer 合成
  renderer.toneMappingExposure = room.grading?.exposure ?? 1;
  // 雾：配方处方优先
  const fogDef = room.recipe?.fog;
  scene.fog = fogDef
    ? new THREE.Fog(fogDef.color, fogDef.near, fogDef.far)
    : new THREE.Fog(0x070a12, 165, 310);
  if (room.moonlight && typeof renderer.setRenderTarget === 'function' && !params.has('nocomposer')) {
    composer = createVolumetricMoonlight({ light: room.moonlight, tint: room.grading?.tint });
    composer.resize(window.innerWidth, window.innerHeight);
  }

  const placements = room.placements || [];
  const fires = placements.filter(p => p.tags.some(t => t === 'lightSource' || t === 'fire'));
  const lamps = placements.filter(p => p.tags.includes('lamp'));
  let lights = 0;
  room.group.traverse(o => { if (o.isPointLight) lights += 1; });
  info.textContent = `${recipeId} · seed=${seed} ｜ 摆位 ${placements.length}`
    + `（落地 ${placements.filter(p => !p.onWall && !p.hosted && !p.floating).length}`
    + `/墙面 ${placements.filter(p => p.onWall).length}`
    + `/顶挂 ${placements.filter(p => p.floating).length}）`
    + `｜ 火位 ${fires.length} ｜ 灯锚 ${lamps.length} ｜ 点光 ${lights}`;

  // 安全区比例：配方声明优先，?ui= 覆盖（0 = 关闭）
  const uiParam = params.has('ui') ? Number(params.get('ui')) : null;
  const ratio = uiParam ?? recipe.anchors?.uiSafe?.bottomRatio ?? 0.42;
  safeEl.style.display = ratio > 0 ? 'block' : 'none';
  safeEl.style.height = `${Math.round(ratio * 100)}%`;

  // 锚点标记
  if (params.get('anchors') !== '0' && recipe.anchors) {
    for (const [key, a] of Object.entries(recipe.anchors)) {
      if (key === 'uiSafe' || a?.x == null) continue;
      const el = document.createElement('div');
      el.className = 'anchor-pin';
      el.innerHTML = `<b>${key}<br>(${a.x}, ${a.z})</b>`;
      document.body.appendChild(el);
      anchorLayer.push(el);
    }
  }
  syncAnchorPins();
}

/** 把锚点世界坐标投影到屏幕（每帧刷新，拖动相机时标记跟随）。 */
function syncAnchorPins() {
  if (!anchorLayer.length || !room) return;
  const recipe = RECIPES[selector.value];
  const names = Object.entries(recipe?.anchors ?? {}).filter(([k, a]) => k !== 'uiSafe' && a?.x != null);
  const world = new THREE.Vector3();
  names.forEach(([, a], i) => {
    const el = anchorLayer[i];
    if (!el) return;
    world.set(a.x, 12, a.z).project(camera);
    el.style.left = `${((world.x * 0.5) + 0.5) * window.innerWidth}px`;
    el.style.top = `${((-world.y * 0.5) + 0.5) * window.innerHeight}px`;
    el.style.display = world.z > 1 ? 'none' : 'block';
  });
}

// ---- 相机控制（与 roomGallery 同款：拖拽旋转 / 滚轮缩放；?orbit=1 时鼠标控制，否则静态机位）----
const freeOrbit = params.get('orbit') === '1';
let dragging = false;
let last = { x: 0, y: 0 };
canvas.addEventListener('pointerdown', (e) => { if (!freeOrbit) return; dragging = true; last = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbit.az -= (e.clientX - last.x) * 0.005;
  orbit.el = Math.min(1.2, Math.max(-0.1, orbit.el - (e.clientY - last.y) * 0.004));
  last = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => {
  if (!freeOrbit) return;
  orbit.dist = Math.min(420, Math.max(60, orbit.dist + e.deltaY * 0.12));
}, { passive: true });
selector.addEventListener('change', rebuild);
document.getElementById('rebuild').addEventListener('click', rebuild);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer?.resize?.(w, h);
}
window.addEventListener('resize', resize);
resize();
rebuild();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  camera.position.set(
    orbit.target.x + orbit.dist * Math.cos(orbit.el) * Math.sin(orbit.az),
    orbit.target.y + orbit.dist * Math.sin(orbit.el),
    orbit.target.z + orbit.dist * Math.cos(orbit.el) * Math.cos(orbit.az),
  );
  camera.lookAt(orbit.target);
  room?.update(dt, null, camera.position);
  syncAnchorPins();
  if (composer) composer.render(renderer, scene, camera);
  else renderer.render(scene, camera);
  window.__ready = true;
});

// 调试探针（隔离渲染诊断）
window.__scene = scene;
window.__camera = camera;
window.__THREE = THREE;
window.__roomRef = () => room;
window.__rebuild = rebuild;
window.__gallery = { scene, renderer, camera };
