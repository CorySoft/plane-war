import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { DIFFICULTY } from "../js/config.js";
import { getDifficultyLevel, getSpawnRate, updateWaves, resetWaves, spawnBoss, getCurrentBossPhase, BOSS_TYPES } from "../js/wave.js";
import { enemies, clearEnemies } from "../js/enemy.js";

describe("wave", () => {
  beforeEach(() => {
    resetWaves();
    clearEnemies();
  });

  it("难度等级按分数封顶", () => {
    const step = DIFFICULTY.levelUpScore;
    assert.equal(getDifficultyLevel(0), 1);
    assert.equal(getDifficultyLevel(step - 1), 1);
    assert.equal(getDifficultyLevel(step), 2);
    assert.equal(getDifficultyLevel(step * 2), 3);
    assert.equal(getDifficultyLevel(1e9), DIFFICULTY.maxLevel);
  });

  it("难度档位不再过早封顶（后期仍有压迫感）", () => {
    // maxLevel 决定「多久之后只剩敌方等级在涨」
    assert.ok(DIFFICULTY.maxLevel >= 12, "难度等级上限过低会让中后期难度断档");
    const capScore = DIFFICULTY.levelUpScore * (DIFFICULTY.maxLevel - 1);
    assert.ok(capScore >= 45000, "封顶分数应撑到中后期");
  });

  it("生成率随等级提升并封顶", () => {
    const r1 = getSpawnRate(1);
    const r5 = getSpawnRate(5);
    const r99 = getSpawnRate(99);
    assert.ok(r5 > r1);
    assert.ok(r99 <= DIFFICULTY.spawnCap + 1e-9);
    assert.ok(getSpawnRate(1, 0.5) < r1);
  });

  it("精英波在 2 级后触发", () => {
    assert.equal(updateWaves(1, 1, 0), null);
    clearEnemies();
    const ev = updateWaves(DIFFICULTY.eliteWaveInterval, 2, 0, 4);
    assert.equal(ev, null);
    assert.ok(enemies.length >= 2);
    // 精英波必须携带当前敌方等级（曾漏传导致后期精英波全是 1 级白板）
    assert.ok(enemies.every(e => e.enemyLevel === 4));
  });

  it("Boss 波按间隔触发一次", () => {
    assert.equal(updateWaves(0, 4, 0), null);
    // 等级达标后先进 2 秒预警，再正式触发 Boss
    assert.equal(updateWaves(0, 5, 0), "bossWarn");
    assert.equal(updateWaves(2, 5, 0), "boss");
    assert.equal(updateWaves(0, 5, 0), null);
    assert.equal(updateWaves(0, 10, 0), "bossWarn");
    assert.equal(updateWaves(2, 10, 0), "boss");
  });

  it("resetWaves 后可再次召唤 Boss", () => {
    updateWaves(0, 5, 0);
    resetWaves();
    assert.equal(updateWaves(0, 5, 0), "bossWarn");
    assert.equal(updateWaves(2, 5, 0), "boss");
  });

  it("spawnBoss 血量随等级成长", () => {
    const b1 = spawnBoss("mothership", 5);
    clearEnemies();
    const b2 = spawnBoss("mothership", 10);
    assert.equal(b1.isBoss, true);
    assert.ok(b2.hp > b1.hp);
    assert.equal(b1.hp, b1.maxHp);
  });

  it("getCurrentBossPhase 按血量切相位", () => {
    const boss = spawnBoss("mothership", 5);
    const p0 = getCurrentBossPhase(boss);
    assert.equal(p0.pattern, "spawn");
    boss.hp = boss.maxHp * 0.4;
    assert.equal(getCurrentBossPhase(boss).pattern, "spread");
    boss.hp = boss.maxHp * 0.1;
    assert.equal(getCurrentBossPhase(boss).pattern, "laser");
  });

  it("三种 Boss 定义完整", () => {
    for (const [id, cfg] of Object.entries(BOSS_TYPES)) {
      assert.ok(cfg.phases.length >= 1, id);
      assert.ok(cfg.hp > 0);
    }
  });
});
