import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { SCORE_AXIS, levelFromScore, DIFFICULTY, ENEMY_LEVEL, enemyLevelScale } from "../js/config.js";
import { spawnEnemy, clearEnemies } from "../js/enemy.js";

describe("统一得分轴（玩家难度 / 敌方等级单一真源）", () => {
  it("七段表结构完整，两条曲线单调不减", () => {
    assert.ok(SCORE_AXIS.length >= 2);
    for (let i = 1; i < SCORE_AXIS.length; i++) {
      assert.ok(SCORE_AXIS[i].at > SCORE_AXIS[i - 1].at, `第 ${i} 段 at 未递增`);
      assert.ok(SCORE_AXIS[i].playerLevel >= SCORE_AXIS[i - 1].playerLevel, `第 ${i} 段玩家等级回退`);
      assert.ok(SCORE_AXIS[i].enemyLevel >= SCORE_AXIS[i - 1].enemyLevel, `第 ${i} 段敌方等级回退`);
    }
  });

  it("玩家封顶 14、敌方封顶 18、差值不超过 4", () => {
    for (const s of [0, 1, 8000, 20000, 35000, 58500, 100000, 180000, 1e9]) {
      const { playerLevel, enemyLevel } = levelFromScore(SCORE_AXIS, s);
      assert.ok(playerLevel <= DIFFICULTY.maxLevel, `score=${s} 玩家等级 ${playerLevel} 超上限`);
      assert.ok(enemyLevel <= 18, `score=${s} 敌方等级 ${enemyLevel} 超上限`);
      assert.ok(enemyLevel >= playerLevel, `score=${s} 敌方等级低于玩家等级`);
      assert.ok(enemyLevel - playerLevel <= 4, `score=${s} 两曲线差值 ${enemyLevel - playerLevel} 超限`);
    }
  });

  it("0..200000 全量扫描保持单调", () => {
    let prevL = 0, prevE = 0;
    for (let s = 0; s <= 200000; s += 500) {
      const { playerLevel, enemyLevel } = levelFromScore(SCORE_AXIS, s);
      assert.ok(playerLevel >= prevL, `score=${s} 玩家等级回退`);
      assert.ok(enemyLevel >= prevE, `score=${s} 敌方等级回退`);
      prevL = playerLevel;
      prevE = enemyLevel;
    }
  });

  it("无效输入回退到首段", () => {
    for (const s of [-1, NaN, undefined, null]) {
      const r = levelFromScore(SCORE_AXIS, s);
      assert.equal(r.playerLevel, 1);
      assert.equal(r.enemyLevel, 1);
    }
  });
});

describe("敌机开火乘数钳正", () => {
  const fireMulOf = (E) => {
    const scale = enemyLevelScale(E);
    return Math.max(ENEMY_LEVEL.fireCdMinMul, 1 + scale * ENEMY_LEVEL.fireCdPerLevel);
  };

  it("E<=25 时与旧公式逐位一致（钳制不改变既有区间）", () => {
    for (let E = 1; E <= 25; E++) {
      const old = 1 + enemyLevelScale(E) * ENEMY_LEVEL.fireCdPerLevel;
      assert.ok(Math.abs(fireMulOf(E) - old) < 1e-12, `E=${E} 行为被改变`);
    }
    assert.equal(fireMulOf(25), fireMulOf(25));
    assert.ok(fireMulOf(25) > ENEMY_LEVEL.fireCdMinMul, "E=25 仍应高于下限，钳制尚未生效");
  });

  it("E=1..99 全域乘数为正且不低于下限", () => {
    for (let E = 1; E <= 99; E++) {
      assert.ok(fireMulOf(E) >= ENEMY_LEVEL.fireCdMinMul - 1e-12, `E=${E} 低于下限`);
      assert.ok(fireMulOf(E) > 0, `E=${E} 乘数非正`);
    }
  });

  it("高等级新生成敌机的首射冷却仍为正（不会出生即开火）", () => {
    const diff = { hpScale: 1, speedScale: 1, fireCdScale: 1 };
    for (const E of [1, 26, 34, 60, 99]) {
      clearEnemies();
      const e = spawnEnemy(1, diff, E, 100, 40);
      assert.ok(e.fireCd > 0, `E=${E} 的 fireCd=${e.fireCd}`);
    }
    clearEnemies();
  });
});