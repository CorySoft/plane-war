/* ===========================================================
 * bossrush.test.mjs — Boss Rush 原型：纯逻辑单测
 * 覆盖：URL 开关、车轮顺序、血量成长与上限、轮间间隔递减与下限、
 *       状态机（首轮延迟 / Boss 存活时暂停 / 击杀后倒计时）、Boss 放大。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOSS_RUSH, BOSS_RUSH_ORDER,
  isBossRushRequested, bossRushRoundType, bossRushHpScale,
  bossRushRoundInterval, createBossRushState, stepBossRush, scaleBossForRound,
} from "../js/modes/bossrush.js";

describe("Boss Rush 纯逻辑", () => {
  it("URL 开关只认显式 bossrush=1/true，其余一律关闭", () => {
    assert.equal(isBossRushRequested(""), false);
    assert.equal(isBossRushRequested("?campaign=campaign-01"), false);
    assert.equal(isBossRushRequested("?bossrush=0"), false);
    assert.equal(isBossRushRequested("?bossrush="), false);
    assert.equal(isBossRushRequested("?bossrush=1"), true);
    assert.equal(isBossRushRequested("?bossrush=true"), true);
  });

  it("车轮顺序按三型 Boss 确定性循环", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(bossRushRoundType),
      ["phantom", "fortress", "mothership", "phantom", "fortress", "mothership"]);
    assert.equal(BOSS_RUSH_ORDER.length, 3);
    // 非法轮次不崩，按第 1 轮处理
    assert.equal(bossRushRoundType(0), "phantom");
    assert.equal(bossRushRoundType(-3), "phantom");
  });

  it("血量倍率逐轮 +35% 且带硬上限", () => {
    assert.equal(bossRushHpScale(1), 1);
    assert.equal(bossRushHpScale(2), 1 + BOSS_RUSH.hpGrowth);
    assert.equal(bossRushHpScale(3), 1 + BOSS_RUSH.hpGrowth * 2);
    assert.equal(bossRushHpScale(9999), BOSS_RUSH.maxHpScale);
  });

  it("轮间等待逐轮递减并保底，不会无限缩短", () => {
    assert.equal(bossRushRoundInterval(0), BOSS_RUSH.baseInterval);
    assert.ok(bossRushRoundInterval(1) < bossRushRoundInterval(0));
    assert.ok(bossRushRoundInterval(2) < bossRushRoundInterval(1));
    assert.equal(bossRushRoundInterval(9999), BOSS_RUSH.minInterval);
  });

  it("状态机：首轮延迟 → 出 Boss → 存活期暂停 → 击杀后倒计时出下一轮", () => {
    const state = createBossRushState();
    assert.equal(state.round, 0);
    assert.equal(state.timer, BOSS_RUSH.firstDelay);

    // 首轮延迟未到：不出 Boss
    let events = [];
    events.push(stepBossRush(state, BOSS_RUSH.firstDelay / 2, false));
    events.push(stepBossRush(state, BOSS_RUSH.firstDelay / 2 - 0.01, false));
    assert.deepEqual(events, [null, null]);
    assert.equal(state.round, 0);

    // 延迟耗尽：第 1 轮 phantom，倍率 1
    const first = stepBossRush(state, 0.02, false);
    assert.deepEqual(first, { type: "spawn", round: 1, bossType: "phantom", hpScale: 1 });
    assert.equal(state.awaitingBoss, true);

    // Boss 存活：车轮暂停（即使 dt 很大也不出新 Boss）
    assert.equal(stepBossRush(state, 10, true), null);
    assert.equal(state.round, 1);

    // 击杀后：等待 interval(1) 再出第 2 轮
    assert.equal(stepBossRush(state, 0, false), null);   // 刚检测到死亡，开始倒计时（dt=0 便于断言）
    assert.equal(state.timer, bossRushRoundInterval(1));
    const second = stepBossRush(state, bossRushRoundInterval(1) + 0.01, false);
    assert.deepEqual(second, { type: "spawn", round: 2, bossType: "fortress", hpScale: 1 + BOSS_RUSH.hpGrowth });
  });

  it("Boss 放大只放大数值，倍率 ≤1 时原样返回", () => {
    const boss = { hp: 100, maxHp: 100, score: 2000, xp: 100 };
    assert.equal(scaleBossForRound(boss, 1), boss);
    assert.deepEqual(boss, { hp: 100, maxHp: 100, score: 2000, xp: 100 });

    const scaled = scaleBossForRound({ hp: 100, maxHp: 100, score: 2000, xp: 100 }, 1.35);
    assert.equal(scaled.hp, 135);
    assert.equal(scaled.maxHp, 135, "maxHp 必须与 hp 同步，否则血条与相位判定失真");
    assert.equal(scaled.score, 2700);
    assert.equal(scaled.xp, 135);
  });
});