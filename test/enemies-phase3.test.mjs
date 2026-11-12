/* ===========================================================
 * enemies-phase3.test.mjs — Phase 3 三敌种（weaver/tank/swarm）护栏
 * 覆盖：配置字段与数值关系、等级门控、weaver zigzag 用配置真值、
 *       非 zigzag 敌种保持直线、分裂子代不继承 patternRef/patternParams。
 * 全部断言读配置，不写死池长/像素值。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { ENEMY_TYPES } from "../js/config.js";
import {
  clearEnemies, spawnEnemy, updateEnemies, spawnSplitChildren, enemies, getEnemyTypePool,
} from "../js/enemy.js";

const count = (arr, id) => arr.filter(x => x === id).length;

describe("Phase 3 敌种：配置与门控", () => {
  it("三新种字段完整，且数值关系相对现有敌种单调", () => {
    for (const id of ["weaver", "tank", "swarm"]) {
      const c = ENEMY_TYPES[id];
      assert.ok(c, `${id} 未登记`);
      assert.ok(c.r > 0 && c.hp > 0 && c.score > 0 && c.xp > 0 && c.speed > 0, `${id} 字段非法`);
      assert.ok(Array.isArray(c.fireCd) && c.fireCd[0] > 0 && c.fireCd[1] >= c.fireCd[0], `${id} fireCd 非法`);
    }
    assert.ok(ENEMY_TYPES.tank.hp > ENEMY_TYPES.big.hp, "tank 应比 big 更肉");
    assert.ok(ENEMY_TYPES.tank.speed < ENEMY_TYPES.big.speed, "tank 应比 big 更慢");
    assert.ok(ENEMY_TYPES.tank.r > ENEMY_TYPES.big.r, "tank 应比 big 更大");
    assert.ok(ENEMY_TYPES.swarm.speed > ENEMY_TYPES.small.speed, "swarm 应比 small 更快");
    assert.ok(ENEMY_TYPES.swarm.hp <= ENEMY_TYPES.small.hp, "swarm 不应比 small 更肉");
    assert.ok(ENEMY_TYPES.swarm.r < ENEMY_TYPES.small.r, "swarm 应比 small 更小");
  });

  it("等级门控：L3/L6/L7/L9/L10 逐级解锁，低等级不误入", () => {
    for (const id of ["weaver", "tank", "swarm"]) {
      assert.equal(count(getEnemyTypePool(2), id), 0, `L2 不应出现 ${id}`);
    }
    assert.equal(count(getEnemyTypePool(3), "weaver"), 1, "L3 应解锁 weaver");
    assert.equal(count(getEnemyTypePool(6), "weaver"), 1, "L6 前 weaver 仍为 1 份");
    assert.equal(count(getEnemyTypePool(6), "tank"), 1, "L6 应解锁 tank");
    assert.equal(count(getEnemyTypePool(7), "weaver"), 2, "L7 weaver 应为 2 份");
    assert.equal(count(getEnemyTypePool(9), "swarm"), 2, "L9 swarm 应为 2 份");
    assert.equal(count(getEnemyTypePool(9), "tank"), 1, "L9 tank 仍为 1 份");
    assert.equal(count(getEnemyTypePool(10), "tank"), 2, "L10 tank 应为 2 份");
    assert.ok(getEnemyTypePool(9).length > getEnemyTypePool(8).length, "解锁应让类型池单调不减");
  });
});

describe("Phase 3 敌种：行为", () => {
  it("weaver 的 zigzag 位移由配置 amp 真值决定", () => {
    clearEnemies();
    const e = spawnEnemy(9, null, 1, 240, 200, { type: "weaver" });
    e.vx = 0; e.vy = 0; e.frozen = 0; e.t = 0;
    const zig = ENEMY_TYPES.weaver.zigzag;
    assert.ok(zig, "weaver 必须带 zigzag 配置");
    const dt = 1 / 60;
    const x0 = e.x;
    updateEnemies(dt, 9, 240, 600, 720, dt);
    const expected = Math.cos(0 * zig.freq) * zig.amp * dt * 60;   // 直线项为 0、sin(0)=0
    assert.ok(Math.abs((e.x - x0) - expected) < 1e-9,
      `zigzag 位移应为 ${expected}，实测 ${(e.x - x0).toFixed(6)}`);
  });

  it("无 zigzag 字段的敌种保持直线（不会误加正弦）", () => {
    clearEnemies();
    const e = spawnEnemy(9, null, 1, 240, 200, { type: "tank" });
    e.vx = 0; e.vy = 0; e.frozen = 0; e.t = 0;
    const x0 = e.x;
    updateEnemies(1 / 60, 9, 240, 600, 720, 1 / 60);
    assert.ok(Math.abs(e.x - x0) < 1e-9, `tank 不应有横向机动，实测 ${(e.x - x0).toFixed(6)}`);
  });

  it("分裂子代不继承宿主的 patternRef/patternParams（对象池残留守卫）", () => {
    clearEnemies();
    const parent = spawnEnemy(9, null, 1, 240, 200, { type: "split" });
    parent.patternRef = "wall";
    parent.patternParams = { count: 11 };
    parent.splitChildren = 3;
    const before = enemies.length;
    spawnSplitChildren(parent);
    const kids = enemies.slice(before);
    assert.equal(kids.length, 3, "应生成 3 个子代");
    for (const k of kids) {
      assert.equal(k.patternRef, null, "子代不应继承 patternRef");
      assert.equal(k.patternParams, null, "子代不应继承 patternParams");
    }
  });
});