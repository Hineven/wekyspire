/**
 * ColoredTextParser - 彩色文本解析器
 *
 * 解析格式：{color}文本{/color}
 * 支持的颜色：red, blue, green, yellow, white, gray, orange, purple
 */

const COLOR_MAP = {
  red: 0xff0000,
  blue: 0x0000ff,
  green: 0x00ff00,
  yellow: 0xffff00,
  white: 0xffffff,
  gray: 0x888888,
  grey: 0x888888,
  orange: 0xffa500,
  purple: 0x800080,
  black: 0x000000,
  cyan: 0x00ffff,
  magenta: 0xff00ff,
  gold: 0xffd700,
  silver: 0xc0c0c0
};

/**
 * 解析彩色文本标记
 * @param {string} text - 带标记的文本
 * @returns {Array} - [{text, color}, ...]
 */
export function parseColoredText(text) {
  const segments = [];
  const regex = /\{(\w+)\}(.*?)\{\/\1\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 添加标记之前的普通文本
    if (match.index > lastIndex) {
      const plainText = text.substring(lastIndex, match.index);
      if (plainText) {
        segments.push({
          text: plainText,
          color: 0xffffff // 默认白色
        });
      }
    }

    // 添加彩色文本
    const colorName = match[1].toLowerCase();
    const colorText = match[2];
    const colorValue = COLOR_MAP[colorName] !== undefined ? COLOR_MAP[colorName] : 0xffffff;

    segments.push({
      text: colorText,
      color: colorValue
    });

    lastIndex = regex.lastIndex;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      segments.push({
        text: remainingText,
        color: 0xffffff
      });
    }
  }

  // 如果没有任何匹配，返回整个文本
  if (segments.length === 0) {
    segments.push({
      text: text,
      color: 0xffffff
    });
  }

  return segments;
}

/**
 * 将颜色名称转为十六进制
 * @param {string} colorName - 颜色名称
 * @returns {number}
 */
export function colorNameToHex(colorName) {
  if (typeof colorName === 'number') {
    return colorName;
  }
  return COLOR_MAP[colorName.toLowerCase()] || 0xffffff;
}

export default {
  parseColoredText,
  colorNameToHex,
  COLOR_MAP
};

