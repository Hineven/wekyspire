import { describe, it, expect } from 'vitest';
import mitt from 'mitt';
import '../src/core/content/index.js';
import { MapStage } from '../src/stage/stages/MapStage.js';
import { StageManager } from '../src/stage/StageManager.js';
import { PanelObject } from '../src/stage/objects/PanelObject.js';
import { ButtonObject } from '../src/stage/objects/ButtonObject.js';
import { TextBlockObject } from '../src/stage/objects/TextBlockObject.js';
import { panelSnapshot, prepSnapshot, rewardSnapshot } from '../src/core/run/panelSnapshot.js';
import { buildPrepPanel, buildRewardPanel } from '../src/stage/panels/index.js';
import { createRun, enterBattle, finishBattle } from '../src/core/run/runFlow.js';
import { grantRelic, equipRelic } from '../src/core/run/prep.js';
import { EventNames } from '../src/bridge/events.js';
import { createRunController, awaitFloorArrive } from '../src/shell/runController.js';
import { AnimationSequencer } from '../src/core/anim/sequencer.js';
import { clearSave } from '../src/shell/saves.js';
import { attachTooltipForwarding } from '../src/shell/tooltipForward.js';
import { tooltipState } from '../src/shell/tooltipHub.js';

// 休息阶段 UI 迁移的契约测试（用户 2026-09 对本次迁移显式豁免「测试维护暂停」）。
// 只测基础设施契约：快照推导 / 布局确定性 / 拾取路由 / 释放 / 事件幂等；
// 视觉样式与演出不写测试（浏览器由用户验收，uiGallery.html 为视觉门）。

// 假舞台只记录推流；通道语义与 MapStage 的真实现一致（setPanel / setPanelIntentHandler）
function fakeMapStage() {
  const pushes = [];
  const statuses = [];
  const stage = {
    pushes,
    statuses,
    intentHandler: null,
    setStatus(s) { statuses.push(s); },
    setPanel(snap) { pushes.push(snap); },
    setPanelIntentHandler(fn) { stage.intentHandler = fn; },
    setFloor() {},
    // 抵达动画立即回执：真实实现走 gsap，这里只关心"回执之后链条有没有继续"
    arriveFloor(_floor, _total, { onDone } = {}) { onDone?.(); },
  };
  return stage;
}

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

describe('端到端：runController 的快照下行 / 意图上行（真实编排器，非桩）', () => {
  it('创建即推 prep 快照；意图落回 core 后回推新快照（装备位随之变化）', () => {
    clearSave(false); clearSave(true);
    const map = fakeMapStage();
    const ctrl = createRunController({ seed: 77, mapStage: map });

    // 下行：初始快照就是 prep，且 Stage 拿到的是纯数据
    expect(map.pushes.length).toBeGreaterThan(0);
    const first = map.pushes.at(-1);
    expect(first.kind).toBe('prep');
    expect(first.relicSlots).toEqual({ used: 0, total: ctrl.run.player.relicSlots });

    // 上行：面板点击 → runController 分发 → core 落地 → notify 回推新快照
    grantRelic(ctrl.run, 'warHorn');
    expect(typeof map.intentHandler).toBe('function');
    map.intentHandler({ action: 'equip', relicId: 'warHorn' });

    expect(ctrl.run.player.equippedRelics).toEqual(['warHorn']); // core 真的变了
    const after = map.pushes.at(-1);
    expect(after.relicSlots.used).toBe(1);
    expect(after.relics.find(r => r.id === 'warHorn').equipped).toBe(true);

    // 再点卸下 → 回退
    map.intentHandler({ action: 'unequip', relicId: 'warHorn' });
    expect(ctrl.run.player.equippedRelics).toEqual([]);
    expect(map.pushes.at(-1).relicSlots.used).toBe(0);
  });

  it('未知 action 与坏输入不抛错（面板改版期间的前后兼容）', () => {
    clearSave(false); clearSave(true);
    const map = fakeMapStage();
    const ctrl = createRunController({ seed: 78, mapStage: map });
    expect(() => map.intentHandler(null)).not.toThrow();
    expect(() => map.intentHandler({ action: 'shopBuy' })).not.toThrow();
    expect(() => map.intentHandler({ action: 'equip', relicId: 'noSuchRelic' })).toThrow();
  });
});

describe('rewardSnapshot + 模态面板（卡片三选一）', () => {
  // 造一个处于 reward 阶段的 run（胜利 → 生成战后奖励；初始只有体修包 → 核心自动开包）
  function rewardRun(seed = 51) {
    const run = createRun({ seed });
    enterBattle(run);
    finishBattle(run, 'victory');
    return run;
  }

  it('奖励快照：金币入账 + 卡包 + 卡面视图（describe 已在 core 侧解析）', () => {
    const run = rewardRun();
    const snap = rewardSnapshot(run);
    expect(snap.kind).toBe('reward');
    expect(snap.money).toBeGreaterThan(0);
    expect(snap.packs.length).toBeGreaterThan(0);
    // 初始只解锁体修包 → spawnRewards 已自动开包，直接进选卡态
    expect(snap.packId).toBeTruthy();
    expect(snap.skillChoices).toHaveLength(3);
    for (const c of snap.skillChoices) {
      expect(typeof c.defId).toBe('string');
      expect(c.view).toBeTruthy();
      expect(typeof c.view.text).toBe('string'); // 应用前口径的卡面正文
      // keywords 是原始 id（中文标签的映射在 Stage 侧做，core 不依赖 bridge 的标签表）
      expect(c.view.keywords.every(k => typeof k === 'string')).toBe(true);
      expect(c.view.keywords.includes('消耗')).toBe(false);
    }
  });

  it('未选卡包时快照给瓦片列表（多包可选）', () => {
    const run = rewardRun(52);
    run.rewards.packId = null;
    run.rewards.skillChoices = [];
    run.rewards.packs = ['body', 'fire'];
    const snap = rewardSnapshot(run);
    expect(snap.packId).toBeNull();
    expect(snap.packs.map(p => p.id)).toEqual(['body', 'fire']);
    expect(snap.packs.every(p => typeof p.name === 'string' && typeof p.desc === 'string')).toBe(true);
  });

  it('模态面板：卡包瓦片走 chooseRewardPack；卡面走 claimReward；重建不累积', () => {
    const intents = [];
    const pickables = [];
    const panel = new PanelObject({ form: 'modal', onIntent: (a) => intents.push(a) });
    panel.attachPicker({
      addPickable: (id, obj, opts) => pickables.push({ id, opts }),
      removePickable: (id) => { const i = pickables.findIndex(p => p.id === id); if (i >= 0) pickables.splice(i, 1); },
    });

    // ① 瓦片态（多包未选）
    const run = rewardRun(53);
    run.rewards.packId = null; run.rewards.skillChoices = []; run.rewards.packs = ['body', 'fire'];
    panel.setWidgets('reward', buildRewardPanel(rewardSnapshot(run)));
    expect(panel.buttons.find(b => b.pickId.startsWith('pack:'))).toBeTruthy();
    panel.onClick({ kind: 'button', id: 'pack:fire' });
    expect(intents.at(-1)).toEqual({ action: 'chooseRewardPack', packId: 'fire' });

    // ② 卡面态：卡注册为 kind 'card'（Picker 做 UV 二级查询 → 卡面 token tooltip），
    //    整卡命中走 claimReward
    const run2 = rewardRun(54);
    const snap2 = rewardSnapshot(run2);
    panel.setWidgets('reward', buildRewardPanel(snap2));
    const cardPickables = pickables.filter(p => p.opts.kind === 'card');
    expect(cardPickables).toHaveLength(3);
    expect(pickables.every(p => p.opts.space === 'ui')).toBe(true);
    const first = snap2.skillChoices[0].defId;
    panel.onClick({ kind: 'card', id: `reward:${first}` });
    expect(intents.at(-1)).toEqual({ action: 'claimReward', defId: first });

    // 跳过
    panel.onClick({ kind: 'button', id: 'reward:skip' });
    expect(intents.at(-1)).toEqual({ action: 'claimReward', defId: null });

    // 换内容（卡面 → 卡面）不累积子对象
    const before = panel.children.length;
    panel.setWidgets('reward', buildRewardPanel(snap2));
    expect(panel.children.length).toBe(before);
    panel.dispose();
    expect(pickables).toHaveLength(0);
  });

  it('模态形态：内容居中于取景带、落在带内、卡面横向对称', () => {
    const run = rewardRun(55);
    const panel = new PanelObject({ form: 'modal' });
    panel.setWidgets('reward', buildRewardPanel(rewardSnapshot(run)));
    expect(panel.position.x).toBe(0); // 局部原点 = 取景带中心
    const UI_TOP = -15 + 100 / 2; const UI_BOTTOM = -15 - 100 / 2;
    for (const { top, bottom } of panel.rows) {
      expect(panel.position.y + top).toBeLessThanOrEqual(UI_TOP + 1e-6);
      expect(panel.position.y + bottom).toBeGreaterThanOrEqual(UI_BOTTOM - 1e-6);
    }
    const xs = panel._cards.map(c => c.object.position.x);
    expect(xs).toHaveLength(3);
    expect(xs[0] + xs[2]).toBeCloseTo(0, 4); // 三张卡对称于中线
    expect(xs[1]).toBeCloseTo(0, 4);
    panel.dispose();
  });

  it('模态层序：文字/按钮/卡面全部高于背板（否则背板会盖住它们）', () => {
    const run = rewardRun(57);
    const panel = new PanelObject({ form: 'modal' });
    panel.setWidgets('reward', buildRewardPanel(rewardSnapshot(run)));
    const bgZ = panel.backdropZ;
    for (const { object } of panel._rows) {
      if (object) expect(object.position.z).toBeGreaterThan(bgZ); // 文本行
    }
    for (const btn of panel.buttons) expect(btn.position.z).toBeGreaterThan(bgZ);
    for (const c of panel._cards) expect(c.object.position.z).toBeGreaterThan(bgZ);
    panel.dispose();
  });

  it('端到端：奖励意图落回 core（领取 → 卡进组 → 离房）', () => {
    clearSave(false); clearSave(true);
    const map = fakeMapStage();
    const ctrl = createRunController({ seed: 56, mapStage: map });
    enterBattle(ctrl.run);
    finishBattle(ctrl.run, 'victory');
    const snap = rewardSnapshot(ctrl.run);
    expect(snap.skillChoices).toHaveLength(3);

    const deckBefore = ctrl.run.player.deck.length;
    const pick = snap.skillChoices[0].defId;
    map.intentHandler({ action: 'claimReward', defId: pick });
    expect(ctrl.run.player.deck.length).toBe(deckBefore + 1); // 卡真的进组了
    expect(ctrl.run.gameStage).not.toBe('reward'); // 领取即离房
    // notify 回推的是新阶段的面板（reward 已结束）
    expect(map.pushes.at(-1)?.kind).not.toBe('reward');
  });
});

describe('塔楼抵达节拍：等待必须能结束（回归：曾漏 resolve 卡死战后链条）', () => {
  // 回归背景：endBattle 等待抵达动画的 Promise 漏了 resolve，网页端每次战后
  // notify 都不执行——奖励面板不出现、金币停在旧值；Vue 版面板靠 reactive 掩盖了它。
  // 该逻辑单列为 awaitFloorArrive，正是因为在 headless 下无法整链驱动（BattleStage 要 canvas）。
  const tick = (ms) => new Promise(r => setTimeout(r, ms));

  it('动画正常回执 → 立即结束等待（不是等保险丝）', async () => {
    const seq = new AnimationSequencer({ bus: mitt() });
    const map = fakeMapStage();
    const t0 = Date.now();
    await awaitFloorArrive(seq, map, { floor: 3, totalFloors: 44, ms: 5000 });
    expect(Date.now() - t0).toBeLessThan(400); // 回执即放行，远早于 5s 保险丝
  });

  it('动画永不回执（rAF 暂停/队列被堵）→ 由等待侧保险丝放行，不永久卡死', async () => {
    const seq = new AnimationSequencer({ bus: mitt() });
    const map = fakeMapStage();
    map.arriveFloor = () => {}; // 永不回执
    const t0 = Date.now();
    await awaitFloorArrive(seq, map, { floor: 3, totalFloors: 44, ms: 120 });
    const dt = Date.now() - t0;
    expect(dt).toBeGreaterThanOrEqual(100); // 确实等过
    expect(dt).toBeLessThan(1500);          // 但一定会放行
  });

  it('抵达指令带上正确的层号与帧事件（便于排障）', async () => {
    const seq = new AnimationSequencer({ bus: mitt() });
    const seen = [];
    const map = fakeMapStage();
    map.arriveFloor = (f, t, { onDone } = {}) => { seen.push([f, t]); onDone?.(); };
    await awaitFloorArrive(seq, map, { floor: 7, totalFloors: 44, ms: 200 });
    expect(seen).toEqual([[7, 44]]);
    expect(seq._instructions.every(i => i.status === 'finished')).toBe(true); // 队列不留残节拍
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
