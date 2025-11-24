/**
 * ViewportManager - 视口与坐标系统管理
 *
 * 职责：
 * - 屏幕坐标与世界坐标转换
 * - 视口尺寸管理
 * - DPI适配计算
 */

import * as THREE from 'three';

class ViewportManager {
  constructor(camera) {
    this.camera = camera;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  /**
   * 更新视口尺寸
   */
  setSize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * 屏幕坐标转世界坐标
   * @param {number} x - 屏幕X坐标（像素）
   * @param {number} y - 屏幕Y坐标（像素）
   * @param {number} z - Z轴深度（默认0）
   * @returns {THREE.Vector3}
   */
  screenToWorld(x, y, z = 0) {
    const vector = new THREE.Vector3(
      (x / this.width) * 2 - 1,
      -(y / this.height) * 2 + 1,
      z
    );
    vector.unproject(this.camera);
    return vector;
  }

  /**
   * 世界坐标转屏幕坐标
   * @param {THREE.Vector3} worldPos - 世界坐标
   * @returns {{x: number, y: number}}
   */
  worldToScreen(worldPos) {
    const vector = worldPos.clone();
    vector.project(this.camera);
    return {
      x: (vector.x + 1) / 2 * this.width,
      y: -(vector.y - 1) / 2 * this.height
    };
  }

  /**
   * 获取世界坐标的Z值对应的缩放因子
   * （透视相机下，距离相机越远物体越小）
   * @param {number} z - Z坐标
   * @returns {number} - 缩放因子
   */
  getScaleAtZ(z) {
    const cameraZ = this.camera.position.z;
    const distance = Math.abs(cameraZ - z);
    const vFov = this.camera.fov * Math.PI / 180;
    const height = 2 * Math.tan(vFov / 2) * distance;
    return height / this.height;
  }

  /**
   * 屏幕坐标转NDC（Normalized Device Coordinates）
   * @param {number} x - 屏幕X坐标
   * @param {number} y - 屏幕Y坐标
   * @returns {{x: number, y: number}}
   */
  screenToNDC(x, y) {
    return {
      x: (x / this.width) * 2 - 1,
      y: -(y / this.height) * 2 + 1
    };
  }

  /**
   * 创建Raycaster从屏幕坐标
   * @param {number} x - 屏幕X坐标
   * @param {number} y - 屏幕Y坐标
   * @returns {THREE.Raycaster}
   */
  createRaycaster(x, y) {
    const ndc = this.screenToNDC(x, y);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
    return raycaster;
  }
}

export default ViewportManager;

