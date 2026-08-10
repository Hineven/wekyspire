// 牌面烘焙器：一张卡的完整视觉（底板/边框/费用徽章/名称/卡图/正文/关键词）→ 单张纹理 + hit map。
// 布局盒固定 200x270（10px = 1 世界单位，对应 20x27 牌面 plane）。
// 视觉语言：
//   系列（type）→ 主题色：底板着色 + 名称下分隔线（体修灰/火红/木绿…）；
//   等阶（tier）→ style：边框色与粗细（高品阶加内描边）+ 左上角品阶徽章；
//   卡图（options.art，浏览器端由 CardArtCache 供 canvas）→ 名称下方图区，有图时正文区下移。
// 正文走 RichTextEngine（markup + 热区），热区坐标加上正文区偏移后随纹理成对返回。

import * as THREE from 'three';
import { parseRichText } from './parser.js';
import { layoutRichText, DEFAULT_COLOR_TABLE } from './layout.js';
import { drawPlacements, createCanvasMeasurer, defaultDrawIcon } from './texture.js';
import { allEffects } from '../../core/effects/registry.js';

// 效果外观解析（markup 里是效果显示名，按 name 反查定义；Stage→Core 查表是允许方向）。
// 特征色：def.color 是 richtext 颜色名，经颜色表转 css；未注册/无色 → null（回落正文色）
function effectLook(name) {
  const def = allEffects().find(d => d.name === name);
  const color = def?.color ? (DEFAULT_COLOR_TABLE[def.color] ?? def.color) : null;
  return { color, icon: def?.icon ?? null };
}

// 牌面图标绘制器：effect 有 emoji 图标画 emoji（与效果行/tooltip 同一视觉语言），
// 无图标或非 effect 回落通用徽章
function drawCardIcon(ctx, { iconType, name, x, y, size }) {
  if (iconType === 'effect') {
    const { icon } = effectLook(name);
    if (icon) {
      ctx.font = `${Math.round(size * 0.85)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, x + size / 2, y + size / 2 + size * 0.05);
      ctx.textAlign = 'left';
      return;
    }
  }
  defaultDrawIcon(ctx, { iconType, name, x, y, size });
}

export const CARD_FACE_SIZE = Object.freeze({ width: 200, height: 270 });

const TIER_COLORS = Object.freeze({
  D: '#8a8f9d', C: '#5aa2e8', B: '#a06ee8', A: '#e8b34c', S: '#e85a5a', Z: '#4a3a5a',
});
// 系列主题色（体修=灰，火=红，木=绿…）；未知系列回落体修灰
const TYPE_COLORS = Object.freeze({
  normal: '#8a8f9d',
  fire: '#e85a5a',
  wood: '#4aa56e',
  water: '#5aa2e8',
  earth: '#b8894a',
  thunder: '#e8d34c',
  light: '#e8e0c0',
  dark: '#7a5aa8',
});
// 等阶 style：边框宽度 + 是否内描边（B 及以上）
const TIER_FRAME = Object.freeze({
  D: { width: 2.5, inner: false },
  C: { width: 3.5, inner: false },
  B: { width: 4.5, inner: true },
  A: { width: 5.5, inner: true },
  S: { width: 6.5, inner: true },
  Z: { width: 3.5, inner: false },
});

const BODY_FONT = { fontSize: 17, lineHeight: 23, iconSize: 18, iconGap: 2, color: '#dde1ec' };
const BODY_MAX_WIDTH = CARD_FACE_SIZE.width - 24;
const BODY_TOP_PLAIN = 56;          // 无卡图时正文区顶
const ART_RECT = { x: 12, y: 46, w: 176, h: 88 };
const BODY_TOP_WITH_ART = ART_RECT.y + ART_RECT.h + 8; // 142

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const c = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// 两色线性混合（t=0 → a，t=1 → b）
export function mixHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

export function typeColor(type) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.normal;
}

/**
 * @param {object} card  projectCardFull 视图（name/tier/type/cost/text/keywords/cardMode/power）
 * @param {object} options
 *   scale = 2, createCanvas, measure, drawIcon —— 同 texture.js（单测全注入）
 *   art = CanvasImageSource | null —— 卡面图案（已加载完成的图像/canvas），缺省无图
 */
export function bakeCardFace(card, options = {}) {
  const {
    scale = 2,
    createCanvas = (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
    measure = createCanvasMeasurer(BODY_FONT),
    drawIcon = drawCardIcon,
    art = null,
  } = options;

  const canvas = createCanvas(CARD_FACE_SIZE.width * scale, CARD_FACE_SIZE.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  drawFrame(ctx, card);
  drawHeader(ctx, card);
  if (art) drawArt(ctx, art);

  // 正文：富文本排版 + 绘制（热区加偏移）；有卡图时正文区下移。
  // resolveEffect 给 /effect{名} 供特征色（图标 emoji 由 drawCardIcon 负责）
  const bodyTop = art ? BODY_TOP_WITH_ART : BODY_TOP_PLAIN;
  const layout = layoutRichText(parseRichText(card.text ?? ''), {
    maxWidth: BODY_MAX_WIDTH,
    measure,
    style: BODY_FONT,
    resolveEffect: options.resolveEffect ?? ((name) => {
      const { color } = effectLook(name);
      return color ? { color } : {};
    }),
  });
  drawPlacements(ctx, layout.placements, { style: BODY_FONT, drawIcon, offsetX: 12, offsetY: bodyTop });
  const hitRegions = layout.hitRegions.map(r => ({
    ...r,
    rect: { x: r.rect.x + 12, y: r.rect.y + bodyTop, w: r.rect.w, h: r.rect.h },
  }));

  drawFooter(ctx, card);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return { texture, hitRegions, width: CARD_FACE_SIZE.width, height: CARD_FACE_SIZE.height };
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFrame(ctx, card) {
  const { width: W, height: H } = CARD_FACE_SIZE;
  const tier = card.tier ?? 'D';
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.D;
  const frame = TIER_FRAME[tier] || TIER_FRAME.D;
  const theme = typeColor(card.type);

  // 底板：深色底混入系列主题色（越高品阶主题色越浓）
  const themeT = { D: 0.12, C: 0.18, B: 0.24, A: 0.30, S: 0.36 }[tier] ?? 0.12;
  roundedRect(ctx, 1, 1, W - 2, H - 2, 10);
  ctx.fillStyle = mixHex('#232634', theme, themeT);
  ctx.fill();
  // 正文区内衬
  roundedRect(ctx, 8, 50, W - 16, H - 92, 6);
  ctx.fillStyle = mixHex('#1a1c26', theme, themeT * 0.5);
  ctx.fill();
  // 边框：品阶色，宽度随等阶；B 及以上加细内描边
  roundedRect(ctx, 1 + frame.width / 2, 1 + frame.width / 2, W - 2 - frame.width, H - 2 - frame.width, 9);
  ctx.lineWidth = frame.width;
  ctx.strokeStyle = tierColor;
  ctx.stroke();
  if (frame.inner) {
    roundedRect(ctx, 4 + frame.width, 4 + frame.width, W - 8 - frame.width * 2, H - 8 - frame.width * 2, 7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // 品阶徽章：左上角菱形 + 字母
  drawTierBadge(ctx, 16, 16, tier, tierColor);
}

function drawTierBadge(ctx, cx, cy, tier, color) {
  const r = 9;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#10121a';
  ctx.stroke();
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#10121a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tier, cx, cy + 1);
  ctx.textAlign = 'left';
}

function drawHeader(ctx, card) {
  const theme = typeColor(card.type);
  // 名称（左移让出品阶徽章）
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#f2f4fa';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(card.name ?? '', 30, 26);
  // 威力
  if (card.power) {
    const nameW = ctx.measureText(card.name ?? '').width;
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#e8a03c';
    ctx.fillText(`威${card.power > 0 ? '+' : ''}${card.power}`, 34 + nameW, 27);
  }
  // 系列主题分隔线（名称下方）
  ctx.fillStyle = theme;
  ctx.fillRect(12, 40, CARD_FACE_SIZE.width - 24, 2);
  // 费用徽章（右上：蓝=mana，绿=AP）
  const cost = card.cost ?? { mana: 0, actionPoint: 0 };
  drawCostBadge(ctx, 162, 26, cost.mana, '#3c6ee8');
  drawCostBadge(ctx, 186, 26, cost.actionPoint, '#3ca55c');
  ctx.textAlign = 'left';
}

function drawCostBadge(ctx, cx, cy, value, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(value), cx, cy + 1);
  ctx.textAlign = 'left';
}

// 卡面图案：cover 式裁切进图区（圆角裁剪），下缘压一道主题色
function drawArt(ctx, art) {
  const { x, y, w, h } = ART_RECT;
  const iw = art.width || w;
  const ih = art.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  roundedRect(ctx, x, y, w, h, 6);
  ctx.clip();
  ctx.drawImage(art, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function drawFooter(ctx, card) {
  const bits = [];
  if (card.cardMode && card.cardMode !== 'normal') bits.push(card.cardMode === 'chant' ? '咏唱' : card.cardMode);
  if (card.keywords?.length) bits.push(...card.keywords);
  if (card.charges && card.charges.max !== Infinity) bits.push(`充能${card.charges.max}`);
  if (bits.length === 0) return;
  ctx.font = '13px sans-serif';
  ctx.fillStyle = typeColor(card.type);
  ctx.textBaseline = 'middle';
  ctx.fillText(bits.join(' · '), 12, CARD_FACE_SIZE.height - 18);
}
