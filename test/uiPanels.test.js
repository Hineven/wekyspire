import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import mitt from 'mitt';
import '../src/core/content/index.js';
import { MapStage } from '../src/stage/stages/MapStage.js';
import { StageManager } from '../src/stage/StageManager.js';
import { PanelObject } from '../src/stage/objects/PanelObject.js';
import { ButtonObject } from '../src/stage/objects/ButtonObject.js';
import { TextBlockObject } from '../src/stage/objects/TextBlockObject.js';
import { panelSnapshot, prepSnapshot } from '../src/core/run/panelSnapshot.js';
import { buildPrepPanel } from '../src/stage/panels/prepPanel.js';
import { createRun, advanceFloor } from '../src/core/run/runFlow.js';
import { grantRelic, equipRelic } from '../src/core/run/prep.js';
import { EventNames } from '../src/bridge/events.js';
import { attachTooltipForwarding } from '../src/shell/tooltipForward.js';
import { tooltipState } from '../src/shell/tooltipHub.js';

// 休息阶段 UI 迁移的契约测试（用户 2026-09 对本次迁移显式豁免「测试维护暂停」）。
// 只测基础设施契约：快照推导 / 布局确定性 / 拾取路由 / 释放 / 事件幂等；
// 视觉样式与演出不写测试（浏览器由用户验收，uiGallery.html 为视觉门）。

// 无渲染器的舞台管理器（假 renderer，与既有舞台测试同法）
function fakeManager() {
  const sm = new StageManager({ createRenderer: () => ({ render() {}, setSize() {}, dispose() {} }) });
  sm._viewWidth = 1920;
  sm._viewHeight = 1080;
  return sm;
}

describe('panelSnapshot（core 纯函数：数据下行唯一通道）', () => {
  it('prep：层数/距 Boss/敌人预告名字/遗物可用性全部在 core 内解析', () => {
    const run = createRun({ seed: 11 });
    grantRelic(run, 'warHorn');
    const snap = prepSnapshot(run);

    expect(snap.kind).toBe('prep');
    expect(snap.floor).toBe(1);
    expect(snap.totalFloors).toBeGreaterThan(0);
    // 第 1 层：距首个 Boss 层 = 11 - 1（章 = 10 普通层 + 1 Boss 层）
    expect(snap.toBoss).toBe(10);
    expect(snap.atBossFloor).toBe(false);
    // 敌人名字在 core 侧反查（Stage 不碰注册表）
    expect(snap.encounter.length).toBe(run.encounter.length);
    for (const e of snap.encounter) expect(typeof e.name).toBe('string');

    const horn = snap.relics.find(r => r.id === 'warHorn');
    expect(horn).toBeTruthy();
    expect(horn.equipped).toBe(false);
    expect(horn.canUse).toBe(false); // 未装备 → 不可用（可用性由 core 判定）
  });

  it('prep：装备后装备位数与主动遗物可用性同步；次数耗尽不可用', () => {
    const run = createRun({ seed: 12 });
    grantRelic(run, 'springFlask'); // uses:1 的主动遗物
    equipRelic(run, 'springFlask');
    let snap = prepSnapshot(run);
    expect(snap.relicSlots.used).toBe(1);
    expect(snap.relics[0].equipped).toBe(true);
    expect(snap.relics[0].canUse).toBe(true);

    run.relicUses.springFlask = 0; // 次数耗尽
    snap = prepSnapshot(run);
    expect(snap.relics[0].canUse).toBe(false);
  });

  it('非 prep 阶段返回 null（该面板尚未迁移 → 宿主不装配，Vue 侧仍在）', () => {
    const run = createRun({ seed: 13 });
    expect(panelSnapshot(run)).not.toBeNull();
    run.gameStage = 'battle';
    expect(panelSnapshot(run)).toBeNull();
    expect(panelSnapshot(null)).toBeNull();
  });
});

describe('TextBlockObject / ButtonObject（headless 可构造 = 契约测试前提）', () => {
  it('无 document 也能构造与布局；同签名文本不重烘', () => {
    const t = new TextBlockObject({});
    t.setText('层数 1 / 44');
    const first = t.material.map;
    expect(t.scale.x).toBeGreaterThan(0);
    expect(t.scale.y).toBeGreaterThan(0);
    t.setText('层数 1 / 44'); // 同签名
    expect(t.material.map).toBe(first); // 未重烘
    t.setText('层数 2 / 44'); // 变签名
    expect(t.material.map).not.toBe(first);
    t.dispose();
  });

  it('按钮三态签名 diff：同数据不重烘，hover 触发重烘，几何按 10px/wu 换算', () => {
    const b = new ButtonObject({ id: 'b1', width: 200, height: 40 });
    expect(b.geometry.parameters.width).toBeCloseTo(20, 5); // 200px / 10
    expect(b.geometry.parameters.height).toBeCloseTo(4, 5);
    expect(b.setData({ label: '装备' })).toBe(true);
    const map = b.material.map;
    expect(b.setData({ label: '装备' })).toBe(false); // 同签名
    expect(b.material.map).toBe(map);
    b.setHovered(true);
    expect(b.material.map).not.toBe(map); // hover 抬亮重烘
    b.dispose();
  });

  it('disabled 态不因 hover 重烘（视觉与语义一致）', () => {
    const b = new ButtonObject({ id: 'b2' });
    b.setData({ label: '进入战斗', enabled: false });
    const map = b.material.map;
    b.setHovered(true);
    expect(b.material.map).toBe(map);
    b.dispose();
  });
});

describe('PanelObject（widget 行流 + 点击路由）', () => {
  const snapOf = () => {
    const run = createRun({ seed: 21 });
    grantRelic(run, 'warHorn');
    return prepSnapshot(run);
  };

  it('按 widget 列表建行；按钮注册进 picker；点击把 action 交给宿主', () => {
    const stage = new MapStage({});
    const pickables = [];
    const fakePicker = {
      addPickable: (id, obj, opts) => pickables.push({ id, opts }),
      removePickable: (id) => { const i = pickables.findIndex(p => p.id === id); if (i >= 0) pickables.splice(i, 1); },
    };
    const intents = [];
    const panel = new PanelObject({ onIntent: (a) => intents.push(a) });
    panel.attachPicker(fakePicker);
    panel.setWidgets('prep', buildPrepPanel(snapOf()));

    expect(panel.rowCount).toBeGreaterThan(0);
    expect(pickables.length).toBe(panel.buttons.length); // 每个按钮一条 pickable
    expect(pickables.every(p => p.opts.kind === 'button' && p.opts.space === 'ui')).toBe(true);

    // 点「装备」按钮 → 上报 equip intent（Stage 不解释语义）
    const equipBtn = panel.buttons.find(b => b.pickId.startsWith('relic:equip:'));
    expect(equipBtn).toBeTruthy();
    expect(panel.onClick({ kind: 'button', id: equipBtn.pickId })).toBe(true);
    expect(intents).toEqual([{ action: 'equip', relicId: 'warHorn' }]);

    // 点非按钮（背景）不产生意图
    expect(panel.onClick({ kind: 'background' })).toBe(false);
    expect(intents).toHaveLength(1);

    panel.dispose();
    expect(pickables).toHaveLength(0); // 释放即摘 pickable
  });

  it('disabled 按钮不触发意图', () => {
    const intents = [];
    const panel = new PanelObject({ onIntent: (a) => intents.push(a) });
    panel.setWidgets('t', [
      { kind: 'button', id: 'x', label: '进不去', enabled: false, action: { action: 'startBattle' } },
    ]);
    expect(panel.onClick({ kind: 'button', id: 'x' })).toBe(false);
    expect(intents).toHaveLength(0);
    panel.dispose();
  });

  it('重建幂等：重复 setWidgets 不累积行/按钮', () => {
    const panel = new PanelObject({});
    const widgets = [{ kind: 'text', text: 'a' }, { kind: 'button', id: 'k', label: 'K' }];
    panel.setWidgets('t', widgets);
    const n = panel.rowCount;
    panel.setWidgets('t', widgets);
    expect(panel.rowCount).toBe(n);
    expect(panel.buttons).toHaveLength(1);
    expect(panel.children).toHaveLength(n); // 旧行已移除
    panel.dispose();
  });

  it('锚定形态贴左上角（沿用原 Vue 面板 12px 边距 / 250px 宽）', () => {
    const panel = new PanelObject({});
    const halfUIW = ((100 * 16) / 9) / 2;
    expect(panel.position.x).toBeCloseTo(-halfUIW + 1.2, 4);
    panel.dispose();
  });

  it('行流布局：行不重叠、且全部落在 UI 取景带内（面板不越界的硬契约）', () => {
    const run = createRun({ seed: 41 });
    for (const id of ['warHorn', 'springFlask']) grantRelic(run, id);
    equipRelic(run, 'springFlask'); // 触发「卸下 + 使用」两个按钮
    const panel = new PanelObject({});
    panel.setWidgets('prep', buildPrepPanel(prepSnapshot(run)));

    const UI_TOP = -15 + 100 / 2;      // UI_CAMERA_LOOK_AT_Y + WORLD_HEIGHT/2
    const UI_BOTTOM = -15 - 100 / 2;
    let prevBottom = Infinity;
    for (const { top, bottom, h, contentH, kind } of panel.rows) {
      const absTop = panel.position.y + top;
      const absBottom = panel.position.y + bottom;
      // 落在取景带内（上不越顶、下不越底）
      expect(absTop).toBeLessThanOrEqual(UI_TOP + 1e-6);
      expect(absBottom).toBeGreaterThanOrEqual(UI_BOTTOM - 1e-6);
      // 与上一行不重叠（行框由固定行高切分）
      expect(absTop).toBeLessThanOrEqual(prevBottom + 1e-6);
      // 逐行内容不溢出各自行框（文本等比收敛 / 按钮几何即行框）
      expect(contentH, kind).toBeLessThanOrEqual(h + 1e-6);
      prevBottom = absBottom;
    }
    expect(panel.heightWu).toBeGreaterThan(0);
    panel.dispose();
  });
});

describe('MapStage 输入通道与面板装配', () => {
  it('attachInput 建 picker；setPanel(prep) 装配面板并接上意图出口', () => {
    const stage = new MapStage({});
    const sm = fakeManager();
    const intents = [];
    stage.setPanelIntentHandler((a) => intents.push(a));
    stage.attachInput({ stageManager: sm, bus: mitt() });
    expect(stage.picker).toBeTruthy();

    const run = createRun({ seed: 31 });
    grantRelic(run, 'warHorn');
    stage.setPanel(prepSnapshot(run));
    expect(stage.panel).toBeTruthy();
    expect(stage.panel.kind).toBe('prep');
    expect(stage.panel.buttons.length).toBeGreaterThan(0);

    // 点「装备」→ 经 MapStage 的意图出口上报（指针路由的最后一环）
    const btn = stage.panel.buttons.find(b => b.pickId.startsWith('relic:equip:'));
    stage.panel.onClick({ kind: 'button', id: btn.pickId });
    expect(intents).toEqual([{ action: 'equip', relicId: 'warHorn' }]);
    stage.dispose();
  });

  it('setPanel(null) 与 dispose 都清干净（无残留子对象/pickable）', () => {
    const stage = new MapStage({});
    const sm = fakeManager();
    stage.attachInput({ stageManager: sm, bus: mitt() });
    stage.setPanel(prepSnapshot(createRun({ seed: 32 })));
    const panel = stage.panel;
    const registered = panel.buttons.length;
    expect(registered).toBeGreaterThan(0);

    stage.setPanel(null);
    expect(stage.panel).toBeNull();
    expect(stage.uiScene.children.includes(panel)).toBe(false);

    // dispose 幂等且不抛
    stage.dispose();
    stage.dispose();
  });

  it('未登记的 kind 不装配（该面板仍由 Vue 渲染）', () => {
    const stage = new MapStage({});
    stage.attachInput({ stageManager: fakeManager(), bus: mitt() });
    stage.setPanel({ kind: 'room', roomType: 'slot' });
    expect(stage.panel).toBeNull();
    stage.dispose();
  });

  it('指针按下/抬起命中一致才算点击（防拖出误触）', () => {
    const stage = new MapStage({});
    const sm = fakeManager();
    const intents = [];
    stage.setPanelIntentHandler((a) => intents.push(a));
    stage.attachInput({ stageManager: sm, bus: mitt() });
    const run = createRun({ seed: 33 });
    grantRelic(run, 'warHorn');
    stage.setPanel(prepSnapshot(run));
    const btn = stage.panel.buttons.find(b => b.pickId.startsWith('relic:equip:'));
    const hit = { kind: 'button', id: btn.pickId };

    // 按下 A、抬起 B（背景）→ 不触发
    stage._downHit = hit;
    stage.picker.pick = () => ({ kind: 'background' });
    stage.handlePointerUp(0, 0);
    expect(intents).toHaveLength(0);
    expect(stage._downHit).toBeNull(); // 按压态被消费掉

    stage.dispose();
  });
});

describe('常驻 tooltip 转发（3D 源 → tooltipHub）', () => {
  it('rest 阶段无 BattleHud 时 tooltip 仍能到达 hub；摘除即隐藏', () => {
    const bus = mitt();
    const detach = attachTooltipForwarding(bus);
    bus.emit(EventNames.TOOLTIP_SHOW, { kind: 'effect', payload: { name: '荆棘' }, x: 30, y: 40 });
    expect(tooltipState.visible).toBe(true);
    expect(tooltipState.model).toBeTruthy();
    detach();
    expect(tooltipState.visible).toBe(false);
  });

  it('同事件被转发两次不改变状态（与 BattleHud 那份转发共存是安全的）', () => {
    const bus = mitt();
    const detach = attachTooltipForwarding(bus);
    const evt = { kind: 'effect', payload: { name: '荆棘' }, x: 30, y: 40 };
    bus.emit(EventNames.TOOLTIP_SHOW, evt);
    const model = tooltipState.model;
    const pos = { x: tooltipState.x, y: tooltipState.y };
    bus.emit(EventNames.TOOLTIP_SHOW, evt); // 第二次
    expect(tooltipState.model).toBe(model); // 同 token 不重算
    expect(tooltipState.x).toBe(pos.x);
    expect(tooltipState.y).toBe(pos.y);
    bus.emit(EventNames.TOOLTIP_HIDE, {});
    bus.emit(EventNames.TOOLTIP_HIDE, {});
    expect(tooltipState.visible).toBe(false);
    detach();
  });

  it('null 总线安全降级（headless / 无舞台）', () => {
    expect(typeof attachTooltipForwarding(null)).toBe('function');
    expect(() => attachTooltipForwarding(null)()).not.toThrow();
  });
});
