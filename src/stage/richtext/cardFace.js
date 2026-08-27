// 牌面烘焙器：一张卡的完整视觉（底板/边框/费用徽章/名称/卡图/正文/关键词）→ 单张纹理 + hit map。
// 布局盒固定 200x270（10px = 1 世界单位，对应 20x27 牌面 plane）。
// 视觉语言：
//   系列（type）→ 主题色：底板着色 + 斜纹饰面 + 名称分隔线（体修灰/火红/木绿…）；
//   等阶（tier）→ style：边框色与粗细，B 及以上加内描边与箔金渐变描边、边中点饰钉；
//   卡图（options.art，浏览器端由 CardArtCache 供 canvas）→ 名称下方图区，有图时正文区下移；
//   无卡图 → 程序化占位：系列字形水印 + 中心辉光（版面与有图完全一致）；
//   系列装饰图层（options.decor，CardArtCache.getDecor 供 decor-{系列}.png）→ 最上层整面贴图，
//   自带透明镂空，素材未就位时整层跳过——每个系列的图像美术资源落进 assets/cards/decor 即生效。
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

/** 等阶主题色（Vue 面板与战场卡面共用同一套等阶色，保证同卡同貌）。 */
export function tierColor(tier) {
  return TIER_COLORS[tier] ?? TIER_COLORS.D;
}

// 系列字形（无卡图时的占位水印字）；新系列登记定义后在此补一行
const SERIES_GLYPHS = Object.freeze({
  fist: '拳', blade: '刃', block: '盾',
  fire: '炎', wood: '木', water: '水', earth: '岳', thunder: '雷', light: '光', dark: '冥',
});

/** 系列字形占位字：series 优先，回落 type，未知回落「技」。 */
export function seriesGlyph(card) {
  return SERIES_GLYPHS[card?.series] ?? SERIES_GLYPHS[card?.type] ?? '技';
}

/** #rrggbb → rgba(r,g,b,a) */
function hexA(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * @param {object} card  projectCardFull 视图（name/tier/type/cost/text/keywords/cardMode/power/series）
 * @param {object} options
 *   scale = 2, createCanvas, measure, drawIcon —— 同 texture.js（单测全注入）
 *   art = CanvasImageSource | null —— 卡面图案（已加载完成的图像/canvas），缺省无图（画程序化占位）
 *   decor = CanvasImageSource | null —— 系列装饰图层（整面贴图、自带透明镂空），缺省跳过
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
    decor = null,
  } = options;

  const canvas = createCanvas(CARD_FACE_SIZE.width * scale, CARD_FACE_SIZE.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  drawFrame(ctx, card);
  drawHeader(ctx, card);
  if (art) drawArt(ctx, art, card);
  else drawArtPlaceholder(ctx, card);

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

  // 系列装饰图层最上（整面 cover 贴图、圆角裁剪；素材自带透明镂空则不遮正文）
  if (decor) {
    const { width: W, height: H } = CARD_FACE_SIZE;
    ctx.save();
    roundedRect(ctx, 1, 1, W - 2, H - 2, 10);
    ctx.clip();
    const iw = decor.width || W;
    const ih = decor.height || H;
    const s = Math.max(W / iw, H / ih);
    ctx.drawImage(decor, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
    ctx.restore();
  }

  // Shift 详情提示方标：仅双轨卡的「已应用」卡面呈现（提示可按 Shift 看机制详情）；
  // 详情面（altFace）自身不带标——已处于详情态；纯机制卡（无 textAlt）无提示必要
  if (card.textAlt != null && !card.altFace) hitRegions.push(drawShiftBadge(ctx));

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  // canvas 一并返回：shell 侧同源卡面预览（DOM img）走同一渲染管线出图
  return { texture, hitRegions, width: CARD_FACE_SIZE.width, height: CARD_FACE_SIZE.height, canvas };
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
  const tColor = TIER_COLORS[tier] || TIER_COLORS.D;
  const frame = TIER_FRAME[tier] || TIER_FRAME.D;
  const theme = typeColor(card.type);

  // 底板：深色底混入系列主题色（越高品阶主题色越浓），顶部提亮、底部压暗的纵向渐变
  const themeT = { D: 0.12, C: 0.18, B: 0.24, A: 0.30, S: 0.36 }[tier] ?? 0.12;
  roundedRect(ctx, 1, 1, W - 2, H - 2, 10);
  ctx.fillStyle = mixHex('#232634', theme, themeT);
  ctx.fill();
  const wash = ctx.createLinearGradient(0, 0, 0, H);
  wash.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  wash.addColorStop(0.42, 'rgba(0, 0, 0, 0)');
  wash.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
  ctx.fillStyle = wash;
  ctx.fill();

  // 系列色斜纹饰面（低透明，压在底板上、卡图/正文之下）
  drawHatch(ctx, theme);

  // 正文区内衬
  roundedRect(ctx, 8, 50, W - 16, H - 92, 6);
  ctx.fillStyle = mixHex('#1a1c26', theme, themeT * 0.5);
  ctx.fill();

  // 边框：品阶色，宽度随等阶；B 及以上加细内描边，描边走箔金渐变（高品阶更闪）
  roundedRect(ctx, 1 + frame.width / 2, 1 + frame.width / 2, W - 2 - frame.width, H - 2 - frame.width, 9);
  ctx.lineWidth = frame.width;
  ctx.strokeStyle = borderStyle(ctx, tier, tColor, W, H);
  ctx.stroke();
  if (frame.inner) {
    roundedRect(ctx, 4 + frame.width, 4 + frame.width, W - 8 - frame.width * 2, H - 8 - frame.width * 2, 7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  // 最外圈发丝线（提亮轮廓）
  ctx.save();
  ctx.globalAlpha = 0.45;
  roundedRect(ctx, 0.5, 0.5, W - 1, H - 1, 10.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = tColor;
  ctx.stroke();
  ctx.restore();
  // 四边中点饰钉（品阶色小菱形）
  drawEdgeStuds(ctx, tColor);
  // 品阶徽章：左上角菱形 + 字母
  drawTierBadge(ctx, 16, 16, tier, tColor);
}

// 高品阶（B+）边框走 tier 色 ↔ 提白的箔金渐变，低品阶保持实色
function borderStyle(ctx, tier, tColor, W, H) {
  if (!(tier in TIER_FRAME) || !TIER_FRAME[tier].inner) return tColor;
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, mixHex(tColor, '#ffffff', 0.42));
  grad.addColorStop(0.5, tColor);
  grad.addColorStop(1, mixHex(tColor, '#ffffff', 0.24));
  return grad;
}

// 45° 斜纹饰面：主题色低透明细线，给底板一层织物质感
function drawHatch(ctx, theme) {
  const { width: W, height: H } = CARD_FACE_SIZE;
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = theme;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -H; x < W; x += 13) {
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
  }
  ctx.stroke();
  ctx.restore();
}

// 四边中点饰钉：边框上的小菱形铆钉（品阶色，暗描边）
function drawEdgeStuds(ctx, tColor) {
  const { width: W, height: H } = CARD_FACE_SIZE;
  const r = 2.6;
  const spots = [[W / 2, 4], [W / 2, H - 4], [4, H / 2], [W - 4, H / 2]];
  for (const [cx, cy] of spots) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = tColor;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = '#10121a';
    ctx.stroke();
  }
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
  // 系列主题分隔线（名称下方）：细线 + 中央菱形饰
  ctx.fillStyle = theme;
  ctx.fillRect(12, 40, CARD_FACE_SIZE.width - 24, 1.2);
  drawDiamond(ctx, CARD_FACE_SIZE.width / 2, 40.6, 3, theme);
  // 费用徽章（右上：蓝=mana，绿=AP）
  const cost = card.cost ?? { mana: 0, actionPoint: 0 };
  drawCostBadge(ctx, 162, 26, cost.mana, '#3c6ee8');
  drawCostBadge(ctx, 186, 26, cost.actionPoint, '#3ca55c');
  ctx.textAlign = 'left';
}

// 实心小菱形（分隔线/饰钉共用形状）
function drawDiamond(ctx, cx, cy, r, color) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawCostBadge(ctx, cx, cy, value, color) {
  // 外圈暗环衬底 → 主色圆 → 高光弧 → 白描边 → 数值
  ctx.beginPath();
  ctx.arc(cx, cy, 12.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 10, 16, 0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 7.5, -2.4, -1.2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.stroke();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(value), cx, cy + 1);
  ctx.textAlign = 'left';
}

// 卡面图案：cover 式裁切进图区（圆角裁剪），上下缘渐隐融入底板 + 主题色内描边
function drawArt(ctx, art, card) {
  const { x, y, w, h } = ART_RECT;
  const iw = art.width || w;
  const ih = art.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const theme = typeColor(card.type);
  ctx.save();
  roundedRect(ctx, x, y, w, h, 6);
  ctx.clip();
  ctx.drawImage(art, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  // 上下渐隐（图与底板的过渡带）
  const fade = ctx.createLinearGradient(0, y, 0, y + h);
  fade.addColorStop(0, 'rgba(18, 22, 36, 0.5)');
  fade.addColorStop(0.2, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, 'rgba(18, 22, 36, 0.55)');
  ctx.fillStyle = fade;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // 双层内描边：外暗线 + 主题色亮线
  ctx.save();
  roundedRect(ctx, x - 2, y - 2, w + 4, h + 4, 7.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(8, 10, 18, 0.8)';
  ctx.stroke();
  ctx.globalAlpha = 0.75;
  roundedRect(ctx, x - 0.75, y - 0.75, w + 1.5, h + 1.5, 6.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = theme;
  ctx.stroke();
  ctx.restore();
}

// 无卡图占位：槽底 + 系列色中心辉光 + 系列字形水印 + 细内框（版面与有图一致）
function drawArtPlaceholder(ctx, card) {
  const { x, y, w, h } = ART_RECT;
  const theme = typeColor(card.type);
  roundedRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = mixHex('#151a29', theme, 0.10);
  ctx.fill();
  const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.56, 6, x + w / 2, y + h * 0.56, w * 0.52);
  glow.addColorStop(0, hexA(theme, 0.30));
  glow.addColorStop(1, hexA(theme, 0));
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = mixHex(theme, '#ffffff', 0.28);
  ctx.fillText(seriesGlyph(card), x + w / 2, y + h * 0.56);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.55;
  roundedRect(ctx, x + 1, y + 1, w - 2, h - 2, 5);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = theme;
  ctx.stroke();
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

// Shift 详情方标（仅已应用卡面）：右下角小方牌 + 字母 S；
// 附 shift 热区（与富文本 token 同协议 → Picker → 共享 tooltip）
function drawShiftBadge(ctx) {
  const S = 26;
  const x = CARD_FACE_SIZE.width - 8 - S;
  const y = CARD_FACE_SIZE.height - 8 - S;
  roundedRect(ctx, x, y, S, S, 5);
  ctx.fillStyle = 'rgba(10, 14, 24, 0.8)';
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#7ab8ff';
  ctx.stroke();
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#9ecdf7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', x + S / 2, y + S / 2 + 1);
  ctx.textAlign = 'left';
  return {
    type: 'shift',
    payload: { name: '按住 Shift 显示详细信息' },
    rect: { x, y, w: S, h: S },
  };
}
