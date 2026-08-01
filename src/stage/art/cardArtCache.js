// 卡面图案缓存（§4 卡图链路）：技能卡插画 → 已加载 Image 的同步查询。
// 解析规则（沿用旧仓库约定）：
//   1. def.image（技能定义显式指定，不含扩展名，如 image:'奇迹' → assets/cards/奇迹.png）
//   2. 兜底 `${type}-${tierIndex}.png`（type=fire/wood…，tierIndex D=0..S=4，素材如 fire-1.png）
//   3. 都没有 → 无卡图（牌面按无图布局）
// 加载是异步的：get() 未命中即发起加载并先返回 null（按无图烘焙），
// 加载完成经 onLoad 回调通知 Stage 重烘牌面（纹理与 hit map 成对替换的铁律不变）。

// vite 静态收集素材 URL（filename → url）
const ART_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/cards/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.split('/').pop(), url]),
);

const TIER_ART_INDEX = Object.freeze({ D: 0, C: 1, B: 2, A: 3, S: 4 });

export class CardArtCache {
  /** @param {object} options  onLoad(url): 某张图加载完成（Stage 借此触发重烘） */
  constructor({ onLoad = null } = {}) {
    this._cache = new Map(); // url -> HTMLImageElement | 'loading' | 'error'
    this._onLoad = onLoad;
  }

  /** 该卡是否有可用素材（同步，不发起加载）。 */
  resolveUrl(card) {
    const file = card.image
      ? `${card.image}.png`
      : `${card.type ?? 'normal'}-${TIER_ART_INDEX[card.tier] ?? 0}.png`;
    return ART_URLS[file] ?? null;
  }

  /**
   * 同步取图：已加载 → HTMLImageElement；未加载 → 发起加载并返回 null。
   * @param {object} card  projectCardFull 视图（image/type/tier）
   */
  get(card) {
    const url = this.resolveUrl(card);
    if (!url) return null;
    const hit = this._cache.get(url);
    if (hit && hit !== 'loading' && hit !== 'error') return hit;
    if (hit === undefined) this._load(url);
    return null;
  }

  _load(url) {
    this._cache.set(url, 'loading');
    const img = new Image();
    img.onload = () => {
      this._cache.set(url, img);
      this._onLoad?.(url);
    };
    img.onerror = () => this._cache.set(url, 'error');
    img.src = url;
  }
}
