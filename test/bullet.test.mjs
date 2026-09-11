import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { stubRandom } from "./_env.mjs";
import { BULLET, H } from "../js/config.js";
import {
  bullets, fireBullet, spawnSplitBullet, spawnEnemyBullet, updateBullets,
  spawnHostileBullet, spawnLaserVolley, applyPierceOrRemove,
  clearBullets, removeBullet, hasPlayerMainBullet, maxMainBulletTraveled,
  markMainBulletsTriggered,
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
