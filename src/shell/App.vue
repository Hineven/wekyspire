<script setup>
// Vue 薄壳：三层场景的最外层编排（README「场景层级」总纲）。
// 菜单层 = 纯 Vue（StartScreen / GameMenu / EndPanel）；
// 大世界层（塔楼层）= MapStage（ThreeJS）+ PrepPanel 等 Vue 面板叠加；
// 战斗层（房间层）= BattleStage（ThreeJS）+ BattleHud / RewardPanel 等叠加。
// dialogue / cutscene overlay 由 Vue 渲染，跨后两层（CutsceneOverlay）。
import { onMounted, onBeforeUnmount, ref, computed, provide } from 'vue';
import '../core/content/index.js'; // 注册全部最小内容
import { StageManager } from '../stage/StageManager.js';
import { MapStage } from '../stage/stages/MapStage.js';
import { createRunController } from './runController.js';
import { readSave } from './saves.js';
import StartScreen from './components/StartScreen.vue';
import GameMenu from './components/GameMenu.vue';
import PrepPanel from './components/PrepPanel.vue';
import BattleHud from './components/BattleHud.vue';
import RewardPanel from './components/RewardPanel.vue';
import RoomPanel from './components/RoomPanel.vue';
import AscensionPanel from './components/AscensionPanel.vue';
import EndPanel from './components/EndPanel.vue';
import MenuPopup from './components/MenuPopup.vue';
import CutsceneOverlay from './overlay/CutsceneOverlay.vue';

const canvas = ref(null);
const ctrl = ref(null);
let stageManager = null;
let mapStage = null;

const phase = ref('menu');      // 'menu' | 'game'（菜单级与游戏级的最外层切换）
const menuOpen = ref(false);    // 游戏内弹出菜单（Esc）
const saves = ref({ infinite: readSave(false), story: readSave(true) }); // 两模式存档隔离

const stage = computed(() => ctrl.value?.run.gameStage ?? 'prep');

// 菜单级全局共享 toast：任意菜单级组件 inject('showMenuPopup') 后调用（跨 phase 可用）。
// 多条 toast 各自 3s 寿命独立消亡；新 toast 从底部进入，旧 toast 被顶起，消亡后其余平滑回落。
const menuToasts = ref([]);
let toastSeq = 0;
provide('showMenuPopup', (title, text = '') => {
  const id = ++toastSeq;
  const list = [...menuToasts.value, { id, title, text }];
  menuToasts.value = list.slice(-4); // 并发上限 4：超出立即挤掉最旧的（转入消亡动画）
  setTimeout(() => {
    menuToasts.value = menuToasts.value.filter(t => t.id !== id);
  }, 3000);
});

function newGame({ storyMode = false, loadSave = null } = {}) {
  ctrl.value?.dispose?.(); // 战斗舞台释放 + 挂起演出瞬落
  mapStage?.dispose?.();
  mapStage = new MapStage({});
  ctrl.value = createRunController({ stageManager, mapStage, save: loadSave, storyMode });
  mapStage.setFloor(ctrl.value.run.floor, ctrl.value.run.totalFloors);
  stageManager.setStage(mapStage);
  phase.value = 'game';
  menuOpen.value = false;
  // 冒烟/控制台钩子
  window.__shell = { ctrl, stageManager, newGame };
}

function onStart({ storyMode, loadSave }) {
  newGame({ storyMode, loadSave });
}

function toTitle() {
  ctrl.value?.dispose?.(); // 战斗舞台释放 + 挂起演出瞬落
  mapStage?.dispose?.();
  mapStage = null;
  ctrl.value = null;
  menuOpen.value = false;
  saves.value = { infinite: readSave(false), story: readSave(true) }; // 回主菜单刷新存档信息
  phase.value = 'menu';
}

function onPointer(type) {
  return (e) => {
    const battleStage = ctrl.value?.getBattleStage();
    if (!battleStage || ctrl.value.run.gameStage !== 'battle') return;
    battleStage[type]?.(e.clientX, e.clientY);
  };
}

// 预生成指针 handler：模板里直接写 onPointer('x') 只会调工厂丢弃闭包，$event 传不进去
const onPointerMove = onPointer('handlePointerMove');
const onPointerDown = onPointer('handlePointerDown');
const onPointerUp = onPointer('handlePointerUp');

let resizeHandler = null;
let keyHandler = null;
onMounted(() => {
  stageManager = new StageManager();
  stageManager.attach(canvas.value);
  resizeHandler = () => {
    canvas.value.width = window.innerWidth;
    canvas.value.height = window.innerHeight;
    stageManager.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resizeHandler);
  resizeHandler();
  stageManager.start();
  // Esc = 游戏内弹出菜单开关（菜单级界面不响应）
  keyHandler = (e) => {
    if (e.key === 'Escape' && phase.value === 'game') menuOpen.value = !menuOpen.value;
  };
  window.addEventListener('keydown', keyHandler);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler);
  window.removeEventListener('keydown', keyHandler);
  stageManager?.dispose();
});
</script>

<template>
  <canvas
    id="stage-canvas" ref="canvas"
    @pointermove="onPointerMove"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
  ></canvas>
  <!-- 菜单级：开始界面（含 changelog 弹层） -->
  <StartScreen v-if="phase === 'menu'" :saves="saves" @start="onStart" />
  <template v-else-if="ctrl">
    <!-- 玩家/瑞米常驻状态：战斗内/地图背景均由 three.js PlayerStatusObject 绘（左下角） -->
    <PrepPanel v-if="stage === 'prep'" :ctrl="ctrl" />
    <BattleHud v-else-if="stage === 'battle'" :ctrl="ctrl" />
    <RewardPanel v-else-if="stage === 'reward'" :ctrl="ctrl" />
    <RoomPanel v-else-if="stage === 'room'" :ctrl="ctrl" />
    <AscensionPanel v-else-if="stage === 'ascension'" :ctrl="ctrl" />
    <EndPanel v-else-if="stage === 'end'" :ctrl="ctrl" @restart="newGame" />
    <!-- 游戏内弹出菜单：Esc 呼出（存档/设置/回主菜单） -->
    <button class="menu-fab" @click="menuOpen = true">菜单</button>
    <GameMenu v-if="menuOpen" :ctrl="ctrl" @close="menuOpen = false" @toTitle="toTitle" />
    <!-- cutscene overlay：对话剧本 + 幕间转场，激活时阻塞一切流程（游戏流程手动驱动） -->
    <CutsceneOverlay v-if="ctrl.cutscene.state.mode !== 'idle'" :player="ctrl.cutscene" />
  </template>
  <!-- 菜单级全局 toast 提示（两 phase 均可用，无阻塞，3s 自然消亡） -->
  <MenuPopup :toasts="menuToasts" />
</template>

<style>
html, body { margin: 0; padding: 0; overflow: hidden; background: #0b1026; }
#stage-canvas { display: block; position: fixed; inset: 0; }
.menu-fab {
  position: fixed; top: 14px; right: 14px; z-index: 25;
  padding: 5px 16px; font-size: 13px; cursor: pointer; border-radius: 6px;
  background: rgba(10, 14, 26, .7); color: #cdd6f4; border: 1px solid #38415e;
}
.menu-fab:hover { background: rgba(44, 53, 84, .9); }
</style>
