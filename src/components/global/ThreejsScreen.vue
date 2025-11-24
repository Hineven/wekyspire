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

    onMounted(() => {
      // 初始化Three.js系统
      threeRoot = getThreeRoot();
      entityStore = getEntityStore();
      sceneGraphAdapter = getSceneGraphAdapter();

      // 初始化渲染器
      threeRoot.init(threeContainer.value, {
        fov: 50,
        cameraZ: 500, // 调整相机距离以适应屏幕坐标
        backgroundColor: 0x000000,
        backgroundAlpha: 0
      });

      // 初始化适配器
      sceneGraphAdapter.init(entityStore, threeRoot);

      // === F2.2测试：创建测试实体 ===
      createTestEntities(threeRoot, entityStore);

      // 监听窗口大小变化，更新布局
      const handleResize = () => {
        sceneGraphAdapter.updateLayout();
      };
      window.addEventListener('resize', handleResize);

      console.log('[ThreejsScreen] Mounted and initialized');

      // 清理函数
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    });

    onBeforeUnmount(() => {
      // 清理资源
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

/**
 * 创建测试实体（F2.2 + F3.1阶段验证）
 */
function createTestEntities(threeRoot, entityStore) {
  const scene = threeRoot.getScene();

  // 暂时不创建测试文本，由SceneGraphAdapter创建面板和图标
  console.log('[ThreejsScreen] Test setup complete');
  console.log('[ThreejsScreen] Panels and icons will be created by SceneGraphAdapter');
  console.log('[ThreejsScreen] Check browser console for entity registration logs');
}
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

