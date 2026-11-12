import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BULLET, SCORE_AXIS, levelFromScore } from "../js/config.js";
import { validateStage } from "../js/level/schema.js";
import {
  buildBossPatternSpecs,
  buildPatternSpecs,
  patternBulletCount,
  rankFromScore,
  validatePatternParams,
} from "../js/level/patterns.js";
import {
  clearBullets,
  countHostileBullets,
  setHostileBulletBudget,
  spawnHostileBullets,
} from "../js/bullet.js";

const emitter = { x: 120, y: 80, r: 40 };
const context = {
  emitter,
  targetX: 50,
  targetY: 220,
  fireScale: 1.3,
  random: () => 0.25,
};

// Recorded from pre-P-B HEAD v0.3.9 bossFire/helpers with this emitter, scale 1.3, and random 0.25.
const LEGACY_BOSS_GOLDEN = {
  spread: {
    opts: { r: 6, color: "#ff4488", maxRange: 500, life: 5 },
    vectors: [
      [120, 100, -2.2021056462406383, 4.55],
      [120, 100, -1.1525288059792242, 4.55],
      [120, 100, 0, 4.55],
      [120, 100, 1.1525288059792242, 4.55],
      [120, 100, 2.2021056462406383, 4.55],
    ],
  },
  homing: {
    opts: { r: 5, color: "#ff8fa3", maxRange: 600, life: 6 },
    vectors: [[120, 100, -1.9621496502560651, 3.9242993005121303]],
  },
  burst: {
    opts: { r: 5, color: "#aa44ff", maxRange: 400, life: 4 },
    vectors: [
      [120, 80, 3.9000000000000004, 0],
      [120, 80, 2.7577164466275357, 2.7577164466275352],
      [120, 80, 2.3880612583373386e-16, 3.9000000000000004],
      [120, 80, -2.7577164466275352, 2.7577164466275357],
      [120, 80, -3.9000000000000004, 4.776122516674677e-16],
      [120, 80, -2.7577164466275357, -2.7577164466275352],
      [120, 80, -7.164183775012016e-16, -3.9000000000000004],
      [120, 80, 2.757716446627535, -2.7577164466275357],
    ],
  },
  laser: {
    opts: { r: 3.5, color: "#ff4444", maxRange: 720, life: 2.4 },
    vectors: [
      [129.83869910099907, 104.91934955049953, -5.116123532519518, 10.232247065039036],
      [120, 100, -5.116123532519518, 10.232247065039036],
      [110.16130089900093, 95.08065044950047, -5.116123532519518, 10.232247065039036],
    ],
  },
};

function assertSpecsClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    for (const key of ["x", "y", "vx", "vy"]) {
      assert.ok(Math.abs(actual[i][key] - expected[i][key]) < 1e-10, `${i}.${key}`);
    }
    assert.deepEqual(actual[i].opts, expected[i].opts);
  }
}

function specsFromGolden({ opts, vectors }) {
  return vectors.map(([x, y, vx, vy]) => ({ x, y, vx, vy, opts: { ...opts } }));
}

describe("enemy pattern registry", () => {
  beforeEach(() => {
    setHostileBulletBudget(null);
    clearBullets();
  });

  it("十一种图案均产生确定、有限且有界的 spec", () => {
    const cases = [
      ["fan", {}, 5],
      ["ring", {}, 12],
      ["spiral", {}, 8],
      ["petal", {}, 16],
      ["rain", {}, 8],
      ["stack", {}, 5],
      ["laserGrid", {}, 3],
      ["aimed", {}, 1],
      ["wall", {}, 11],
      ["cross", {}, 8],
      ["pincerWave", {}, 8],
    ];
    for (const [ref, params, count] of cases) {
      const first = buildPatternSpecs(ref, params, context);
      const second = buildPatternSpecs(ref, params, context);
      assert.equal(patternBulletCount(ref, params), count, ref);
      assert.deepEqual(first, second, `${ref} output is deterministic for fixed inputs`);
      assert.equal(first.length, count);
      for (const spec of first) {
        assert.ok([spec.x, spec.y, spec.vx, spec.vy].every(Number.isFinite), ref);
        assert.ok(Math.hypot(spec.vx, spec.vy) > 0, ref);
        assert.ok(spec.opts.r > 0 && spec.opts.life > 0, ref);
      }
    }
  });

  it("$rank 由共享 SCORE_AXIS 派生且速度随等级单调", () => {
    const scores = [0, 8000, 20000, 35000, 58500, 100000, 180000];
    const ranks = scores.map(score => rankFromScore(
      SCORE_AXIS, score, levelFromScore(SCORE_AXIS, score),
    ));
    assert.equal(ranks[0], 0);
    assert.equal(ranks.at(-1), 1);
    assert.ok(ranks.every((rank, i) => i === 0 || rank >= ranks[i - 1]));

    const speedAt = rank => {
      const bullet = buildPatternSpecs("ring", {
        count: 4, speed: { base: 2, rankGain: 3 },
      }, { ...context, rank })[0];
      return Math.hypot(bullet.vx, bullet.vy);
    };
    assert.ok(speedAt(0.75) > speedAt(0.25));
  });

  it("未知引用及越界参数在构建前被拒绝", () => {
    assert.throws(() => buildPatternSpecs("not-a-pattern", {}), /unknown pattern/);
    assert.throws(() => validatePatternParams("fan", { count: 99 }), /params.count/);
    assert.throws(() => validatePatternParams("fan", { surprise: true }), /params.surprise/);
    assert.throws(() => validatePatternParams("stack", { count: 16, speedStep: 1 }), /non-positive/);
    assert.throws(() => buildPatternSpecs("ring", {}, { ...context, rank: 1.1 }), /rank/);
    // 新图案的整除/步长约束：产出数必须恒等于 patternBulletCount()，否则密度预算分母失真
    assert.throws(() => buildPatternSpecs("cross", { count: 6 }), /multiple of 4/);
    assert.throws(() => buildPatternSpecs("pincerWave", { count: 5 }), /even/);
    assert.throws(() => buildPatternSpecs("wall", { count: 11, gapAt: 11 }), /gapAt/);
    // 守门：新分支不得吃掉既有图案的 min/max（ring 下限仍为 2）
    assert.throws(() => validatePatternParams("ring", { count: 1 }), /params.count/);
  });

  it("注册表输出通过原子敌弹预算，超限 volley 不生成部分弹", () => {
    const specs = buildPatternSpecs("ring", { count: 5 }, context);
    setHostileBulletBudget({ maxHostileActive: 4, maxHostileBulletsPerSec: 20 });
    assert.equal(spawnHostileBullets(specs), null);
    assert.equal(countHostileBullets(), 0);

    setHostileBulletBudget({ maxHostileActive: 5, maxHostileBulletsPerSec: 20 });
    assert.equal(spawnHostileBullets(specs).length, 5);
    assert.equal(countHostileBullets(), 5);
    assert.ok(BULLET.hostileScreenCap >= 5);
  });

  it("stage 的 patternRef/params 校验引用、参数和单次弹幕预算", async () => {
    const stage = JSON.parse(
      await readFile(new URL("../assets/levels/level-01.json", import.meta.url), "utf8"),
    );
    stage.patterns.push("fan");
    const spawn = stage.beats[0].waves[0].spawns[0];
    spawn.patternRef = "fan";
    spawn.params = { count: 5, speed: { base: 2, rankGain: 1 } };
    assert.doesNotThrow(() => validateStage(stage));

    const overBudget = structuredClone(stage);
    overBudget.beats[0].densityBudget.maxHostileBulletsPerSec = 4;
    assert.throws(() => validateStage(overBudget), /exceeds the beat density budget/);

    const unknownParams = structuredClone(stage);
    unknownParams.beats[0].waves[0].spawns[0].params.extra = true;
    assert.throws(() => validateStage(unknownParams), /params\.extra.*not supported/);
  });

  it("旧 Boss pattern 与 HEAD v0.3.9 固定随机源黄金弹道一致", () => {
    for (const pattern of ["spread", "homing", "burst", "laser"]) {
      assertSpecsClose(
        buildBossPatternSpecs(pattern, context),
        specsFromGolden(LEGACY_BOSS_GOLDEN[pattern]),
      );
    }
    assert.deepEqual(buildBossPatternSpecs("spawn", context), []);
    assert.equal(buildBossPatternSpecs("future-pattern", context), null);
  });
});
