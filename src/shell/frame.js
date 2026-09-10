// 16:9 取景框尺寸计算（App.vue 与观战页 watch.html 共用）。
// 框带 translateZ —— 内部一切 position:fixed 的 UI（面板/菜单/toast/tooltip）以框为
// 包含块，内容编排只依赖 16:9 画布，与窗口实际比例解耦。指针坐标与 tooltip 落点
// 数学（App.vue 的 onPointer、tooltipHub.framePoint/place）都依赖这个框存在。
export const FRAME_ASPECT = 16 / 9;

/** 在窗口内取最大可容纳的 16:9 矩形居中摆放（边缘铺黑），并同步舞台渲染尺寸。 */
export function fitGameFrame({ frame, stageManager, aspect = FRAME_ASPECT } = {}) {
  if (!frame) return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const w = Math.min(W, H * aspect);
  const h = Math.min(H, W / aspect);
  frame.style.left = `${Math.round((W - w) / 2)}px`;
  frame.style.top = `${Math.round((H - h) / 2)}px`;
  frame.style.width = `${Math.round(w)}px`;
  frame.style.height = `${Math.round(h)}px`;
  // 画布缓冲由 StageManager.resize → renderer.setSize 建立（按 devicePixelRatio 放大）
  stageManager?.resize(Math.round(w), Math.round(h));
  return { width: Math.round(w), height: Math.round(h) };
}
