/**
 * ThreejsScreen - Three.js场景容器组件
 *
 * 此组件负责：
 * - 挂载Three.js渲染器
 * - 初始化ECS系统
 * - 管理场景生命周期
 */

<template>
  <div ref="threeContainer" class="threejs-container"></div>
</template>

<script>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { getThreeRoot } from '../../three/core/ThreeRoot.js';
import { getEntityStore } from '../../three/ecs/EntityStore.js';
import { getSceneGraphAdapter } from '../../three/ecs/SceneGraphAdapter.js';
import { getInputSystem } from '../../three/ecs/systems/InputSystem.js';
import { getAnimationRuntime } from '../../three/ecs/systems/AnimationRuntime.js';
import { displayGameState } from '../../data/gameState.js';
import backendEventBus, { EventNames } from '../../backendEventBus.js';
import ColoredTextComponent from '../../three/ecs/components/ColoredTextComponent.js';
import BarComponent from '../../three/ecs/components/BarComponent.js';
import EffectIconComponent from '../../three/ecs/components/EffectIconComponent.js';
import * as THREE from 'three';

export default {
  name: 'ThreejsScreen',
  setup() {
    const threeContainer = ref(null);
    let threeRoot = null;
    let entityStore = null;
    let sceneGraphAdapter = null;
    let inputSystem = null;
    let animationRuntime = null;

    onMounted(() => {
      // 初始化Three.js系统
      threeRoot = getThreeRoot();
      entityStore = getEntityStore();
      sceneGraphAdapter = getSceneGraphAdapter();
      inputSystem = getInputSystem();
      animationRuntime = getAnimationRuntime();

      // 调试：输出displayGameState的内容
      console.log('[ThreejsScreen] DisplayGameState:', displayGameState);
      console.log('[ThreejsScreen] Player data:', displayGameState.player);
      console.log('[ThreejsScreen] Game stage:', displayGameState.gameStage);

      // 初始化渲染器
      threeRoot.init(threeContainer.value, {
        fov: 50,
        cameraZ: 500,
        backgroundColor: 0x000000,
        backgroundAlpha: 0
      });

      // 初始化适配器
      sceneGraphAdapter.init(entityStore, threeRoot);

      // 初始化输入系统
      inputSystem.init(
        threeRoot.getCamera(),
        threeRoot.getScene(),
        entityStore,
        threeContainer.value
      );

      // 初始化动画系统
      animationRuntime.init(entityStore);

      // 监听窗口大小变化，更新布局
      const handleResize = () => {
        sceneGraphAdapter.updateLayout();
      };
      window.addEventListener('resize', handleResize);

      console.log('[ThreejsScreen] Mounted and initialized');

      // 触发游戏开始（后端会自动创建技能、敌人等）
      setTimeout(() => {
        console.log('[ThreejsScreen] Triggering GAME_START event');
        backendEventBus.emit(EventNames.Game.GAME_START);
      }, 100);

      // 清理函数
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    });

    onBeforeUnmount(() => {
      // 清理资源
      if (animationRuntime) {
        animationRuntime.dispose();
      }
      if (inputSystem) {
        inputSystem.dispose();
      }
      if (sceneGraphAdapter) {
        sceneGraphAdapter.dispose();
      }
      if (entityStore) {
        entityStore.clear();
      }
      // 注意：threeRoot是单例，不在此处dispose

      console.log('[ThreejsScreen] Unmounted');
    });

    return {
      threeContainer
    };
  }
};
</script>

<style scoped>
.threejs-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1; /* 位于背景之上，Vue HUD之下 */
  pointer-events: auto; /* 允许交互 */
}
</style>

