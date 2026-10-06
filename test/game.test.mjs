import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { STATE } from "../js/config.js";
import { getSettings } from "../js/meta.js";
import { spawnBoss } from "../js/wave.js";

const noop = () => {};

// ---- 浏览器环境 mock（必须在 import game.js 之前完成）----
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

const touchUi = makeEl();

globalThis.document = {
  getElementById: (id) => (id === "game" ? canvas : makeEl()),
  querySelector: (sel) => (sel === ".touch-ui" ? touchUi : null),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: noop,
  removeEventListener: noop,
  body: makeEl(),
};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;

globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = noop;
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = noop;

globalThis.performance = { now: () => (fakeNow += 16.7) };
globalThis.window.performance = globalThis.performance;

// 捕获运行时错误：loop 内 try/catch 会把错误写入 console.error
const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

await import("../js/game.js");

const game = () => globalThis.window.__game;

describe("game 集成冒烟", () => {
  it("模块加载并暴露调试接口", () => {
    assert.equal(globalThis.window.__gameReady, true);
    assert.ok(game());
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("开始游戏并推进 180 帧无运行时错误", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    assert.equal(game().state(), STATE.PLAYING);
    for (let i = 0; i < 180 && typeof rafCb === "function"; i++) rafCb();
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("高难度触发 Boss 波次不崩溃", () => {
    game().setScore(60000);
    game().setLevel(9);
    for (let i = 0; i < 400 && typeof rafCb === "function"; i++) rafCb();
    assert.ok(Array.isArray(game().enemies));
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("母舰由空军召唤相位切入射击相位后重置开火计时", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    const boss = spawnBoss("mothership", 1);
    assert.equal(boss.fireCd, 999, "母舰第一相位为空军召唤（无枪），开火计时初始为 999");
    boss.hp = boss.maxHp * 0.49;   // 切到 spread 射击相位
    for (let i = 0; i < 30 && typeof rafCb === "function"; i++) rafCb();
    assert.ok(boss.fireCd <= 5, "相位切换后应重置开火计时（当前 " + boss.fireCd + "，未重置会停留 ~999）");
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});
