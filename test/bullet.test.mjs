import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { stubRandom } from "./_env.mjs";
import { BULLET, H } from "../js/config.js";
import {
  bullets, fireBullet, spawnSplitBullet, spawnEnemyBullet, updateBullets,
  spawnHostileBullet, spawnLaserVolley, applyPierceOrRemove,
  clearBullets, removeBullet, hasPlayerMainBullet, maxMainBulletTraveled,
  markMainBulletsTriggered, spawnSplitBurst,
  canHitEnemy, markHitEnemy, headingToBulletAngle, countFriendlyBullets,
} from "../js/bullet.js";
import { createPlayer } from "../js/player.js";
import { META } from "../js/config.js";

function playerWith(skills = {}, extra = {}) {
  const p = createPlayer(META.aircraft.falcon, {});
  p.skills = { ...p.skills, ...skills };
  Object.assign(p, extra);
  return p;
}

describe("bullet", () => {
  beforeEach(() => clearBullets());

  it("开火生成友方子弹并回写字段", () => {
    const p = playerWith();
    const b = fireBullet(0, 1, p, 100, 200);
    assert.equal(bullets.length, 1);
    assert.equal(b.friendly, true);
    assert.equal(b.x, 100);
    assert.equal(b.y, 200);
    assert.ok(b.maxRange > 0);
  });

  it("射程随技能与等级叠加并封顶", () => {
    const p = playerWith({ range: 1 }, { level: 2 });
    const b = fireBullet(0, 1, p);
    const expected = BULLET.baseRange + BULLET.rangePerLevel + BULLET.levelRangePerLevel;
    assert.equal(b.maxRange, expected);
    const p2 = playerWith({ range: 5 }, { level: 200 });
    const b2 = fireBullet(0, 1, p2);
    assert.equal(b2.maxRange, H + BULLET.rangeCapMargin);
  });

  it("穿透/分裂/爆炸行为可叠加", () => {
    // expChance 堆高使爆炸概率为 100%，保证断言确定性
    const p = playerWith({ penetrate: 2, split: 1, explosion: 2, expChance: 10, expRange: 2 });
    const b = fireBullet(0, 1, p);
    assert.ok(b.behaviors.has("penetrate"));
    assert.ok(b.behaviors.has("split"));
    assert.ok(b.behaviors.has("explosion"));
    assert.equal(b.maxPierce, 2);
    assert.equal(b.splitCount, 1 + BULLET.splitCountPerLevel);
    assert.equal(b.explosionRadius, BULLET.explosionBaseRadius + 2 * BULLET.explosionRadiusPerLevel);
  });

  it("致命暴击 buff 必暴且提高倍率", () => {
    const p = playerWith({ crit: 1, critdmg: 2 });
    p.buffs.critboost = 8;
    const b = fireBullet(0, 2, p);
    assert.equal(b.isCrit, true);
    assert.equal(b.dmg, Math.round(2 * (BULLET.critMulti + 0.5 + 0.5 * 2)));
  });

  it("子弹加速技能提高初速", () => {
    const p = playerWith({ bulletSpeed: 2 });
    const b = fireBullet(0, 1, p, 0, 0, BULLET.baseSpeed);
    assert.ok(Math.abs(b.vy) > BULLET.baseSpeed);
  });

  it("天基武器赋予加速度", () => {
    const p = playerWith({ orbital: 2 });
    const b = fireBullet(0, 1, p);
    assert.ok(b.accel > 0);
  });

  it("子弹按角度发射：正向偏右上", () => {
    const p = playerWith();
    const b = fireBullet(0.2, 1, p, 240, 360, BULLET.baseSpeed);
    assert.ok(b.vx > 0, "正角度应有正水平速度");
    assert.ok(b.vy < 0, "仍应向上");
    assert.ok(Math.abs(b.vy) > b.vx, "垂直分量应占主导");
  });

  it("子弹按角度发射：负向偏左上", () => {
    const p = playerWith();
    const b = fireBullet(-0.2, 1, p, 240, 360, BULLET.baseSpeed);
    assert.ok(b.vx < 0, "负角度应有负水平速度");
    assert.ok(b.vy < 0, "仍应向上");
  });

  it("子弹按角度发射：大角度水平分量显著", () => {
    const p = playerWith();
    const b = fireBullet(Math.PI / 2, 1, p, 240, 360, BULLET.baseSpeed);
    assert.ok(b.vx > BULLET.baseSpeed * 0.9, "90度时应几乎全水平");
    assert.ok(Math.abs(b.vy) < BULLET.baseSpeed * 0.1, "90度时垂直分量应趋近于零");
  });

  it("updateBullets 推进并按射程销毁", () => {
    const p = playerWith();
    const b = fireBullet(0, 1, p, 240, 360);
    b.maxRange = 8;
    updateBullets(1);
    assert.equal(hasPlayerMainBullet(), false);
  });

  it("天基武器加速不超过上限", () => {
    const p = playerWith({ orbital: 3 });
    const b = fireBullet(0, 1, p, 240, 400);
    b.vy = -BULLET.orbitalMaxSpeed;
    b.maxRange = 9999;
    updateBullets(1);
    assert.ok(Math.abs(b.vy) <= BULLET.orbitalMaxSpeed + 1e-6);
  });

  it("分裂弹标记为散射碎片", () => {
    const b = spawnSplitBullet(10, 20, 0, 1, "#fff", 4);
    assert.equal(b.isScatter, true);
    assert.equal(b.friendly, true);
  });

  it("分裂距离技能：碎片射程随等级增加", () => {
    const p1 = playerWith({ split: 1 });
    const b1 = fireBullet(0, 1, p1, 240, 400);
    assert.equal(b1.splitRange, BULLET.splitFragBaseRange, "未学分裂距离时碎片为基础射程");

    const p2 = playerWith({ split: 1, splitDist: 3 });
    const b2 = fireBullet(0, 1, p2, 240, 400);
    assert.equal(b2.splitRange, BULLET.splitFragBaseRange + 3 * BULLET.splitFragRangePerLevel);
  });

  it("分裂弹按角度发射", () => {
    const bUp = spawnSplitBullet(10, 20, 0, 1, "#fff", 4);
    assert.equal(bUp.vx, 0, "0角度水平速度为零");
    assert.ok(bUp.vy < 0, "0角度应向上");

    const bRight = spawnSplitBullet(10, 20, Math.PI / 2, 1, "#fff", 4);
    assert.ok(bRight.vx > 0, "正角度应有正水平速度");

    const bLeft = spawnSplitBullet(10, 20, -Math.PI / 2, 1, "#fff", 4);
    assert.ok(bLeft.vx < 0, "负角度应有负水平速度");
  });

  it("敌方子弹朝玩家方向", () => {
    const e = { x: 100, y: 100, r: 16 };
    const b = spawnEnemyBullet(e, 100, 200, 1);
    assert.equal(b.friendly, false);
    assert.ok(b.vy > 0);
  });

  it("clearBullets 可只清敌弹", () => {
    const p = playerWith();
    fireBullet(0, 1, p);
    spawnEnemyBullet({ x: 10, y: 10, r: 8 }, 20, 20);
    clearBullets(true);
    assert.equal(bullets.every(b => b.friendly), true);
    clearBullets();
    assert.equal(bullets.length, 0);
  });

  it("主弹 refire 标记防连射", () => {
    const p = playerWith();
    fireBullet(0, 1, p, 100, 200);
    bullets[0].traveled = 80;
    assert.equal(maxMainBulletTraveled(), 80);
    markMainBulletsTriggered();
    assert.equal(maxMainBulletTraveled(), 0);
  });

  it("countFriendlyBullets 只统计友方子弹（同屏密度兜底）", () => {
    clearBullets();
    const p = playerWith();
    fireBullet(0, 1, p);
    fireBullet(0, 1, p);
    spawnEnemyBullet({ x: 30, y: 30, r: 8 }, 60, 60);
    assert.equal(bullets.length, 3);
    assert.equal(countFriendlyBullets(), 2);
    clearBullets();
    assert.equal(countFriendlyBullets(), 0);
  });

  it("removeBullet 从数组移除", () => {
    const p = playerWith();
    const b = fireBullet(0, 1, p);
    removeBullet(b);
    assert.equal(bullets.length, 0);
  });

  it("spawnHostileBullet 生成敌方子弹字段", () => {
    const b = spawnHostileBullet(30, 40, 1, 2, { r: 7, color: "#123456", dmg: 3 });
    assert.equal(bullets.length, 1);
    assert.equal(b.friendly, false);
    assert.equal(b.x, 30);
    assert.equal(b.y, 40);
    assert.equal(b.vx, 1);
    assert.equal(b.vy, 2);
    assert.equal(b.r, 7);
    assert.equal(b.color, "#123456");
    assert.equal(b.dmg, 3);
    assert.ok(!b.behaviors.has("penetrate"));
  });

  it("spawnLaserVolley 三发平行快弹瞄准玩家", () => {
    const e = { x: 100, y: 100, r: 16 };
    const shots = spawnLaserVolley(e, 100, 300, 1);
    assert.equal(shots.length, 3);
    assert.equal(bullets.length, 3);
    for (const b of shots) {
      assert.equal(b.friendly, false);
      assert.equal(b.color, "#ff4444");
      assert.ok(b.vy > 0);
      assert.equal(b.vx, 0);
    }
    assert.notEqual(shots[0].x, shots[1].x);
    assert.notEqual(shots[1].x, shots[2].x);
  });

  it("applyPierceOrRemove 普通弹命中即移除", () => {
    const p = playerWith();
    const b = fireBullet(0, 1, p);
    assert.equal(applyPierceOrRemove(b), true);
    assert.equal(bullets.length, 0);
  });

  it("applyPierceOrRemove 穿透弹按次数消耗", () => {
    const p = playerWith({ penetrate: 2 });
    const b = fireBullet(0, 1, p);
    assert.equal(applyPierceOrRemove(b), false);
    assert.equal(b.pierceCount, 1);
    assert.equal(applyPierceOrRemove(b), false);
    assert.equal(b.pierceCount, 2);
    assert.equal(applyPierceOrRemove(b), true);
    assert.equal(bullets.length, 0);
  });

  it("applyPierceOrRemove 散射碎片不销毁", () => {
    const b = spawnSplitBullet(10, 20, 0, 1, "#fff", 4);
    assert.equal(b.isScatter, true);
    assert.equal(applyPierceOrRemove(b), false);
    assert.equal(applyPierceOrRemove(b), false);
    assert.equal(bullets.length, 1);
  });

  // ---------- 回归：分裂碎片方向 ----------
  it("headingToBulletAngle 与 fireBullet 的角度约定互逆", () => {
    const p = playerWith();
    // 正上方
    const up = fireBullet(0, 1, p, 240, 400);
    assert.ok(Math.abs(headingToBulletAngle(up.vx, up.vy)) < 1e-9, "向上飞行应换算回 0");
    // 正右方（左右护法）
    const right = fireBullet(Math.PI / 2, 1, p, 240, 400);
    assert.ok(Math.abs(headingToBulletAngle(right.vx, right.vy) - Math.PI / 2) < 1e-9, "向右飞行应换算回 +90°");
    // 正左方
    const left = fireBullet(-Math.PI / 2, 1, p, 240, 400);
    assert.ok(Math.abs(headingToBulletAngle(left.vx, left.vy) + Math.PI / 2) < 1e-9, "向左飞行应换算回 -90°");
    // 斜向右上
    const diag = fireBullet(0.6, 1, p, 240, 400);
    assert.ok(Math.abs(headingToBulletAngle(diag.vx, diag.vy) - 0.6) < 1e-9);
  });

  it("分裂碎片沿主弹前进方向飞（不横向乱飞）", () => {
    clearBullets();
    const p = playerWith();
    const parent = fireBullet(0, 1, p, 240, 400);   // 正上方飞行
    const dir = headingToBulletAngle(parent.vx, parent.vy);
    spawnSplitBurst(240, 400, dir, 4, 1, "#fff", parent.r, 120);
    const frags = bullets.filter(b => b.isScatter);
    assert.equal(frags.length, 4);
    // 全部碎片都应保持向上（vy<0），且整体方向围绕父弹方向，而非向左/右
    for (const f of frags) {
      assert.ok(f.vy < 0, "向上飞行的主弹，碎片也必须继续向上");
    }
    const avgVx = frags.reduce((s, f) => s + f.vx, 0) / frags.length;
    assert.ok(Math.abs(avgVx) < 1e-6, "对称扇形碎片的平均水平分量应为 0");
  });

  it("左右护法（水平弹）触发分裂时碎片保持水平", () => {
    clearBullets();
    const p = playerWith();
    const parent = fireBullet(Math.PI / 2, 1, p, 240, 400);  // 向右水平
    const dir = headingToBulletAngle(parent.vx, parent.vy);
    spawnSplitBurst(240, 400, dir, 3, 1, "#fff", parent.r, 120);
    const frags = bullets.filter(b => b.isScatter);
    assert.equal(frags.length, 3);
    for (const f of frags) {
      assert.ok(f.vx > 0, "向右水平的主弹，碎片应继续向右");
    }
  });

  // ---------- 回归：穿透/碎片每敌只结算一次 ----------
  it("同一敌机不会被同一颗子弹重复命中", () => {
    const p = playerWith({ penetrate: 3 });
    const b = fireBullet(0, 1, p);
    const enemy = { uid: 7 };
    assert.equal(canHitEnemy(b, enemy), true);
    markHitEnemy(b, enemy);
    assert.equal(canHitEnemy(b, enemy), false, "穿透弹停留期间不得对同一敌机反复扣血");
    // 另一架敌机仍可命中
    assert.equal(canHitEnemy(b, { uid: 8 }), true);
  });

  it("子弹回收进对象池后命中记录被清空（对象复用不会误判）", () => {
    const b = fireBullet(0, 1, playerWith());
    markHitEnemy(b, { uid: 42 });
    removeBullet(b);
    const b2 = fireBullet(0, 1, playerWith());
    assert.equal(canHitEnemy(b2, { uid: 42 }), true, "复用对象必须重置命中集合");
  });

  it("碎片数量与分裂等级一致（1级2片、满级6片）", () => {
    for (let lv = 1; lv <= 5; lv++) {
      clearBullets();
      const p = playerWith({ split: lv });
      const b = fireBullet(0, 1, p, 240, 400);
      assert.equal(b.splitCount, 1 + lv * BULLET.splitCountPerLevel);
      spawnSplitBurst(240, 400, 0, b.splitCount, 1, "#fff", b.r, 120);
      assert.equal(bullets.filter(x => x.isScatter).length, 1 + lv * BULLET.splitCountPerLevel);
    }
  });

  // ---------- 回归：天基武器不得篡改飞行方向 ----------
  it("天基武器沿原方向加速，不把水平弹掰成向上", () => {
    clearBullets();
    const p = playerWith({ orbital: 5 });
    const b = fireBullet(Math.PI / 2, 1, p, 240, 400);   // 向右水平
    b.maxRange = 9999;
    const dirBefore = Math.atan2(b.vy, b.vx);
    updateBullets(0.5);
    assert.ok(b.vy !== undefined && Math.abs(b.vy) < 1e-9, "水平弹加速后仍应保持水平");
    assert.ok(b.vx > BULLET.baseSpeed, "水平弹应被加速");
    assert.ok(Math.abs(Math.atan2(b.vy, b.vx) - dirBefore) < 1e-9, "加速不得改变飞行方向");
  });

  it("天基武器对向上飞行的子弹加速且不超过上限", () => {
    clearBullets();
    const p = playerWith({ orbital: 5 });
    const b = fireBullet(0, 1, p, 240, 400);
    b.maxRange = 9999;
    const before = Math.abs(b.vy);
    updateBullets(1);
    assert.ok(Math.abs(b.vy) > before, "应被加速");
    assert.ok(Math.abs(b.vy) <= BULLET.orbitalMaxSpeed + 1e-6, "不得超过速度上限");
  });

  it("天赋暴击率与技能暴击叠加", () => {
    const p = playerWith({ crit: 0 }, { talentCrit: 0.95 });
    const restore = stubRandom([0.5]);
    try {
      const b = fireBullet(0, 1, p);
      assert.equal(b.isCrit, true);
    } finally {
      restore();
    }
  });
});
