import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE, META } from "../js/config.js";
import { applyPowerup, xpPackAmount } from "../js/powerup.js";
import { createPlayer } from "../js/player.js";

const noop = () => {};
let rafCb = null;
let fakeNow = 0;
const ctx2d = makeCtx();
const canvas = {
  width: 480, height: 720, style: {},
  addEventListener: noop, removeEventListener: noop,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
};
const makeEl = () => ({
  style: {}, classList: { toggle: noop, add: noop, remove: noop },
  addEventListener: noop, removeEventListener: noop, appendChild: noop, parentNode: null,
});
const touchUi = makeEl();
globalThis.document = {
  getElementById: id => (id === "game" ? canvas : makeEl()),
  querySelector: sel => (sel === ".touch-ui" ? touchUi : null),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: noop, removeEventListener: noop, body: makeEl(),
};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;
globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = noop;
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = noop;
globalThis.performance = { now: () => (fakeNow += 16.7) };
globalThis.window.performance = globalThis.performance;

const { chainDamageMultiplier, blastDrawRadius } = await import("../js/game.js");

describe("v0.5.0 数值改版", () => {
  it("madHunt 持续 5 秒（原 8 秒，只改时长不改伤害）", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    applyPowerup({ type: "madHunt" }, p);
    assert.equal(p.buffs.madHunt, 5);
  });

  it("freeze 掉落权重降到 3（早晚两表一致）", () => {
    const early = Object.fromEntries(POWERUP_WEIGHTS_EARLY);
    const late = Object.fromEntries(POWERUP_WEIGHTS_LATE);
    assert.equal(early.freeze, 3);
    assert.equal(late.freeze, 3);
  });

  it("xppack 直接 +1 级：经验值等于当前升级需求", () => {
    assert.equal(xpPackAmount(1000), 1000);
    assert.equal(xpPackAmount(60), 60);
  });

  it("连锁伤害每层 ×0.7（深度上限 2 不变）", () => {
    assert.equal(chainDamageMultiplier(0), 1);
    assert.ok(Math.abs(chainDamageMultiplier(1) - 0.7) < 1e-9);
    assert.ok(Math.abs(chainDamageMultiplier(2) - 0.49) < 1e-9);
  });

  it("爆炸闪首帧半径 = 判定半径（不再从 0 膨胀）", () => {
    assert.equal(blastDrawRadius(112), 112);
    assert.equal(blastDrawRadius(250), 250);
  });
});