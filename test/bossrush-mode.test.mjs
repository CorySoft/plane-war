/* ===========================================================
 * bossrush-mode.test.mjs — Boss Rush 对局集成（灰度入口 ?bossrush=1）
 * 用最小浏览器 mock 以带参数的 location 启动 game.js，验证：
 *  1) 参数命中时进入车轮战；2) 首轮 phantom、次轮 fortress 且血量按轮成长；
 *  3) Boss Rush 期间不再自然生成常规小怪。
 * 默认路径（无参数）由 game.test.mjs 及差分探针覆盖。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { getSettings } from "../js/meta.js";
import { BOSS_TYPES } from "../js/wave.js";
import { getHostileBulletBudgetStats } from "../js/bullet.js";
import { BOSS_RUSH_BUDGET } from "../js/modes/bossrush.js";

const noop = () => {};
let rafCb = null;
let fakeNow = 0;

const ctx2d = makeCtx();
const canvas = {
  width: 480,
  height: 720,
  style: {},
  addEventListener: noop,
  removeEventListener: noop,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
};

const makeEl = () => ({
  style: {},
  classList: { toggle: noop, add: noop, remove: noop },
  addEventListener: noop,
  removeEventListener: noop,
  appendChild: noop,
  parentNode: null,
});

globalThis.document = {
  getElementById: impl => (impl === "game" ? canvas : makeEl()),
  querySelector: sel => (sel === ".touch-ui" ? makeEl() : null),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: noop,
  removeEventListener: noop,
  body: makeEl(),
};
globalThis.window.document = globalThis.document;
// 灰度入口：模块加载期读取 location.search
globalThis.location = { search: "?bossrush=1", reload: noop };
globalThis.window.location = globalThis.location;

globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = noop;
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = noop;

globalThis.performance = { now: () => (fakeNow += 16.7) };
globalThis.window.performance = globalThis.performance;

const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

await import("../js/game.js");
const game = () => globalThis.window.__game;

describe("Boss Rush 对局集成（?bossrush=1）", () => {
  it("连续车轮战：phantom → fortress，血量随轮次成长，且不刷常规小怪", () => {
    getSettings().skipTutorial = true;
    game().resetGame();

    assert.equal(game().getBossRush().enabled, true, "带参数时必须启用车轮战");
    assert.equal(game().getBossRush().round, 0, "开局尚未召唤任何 Boss");

    // 敌弹密度闸门：Boss Rush 必须复用 campaign 同款预算接口
    const budget = getHostileBulletBudgetStats();
    assert.equal(budget.maxActive, BOSS_RUSH_BUDGET.maxHostileActive, "Boss Rush 同屏敌弹预算未生效");
    assert.equal(budget.maxPerSecond, BOSS_RUSH_BUDGET.maxHostileBulletsPerSec, "Boss Rush 敌弹发射速率预算未生效");
    assert.ok(budget.maxActive <= 140 && budget.maxPerSecond <= 140, "预算不得突破全局硬上限");

    // 等首轮 Boss 出场
    let frames = 0;
    while (!game().enemies.some(e => e && e.isBoss) && frames < 900) { rafCb(); frames++; }
    assert.ok(frames < 900, "首轮 Boss 必须在延迟后出现");
    const boss1 = game().enemies.find(e => e && e.isBoss);
    assert.equal(boss1.bossType, "phantom", "第 1 轮固定 phantom（确定性车轮顺序）");
    assert.equal(boss1.bossRushRound, 1);
    assert.equal(boss1.maxHp, BOSS_TYPES.phantom.hp, "第 1 轮不加血量倍率");
    assert.equal(game().getBossRush().round, 1);

    // 车轮战期间跳过常规波次：跑若干帧也不应出现非 Boss 敌机
    for (let i = 0; i < 40; i++) rafCb();
    assert.equal(game().enemies.filter(e => e && !e.isBoss).length, 0, "Boss Rush 不应自然生成小怪");
    assert.equal(game().enemies.filter(e => e && e.isBoss).length, 1, "场上只应有一只 Boss");

    // 移除 Boss 模拟击杀（绕过击杀奖励，避免升级弹窗暂停对局）
    game().enemies.splice(0, game().enemies.length);

    let f2 = 0;
    while (game().getBossRush().round < 2 && f2 < 900) { rafCb(); f2++; }
    assert.equal(game().getBossRush().round, 2, "Boss 消失后应进入第 2 轮");
    const boss2 = game().enemies.find(e => e && e.isBoss);
    assert.ok(boss2, "第 2 轮 Boss 必须出场");
    assert.equal(boss2.bossType, "fortress", "第 2 轮固定 fortress");
    assert.equal(boss2.bossRushRound, 2);
    assert.equal(boss2.maxHp, Math.round(BOSS_TYPES.fortress.hp * 1.35), "第 2 轮血量应 +35%");
    assert.ok(boss2.maxHp > BOSS_TYPES.fortress.hp);

    assert.equal(errors.length, 0, errors.join("\n"));
  });
});