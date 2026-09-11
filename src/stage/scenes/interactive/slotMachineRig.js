// 老虎机 rig（用户定 2026-09-11）：把 `props/slotMachine.js` 的可动件驱动起来。
// 反馈分层（原则：交互反馈丰富且分层）：
//   · 常驻：机体微微抖动（"活着"）+ 彩灯缓慢呼吸
//   · hover：机体轻微上浮放大 + 彩灯提亮（由交互层调用 setHover）
//   · 拉杆：拉杆快速拉下 → 缓慢弹起（弹性回位）；三点亮起同步起转
//   · 转轮：起转 → 匀速 → 减速 → **离散落槽**（左/右先锁，中间最后；锁定瞬间有"咔"式
//     小弹跳）。落槽目标由后端结果决定（后端在拉杆瞬间就算好了）：rig 只负责把轮盘
//     转到对应图案的那一面。
//   · 中奖：屏幕彩灯按档位分级的灯效（小奖=跑马灯，大奖=跑马+全亮爆闪+机体激动抖动），
//     并让机体抖动幅度随档位提升。
// 纯 Stage 层：不读 Core、不读 Bridge；输入只有「拉杆时给定的结果」（调用方从 Core 拿）。

import * as THREE from 'three';
import { P } from '../kit/index.js';

const Z = Math.PI * 2;

// 档位 → 灯效/抖动强度（细节是可调参数：先给一版手感，视觉门里再调）
const TIER_FX = {
  none: { chase: 0, flash: 0, shake: 0.0, seconds: 0.5, dim: 0.45 },
  minor: { chase: 9, flash: 0.35, shake: 0.05, seconds: 1.6, dim: 0.0 },
  major: { chase: 16, flash: 1.0, shake: 0.16, seconds: 2.6, dim: 0.0 },
};

// 各转轮锁定耗时（秒）：**左右两侧最快、中间稍慢**（用户定）——右侧略晚于左侧，
// 读作"两侧先定、中间最后咬合"的层次。
const LOCK_AT = [1.05, 1.55, 1.25];

/**
 * 让轮盘停在某个图案面 —— **推导（别再凭感觉改）**：
 * 鼓面按角度分带：图案 k 占 `[k/N,(k+1)/N)` 扇区（`props/slotMachine.js` 的
 * `p(a) = (sin a·r, y, cos a·r)`），故带心 `a_k = (k+0.5)/N·2π`。
 * 以绕 X 旋转 θ 时，处于角度 a 的面移到 `a − θ`；要让带心朝正前（角度 0）需
 * `θ ≡ a_k (mod 2π)`。取 `θ = a_k − 2π`（**负向**，与转轮自旋方向一致；
 * 调用方还会继续减整圈，模 2π 不变）。
 * 常见错法：用 `−a_k` 或 `−k/N·2π` —— 那会把**两带接缝**摆到正前（怼脸一眼可见）。
 */
const angleFor = (k, n) => (((k % n) + 0.5) / n) * Z - Z;

export function createSlotMachineRig({ object, parts, seed = 'slot' }) {
  const body = parts?.body ?? object;
  const lever = parts?.leverPivot ?? null;
  const reels = parts?.reels ?? [];
  const bulbs = parts?.bulbs ?? [];
  // 转轮面数由资产决定（道具导出 SYMBOLS 长度）；资产侧只有 kit 共享材质，
  // 彩灯的逐帧改色**由 rig 持独立材质**（资产禁自建材质是契约）。
  const SYM = reels[0]?.userData?.symbols?.length ?? 5;
  for (const b of bulbs) b.material = new THREE.MeshBasicMaterial({ color: P.gold });
  // 拉杆：材质独立化（悬停/拉下时能闪光提示——它是"这台能点"的关键部件）
  const leverParts = [];
  lever?.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    const base = o.material.color.clone();
    o.material.emissive = new THREE.Color(0x000000);
    leverParts.push({ mesh: o, base });
  });
  let leverFlash = 0;
  const basePos = body.position.clone();   // 机器由 composeRoom 定位——抖动只能在基准位附近
  const baseScale = body.scale.x || 1;

  const st = {
    t: 0,
    phase: Math.random() * 10,
    hover: 0,            // 0..1 hover 权重（平滑过渡）
    pulling: false,
    leverAngle: 0,       // 0 = 静止，负 = 拉下
    leverRelease: 0,     // 弹起进度（0..1）
    spin: null,          // { elapsed, targets: [k,k,k], locked: [bool], angle: [..], speed: [..] }
    win: null,           // { tier, t, fx }
    shake: 0,            // 剩余抖动时间
    shakeAmp: 0,
  };

  // ---- 彩灯：常态呼吸 + 灯效（逐灯独立材质，直接改 color）----
  const shadeHex = (hex, k) => new THREE.Color(hex).multiplyScalar(1 + k);
  const bulbOn = new THREE.Color(P.flameCore);
  const bulbWarm = new THREE.Color(P.gold);
  const bulbDim = new THREE.Color(shadeHex(P.gold, -0.3));

  function paintBulbs(level = 0) {
    // level 0 = 常态（暗金呼吸）；>0 = 中奖灯效强度
    bulbs.forEach((b, i) => {
      const breathe = 0.5 + 0.5 * Math.sin(st.t * 1.6 + i * 0.5);
      if (st.win) {
        const fx = st.win.fx;
        const chaseOn = fx.chase > 0 && ((i + Math.floor(st.win.t * fx.chase)) % 3 === 0);
        const flashOn = fx.flash > 0 && Math.sin(st.win.t * 18) > 1 - fx.flash * 2;
        const on = chaseOn || flashOn;
        b.material.color.copy(on ? bulbOn : bulbWarm);
      } else {
        const base = bulbDim.clone().lerp(bulbWarm, 0.35 + 0.45 * breathe + 0.35 * st.hover);
        b.material.color.copy(base);
      }
    });
  }
  // ---- 拉杆 ----
  function pull({ tier = 'minor', symbols = null } = {}) {
    if (st.spin) return false;                      // 转轮中不能再拉（调用方另有防抖）
    st.pulling = true;
    st.leverRelease = 0;
    st.win = null;
    const targets = reels.map((_, i) => {
      const s = symbols?.[i];
      return Number.isInteger(s) ? s % SYM : Math.floor(Math.random() * SYM);
    });
    st.spin = {
      elapsed: 0,
      targets,
      locked: reels.map(() => false),
      angle: reels.map((r) => r.rotation.x),
      speed: reels.map(() => 0),
      final: reels.map(() => 0),
      tier,
    };
    return true;
  }

  function update(dt) {
    st.t += dt;
    const busy = !!st.spin;

    // ---- 常驻抖动：机体微微抖（幅度小但持续；中奖时叠加"激动"抖动）----
    const idleAmp = st.hover > 0.5 ? 0.03 : 0.018;
    let shakeX = 0, shakeY = 0, shakeZ = 0;
    if (st.shake > 0) {
      st.shake = Math.max(0, st.shake - dt);
      const k = st.shakeAmp * (st.shake > 0 ? 1 : 0);
      shakeX = Math.sin(st.t * 46) * k;
      shakeY = Math.abs(Math.sin(st.t * 38)) * k * 0.7;
      shakeZ = Math.cos(st.t * 52) * k * 0.5;
    }
    body.position.set(
      basePos.x + Math.sin(st.t * 13.3 + st.phase) * idleAmp + shakeX,
      basePos.y + Math.abs(Math.sin(st.t * 9.7 + st.phase)) * idleAmp * 0.6 + shakeY,
      basePos.z + Math.cos(st.t * 11.1 + st.phase) * idleAmp * 0.5 + shakeZ,
    );
    body.rotation.z = Math.sin(st.t * 7.3 + st.phase) * 0.004 + shakeZ * 0.02;
    // hover：轻微上浮放大（配合灯提亮）
    st.hover += ((st.hoverTarget ?? 0) - st.hover) * Math.min(1, dt * 8);
    const hoverBoost = 1 + 0.025 * st.hover;
    body.scale.setScalar(baseScale * hoverBoost);

    // ---- 拉杆：快速拉下 → 缓慢弹起（弹性回位）；悬停/拉下时闪光提示 ----
    leverFlash = Math.max(0, leverFlash - dt * 2.2);
    if (lever) {
      const wantFlash = st.pulling || st.hover > 0.5 ? 1 : 0;
      leverFlash = Math.max(leverFlash, wantFlash * Math.min(1, dt * 6 + leverFlash));
      if (st.pulling) {
        st.leverAngle += (-1.05 - st.leverAngle) * Math.min(1, dt * 16);
        if (st.leverAngle < -1.0) { st.pulling = false; st.leverRelease = 0; }
      } else {
        st.leverRelease = Math.min(1, st.leverRelease + dt * 0.9);   // 缓慢弹起（约 1.1s）
        const e = 1 - Math.pow(1 - st.leverRelease, 3);              // easeOutCubic
        const overshoot = Math.sin(st.leverRelease * Math.PI) * 0.12;
        st.leverAngle = -1.05 * (1 - e) + overshoot * (1 - e);
      }
      lever.rotation.z = st.leverAngle;
      // 闪光：朝冷白插值（拉下瞬间最亮）
      for (const lp of leverParts) {
        lp.mesh.material.color.copy(lp.base).lerp(new THREE.Color(P.flameCore), leverFlash * 0.75);
      }
    }

    // ---- 转轮：起转 → 匀速 → 减速 → 离散落槽 ----
    if (st.spin) {
      const s = st.spin;
      s.elapsed += dt;
      reels.forEach((r, i) => {
        if (s.locked[i]) return;
        const lockAt = LOCK_AT[i % LOCK_AT.length];
        const spinUp = Math.min(1, s.elapsed / 0.18);              // 起转加速
        const remain = Math.max(0, lockAt - s.elapsed);
        if (remain > 0.45) {
          s.speed[i] = 26 * spinUp * (busy ? 1 : 0);               // 匀速段
          s.angle[i] -= s.speed[i] * dt;                           // 负向转（视觉上是向上跑）
        } else {
          // 末段：算出落点并缓入（离散停面 = 图案面角度）
          const targetAngle = angleFor(s.targets[i], SYM);
          // 从当前角继续（保持同向）补足到目标角
          const cur = s.angle[i];
          let goal = targetAngle;
          while (goal > cur - Z * 0.75) goal -= Z;                 // 至少再转 3/4 圈，方向一致
          const k = Math.max(0, Math.min(1, 1 - remain / 0.45));   // 0→1
          const e = 1 - Math.pow(1 - k, 3);
          s.angle[i] = cur + (goal - cur) * e;
          if (remain <= 0.001) {
            s.angle[i] = targetAngle;                              // 硬落槽（离散）
            r.userData.index = s.targets[i];
            s.locked[i] = true;
            st.shake = Math.max(st.shake, 0.09);                   // 落槽小弹跳
            st.shakeAmp = Math.max(st.shakeAmp, 0.02);
          }
        }
        r.rotation.x = s.angle[i];
      });
      if (s.locked.every(Boolean)) {
        const tier = s.tier;
        st.spin = null;
        st.win = { tier, t: 0, fx: TIER_FX[tier] ?? TIER_FX.none };
        if (st.win.fx.shake > 0) { st.shake = st.win.fx.seconds; st.shakeAmp = st.win.fx.shake; }
      }
    }

    // ---- 中奖灯效推进 ----
    if (st.win) {
      st.win.t += dt;
      if (st.win.t > st.win.fx.seconds) st.win = null;
    }
    paintBulbs(st.win ? 1 : 0);
  }

  return {
    pull,
    update,
    setHover: (on) => { st.hoverTarget = on ? 1 : 0; },
    isBusy: () => !!st.spin,
    state: st,
  };
}
