// 立牌素材映射与缓存：defId/side → assets/stage/*.png。
// 与 CardArtCache 同模式：get() 未命中即发起异步加载并先返回 null（占位色块），
// 加载完成经 onLoad 通知 Stage 补挂纹理（立牌纹理不带 hit map，无成对替换问题）。
//
// 视角约定（STAGE_DESIGN §0 用户手绘稿）：友军（玩家/队友）背对屏幕，敌军正对屏幕。
//   unit_xxx.png      = 舞台用图（友军=背视图，敌军=正视图）
//   unit_xxx_front.png = 正视图备用（幕间/图鉴等 UI 场景）

const ART_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../../assets/stage/*.png', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.split('/').pop(), url]),
);

// defId → 立牌文件名；玩家（side==='player'）无 defId，固定 unit_player.png
const UNIT_ART_FILES = Object.freeze({
  remi: 'unit_remi.png',
  slime: 'unit_slime.png',
  pyro: 'unit_warlock.png',
});

// 立牌相对高度系数（基准身高 26 世界单位 × baseScale）：
// 按角色体格调，不按图片像素——图已被抠图裁边，像素高≈角色高
const UNIT_HEIGHT_FACTOR = Object.freeze({
  player: 0.92,
  remi: 0.62,
  slime: 0.6,
  pyro: 0.85,
});

export const STANDEE_BASE_HEIGHT = 26; // 世界单位（scale=1 时）

export function unitHeightFactor(defId, side) {
  if (side === 'player') return UNIT_HEIGHT_FACTOR.player;
  return UNIT_HEIGHT_FACTOR[defId] ?? 0.9;
}

export class UnitArtCache {
  /** @param {object} options  onLoad(url): 某张立牌加载完成（Stage 借此补挂纹理） */
  constructor({ onLoad = null } = {}) {
    this._cache = new Map(); // url -> HTMLImageElement | 'loading' | 'error'
    this._onLoad = onLoad;
  }

  resolveUrl(defId, side) {
    const file = side === 'player' ? 'unit_player.png' : UNIT_ART_FILES[defId];
    return file ? (ART_URLS[file] ?? null) : null;
  }

  /**
   * 同步取图：已加载 → HTMLImageElement；未加载 → 发起加载并返回 null；无素材 → null。
   */
  get(defId, side) {
    const url = this.resolveUrl(defId, side);
    return url ? this._getByUrl(url) : null;
  }

  /** 按文件名直接取图（如 'unit_player_front.png' 头像正视图），加载语义同 get()。 */
  getFile(file) {
    const url = ART_URLS[file] ?? null;
    return url ? this._getByUrl(url) : null;
  }

  _getByUrl(url) {
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
