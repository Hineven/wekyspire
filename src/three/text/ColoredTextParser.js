/**
 * ColoredTextParser - 彩色文本解析器
 *
 * 解析格式：
 * - {color}文本{/color} 或 /color{文本}
 * - /effect{效果名} - 嵌入效果图标
 * - /named{实体名} - 嵌入命名实体图标
 * - /skill{技能名} - 嵌入技能图标
 *
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
 * @returns {Array} - [{type: 'text'|'color'|'effect'|'named'|'skill', ...}, ...]
 */
export function parseColoredText(text) {
  const segments = [];

  // 正则表达式匹配所有标记
  const colorRegex = /\/(\w+)\{([^}]+)\}/g;  // /color{文本}
  const oldColorRegex = /\{(\w+)\}(.*?)\{\/\1\}/g;  // {color}文本{/color}
  const effectRegex = /\/effect\{([^}]+)\}/g;  // /effect{效果名}
  const namedRegex = /\/named\{([^}]+)\}/g;  // /named{实体名}
  const skillRegex = /\/skill\{([^}]+)\}/g;  // /skill{技能名}

  const allMatches = [];
  let match;

  // 匹配新格式颜色 /color{文本}
  while ((match = colorRegex.exec(text)) !== null) {
    const colorName = match[1].toLowerCase();
    // 跳过特殊标记
    if (['effect', 'named', 'skill'].includes(colorName)) continue;

    if (COLOR_MAP[colorName] !== undefined) {
      allMatches.push({
        index: match.index,
        lastIndex: colorRegex.lastIndex,
        type: 'color',
        text: match[2],
        color: COLOR_MAP[colorName]
      });
    }
  }

  // 匹配旧格式颜色 {color}文本{/color}
  oldColorRegex.lastIndex = 0;
  while ((match = oldColorRegex.exec(text)) !== null) {
    const colorName = match[1].toLowerCase();
    if (COLOR_MAP[colorName] !== undefined) {
      allMatches.push({
        index: match.index,
        lastIndex: oldColorRegex.lastIndex,
        type: 'color',
        text: match[2],
        color: COLOR_MAP[colorName]
      });
    }
  }

  // 匹配效果图标 /effect{效果名}
  effectRegex.lastIndex = 0;
  while ((match = effectRegex.exec(text)) !== null) {
    allMatches.push({
      index: match.index,
      lastIndex: effectRegex.lastIndex,
      type: 'effect',
      effectName: match[1]
    });
  }

  // 匹配命名实体 /named{实体名}
  namedRegex.lastIndex = 0;
  while ((match = namedRegex.exec(text)) !== null) {
    allMatches.push({
      index: match.index,
      lastIndex: namedRegex.lastIndex,
      type: 'named',
      entityName: match[1]
    });
  }

  // 匹配技能图标 /skill{技能名+N/-N}
  skillRegex.lastIndex = 0;
  while ((match = skillRegex.exec(text)) !== null) {
    const raw = match[1].trim();
    let skillName = raw;
    let powerDelta = 0;

    // 捕获末尾的 +N 或 -N
    const powerMatch = raw.match(/^(.*?)([+-]\d+)$/);
    if (powerMatch) {
      skillName = powerMatch[1].trim();
      powerDelta = parseInt(powerMatch[2], 10) || 0;
    }

    allMatches.push({
      index: match.index,
      lastIndex: skillRegex.lastIndex,
      type: 'skill',
      skillName,
      powerDelta
    });
  }

  // 按位置排序所有匹配
  allMatches.sort((a, b) => a.index - b.index);

  // 构建最终的段落数组
  let lastIndex = 0;
  for (const cur of allMatches) {
    // 添加匹配前的普通文本
    if (cur.index > lastIndex) {
      const plainText = text.substring(lastIndex, cur.index);
      if (plainText) {
        segments.push({
          type: 'text',
          text: plainText,
          color: 0xffffff
        });
      }
    }

    // 添加当前匹配
    segments.push(cur);
    lastIndex = cur.lastIndex;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      segments.push({
        type: 'text',
        text: remainingText,
        color: 0xffffff
      });
    }
  }

  // 如果没有任何匹配，返回整个文本
  if (segments.length === 0) {
    segments.push({
      type: 'text',
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

