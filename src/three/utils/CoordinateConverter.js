/**
 * CoordinateConverter - 坐标转换工具类
 *
 * 提供屏幕坐标与世界坐标之间的转换
 * 使用Three.js内置的unproject和project方法确保转换准确性
 */

import * as THREE from 'three';

class CoordinateConverter {
  constructor(camera) {
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  /**
   * 屏幕坐标转世界坐标（指定Z深度）
   * @param {number} screenX - 屏幕X坐标（像素）
   * @param {number} screenY - 屏幕Y坐标（像素）
   * @param {number} z - 世界坐标Z值（默认：0，靠近相机）
   * @returns {THREE.Vector3}
   * 
   * 转换原理：
   * 1. 将屏幕坐标转换为标准化设备坐标(NDC)
   * 2. 使用unproject方法将NDC转换为世界坐标方向
   * 3. 计算从相机位置到指定Z平面的射线交点
   */
  screenToWorld(screenX, screenY, z = 0) {
    // 使用Three.js内置的unproject方法进行准确的坐标转换
    const vector = new THREE.Vector3(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1,
      0.5
    );
    vector.unproject(this.camera);
    
    const dir = vector.sub(this.camera.position).normalize();
    const distance = (z - this.camera.position.z) / dir.z;
    return this.camera.position.clone().add(dir.multiplyScalar(distance));
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

