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
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointerleave', this.onPointerLeave);

    this.isInitialized = true;
    console.log('[InputSystem] Initialized');
  }

  /**
   * 更新鼠标NDC坐标
   */
  updateMousePosition(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
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

      // 限制在屏幕范围内（简单实现）
      const maxX = 400;
      const maxY = 300;
      target.x = THREE.MathUtils.clamp(target.x, -maxX, maxX);
      target.y = THREE.MathUtils.clamp(target.y, -maxY, maxY);

      this.draggedEntity.object3D.position.copy(target);

      // 发出拖拽事件
      frontendEventBus.emit('card-dragging', {
        id: this.draggedEntity.id,
        position: { x: target.x, y: target.y }
      });
    }
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

      // 发出事件（后端会处理卡牌使用逻辑）
      frontendEventBus.emit('card-drag-end', {
        id: entity.id,
        skillData: entity.components.card?.skillData,
        position: {
          x: object3D.position.x,
          y: object3D.position.y
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

