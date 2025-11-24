/**
 * CoordinateConverter - 坐标转换工具类
 *
 * 提供屏幕坐标与世界坐标之间的转换
 */

import * as THREE from 'three';

class CoordinateConverter {
  constructor(camera) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /**
   * 屏幕坐标转世界坐标（Z=0平面）
   * @param {number} screenX - 屏幕X坐标（像素）
   * @param {number} screenY - 屏幕Y坐标（像素）
   * @returns {THREE.Vector3}
   */
  screenToWorld(screenX, screenY) {
    // 计算世界坐标的缩放因子
    const distance = this.camera.position.z;
    const vFov = this.camera.fov * Math.PI / 180;
    const height = 2 * Math.tan(vFov / 2) * distance;
    const width = height * this.camera.aspect;

    // 将屏幕坐标转换为世界坐标
    const x = (screenX / window.innerWidth - 0.5) * width;
    const y = -(screenY / window.innerHeight - 0.5) * height;

    return new THREE.Vector3(x, y, 0);
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
      x: (vector.x + 1) / 2 * window.innerWidth,
      y: -(vector.y - 1) / 2 * window.innerHeight
    };
  }

  /**
   * 获取在某个Z深度处，1像素对应的世界单位大小
   * @param {number} z - Z坐标
   * @returns {number}
   */
  getPixelSizeAtZ(z) {
    const distance = Math.abs(this.camera.position.z - z);
    const vFov = this.camera.fov * Math.PI / 180;
    const height = 2 * Math.tan(vFov / 2) * distance;
    return height / window.innerHeight;
  }
}

export default CoordinateConverter;

