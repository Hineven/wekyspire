// filepath: src/renderers/effects/pulse/burn.js
import * as PIXI from 'pixi.js';
import { EffectKinds, genEffectId } from '../core.js';

// A simple burn prototype: over duration, dissolve with noise and warm glow,
// fade the sprite to transparent. No interruptions; auto-finish and cleanup.
export default function createBurn(options = {}) {
  const duration = typeof options.duration === 'number' ? options.duration : 850;
  const color = options.color || [0.9, 0.4, 0.15]; // warm orange glow
  const dissolveEdge = options.edgeWidth || 0.10;  // edge softness
  const glowIntensity = options.glow || 0.99;

  const passThroughFrag = `
    precision mediump float;
    varying vec2 vTextureCoord;
    uniform sampler2D uSampler;
    void main(void){ gl_FragColor = texture2D(uSampler, vTextureCoord); }
  `;

  const copy = new PIXI.Filter(undefined, passThroughFrag);
  copy.autoFit = true; copy.padding = 0;


  const vertex = `
    attribute vec2 aVertexPosition;

    uniform mat3 projectionMatrix;

    varying vec2 vTextureCoord;
    varying vec2 vUniformCoord;

    uniform vec4 inputSize;
    uniform vec4 outputFrame;

    vec4 filterVertexPosition( void )
    {
        vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.)) + outputFrame.xy;

        return vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
    }

    vec2 filterTextureCoord( void )
    {
        return aVertexPosition * (outputFrame.zw * inputSize.zw);
    }

    void main(void)
    {
        gl_Position = filterVertexPosition();
        vTextureCoord = filterTextureCoord();
        float aspect = 198.0 / 266.0;
        vUniformCoord = 2.0 * (aVertexPosition - 0.5);
        vUniformCoord.x *= aspect;
    }
  `;

  const fragment = `
    precision mediump float;
    varying vec2 vTextureCoord;
    varying vec2 vUniformCoord;
    uniform sampler2D uSampler;
    
    // time progress 0..1
    uniform float uPhase;
    uniform vec3 uGlowColor;
    uniform float uGlowIntensity;
    uniform float uEdge;

    // Simple hash-based noise (cheap)
    float hash(vec2 p){
      p = fract(p*vec2(123.34, 456.21));
      p += dot(p, p+45.32);
      return fract(p.x*p.y);
    }
    
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      // 4 corners
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      // bilerp
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
    }

    void main(){
      vec4 base = texture2D(uSampler, vTextureCoord);
      // dissolve threshold grows with phase; scale noise to get varied edges
      float n = noise(vUniformCoord * 5.0) * 0.5 + noise(vUniformCoord * 8.4) * 0.42 + noise(vUniformCoord * 33.0) * 0.08;
      float border = sqrt(max(abs(vUniformCoord.x), abs(vUniformCoord.y)) * length(vUniformCoord));
      float borderEdge = max(1.3 - border, 0.0) * (1.0 / 1.3) * 0.99;
      float borderBonus = smoothstep(borderEdge, min(borderEdge + 0.5, 1.0), uPhase);
      float threshold = borderBonus * 1.5 + uPhase * 0.6; // expand slightly beyond 1 for full clear
      float dRust = clamp(smoothstep(threshold, threshold - uEdge * 2.5, n) + uPhase * 0.5, 0.0, 1.0);
      float dGlow = smoothstep(threshold - uEdge * 3.0, threshold - uEdge * 5.0, n);
      float d = smoothstep(threshold - uEdge * 3.3, threshold - uEdge * 4.4, n);

      // d ~ 0: intact, d ~ 1: dissolved
      float alpha = base.a * (1.0 - d);

      // Rust 
      float rust = dRust;
      float burnGlowEdge = 0.19;
      // On the inner glow edge, burning effect further brightens the glow
      float burn = smoothstep(0.18, 0.05, abs(dGlow - burnGlowEdge));
      // Turns into glow rust after rusting
      float glow = uGlowIntensity * smoothstep(burnGlowEdge, burnGlowEdge + 0.02, dGlow) * smoothstep(1.0, burnGlowEdge, dGlow);

      // composite: add rust tint
      vec3 col = mix(base.rgb, vec3(0.2, 0.05, 0.0), rust);
      // brighten remaining color with glow
      col = mix(col, uGlowColor, glow);
      // final burn brighten
      float nBurn = noise(vec2(0.614, 0.781) + vUniformCoord * 29.0) * 0.5 + 0.5;
      col += vec3(1.0 * (0.7 + nBurn*0.3), 0.7 * nBurn, 0.4 * nBurn) * burn;
      // Clamp color
      col = clamp(col, 0.0, 1.0);
      
      // output premultiplied alpha to match Pixi's pipeline
      col *= alpha;
      gl_FragColor = vec4(col, alpha);
    }
  `;

  const uniforms = {
    uPhase: 0,
    uGlowColor: color,
    uGlowIntensity: glowIntensity,
    uEdge: dissolveEdge
  };

  const filter = new PIXI.Filter(vertex, fragment, uniforms);
  filter.autoFit = true;
  filter.padding = 0;

  let t = 0;
  let destroyed = false;

  return {
    kind: EffectKinds.PULSE,
    name: 'pulse:burn',
    id: options.id || genEffectId('pulse'),
    filters: [copy, filter],
    update(dt) {
      if (destroyed) return true;
      t += dt;
      const phase = Math.min(1, t / duration);
      filter.uniforms.uPhase = phase;
      return t >= duration;
    },
    interrupt() {
      // burn is not intended to be interrupted; force finish
      t = duration;
    },
    destroy() {
      destroyed = true;
      try { filter.destroy?.(); } catch (_) {}
      try { copy.destroy?.(); } catch (_) {}
    }
  };
}
