/**
 * BarComponent - 进度条基础组件
 *
 * 职责：
 * - 渲染进度条（背景 + 填充）
 * - 支持渐变色填充
 * - 平滑过渡动画
 */

import * as THREE from 'three';

class BarComponent {
  constructor(options = {}) {
    this.options = {
      width: 200,
      height: 20,
      maxValue: 100,
      currentValue: 100,
      backgroundColor: 0x333333,
      fillColor: 0x00ff00,
      borderColor: 0xffffff,
      borderWidth: 1,
      cornerRadius: 4,
      ...options
    };

    this.group = new THREE.Group();
    this.backgroundBar = null;
    this.fillBar = null;
    this.border = null;

    this._currentFillWidth = this.options.width;
    this._targetFillWidth = this.options.width;

    this._build();
  }

  /**
   * 构建进度条
   */
  _build() {
    const { width, height, backgroundColor, fillColor, borderColor, borderWidth } = this.options;

    // 创建背景条
    const bgGeometry = new THREE.PlaneGeometry(width, height);
    const bgMaterial = new THREE.MeshBasicMaterial({
      color: backgroundColor,
      transparent: true,
      opacity: 0.8
    });
    this.backgroundBar = new THREE.Mesh(bgGeometry, bgMaterial);
    this.group.add(this.backgroundBar);

    // 创建填充条（初始宽度为完整宽度）
    const fillGeometry = new THREE.PlaneGeometry(width, height - 4); // 稍小一点
    const fillMaterial = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: 1.0
    });
    this.fillBar = new THREE.Mesh(fillGeometry, fillMaterial);
    this.fillBar.position.z = 0.1; // 稍微前置
    this.group.add(this.fillBar);

    // 创建边框（使用LineSegments）
    if (borderWidth > 0) {
      const borderGeometry = new THREE.EdgesGeometry(bgGeometry);
      const borderMaterial = new THREE.LineBasicMaterial({ color: borderColor });
      this.border = new THREE.LineSegments(borderGeometry, borderMaterial);
      this.border.position.z = 0.2;
      this.group.add(this.border);
    }

    // 更新填充条宽度
    this._updateFillWidth();
  }

  /**
   * 更新当前值
   */
  setValue(value) {
    this.options.currentValue = Math.max(0, Math.min(value, this.options.maxValue));

    // 计算目标填充宽度
    const ratio = this.options.currentValue / this.options.maxValue;
    this._targetFillWidth = this.options.width * ratio;
  }

  /**
   * 更新填充条宽度（每帧调用）
   */
  update(deltaTime) {
    // 平滑过渡到目标宽度
    const speed = 0.01; // 过渡速度
    const diff = this._targetFillWidth - this._currentFillWidth;

    if (Math.abs(diff) > 0.1) {
      this._currentFillWidth += diff * speed * (deltaTime / 16); // 归一化到60fps
      this._updateFillWidth();
    } else {
      this._currentFillWidth = this._targetFillWidth;
    }
  }

  /**
   * 更新填充条的几何体
   */
  _updateFillWidth() {
    if (!this.fillBar) return;

    const { height } = this.options;
    const fillWidth = Math.max(0, this._currentFillWidth);

    // 更新几何体
    const newGeometry = new THREE.PlaneGeometry(fillWidth, height - 4);
    this.fillBar.geometry.dispose();
    this.fillBar.geometry = newGeometry;

    // 调整位置（左对齐）
    const offset = (this.options.width - fillWidth) / 2;
    this.fillBar.position.x = -offset;
  }

  /**
   * 设置填充颜色
   */
  setFillColor(color) {
    if (this.fillBar) {
      this.fillBar.material.color.setHex(color);
    }
  }

  /**
   * 获取Group对象
   */
  getObject3D() {
    return this.group;
  }

  /**
   * 清理资源
   */
  dispose() {
    if (this.backgroundBar) {
      this.backgroundBar.geometry.dispose();
      this.backgroundBar.material.dispose();
    }
    if (this.fillBar) {
      this.fillBar.geometry.dispose();
      this.fillBar.material.dispose();
    }
    if (this.border) {
      this.border.geometry.dispose();
      this.border.material.dispose();
    }
  }
}

export default BarComponent;

