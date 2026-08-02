import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { UnitObject } from '../src/stage/objects/UnitObject.js';

function makeUnit(extra = {}) {
  const baked = [];
  const unit = new UnitObject({
    uniqueID: 'u1', side: 'player',
    bakeLabel: (text) => {
      baked.push(text);
      return { texture: new THREE.Texture(), width: 100, height: 20 };
    },
    ...extra,
  });
  return { unit, baked };
}

const proj = (over = {}) => ({
  hp: 20, maxHp: 40, shield: 0, isDead: false, effects: [], ...over,
});

describe('UnitObject 护盾层', () => {
  it('无盾：护盾层隐藏，主标签不含"盾"后缀', () => {
    const { unit, baked } = makeUnit();
    unit.setUnit(proj());
    expect(unit._shieldGroup.visible).toBe(false);
    expect(baked[0]).toBe('20/40');
    expect(baked[0]).not.toContain('盾');
  });

  it('获得护盾：保护框可见 + 数值重烘 + chip 放缩跳动', () => {
    const { unit, baked } = makeUnit();
    unit.setUnit(proj());
    unit.setUnit(proj({ shield: 5 }));
    expect(unit._shieldGroup.visible).toBe(true);
    expect(baked).toContain('5'); // chip 数值文本
    expect(unit._shieldPopT).toBeGreaterThan(0); // 跳动已触发
    unit.update(0.1);
    expect(unit._shieldChip.scale.x).toBeGreaterThan(1); // 放缩中
    unit.update(1); // 跳动衰减完毕回 1
    expect(unit._shieldChip.scale.x).toBeCloseTo(1, 5);
  });

  it('数值变更（不破碎）：再跳动', () => {
    const { unit } = makeUnit();
    unit.setUnit(proj({ shield: 5 }));
    unit._shieldPopT = 0;
    unit.setUnit(proj({ shield: 8 }));
    expect(unit._shieldGroup.visible).toBe(true);
    expect(unit._shieldPopT).toBeGreaterThan(0);
  });

  it('护盾消失（>0→0）：护盾层静默隐藏、不播跳动（破碎碎粒由 BattleStage 伤害节拍驱动）', () => {
    const { unit } = makeUnit();
    unit.setUnit(proj({ shield: 5 }));
    unit._shieldPopT = 0;
    unit.setUnit(proj({ shield: 0 }));
    expect(unit._shieldGroup.visible).toBe(false);
    expect(unit._shieldPopT).toBe(0);
  });

  it('首帧带盾：直接可见但不播跳动（初始定植不算变更）', () => {
    const { unit } = makeUnit();
    unit.setUnit(proj({ shield: 5 }));
    expect(unit._shieldGroup.visible).toBe(true);
    expect(unit._shieldPopT).toBe(0);
  });

  it('护盾值不变时 chip 文本不重烘', () => {
    const { unit, baked } = makeUnit();
    unit.setUnit(proj({ shield: 5 }));
    const n = baked.length;
    unit.setUnit(proj({ hp: 15, shield: 5 })); // hp 变、盾不变
    expect(baked.length).toBe(n + 1); // 只有主标签重烘
    expect(baked[baked.length - 1]).toBe('15/40');
  });

  it('状态绘制浮于场景之上：depthTest 关闭 + renderOrder≥60；立牌本体仍吃深度', () => {
    const { unit } = makeUnit();
    unit.setUnit(proj({ shield: 5 }));
    const statusMeshes = [
      unit._hpBg, unit._hpFill, unit._label,
      ...unit._shieldFrame, unit._shieldLabel,
      ...unit._shieldChip.children,
    ];
    for (const m of statusMeshes) {
      expect(m.material.depthTest).toBe(false);
      expect(m.material.depthWrite).toBe(false); // 不污染体积光 RT 深度
      expect(m.renderOrder).toBeGreaterThanOrEqual(60); // 场景之上、粒子之下
      expect(m.renderOrder).toBeLessThan(70);
    }
    // renderOrder 严格递增可画序（depthTest 关闭后只能靠 painter 序）
    const orders = [unit._hpBg, unit._hpFill, unit._label].map(m => m.renderOrder);
    expect(orders[0]).toBeLessThan(orders[1]);
    expect(orders[1]).toBeLessThan(orders[2]);
    // 立牌本体仍是场景物：吃深度、可被遮蔽
    expect(unit._body.material.depthTest).toBe(true);
  });
});
