/**
 * InputSystem - 输入系统
 *
 * 职责：
 * - 处理鼠标/触摸输入
 * - Raycaster拾取Three.js对象
 * - 实现卡牌拖拽逻辑
 * - 实现悬停检测
 * - 桥接frontendEventBus事件
 */

import * as THREE from 'three';
import frontendEventBus from '../../../frontendEventBus.js';

class InputSystem {
  constructor() {
    this.camera = null;
    this.scene = null;
    this.entityStore = null;
    this.domElement = null;

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 状态
    this.isDragging = false;
    this.draggedEntity = null;
    this.dragStartPos = new THREE.Vector3();
    this.dragOffset = new THREE.Vector3();
    this.hoveredEntity = null;

    // 绑定事件处理器
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);

    this.isInitialized = false;
  }

  /**
   * 初始化
   */
  init(camera, scene, entityStore, domElement) {
    this.camera = camera;
    this.scene = scene;
    this.entityStore = entityStore;
    this.domElement = domElement;

    // 注册事件监听
    // 使用pointer事件处理鼠标和触摸
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointerleave', this.onPointerLeave);
    
    // 额外添加触摸事件支持，确保在各种设备上都能正常工作
    this.domElement.addEventListener('touchstart', this.onPointerDown);
    this.domElement.addEventListener('touchmove', this.onPointerMove);
    this.domElement.addEventListener('touchend', this.onPointerUp);
    this.domElement.addEventListener('touchcancel', this.onPointerUp);

    this.isInitialized = true;
    console.log('[InputSystem] Initialized');
  }

  /**
   * 更新鼠标/触摸NDC坐标
   */
  updateMousePosition(event) {
    const rect = this.domElement.getBoundingClientRect();
    
    // 处理触摸事件
    if (event.touches && event.touches.length > 0) {
      // 使用第一个触摸点
      const touch = event.touches[0];
      this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
    } else {
      // 处理鼠标事件
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }
  }

  /**
   * Raycaster拾取
   * @returns {Object|null} 返回 { entity, object3D, point }
   */
  raycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 只检测卡牌实体（getEntitiesByType返回Set，需转换为数组）
    const cardEntitiesSet = this.entityStore.getEntitiesByType('card');
    const cardEntities = Array.from(cardEntitiesSet);
    const objects = cardEntities.map(e => e.object3D).filter(Boolean);

    if (objects.length === 0) return null;

    // 递归检测所有子对象
    const intersects = this.raycaster.intersectObjects(objects, true);

    if (intersects.length === 0) return null;

    // 找到第一个相交对象对应的实体
    let intersectedObject = intersects[0].object;

    // 向上遍历找到顶层Group（卡牌根节点）
    while (intersectedObject.parent && !this.isCardRoot(intersectedObject)) {
      intersectedObject = intersectedObject.parent;
    }

    // 查找对应的实体
    const entity = cardEntities.find(e => e.object3D === intersectedObject);

    if (entity) {
      return {
        entity,
        object3D: intersectedObject,
        point: intersects[0].point
      };
    }

    return null;
  }

  /**
   * 判断是否为卡牌根节点
   */
  isCardRoot(object) {
    // 卡牌根节点是Group且直接添加到scene
    return object.type === 'Group' && object.parent === this.scene;
  }

  /**
   * 鼠标按下
   */
  onPointerDown(event) {
    if (!this.isInitialized) return;

    this.updateMousePosition(event);
    const hit = this.raycast();

    if (!hit) return;

    const { entity, object3D, point } = hit;

    // 开始拖拽
    this.isDragging = true;
    this.draggedEntity = entity;
    this.dragStartPos.copy(object3D.position);
    this.dragOffset.copy(point).sub(object3D.position);

    // 视觉反馈：放大
    object3D.scale.multiplyScalar(1.1);
    
    // 提升z坐标，确保拖拽的卡牌渲染在最上层
    this.originalZ = object3D.position.z;
    object3D.position.z = 100; // 设置一个很高的z值

    // 发出事件
    frontendEventBus.emit('card-drag-start', {
      id: entity.id,
      skillData: entity.components.card?.skillData
    });

    console.log('[InputSystem] Drag start:', entity.id);
  }

  /**
   * 鼠标移动
   */
  onPointerMove(event) {
    if (!this.isInitialized) return;

    this.updateMousePosition(event);

    if (this.isDragging && this.draggedEntity) {
      // 拖拽模式：更新位置
      this.updateDragPosition();
    } else {
      // 悬停检测模式
      this.updateHover();
    }
  }

  /**
   * 更新拖拽位置
   */
  updateDragPosition() {
    if (!this.draggedEntity) return;

    // Raycaster与z=0平面相交
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const target = new THREE.Vector3();

    this.raycaster.ray.intersectPlane(plane, target);

    if (target) {
      // 应用偏移
      target.sub(this.dragOffset);

      // 动态计算边界限制（基于当前相机和屏幕尺寸）
      const bounds = this._calculateDragBounds();
      target.x = THREE.MathUtils.clamp(target.x, bounds.minX, bounds.maxX);
      target.y = THREE.MathUtils.clamp(target.y, bounds.minY, bounds.maxY);

      // 平滑更新位置
      this.draggedEntity.object3D.position.lerp(target, 0.2);

      // 发出拖拽事件
      frontendEventBus.emit('card-dragging', {
        id: this.draggedEntity.id,
        position: { 
          x: this.draggedEntity.object3D.position.x, 
          y: this.draggedEntity.object3D.position.y 
        }
      });
    }
  }

  /**
   * 计算拖拽边界
   * @returns {Object} {minX, maxX, minY, maxY}
   */
  _calculateDragBounds() {
    if (!this.camera || !this.domElement) {
      return { minX: -400, maxX: 400, minY: -300, maxY: 300 };
    }

    // 获取屏幕尺寸
    const rect = this.domElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // 计算边界（基于相机视锥体）
    const distance = this.camera.position.z;
    const fov = this.camera.fov * Math.PI / 180;
    const aspect = this.camera.aspect;

    // 计算视锥体在z=0平面的高度和宽度
    const heightAtZ0 = 2 * Math.tan(fov / 2) * distance;
    const widthAtZ0 = heightAtZ0 * aspect;

    // 边界留出10%的边距
    const margin = 0.1;
    const minX = -widthAtZ0 / 2 * (1 - margin);
    const maxX = widthAtZ0 / 2 * (1 - margin);
    const minY = -heightAtZ0 / 2 * (1 - margin);
    const maxY = heightAtZ0 / 2 * (1 - margin);

    return { minX, maxX, minY, maxY };
  }

  /**
   * 更新悬停状态
   */
  updateHover() {
    const hit = this.raycast();

    const newHoveredEntity = hit ? hit.entity : null;

    // 悬停状态变化
    if (newHoveredEntity !== this.hoveredEntity) {
      // 离开旧实体
      if (this.hoveredEntity) {
        frontendEventBus.emit('card-leave', {
          id: this.hoveredEntity.id
        });
      }

      // 进入新实体
      if (newHoveredEntity) {
        frontendEventBus.emit('card-hover', {
          id: newHoveredEntity.id,
          skillData: newHoveredEntity.components.card?.skillData
        });
      }

      this.hoveredEntity = newHoveredEntity;
    }
  }

  /**
   * 鼠标抬起
   */
  onPointerUp(event) {
    if (!this.isInitialized) return;

    if (this.isDragging && this.draggedEntity) {
      const entity = this.draggedEntity;
      const object3D = entity.object3D;

      // 恢复缩放
      object3D.scale.divideScalar(1.1);
      
      // 恢复原始z坐标
      if (this.originalZ !== undefined) {
        object3D.position.z = this.originalZ;
        this.originalZ = undefined;
      }

      // 发出事件（后端会处理卡牌使用逻辑）
      frontendEventBus.emit('card-drag-end', {
        id: entity.id,
        skillData: entity.components.card?.skillData,
        position: {
          x: object3D.position.x,
          y: object3D.position.y,
          z: object3D.position.z
        }
      });

      console.log('[InputSystem] Drag end:', entity.id);

      // 重置拖拽状态
      this.isDragging = false;
      this.draggedEntity = null;
    }
  }

  /**
   * 鼠标离开Canvas
   */
  onPointerLeave(event) {
    // 如果正在拖拽，取消拖拽
    if (this.isDragging) {
      this.onPointerUp(event);
    }

    // 清除悬停
    if (this.hoveredEntity) {
      frontendEventBus.emit('card-leave', {
        id: this.hoveredEntity.id
      });
      this.hoveredEntity = null;
    }
  }

  /**
   * 每帧更新（如果需要）
   */
  update(deltaTime) {
    // 目前不需要每帧更新
  }

  /**
   * 清理
   */
  dispose() {
    if (this.domElement) {
      this.domElement.removeEventListener('pointerdown', this.onPointerDown);
      this.domElement.removeEventListener('pointermove', this.onPointerMove);
      this.domElement.removeEventListener('pointerup', this.onPointerUp);
      this.domElement.removeEventListener('pointerleave', this.onPointerLeave);
      
      // 移除触摸事件监听器
      this.domElement.removeEventListener('touchstart', this.onPointerDown);
      this.domElement.removeEventListener('touchmove', this.onPointerMove);
      this.domElement.removeEventListener('touchend', this.onPointerUp);
      this.domElement.removeEventListener('touchcancel', this.onPointerUp);
    }

    this.camera = null;
    this.scene = null;
    this.entityStore = null;
    this.domElement = null;
    this.draggedEntity = null;
    this.hoveredEntity = null;
    this.isInitialized = false;

    console.log('[InputSystem] Disposed');
  }
}

// 单例
let instance = null;

export function getInputSystem() {
  if (!instance) {
    instance = new InputSystem();
  }
  return instance;
}

export default InputSystem;

