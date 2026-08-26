import * as THREE from 'three';
import gsap from 'gsap';
import { isBossFloor } from '../../core/run/runFlow.js';
import { PlayerStatusObject, PLAYER_STATUS_POS } from '../objects/PlayerStatusObject.js';
import { renderRichTextBlock } from '../richtext/texture.js';
import { UnitArtCache } from '../art/unitArt.js';

// 战前准备/地图舞台（阶段 7 色块占位，RUN_DESIGN §8.8）：
// 夜空背景 + 点星 + 右侧塔楼侧视图（只看当前层附近一截——看不到顶底）+ 高亮当前层。
// uiScene pass 绘左下角玩家状态栏（与战斗内 PlayerStatusObject 同物同位）。
// 水彩素材与正式布局后补（§9）；本舞台只保证三阶段模型中"楼层切换"一极可跑通。
const VISIBLE_WINDOW = 11;      // 可视层数窗口
const FLOOR_GAP = 7;            // 层间纵向间距（世界单位）
const TOWER_X = 58;             // 塔楼横向位置（右侧）
const BOX_SIZE = { w: 14, h: 4.6, d: 10 };

export class MapStage {
  /**
   * @param {object} options
   *   totalFloors: 塔高（缺省 44）
   *   bakeLabel: 文本烘焙（缺省浏览器用 renderRichTextBlock，node 退化为 1x1 占位）
   */
  constructor({ totalFloors = 44, bakeLabel = null } = {}) {
    this.name = 'map';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1026); // 夜空
    this.uiScene = new THREE.Scene(); // UI pass：玩家状态栏（StageManager 清深度后二次渲染）
    this._tower = new THREE.Group();
    this._tower.position.set(TOWER_X, -15, -10);
    this.scene.add(this._tower);
    this._buildStars();

    // ---- 玩家状态栏（与战斗内共享 PlayerStatusObject，同位同尺寸）----
    this._bakeLabel = bakeLabel || defaultBakeLabel();
    this._statusBar = new PlayerStatusObject({ bakeLabel: this._bakeLabel });
    this._statusBar.position.set(PLAYER_STATUS_POS.x, PLAYER_STATUS_POS.y, PLAYER_STATUS_POS.z);
    this.uiScene.add(this._statusBar);
    this._unitArt = (typeof document !== 'undefined')
      ? new UnitArtCache({ onLoad: () => this._applyAvatar() })
      : null;
    this._applyAvatar();

    this._unsubTick = null;
    this.setFloor(1, totalFloors);
  }

  get statusBar() { return this._statusBar; }

  /**
   * 同步状态栏数值（run 层每次阶段迁移后由编排器调用）。
   * 战斗外 AP 恒满（战斗内才消耗）；魏启 = run 持久值；金币/瑞米同源于 run。
   */
  setStatus({ ap, apMax, mana, manaMax, money = null, remi = null }) {
    this._statusBar.apPips.setValue(ap, apMax);
    this._statusBar.manaPips.setValue(mana, manaMax);
    if (money !== null) this._statusBar.setMoney(money);
    if (remi) this._statusBar.setRemi(remi);
  }

  _applyAvatar() {
    const img = this._unitArt?.getFile('unit_player_front.png');
    if (img) this._statusBar.setAvatar(img);
  }

  // 帧驱动：资源点颜色渐变/弹跳过渡（与 BattleStage 同契约）
  onEnter(manager) {
    this._unsubTick?.();
    this._unsubTick = manager.onTick((dt) => {
      this._statusBar.apPips.update(dt);
      this._statusBar.manaPips.update(dt);
    });
  }

  onExit() {
    this._unsubTick?.();
    this._unsubTick = null;
  }

  dispose() {
    this.onExit();
    for (const child of [...this._tower.children]) { // 塔身层块（与 setFloor 重建同律）
      child.geometry.dispose();
      child.material.dispose();
      this._tower.remove(child);
    }
    this._stars?.geometry.dispose();
    this._stars?.material.dispose();
    this.scene.remove(this._stars);
    this._statusBar.dispose();
  }

  _buildStars() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 360;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 220;
      positions[i * 3 + 2] = -40 - Math.random() * 80;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaabbee, size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.85,
    }));
    this._stars = stars; // dispose 时释放（geometry + material）
    this.scene.add(stars);
  }

  // 重建塔身窗口：以当前层为中心的一截；当前层高亮，Boss 层红色调
  setFloor(floor, totalFloors) {
    for (const child of [...this._tower.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this._tower.remove(child);
    }
    const half = Math.floor(VISIBLE_WINDOW / 2);
    for (let f = floor - half; f <= floor + half; f++) {
      if (f < 1 || f > totalFloors) continue; // 看不到顶底 → 窗口外的层不画
      const isCurrent = f === floor;
      const color = isCurrent ? 0xffd75e : (isBossFloor(f) ? 0x8a3548 : 0x39456b);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(BOX_SIZE.w, BOX_SIZE.h, BOX_SIZE.d),
        new THREE.MeshBasicMaterial({ color }),
      );
      box.position.set(0, (floor - f) * FLOOR_GAP, 0);
      this._tower.add(box);
    }
  }

  // 塔楼抵达动画（S5 pilot）：黑幕 reveal 后当前层高亮块自下而上"长出"。
  // 由 run sequencer 指令驱动（onDone = 回执句柄）；duration 可缩（测试）
  arriveFloor(floor, totalFloors, { onDone = null, duration = 0.6 } = {}) {
    this.setFloor(floor, totalFloors); // 幂等落位（doSwap 已 setFloor 时等同重放）
    const current = this._tower.children.find(c => c.position.y === 0);
    if (!current) { onDone?.(); return; }
    current.scale.set(1, 0.01, 1);
    gsap.to(current.scale, {
      y: 1, duration, ease: 'back.out(2.2)',
      onComplete: onDone,
    });
  }
}

// 缺省文本烘焙：浏览器走 RichTextEngine（与 BattleStage 小字号同参数）；
// node 无 document 退化为 1x1 占位（与 ResourcePipsObject 缺省一致）
function defaultBakeLabel() {
  if (typeof document === 'undefined') return null;
  return (text) => renderRichTextBlock(text, {
    maxWidth: 220, scale: 3, style: { fontSize: 16, lineHeight: 20 },
  });
}
