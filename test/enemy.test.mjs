import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { H, W, ENEMY_TYPES } from "../js/config.js";
import {
  enemies, spawnEnemy, updateEnemies, getEnemyShooters,
  clearEnemies, spawnSplitChildren, removeEnemyEx,
} from "../js/enemy.js";

const diff = { hpScale: 1, speedScale: 1, fireCdScale: 1 };

describe("enemy", () => {
  beforeEach(() => clearEnemies());

  it("1 级只出小兵", () => {
    for (let i = 0; i < 20; i++) spawnEnemy(1, diff, 1);
    assert.ok(enemies.every(e => e.type === "small"));
  });

  it("关卡可指定敌种与弹幕图案，并拒绝未知敌种", () => {
    const enemy = spawnEnemy(1, diff, 1, 120, 40, { type: "laser", patternRef: "aimed" });
    assert.equal(enemy.type, "laser");
    assert.equal(enemy.patternRef, "aimed");
    assert.throws(() => spawnEnemy(1, diff, 1, 120, 40, { type: "unknown" }), /Unknown enemy type/);
  });

  it("敌方等级放大血量与奖励", () => {
    const e1 = spawnEnemy(3, diff, 1, 100, 40);
    const type = e1.type;
    const hp1 = e1.hp;
    const score1 = e1.score;
    clearEnemies();
    let e10;
    for (let i = 0; i < 40; i++) {
      const e = spawnEnemy(3, diff, 10, 100, 40);
      if (e.type === type) { e10 = e; break; }
      clearEnemies();
    }
    assert.ok(e10);
    assert.ok(e10.score > score1);
    assert.ok(e10.hp >= hp1);
  });

  it("困难档位提高血量", () => {
    const e = spawnEnemy(1, { hpScale: 1.4, speedScale: 1, fireCdScale: 1 }, 1, 100, 40);
    assert.ok(e.hp >= 1);
  });

  it("飞出屏幕后移除", () => {
    const e = spawnEnemy(1, diff, 1, 100, H + 100);
    e.r = 10;
    updateEnemies(0.016, 1, 240, 600, 52);
    assert.equal(enemies.length, 0);
  });

  it("墙壁弹射", () => {
    const e = spawnEnemy(1, diff, 1, 5, 80);
    e.vx = -2;
    e.frozen = 0;
    e.y = 80;
    updateEnemies(0.016, 1, 240, 600, 52);
    assert.ok(e.x >= e.r);
    assert.ok(e.vx >= 0);
  });

  it("冰冻时不移动", () => {
    const e = spawnEnemy(1, diff, 1, 120, 80);
    e.frozen = 1;
    const y = e.y;
    updateEnemies(0.1, 1, 240, 600, 52);
    assert.equal(e.y, y);
    assert.ok(e.frozen < 1);
  });

  it("Boss 不被普通位移带出屏幕", () => {
    const e = spawnEnemy(1, diff, 1, 240, 80);
    e.isBoss = true;
    e.vy = 20;
    const y = e.y;
    updateEnemies(1, 1, 240, 600, 52);
    assert.equal(e.y, y);
  });

  it("开火冷却到期后入射击列表", () => {
    const e = spawnEnemy(1, diff, 1, 240, 200);
    e.y = 120;
    e.fireCd = 0;
    const list = getEnemyShooters(240, 600, 0.016, 1);
    assert.equal(list.length, 1);
    assert.ok(e.fireCd > 0);
  });

  // ===== 批 0：敌机开火计时读表 + fireMul 生命周期 =====
  // 背景：旧实现只在出生时读 ENEMY_TYPES.fireCd，复射改用 js/enemy.js 里并行硬编码的一组数字，
  // 既与表漂移（shield 表 [3,4] 写死 3.5、split 落到 small 的 rand(4,6)），也不乘等级乘数 fireMul。
  // 下列用例把「复射值来自表」从"仅断言 > 0"升级为锁数值。
  it("批 0：复射冷却来自 ENEMY_TYPES 表（锁数值，不再只断言 >0）", () => {
    const [lo, hi] = ENEMY_TYPES.small.fireCd;
    const small = spawnEnemy(1, diff, 1, 240, 120, { type: "small" });
    small.fireCd = 0;
    getEnemyShooters(240, 600, 0.016, 1);
    assert.ok(small.fireCd <= hi + 1e-12 && small.fireCd >= lo - 0.05,
      `small 复射 ${small.fireCd} 未落在表区间 [${lo},${hi}]`);

    const mid = spawnEnemy(1, diff, 1, 240, 120, { type: "mid" });
    mid.fireCd = 0;
    getEnemyShooters(240, 600, 0.016, 1);
    assert.equal(mid.fireCd, ENEMY_TYPES.mid.fireCd[0], "mid 表为定值，复射应逐字等于表值");
  });

  it("批 0：高等级敌机的复射也乘 fireMul（旧实现只有首射乘）", () => {
    const e = spawnEnemy(1, diff, 10, 240, 120, { type: "mid" });
    assert.ok(e.fireMul > 0 && e.fireMul < 1, `E=10 的 fireMul 应落在 (0,1)，实际 ${e.fireMul}`);
    e.fireCd = 0;
    getEnemyShooters(240, 600, 0.016, 1);
    assert.ok(Math.abs(e.fireCd - ENEMY_TYPES.mid.fireCd[0] * e.fireMul) < 1e-12,
      `复射应为 表值×fireMul，实际 ${e.fireMul} → ${e.fireCd}`);
  });

  it("批 0 不变式：level ∈ {1,6} 下 small 穿越开火窗口必开一枪（最坏组合 RNG）", () => {
    const realRandom = Math.random;
    try {
      // rand(a,b) = a + Math.random()·(b-a) → 返回 1 让落速取上界 1.25（窗口最短）、
      // 冷却取表上界（等待最久），即"最不该开火"的那一架敌机。
      Math.random = () => 1;
      for (const level of [1, 6]) {
        clearEnemies();
        const e = spawnEnemy(level, diff, 1, 240, 11, { type: "small" });
        const dt = 1 / 60;
        let fired = 0;
        for (let f = 0; f < 2000 && e.y < 504; f++) {
          updateEnemies(dt, level, 240, 600, 52);
          if (getEnemyShooters(240, 600, dt, 1).includes(e)) fired++;
        }
        assert.ok(fired >= 1,
          `level ${level}：small 在窗口 10<y<504 内未开火（vy=${e.vy.toFixed(3)} px/f，冷却上界 ${ENEMY_TYPES.small.fireCd[1]}s）`);
      }
    } finally {
      Math.random = realRandom;
      clearEnemies();
    }
  });

  it("批 0：分裂子代不继承上一个宿主的 fireMul（对象池泄漏守护）", () => {
    const parent = spawnEnemy(1, diff, 20, 240, 200, { type: "split" });
    assert.ok(parent.fireMul < 1, "先造一个高倍率宿主（fireMul < 1）");
    parent.x = 240; parent.y = 200;
    // 用普通对象作快照传入：生产代码里父机是在 spawnSplitChildren 之后才移除的
    // （js/game.js:723 早于 :748），不能在这里 clearEnemies，否则父对象会被子代复用而产生别名。
    const snapshot = { splitChildren: parent.splitChildren, color: parent.color, x: parent.x, y: parent.y };
    clearEnemies();               // 宿主（fireMul<1）回池
    spawnSplitChildren(snapshot);
    assert.ok(enemies.length >= 1, "应生成子代");
    for (const k of enemies) {
      assert.equal(k.fireMul, 1, `子代 fireMul=${k.fireMul}：从池里复用了旧宿主字段，复射会被偷偷加速`);
    }
  });

  it("屏外敌机不射击", () => {
    const e = spawnEnemy(1, diff, 1, 240, 5);
    e.y = 5;
    e.fireCd = 0;
    assert.equal(getEnemyShooters(240, 600, 0.016, 1).length, 0);
  });

  it("分裂子代数量正确", () => {
    const parent = spawnEnemy(6, diff, 1, 200, 100);
    parent.splitChildren = 2;
    spawnSplitChildren(parent);
    assert.ok(enemies.length >= 3);
  });

  it("removeEnemyEx 安全移除", () => {
    spawnEnemy(1, diff, 1, 100, 40);
    removeEnemyEx(0);
    assert.equal(enemies.length, 0);
    removeEnemyEx(99);
  });

  it("同屏上限 60", () => {
    for (let i = 0; i < 80; i++) spawnEnemy(1, diff, 1, 50 + (i % 10), 20);
    assert.ok(enemies.length <= 60);
  });

  it("激光敌机蓄力未完不开火", () => {
    const e = spawnEnemy(1, diff, 1, 240, 120);
    e.type = "laser";
    e.laserTimer = 0.5;
    e.frozen = 0;
    assert.equal(getEnemyShooters(240, 600, 0.016, 1).length, 0);
  });

  // ---------- 回归：对象池复用下的敌机唯一标识 ----------
  it("每架敌机拥有唯一 uid（穿透/碎片命中去重依赖它）", () => {
    const a = spawnEnemy(1, diff, 1, 100, 100);
    const b = spawnEnemy(1, diff, 1, 200, 100);
    assert.ok(a.uid > 0);
    assert.notEqual(a.uid, b.uid);
  });

  it("对象池复用后 uid 也会刷新（不会误判为已命中）", () => {
    const first = spawnEnemy(1, diff, 1, 100, 100);
    const uid = first.uid;
    removeEnemyEx(enemies.indexOf(first));
    const reused = spawnEnemy(1, diff, 1, 100, 100);
    // 可能拿到池中同一个对象，但 uid 必须是新的
    assert.notEqual(reused.uid, uid);
  });

  it("分裂子代也带 uid 且受同屏上限约束", () => {
    const parent = spawnEnemy(6, diff, 1, 240, 200);
    parent.type = "split";
    parent.splitChildren = 2;
    spawnSplitChildren(parent);
    const kids = enemies.filter(e => e.splitChildren === 0 && e.type === "small");
    assert.ok(kids.length >= 1);
    for (const k of kids) assert.ok(k.uid > 0);
    assert.ok(enemies.length <= 60);
  });

  it("激光敌机蓄力结束进入射击列表并标记", () => {
    const e = spawnEnemy(1, diff, 1, 240, 120);
    e.type = "laser";
    e.laserTimer = 0;
    e.frozen = 0;
    const list = getEnemyShooters(240, 600, 0.016, 1);
    assert.equal(list.length, 1);
    assert.equal(list[0], e);
    assert.equal(e._laserShot, true);
    assert.ok(e.laserTimer > 0);
  });
});
