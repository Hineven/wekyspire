/**
 * ComponentStore - 组件管理器
 * 专门用于管理和索引所有Component实例
 */

class ComponentStore {
  constructor() {
    // 组件存储结构：
    // componentsByType: type -> Map(componentId -> Component实例)
    this.componentsByType = new Map();
    
    // 所有组件实例的全局映射: componentId -> Component实例
    this.allComponents = new Map();
  }
  
  /**
   * 注册组件实例
   * @param {Component} component - 组件实例，必须包含type属性
   */
  register(component) {
    if (!component || !component.type) {
      console.error('[ComponentStore] 无效组件:', component);
      return false;
    }
    
    const type = component.type;
    if (!this.componentsByType.has(type)) {
      this.componentsByType.set(type, new Map());
    }
    
    const typeMap = this.componentsByType.get(type);
    
    // 使用组件实例的唯一标识符作为key
    const componentId = this._getComponentId(component);
    if (componentId) {
      typeMap.set(componentId, component);
      this.allComponents.set(componentId, component);
      
      console.log(`[ComponentStore] 注册组件: ${componentId} (类型: ${type})`);
      return true;
    }
    
    console.warn('[ComponentStore] 组件缺少唯一标识，无法注册:', component);
    return false;
  }
  
  /**
   * 注销组件
   * @param {Component} component - 组件实例
   */
  unregister(component) {
    if (!component || !component.type) {
      console.error('[ComponentStore] 无效组件:', component);
      return false;
    }
    
    const type = component.type;
    if (!this.componentsByType.has(type)) {
      return false;
    }
    
    const typeMap = this.componentsByType.get(type);
    const componentId = this._getComponentId(component);
    
    if (componentId && typeMap.has(componentId)) {
      typeMap.delete(componentId);
      this.allComponents.delete(componentId);
      
      console.log(`[ComponentStore] 注销组件: ${componentId} (类型: ${type})`);
      return true;
    }
    
    return false;
  }
  
  /**
   * 根据类型获取组件
   * @param {string} type - 组件类型
   * @param {string} id - 组件实例ID
   * @returns {Component|null} 组件实例
   */
  get(type, id) {
    if (!this.componentsByType.has(type)) {
      return null;
    }
    
    const typeMap = this.componentsByType.get(type);
    return typeMap.get(id) || null;
  }
  
  /**
   * 获取指定类型的所有组件
   * @param {string} type - 组件类型
   * @returns {Map<string, Component>} 指定类型的所有组件实例
   */
  getAll(type) {
    return this.componentsByType.get(type) || new Map();
  }
  
  /**
   * 获取所有组件实例
   * @returns {Map<string, Component>} 所有已注册组件
   */
  getAllComponents() {
    return this.allComponents;
  }
  
  /**
   * 获取组件的唯一标识符
   * 优先使用id属性，其次使用name或其他标识属性
   */
  _getComponentId(component) {
    if (component.id) {
      return component.id;
    }
    if (component.name) {
      return component.name;
    }
    return null;
  }
}

// 单例模式
let instance = null;

export function getComponentStore() {
  if (!instance) {
    instance = new ComponentStore();
  }
  return instance;
}

export default ComponentStore;