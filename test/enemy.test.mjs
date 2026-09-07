import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { H, W } from "../js/config.js";
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
