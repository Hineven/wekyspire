// UnitObject（STAGE_DESIGN §3）：场景内的一个单位（玩家/敌人/队友）——2.5D 立牌。
// 结构：Group（位置/缩放由 BattleStage 按战线轴槽位设置，animator 补间作用于整组）
//   ├─ billboard: 立牌形 billboard 子组（faceCamera 逐帧 yaw 转向相机，立面保持垂直地面）
//   │   ├─ standee: 立牌子组（呼吸/受击等仿射只作用在这里）
//   │   │   └─ body: PlaneGeometry，**底部锚定**（position.y = h/2），纹理=抠图 PNG，
//   │   │            无图回退 side 配色色块
//   │   ├─ hpBar:   底槽 + 填充条（左锚定）+ 数字文本（"20/60"）
//   │   │   ├─ shieldGroup: 护盾层（shield>0 时可见）——蓝色保护框包裹血条
//   │   │   │  + 左侧盾徽数值 chip（数值变更时放缩跳动，牌库脉冲同语言）
//   │   │   └─ fxRows: 血条上方左对齐效果行（icon + 特征色名称 + 层数，
//   │   │      buff 层数绿 / debuff 层数红；行网格带 userData.effectRow，
//   │   │      Picker 二级查询返回 token 命中 → tooltip 协议与卡面热区同构）
//   │   └─ fxAnchor: 头侧效果图标锚点（overlay 后续批次，先留位）
//   └─ ring:    目标标注金环（平贴地板）
// 极简状态机（idle 呼吸 / hurt 抖动红闪 / dead 倒地）由 update(dt) + BattleStage 节拍驱动。
// 文本签名不变不重烘。
// 状态绘制（hpBar 全家 + 护盾层）一律 depthTest:false + 显式 renderOrder(60+)：
// 场景可遮蔽立牌（合理）但不可遮蔽状态（用户定）；卡牌 UI 是独立 pass 天然在其上。

import * as THREE from 'three';

const SIDE_COLORS = Object.freeze({
  player: 0x4a6fa5,
  enemy: 0xa54a4a,
  ally: 0x4aa56e,
});
const HP_FILL_COLORS = Object.freeze({
  player: 0x4ade80,
  ally: 0x4ade80,
  enemy: 0xe85a5a,
});

const HP_BAR_WIDTH = 12;
const HP_BAR_HEIGHT = 1.5;
const SHIELD_FRAME_PAD = 0.45;  // 保护框相对血条的外扩
const SHIELD_FRAME_COLOR = 0x5aa8ff;
const SHIELD_POP_DUR = 0.28;    // 数值变更放缩跳动时长（牌库脉冲同语言）
// 效果行（血条上方）：行距、背板横向外扩、背板颜色
const FX_ROW_GAP = 0.4;
const FX_ROW_PAD = 0.55;
const FX_ROW_BG = 0x0a0c14;
// 状态绘制（HP 条/护盾框/盾徽/数字）的 renderOrder 基值：场景(0)之上、粒子(70/71)之下；
// 卡牌等 UI 是独立 uiScene pass（清深度后渲染），天然在其上方
const STATUS_RENDER_ORDER = 60;
// 状态件"浮在场景上方"：关深度测试（不被柱子/地板/立牌遮挡），不写深度
// （不污染体积光 RT 深度），renderOrder 显式排层（depthTest 关闭后只能靠 painter 序）
function statusify(mesh, order) {
  mesh.renderOrder = STATUS_RENDER_ORDER + order;
  mesh.material.depthTest = false;
  mesh.material.depthWrite = false;
  return mesh;
}

export class UnitObject extends THREE.Group {
  /**
   * @param {object} options
   *   uniqueID, side: 'player'|'enemy'|'ally'
   *   standeeHeight: 立牌世界高度（scale=1 时，含体型系数，缺省 22）
   *   bakeLabel: (text) => { texture, width, height }   文本烘焙（缺省 1x1 占位）
   *   pixelsPerWorld: 烘焙像素 → 世界单位换算（默认 10，与牌面同约定）
   */
  constructor(options) {
    super();
    const { uniqueID, side, standeeHeight = 22, bakeLabel = null, pixelsPerWorld = 10 } = options;
    this.uniqueID = uniqueID;
    this.side = side;
    this._bakeLabel = bakeLabel || defaultBakeLabel;
    this._ppw = pixelsPerWorld;
    this._standeeHeight = standeeHeight;
    this._groundRadius = standeeHeight * 0.32; // 金环横向半径（setArt 后随牌面加宽）
    this._hasArt = false;
    this._shield = undefined; // undefined=尚未 setUnit（首帧不播跳动）

    // billboard 子组：standee/hpBar/fxAnchor 全部挂进来，faceCamera 逐帧水平转向相机
    // （立牌形/圆柱 billboard，只 yaw——斜视下立牌不转正会被透视压斜；
    // 立面保持垂直地面，球面 pitch 后仰已弃；金环贴地不参与）
    this._billboard = new THREE.Group();
    this._billboard.name = 'billboard';
    this._billboard.rotation.order = 'YXZ';
    this.add(this._billboard);

    // 立牌（底部锚定）：仿射动效只作用在 standee 子组
    this._standee = new THREE.Group();
    this._standee.name = 'standee';
    this._billboard.add(this._standee);
    const w0 = standeeHeight * 0.72;
    this._body = new THREE.Mesh(
      new THREE.PlaneGeometry(w0, standeeHeight),
      // 二值 mask（alphaTest discard），不做 semi-transparency：
      // 全透明像素也写深度会污染深度缓冲（体积光 RT 深度被立牌矩形截断、后方物体被误挡）
      new THREE.MeshBasicMaterial({ color: SIDE_COLORS[side] ?? 0x888888, alphaTest: 0.5, fog: false }),
    );
    this._body.name = 'body';
    this._body.position.y = standeeHeight / 2;
    // 立牌投影（用户定）：alphaTest 剪影在月光下拉出单位形地面影；
    // three 深度材质支持 map+alphaTest，透明区不会投出矩形假影
    this._body.castShadow = true;
    this._standee.add(this._body);

    // HP 条：底槽 + 左锚定填充 + 数字文本，叠在脚踝前方（脚底=地板，旧稿"站台下方"
    // 在真 3D 地板下会被地面裁掉，故上移叠腿前，z 微抬避免与立牌 z-fight）
    this._hpBar = new THREE.Group();
    this._hpBar.name = 'hpBar';
    this._hpBar.position.set(0, 3.4, 0.6);
    this._billboard.add(this._hpBar);
    this._hpBg = statusify(new THREE.Mesh(
      new THREE.PlaneGeometry(HP_BAR_WIDTH, HP_BAR_HEIGHT),
      new THREE.MeshBasicMaterial({ color: 0x14161e, transparent: true, opacity: 0.85, fog: false }),
    ), 1);
    this._hpBar.add(this._hpBg);
    this._hpFill = statusify(new THREE.Mesh(
      new THREE.PlaneGeometry(HP_BAR_WIDTH, HP_BAR_HEIGHT - 0.4),
      new THREE.MeshBasicMaterial({ color: HP_FILL_COLORS[side] ?? 0x4ade80, fog: false }),
    ), 2);
    this._hpFill.position.z = 0.05;
    this._hpBar.add(this._hpFill);
    // 文本用真 alpha 混合而非 alphaTest 二值 mask：canvas 烘焙的 AA alpha 渐变被
    // 二值化丢弃会产生阶梯锯齿；状态层本就 depthTest/Write 关闭 + 显式 renderOrder
    // （painter 序确定），混合是安全的。standee 立牌在世界内吃深度，仍用 alphaTest
    this._labelMaterial = new THREE.MeshBasicMaterial({ transparent: true, fog: false });
    this._label = statusify(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._labelMaterial), 3);
    this._label.position.z = 0.05;
    this._hpBar.add(this._label);

    // ---- 护盾层（shield>0 可见）----
    // ① 蓝色保护框：微蓝背板 + 四细条边框包裹血条；② 左侧盾徽数值 chip
    this._shieldGroup = new THREE.Group();
    this._shieldGroup.name = 'shieldGroup';
    this._shieldGroup.visible = false;
    this._hpBar.add(this._shieldGroup);
    const fw = HP_BAR_WIDTH + SHIELD_FRAME_PAD * 2;
    const fh = HP_BAR_HEIGHT + SHIELD_FRAME_PAD * 2;
    const ft = 0.32; // 边框厚度
    this._shieldFrame = [];
    const frameMat = () => new THREE.MeshBasicMaterial({
      color: SHIELD_FRAME_COLOR, transparent: true, opacity: 0.95, depthWrite: false, fog: false,
    });
    const backfill = statusify(new THREE.Mesh(
      new THREE.PlaneGeometry(fw, fh),
      new THREE.MeshBasicMaterial({ color: SHIELD_FRAME_COLOR, transparent: true, opacity: 0.16, depthWrite: false, fog: false }),
    ), 0);
    backfill.position.z = -0.02;
    this._shieldGroup.add(backfill);
    this._shieldFrame.push(backfill);
    const bars = [
      { w: fw, h: ft, x: 0, y: fh / 2 - ft / 2 },   // 上
      { w: fw, h: ft, x: 0, y: -(fh / 2 - ft / 2) }, // 下
      { w: ft, h: fh, x: -(fw / 2 - ft / 2), y: 0 }, // 左
      { w: ft, h: fh, x: fw / 2 - ft / 2, y: 0 },    // 右
    ];
    for (const b of bars) {
      const bar = statusify(new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), frameMat()), 2);
      bar.position.set(b.x, b.y, 0.03);
      this._shieldGroup.add(bar);
      this._shieldFrame.push(bar);
    }
    // 盾徽数值 chip（放缩跳动作用于整 chip，与牌库脉冲同语言）
    this._shieldChip = new THREE.Group();
    this._shieldChip.name = 'shieldChip';
    this._shieldChip.position.set(-(HP_BAR_WIDTH / 2 + 1.7), 0, 0.1);
    this._shieldGroup.add(this._shieldChip);
    this._shieldIconMaterial = new THREE.MeshBasicMaterial({ transparent: true, fog: false });
    this._shieldIconMaterial.map = shieldIconTexture();
    const icon = statusify(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), this._shieldIconMaterial), 3);
    this._shieldChip.add(icon);
    this._shieldLabelMaterial = new THREE.MeshBasicMaterial({ transparent: true, fog: false });
    this._shieldLabel = statusify(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._shieldLabelMaterial), 4);
    this._shieldChip.add(this._shieldLabel);
    this._shieldPopT = 0;

    // 效果行（血条上方左对齐纵列）：投影 effects 签名驱动重建
    this._fxRows = [];
    this._fxSig = null;

    // 效果图标锚点（overlay 后续批次）
    this.fxAnchor = new THREE.Object3D();
    this.fxAnchor.position.set(standeeHeight * 0.4, standeeHeight * 0.8, 0);
    this._billboard.add(this.fxAnchor);

    this._breathT = Math.random() * Math.PI * 2; // 相位随机，避免全场同步呼吸
    this._dead = false;
    this._signature = null;
    this._lightTint = new THREE.Color(0xffffff); // 场景灯光染色（sampleStandeeTint 逐帧供给）
    this._flashT = 0;                            // 受击闪红剩余窗口（染色不覆盖闪红）
  }

  /** 立牌纹理挂载（异步到图后调用）：替换占位色块，按图片纵横比重排平面。 */
  setArt(img) {
    const aspect = img.naturalWidth / img.naturalHeight;
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    const old = this._body.material.map;
    this._body.material.map = texture;
    this._body.material.color.set(0xffffff);
    this._body.material.needsUpdate = true;
    old?.dispose?.();
    this._body.geometry.dispose();
    this._body.geometry = new THREE.PlaneGeometry(this._standeeHeight * aspect, this._standeeHeight);
    this._groundRadius = this._standeeHeight * aspect * 0.5;
    this._hasArt = true;
  }

  get hasArt() { return this._hasArt; }

  /** 单位投影更新：签名变化才重烘文本/重排血条。 */
  setUnit(projection) {
    const sig = JSON.stringify({
      hp: projection.hp, max: projection.maxHp,
      sh: projection.shield, dead: projection.isDead, ef: projection.effects,
    });
    if (sig === this._signature) return false;
    this._signature = sig;
    this._dead = projection.isDead;

    // 数字文本：HP 比。效果有独立效果行（血条上方 fxRows），不再附文本后缀
    const text = `${projection.hp}/${projection.maxHp}`;
    const { texture, width, height } = this._bakeLabel(text);
    const old = this._labelMaterial.map;
    this._labelMaterial.map = texture;
    this._labelMaterial.needsUpdate = true;
    old?.dispose?.();
    const w = width / this._ppw;
    const h = height / this._ppw;
    this._label.geometry.dispose();
    this._label.geometry = new THREE.PlaneGeometry(w, h);
    this._label.position.y = Math.max(
      -(HP_BAR_HEIGHT / 2 + h / 2 + 0.5),
      h / 2 - 3.1, // 钳住不沉进地板（hpBar 在脚底上方 3.4，标签底至少离地 0.3）
    );

    // 护盾层：>0 可见；数值变更重烘 chip 文本 + 放缩跳动。
    // 破碎碎粒不在此检测——自然消失（回合开始清零）与被打破（伤害吸收）在此无法区分，
    // 碎粒由 BattleStage 的伤害节拍按 shieldAbsorbed 驱动；此处只负责随 sync 显隐
    const prev = this._shield;
    const sh = projection.shield ?? 0;
    this._shield = sh;
    this._shieldGroup.visible = sh > 0 && !projection.isDead;
    if (prev !== undefined && sh !== prev && sh > 0) this._shieldPopT = SHIELD_POP_DUR;
    if (sh > 0 && sh !== this._shieldBaked) {
      this._rebakeShieldLabel(sh);
      this._shieldBaked = sh; // 值不变不重烘（hp 变化也会过签名）
    }

    // 效果行（血条上方左对齐纵列）：签名驱动整列重建
    this._syncEffectRows(projection.effects ?? []);

    // 填充条：左锚定按比例缩短
    const ratio = projection.maxHp > 0 ? Math.max(0, projection.hp / projection.maxHp) : 0;
    this._hpFill.scale.x = Math.max(ratio, 0.001);
    this._hpFill.position.x = -HP_BAR_WIDTH / 2 + (HP_BAR_WIDTH * ratio) / 2;
    this._hpFill.material.color.set(
      projection.isDead ? 0x444444 : (HP_FILL_COLORS[this.side] ?? 0x4ade80));
    if (!this._hasArt) {
      this._body.material.color.set(
        projection.isDead ? 0x333333 : (SIDE_COLORS[this.side] ?? 0x888888));
    }
    return true;
  }

  /** 盾徽数值重烘：文本变才动（setUnit 签名已过滤）；左锚定接在盾徽右侧。 */
  _rebakeShieldLabel(sh) {
    const { texture, width, height } = this._bakeLabel(`${sh}`);
    const old = this._shieldLabelMaterial.map;
    this._shieldLabelMaterial.map = texture;
    this._shieldLabelMaterial.needsUpdate = true;
    old?.dispose?.();
    const w = width / this._ppw;
    const h = height / this._ppw;
    this._shieldLabel.geometry.dispose();
    this._shieldLabel.geometry = new THREE.PlaneGeometry(w, h);
    this._shieldLabel.position.set(1.1 + 0.35 + w / 2, 0, 0); // 盾徽右缘 + 间隙 + 半宽（左锚定）
  }

  /**
   * 效果行重建（签名驱动）：血条上方左对齐纵列，每行 = 暗背板 + 烘焙文本
   * （icon + 特征色名称 + 层数，buff 层数绿 / debuff 层数红）。
   * 行网格带 userData.effectRow（{ type:'effect', payload:{ name } }，与卡面热区
   * hitRegion 同构）——Picker 二级查询返回 token 命中，tooltip 走既有 tooltip:* 协议。
   */
  _syncEffectRows(effects) {
    const sig = JSON.stringify(effects);
    if (sig === this._fxSig) return;
    this._fxSig = sig;
    this._clearEffectRows();
    let y = HP_BAR_HEIGHT / 2 + FX_ROW_GAP; // 第一行背板底缘
    for (const e of effects) {
      const { texture, width, height } = this._bakeLabel(effectRowMarkup(e));
      const w = width / this._ppw;
      const h = height / this._ppw;
      const bw = w + FX_ROW_PAD * 2;
      const bh = h + 0.5;
      const row = new THREE.Group();
      row.name = `fx:${e.effectId}`;
      const pick = { type: 'effect', payload: { name: e.name } };
      const bg = statusify(new THREE.Mesh(
        new THREE.PlaneGeometry(bw, bh),
        new THREE.MeshBasicMaterial({ color: FX_ROW_BG, transparent: true, opacity: 0.62, depthWrite: false, fog: false }),
      ), 5);
      bg.userData.effectRow = pick;
      const textMesh = statusify(new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, fog: false }), // 真 alpha 混合保 AA（同主标签）
      ), 6);
      textMesh.position.z = 0.02;
      textMesh.userData.effectRow = pick;
      row.add(bg, textMesh);
      // 左对齐：背板左缘对齐血条左缘；行自下而上堆叠（第一个效果最贴近血条）
      row.position.set(-HP_BAR_WIDTH / 2 + bw / 2, y + bh / 2, 0.1);
      this._hpBar.add(row);
      this._fxRows.push(row);
      y += bh + FX_ROW_GAP;
    }
  }

  _clearEffectRows() {
    for (const row of this._fxRows) {
      for (const mesh of row.children) {
        mesh.geometry.dispose();
        mesh.material.map?.dispose?.();
        mesh.material.dispose();
      }
      this._hpBar.remove(row);
    }
    this._fxRows = [];
  }

  /**
   * 立牌形（圆柱）billboard：只转 yaw 让牌面水平朝向相机，立面保持与地面垂直
   * （球面 billboard 的 pitch 后仰视觉上像"纸片倒下"，已弃——用户定）。
   * 相机静止时每帧结果相同，代价可忽略；金环贴地不参与。
   * @param {THREE.Vector3|{x,y,z}} camDir 相机方向向量
   */
  faceCamera(camDir) {
    this._billboard.rotation.y = Math.atan2(camDir.x, camDir.z);
  }

  /** 帧驱动：idle 呼吸（仅 scaleY 微振，死亡即停）+ 闪红窗口衰减 + 盾徽数值跳动衰减。 */
  update(dt) {
    if (this._flashT > 0) this._flashT -= dt;
    if (this._shieldPopT > 0) {
      this._shieldPopT -= dt;
      const k = Math.max(this._shieldPopT, 0) / SHIELD_POP_DUR; // 1→0 线性衰减
      const s = 1 + 0.45 * k;
      this._shieldChip.scale.set(s, s, 1);
    }
    if (this._dead) return;
    this._breathT += dt * 2.2;
    this._standee.scale.y = 1 + 0.02 * Math.sin(this._breathT);
  }

  /** 场景灯光染色（有立牌图才生效；闪红窗口内只记录不覆盖）。 */
  applyLightTint(color) {
    this._lightTint.copy(color);
    if (this._hasArt && this._flashT <= 0) this._body.material.color.copy(color);
  }

  flash(color = 0xff4444) {
    this._flashT = 0.28;
    this._body.material.color.set(color);
  }

  restoreColor() {
    this._flashT = 0;
    if (this._hasArt) this._body.material.color.copy(this._lightTint);
    else this._body.material.color.set(SIDE_COLORS[this.side] ?? 0x888888);
  }

  /** 目标标注高亮（拖牌指定目标时）：地面金环（平贴地板）。 */
  setHighlight(on) {
    if (on === !!this._ring) return;
    if (on) {
      this._ring = new THREE.Mesh(
        new THREE.CircleGeometry(1, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffd34c, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      const rx = this._groundRadius;
      this._ring.rotation.x = -Math.PI / 2;
      this._ring.position.y = 0.25;
      this._ring.scale.set(rx * 1.3, this._standeeHeight * 0.14, 1);
      this.add(this._ring);
    } else {
      this.remove(this._ring);
      this._ring.geometry.dispose();
      this._ring.material.dispose();
      this._ring = null;
    }
  }

  get highlighted() { return !!this._ring; }

  dispose() {
    this.setHighlight(false);
    this._clearEffectRows();
    this._body.geometry.dispose();
    this._body.material.map?.dispose?.();
    this._body.material.dispose();
    this._hpBg.geometry.dispose();
    this._hpBg.material.dispose();
    this._hpFill.geometry.dispose();
    this._hpFill.material.dispose();
    this._label.geometry.dispose();
    this._labelMaterial.map?.dispose?.();
    this._labelMaterial.dispose();
    for (const piece of this._shieldFrame) {
      piece.geometry.dispose();
      piece.material.dispose();
    }
    this._shieldIconMaterial.dispose(); // 图标纹理全局共享，不销毁
    this._shieldLabel.geometry.dispose();
    this._shieldLabelMaterial.map?.dispose?.();
    this._shieldLabelMaterial.dispose();
  }
}

// 盾徽纹理：全局共享一份（多单位复用），canvas 程序化绘制——圆顶尖底盾形 +
// 浅蓝描边 + 左上高光弧；非浏览器（单测）退化 1x1 占位
let _shieldIconTexture = null;
function shieldIconTexture() {
  if (_shieldIconTexture) return _shieldIconTexture;
  if (typeof document === 'undefined') {
    _shieldIconTexture = new THREE.Texture({ width: 1, height: 1 });
    _shieldIconTexture.needsUpdate = true;
    return _shieldIconTexture;
  }
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 70;
  const ctx = c.getContext('2d');
  // 盾形：圆顶 + 两侧弧收 + 尖底
  ctx.beginPath();
  ctx.moveTo(32, 5);
  ctx.quadraticCurveTo(46, 9, 56, 14);
  ctx.quadraticCurveTo(58, 44, 32, 66);
  ctx.quadraticCurveTo(6, 44, 8, 14);
  ctx.quadraticCurveTo(18, 9, 32, 5);
  ctx.closePath();
  ctx.fillStyle = '#3d7bd6';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#d6e8ff';
  ctx.stroke();
  // 左上高光弧（涂鸦感一笔）
  ctx.beginPath();
  ctx.moveTo(18, 16);
  ctx.quadraticCurveTo(26, 11, 36, 11);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(235,244,255,0.85)';
  ctx.lineCap = 'round';
  ctx.stroke();
  _shieldIconTexture = new THREE.Texture(c);
  _shieldIconTexture.needsUpdate = true;
  _shieldIconTexture.colorSpace = THREE.SRGBColorSpace;
  return _shieldIconTexture;
}

// 效果行 markup：icon（emoji 文本）+ 特征色名称 + 层数（buff 绿 / debuff 红）。
// 颜色走 richtext 颜色名语法（/red{...}），效果定义的 color 字段即颜色名
function effectRowMarkup(e) {
  const icon = e.icon ? `${e.icon} ` : '';
  const name = e.color ? `/${e.color}{${e.name}}` : `${e.name}`;
  const stackColor = e.type === 'debuff' ? 'red' : 'green';
  return `${icon}${name} /${stackColor}{ ${e.stacks}}`;
}

function defaultBakeLabel() {
  const texture = new THREE.Texture({ width: 1, height: 1 });
  texture.needsUpdate = true;
  return { texture, width: 1, height: 1 };
}
