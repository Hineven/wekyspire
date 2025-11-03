// filepath: src/renderers/effects/pulse/cooldown.js
import * as PIXI from 'pixi.js';
import { EffectKinds, genEffectId } from '../core.js';
import { setDesaturate } from '../utils.js';

export default function createCooldown(options = {}) {
  const cm = new PIXI.ColorMatrixFilter();
  const alpha = new PIXI.AlphaFilter(1);
  setDesaturate(cm, 1);
  const duration = options.duration ?? 600;
  let t = 0;
  return {
    kind: EffectKinds.PULSE,
    name: 'pulse:cooldown',
    id: options.id || genEffectId('pulse'),
    filters: [cm, alpha],
    update(dt) {
      t += dt;
      const phase = Math.min(1, t / duration);
      const s = 0.5 - Math.cos(phase * Math.PI) * 0.5; // 0..1
      alpha.alpha = 0.6 + s * 0.4;
      return t >= duration;
    },
    interrupt() {},
    destroy() { try { cm.destroy?.(); } catch(_) {} try { alpha.destroy?.(); } catch(_) {} }
  };
}

