<template>
  <div class="pixi-overlay" ref="host"></div>
</template>

<script>
import PixiAppManager from '@/webgl/PixiAppManager.js'
import animator from '@/utils/animator.js'
import { bakeElementToTexture } from '@/webgl/domBake.js'
import frontendEventBus from '@/frontendEventBus.js'

export default {
  name: 'GamePixiOverlay',
  data() { return { layer: null, spriteMap: new Map(), bakingStamp: new Map(), boundsMap: new Map(), debugShowBounds: false }; },
  mounted() {
    const host = this.$refs.host;
    const { app, PIXI, getLayer } = PixiAppManager.init(host);
    this.layer = getLayer('cards-overlay', 1150);

    // Purge any pre-existing children (from previous mounts/HMR) before we manage this layer
    try {
      if (this.layer?.children?.length) {
        for (const child of [...this.layer.children]) {
          try { this.layer.removeChild(child); } catch(_) {}
          try { child.destroy({ children: true, texture: true, baseTexture: true }); } catch(_) {}
        }
      }
    } catch(_) {}

    const getSnapById = (id) => animator.getTransformsSnapshotByAdapter('card').find(s => s.id === id) || null;

    const api = {
      setShowBounds: (v) => { this.debugShowBounds = !!v; if (!this.debugShowBounds) this._clearBounds(); },
      getShowBounds: () => this.debugShowBounds,
      dump: (id) => { const snap = getSnapById(id); const rec = this.spriteMap.get(id); console.log('[PixiOverlay dump]', { id, snap, rec }); },
      dumpAll: () => {
        const snaps = animator.getTransformsSnapshotByAdapter('card');
        console.log('[PixiOverlay dumpAll] Snaps:', snaps);
        for (const [id, rec] of this.spriteMap.entries()) console.log(`[Sprite ${id}]`, rec);
        console.log('[PixiOverlay dumpAll] Layer children:', this.layer?.children?.map((c,i)=>({i, type: c.constructor?.name, hasId: c.__cardId!=null, cardId:c.__cardId})));
      },
      purgeLayer: () => {
        // Remove any Sprite not owned by spriteMap; keep bounds graphics
        const ownedSprites = new Set(Array.from(this.spriteMap.values()).map(r => r.sprite).filter(Boolean));
        for (const child of [...this.layer.children]) {
          const isSprite = child && child.texture != null; // heuristic for PIXI.Sprite
          const isOwned = ownedSprites.has(child);
          if (isSprite && !isOwned) {
            try { this.layer.removeChild(child); } catch(_) {}
            try { child.destroy({ children:false, texture:true, baseTexture:true }); } catch(_) {}
          }
        }
        return true;
      },
      rebake: (id) => {
        const rec = this._ensureRecord(id);
        if (rec) rec.requestBake = true;
        return true;
      }
    };
    if (typeof window !== 'undefined') { window.__pixiOverlayDebug = api; console.info('[PixiOverlay] Debug API available as window.__pixiOverlayDebug'); }

    const computeSizeKey = (wrapperEl) => {
      const el = (wrapperEl && wrapperEl.firstElementChild) ? wrapperEl.firstElementChild : wrapperEl;
      if (!el) return '';
      let w = el.offsetWidth || el.clientWidth || 0;
      let h = el.offsetHeight || el.clientHeight || 0;
      if (!(w > 0 && h > 0)) { const r = el.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); }
      if (!(w > 0 && h > 0)) return '';
      return `${w}x${h}`;
    };

    // Records: id -> { sprite?, baked?, bakeScale?, pendingTexture?, pendingScale?, baking:boolean, requestBake:boolean, wrapperEl?, sizeKey? }
    this._ensureRecord = (id) => {
      let rec = this.spriteMap.get(id);
      if (!rec) { rec = { sprite: null, baked: null, bakeScale: 1, pendingTexture: null, pendingScale: 1, baking: false, requestBake: false, wrapperEl: null, sizeKey: '' }; this.spriteMap.set(id, rec); }
      return rec;
    };

    const startBake = async (id, contentEl) => {
      const rec = this.spriteMap.get(id);
      if (!rec || rec.baking) return;
      rec.baking = true;
      try {
        const baked = await bakeElementToTexture(contentEl);
        rec.pendingTexture = baked.texture;
        rec.pendingScale = baked.scaleUsed || 1;
      } catch (e) {
        console.warn('[PixiOverlay] bake failed', id, e);
      } finally {
        rec.baking = false;
      }
    };

    // Content change marks bake request; actual bake and sprite commit happen in ticker
    const onContentUpdated = ({ id }) => {
      const reg = animator.getRegisteredByAdapter('card').find(r => r.id === id);
      if (!reg) return;
      const rec = this._ensureRecord(id);
      rec.wrapperEl = reg.element;
      rec.requestBake = true;
    };
    frontendEventBus.on('card-content-updated', onContentUpdated);
    this._offContentUpdated = () => frontendEventBus.off('card-content-updated', onContentUpdated);

    app.ticker.add(() => {
      const regs = animator.getRegisteredByAdapter('card');
      const snaps = animator.getTransformsSnapshotByAdapter('card');
      const snappedIds = new Set(snaps.map(s => s.id));

      // Maintain records from regs
      for (const { id, element: wrapper } of regs) {
        const rec = this._ensureRecord(id);
        rec.wrapperEl = wrapper;
        const key = computeSizeKey(wrapper);
        if (key && rec.sizeKey !== key) { rec.sizeKey = key; rec.requestBake = true; }
      }

      // Launch bakes for requests
      for (const [id, rec] of this.spriteMap.entries()) {
        if (!rec.wrapperEl) continue;
        if (rec.requestBake && !rec.baking) {
          const contentEl = rec.wrapperEl.firstElementChild || rec.wrapperEl;
          const rect = contentEl.getBoundingClientRect();
          if (rect && rect.width > 0 && rect.height > 0) {
            startBake(id, contentEl);
            rec.requestBake = false; // queued
          }
        }
      }

      // Commit pending textures and create sprites only inside ticker when snapshot exists
      for (const [id, rec] of this.spriteMap.entries()) {
        const snap = snaps.find(s => s.id === id);
        if (!rec.sprite && rec.pendingTexture && snap) {
          const sprite = new PIXI.Sprite(rec.pendingTexture);
          sprite.__cardId = id;
          sprite.anchor.set(0.5);
          sprite.zIndex = 0;
          sprite.interactive = false;
          sprite.eventMode = 'none';
          const s = Math.max(1, rec.pendingScale || 1);
          sprite.position.set(snap.cx, snap.cy);
          sprite.scale.set(snap.sx / s, snap.sy / s);
          sprite.rotation = snap.rot;
          sprite.alpha = Math.max(0, Math.min(1, snap.opacity));
          sprite.visible = !!snap.visible;
          this.layer.addChild(sprite);
          rec.sprite = sprite;
          rec.baked = rec.pendingTexture;
          rec.bakeScale = rec.pendingScale || 1;
          rec.pendingTexture = null;
          // Notify container to hide wrapper visuals
          frontendEventBus.emit('pixi-sprite-committed', { id });
        } else if (rec.sprite && rec.pendingTexture) {
          const oldTex = rec.sprite.texture;
          rec.sprite.texture = rec.pendingTexture;
          rec.baked = rec.pendingTexture;
          rec.bakeScale = rec.pendingScale || rec.bakeScale || 1;
          rec.pendingTexture = null;
          try { oldTex?.destroy(true); } catch(_) {}
        }
      }

      // Sync transforms and visibility/opacity
      for (const snap of snaps) {
        const rec = this.spriteMap.get(snap.id);
        if (!rec?.sprite) continue;
        rec.sprite.visible = !!snap.visible;
        const s = Math.max(1, rec.bakeScale || 1);
        rec.sprite.position.set(snap.cx, snap.cy);
        rec.sprite.scale.set(snap.sx / s, snap.sy / s);
        rec.sprite.rotation = snap.rot;
        rec.sprite.alpha = Math.max(0, Math.min(1, snap.opacity));
      }
      // Hide any sprite without a snapshot this frame
      for (const [id, rec] of this.spriteMap.entries()) {
        if (rec.sprite && !snappedIds.has(id)) rec.sprite.visible = false;
      }

      // Remove records for cards no longer registered
      const regIds = new Set(regs.map(r => r.id));
      for (const [id, rec] of [...this.spriteMap.entries()]) {
        if (!regIds.has(id)) {
          if (rec.sprite) {
            try { this.layer.removeChild(rec.sprite); } catch(_) {}
            try { rec.sprite.destroy({ children:false, texture:false, baseTexture:false }); } catch(_) {}
          }
          try { rec.baked?.destroy?.(true); } catch(_) {}
          try { rec.pendingTexture?.destroy?.(true); } catch(_) {}
          this.spriteMap.delete(id);
          const g = this.boundsMap.get(id);
          if (g) { try { g.destroy(); } catch(_) {}; this.boundsMap.delete(id); }
          frontendEventBus.emit('pixi-sprite-released', { id });
        }
      }

      // Compact layer: remove any Sprite not owned by spriteMap (regardless of __cardId)
      const owned = new Set(Array.from(this.spriteMap.values()).map(r => r.sprite).filter(Boolean));
      for (const child of [...this.layer.children]) {
        const isSprite = child && child.texture != null; // heuristic: PIXI.Sprite has texture
        if (isSprite && !owned.has(child)) {
          try { this.layer.removeChild(child); } catch(_) {}
          try { child.destroy({ children:false, texture:true, baseTexture:true }); } catch(_) {}
        }
      }

      // Debug bounds drawing
      if (this.debugShowBounds) {
        for (const snap of snaps) {
          if (!snap.visible) {
            const gHidden = this.boundsMap.get(snap.id);
            if (gHidden) {
              try { gHidden.destroy(); } catch(_) {}
              this.boundsMap.delete(snap.id);
            }
            continue;
          }
          let g = this.boundsMap.get(snap.id);
          if (!g) {
            g = new PIXI.Graphics();
            g.zIndex = 1000;
            g.interactive = false;
            g.eventMode = 'none';
            this.layer.addChild(g);
            this.boundsMap.set(snap.id, g);
          }
          g.clear();
          g.lineStyle(2, 0xff66cc, 0.9);
          g.beginFill(0xff66cc, 0.12);
          g.position.set(snap.cx, snap.cy);
          g.rotation = snap.rot;
          g.scale.set(snap.sx, snap.sy);
          g.drawRect(-snap.baseW / 2, -snap.baseH / 2, snap.baseW, snap.baseH);
          g.endFill();
        }
      } else {
        for (const [bid, g] of this.boundsMap.entries()) {
          try { g.destroy(); } catch(_) {}
          this.boundsMap.delete(bid);
        }
      }
    });
  },
  methods: {
    _clearBounds() {
      for (const [id, g] of this.boundsMap.entries()) {
        try { g.destroy(); } catch(_) {}
        this.boundsMap.delete(id);
      }
    }
  },
  beforeUnmount() {
    try { this._offContentUpdated?.(); } catch(_) {}
    try { this._clearBounds(); } catch(_) {}
    try {
      if (this.layer) { this.layer.removeChildren().forEach(c => c.destroy()); }
      for (const [, rec] of this.spriteMap.entries()) {
        try { rec.baked?.destroy?.(true); } catch(_) {}
        try { rec.pendingTexture?.destroy?.(true); } catch(_) {}
      }
      this.spriteMap.clear();
      this.bakingStamp.clear();
    } catch (_) {}
  }
}
</script>

<style scoped>
.pixi-overlay { position: fixed; inset: 0; z-index: calc(var(--z-animatable-elements, 1100) + 1); pointer-events: none; }
</style>
