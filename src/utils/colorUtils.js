export function adjustColorBrightness(color, percent) {
  let hex = color.replace(/#/g, '');
  if (hex.length !== 6) throw new Error('无效的颜色格式，请使用6位十六进制颜色，如"#AACC12"');
  let r = parseInt(hex.substring(0, 2), 16);
  let g = parseInt(hex.substring(2, 4), 16);
  let b = parseInt(hex.substring(4, 6), 16);
  const factor = percent / 100;
  r = Math.round(r + (255 - r) * factor);
  g = Math.round(g + (255 - g) * factor);
  b = Math.round(b + (255 - b) * factor);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  const toHex = (c) => { const h = c.toString(16); return h.length === 1 ? '0' + h : h; };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}