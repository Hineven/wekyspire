// UnitObject（STAGE_DESIGN §3）：场景内的一个单位（玩家/敌人/队友）——2.5D 立牌。
// 结构：Group（位置/缩放由 BattleStage 按战线轴槽位设置，animator 补间作用于整组）
//   ├─ shadow:  引擎画椭圆，平贴地板不动（仿射/billboard 都不打在它身上）
//   ├─ billboard: 立牌形 billboard 子组（faceCamera 逐帧 yaw 转向相机，立面保持垂直地面）
//   │   ├─ standee: 立牌子组（呼吸/受击等仿射只作用在这里）
//   │   │   └─ body: PlaneGeometry，**底部锚定**（position.y = h/2），纹理=抠图 PNG，
//   │   │            无图回退 side 配色色块
//   │   ├─ hpBar:   底槽 + 填充条（左锚定）+ 数字文本（"20/60 盾5"）
//   │   └─ fxAnchor: 头侧效果图标锚点（overlay 后续批次，先留位）
//   └─ ring:    目标标注金环（平贴地板）
// 极简状态机（idle 呼吸 / hurt 抖动红闪 / dead 倒地）由 update(dt) + BattleStage 节拍驱动。
// 文本签名不变不重烘。

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
    this._hasArt = false;

    // 地面阴影：压扁椭圆平贴地板（水平面），半透明涂鸦黑；仿射动效不打在它身上
    this._shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: 0x0a0a12, transparent: true, opacity: 0.45, depthWrite: false, fog: false }),
    );
    this._shadow.name = 'shadow';
    this._shadow.rotation.x = -Math.PI / 2; // 平贴地面（local y → world z 纵深）
    this._shadow.position.y = 0.15;         // 抬离地板防 z-fight
    this._shadow.scale.set(standeeHeight * 0.32, standeeHeight * 0.1, 1);
    this.add(this._shadow);

    // billboard 子组：standee/hpBar/fxAnchor 全部挂进来，faceCamera 逐帧水平转向相机
    // （立牌形/圆柱 billboard，只 yaw——斜视下立牌不转正会被透视压斜；
    // 立面保持垂直地面，球面 pitch 后仰已弃；阴影/金环贴地不参与）
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
    this._hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(HP_BAR_WIDTH, HP_BAR_HEIGHT),
      new THREE.MeshBasicMaterial({ color: 0x14161e, transparent: true, opacity: 0.85, fog: false }),
    );
    this._hpBar.add(this._hpBg);
    this._hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(HP_BAR_WIDTH, HP_BAR_HEIGHT - 0.4),
      new THREE.MeshBasicMaterial({ color: HP_FILL_COLORS[side] ?? 0x4ade80, fog: false }),
    );
    this._hpFill.position.z = 0.05;
    this._hpBar.add(this._hpFill);
    this._labelMaterial = new THREE.MeshBasicMaterial({ alphaTest: 0.5, fog: false }); // 同 body：二值 mask，不写假深度
    this._label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._labelMaterial);
    this._label.position.z = 0.05;
    this._hpBar.add(this._label);

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
    this._shadow.scale.set(this._standeeHeight * aspect * 0.5, this._standeeHeight * 0.1, 1);
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

    // 数字文本：HP 比 + 盾；效果层数临时以文本附带（图标 overlay 后续批次）
    let text = `${projection.hp}/${projection.maxHp}`;
    if (projection.shield > 0) text += ` 盾${projection.shield}`;
    if (projection.effects?.length) {
      text += `\n${projection.effects.map(e => `${e.effectId}x${e.stacks}`).join(' ')}`;
    }
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

  /**
   * 立牌形（圆柱）billboard：只转 yaw 让牌面水平朝向相机，立面保持与地面垂直
   * （球面 billboard 的 pitch 后仰视觉上像"纸片倒下"，已弃——用户定）。
   * 相机静止时每帧结果相同，代价可忽略；阴影/金环贴地不参与。
   * @param {THREE.Vector3|{x,y,z}} camPos 相机世界坐标
   */
  faceCamera(camPos) {
    this._billboard.rotation.y = Math.atan2(camPos.x - this.position.x, camPos.z - this.position.z);
  }

  /** 帧驱动：idle 呼吸（仅 scaleY 微振，死亡即停）+ 闪红窗口衰减。 */
  update(dt) {
    if (this._flashT > 0) this._flashT -= dt;
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

  /** 目标标注高亮（拖牌指定目标时）：地面金环（平贴地板，与阴影同语言）。 */
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
      const rx = this._shadow.scale.x;
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
    this._shadow.geometry.dispose();
    this._shadow.material.dispose();
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
  }
}

function defaultBakeLabel() {
  const texture = new THREE.Texture({ width: 1, height: 1 });
  texture.needsUpdate = true;
  return { texture, width: 1, height: 1 };
}
