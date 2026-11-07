import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { STATE, BULLET } from "../js/config.js";
import { getSettings } from "../js/meta.js";
import { getShootPattern } from "../js/player.js";

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

const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

const gameMod = await import("../js/game.js");
const { expectedMadHuntPatterns, canBuildShootPattern } = gameMod;
const game = () => globalThis.window.__game;

function fullMadHuntPlayer() {
  return {
    x: 240, y: 560, w: 44, h: 52,
    power: 4, level: 30,
    baseDmgMul: 1, fireRateMul: 1, talentDmg: 0, talentCrit: 0,
    skills: {
      dmg: 6, rate: 5, range: 6, crit: 0, critdmg: 0,
      scatter: 6, volley: 6, dual: 0, sideBullets: 0, bulletSpeed: 0,
      orbital: 0, penetrate: 0, explosion: 0, expChance: 0, expDmg: 0,
      expRange: 0, split: 0, splitDist: 0, knockback: 0,
    },
    buffs: { rapid: 0, madHunt: 999, critboost: 0, knockback: 0 },
  };
}

function maxFriendlyBullets() {
  let n = 0;
  for (const b of game().bullets) if (b && b.friendly) n++;
  return n;
}

describe("madHunt screenCap 预判", () => {
  it("预判数量与 getShootPattern 实际产出完全一致（多组技能等级）", () => {
    for (const scatter of [0, 1, 3, 6]) {
      for (const volley of [0, 1, 2, 6]) {
        const p = fullMadHuntPlayer();
        p.skills.scatter = scatter;
        p.skills.volley = volley;
        const expected = expectedMadHuntPatterns(p);
        const real = getShootPattern(p).length;
        assert.equal(expected, real, `scatter=${scatter} volley=${volley} 预判 ${expected} 与实际 ${real} 不一致`);
      }
    }
  });

  it("非 madHunt 不预判（返回 0，交由生成后的原逻辑判定）", () => {
    const p = fullMadHuntPlayer();
    p.buffs.madHunt = 0;
    assert.equal(expectedMadHuntPatterns(p), 0);
    assert.equal(canBuildShootPattern(p, 140, BULLET.screenCap), true, "常规分支必须保持生成后再判，否则会误伤本可发射的波次");
  });

  it("满屏时预判为 false（update 不会进入 getShootPattern 分支）", () => {
    const p = fullMadHuntPlayer();
    const expected = expectedMadHuntPatterns(p);
    assert.equal(expected, 140);
    assert.equal(canBuildShootPattern(p, 140, BULLET.screenCap), false);
    assert.equal(canBuildShootPattern(p, BULLET.screenCap - expected + 1, BULLET.screenCap), false);
  });

  it("非满屏预判与原逻辑逐值等价（0..140 全量）", () => {
    const p = fullMadHuntPlayer();
    const real = getShootPattern(p).length;
    for (let friendly = 0; friendly <= BULLET.screenCap; friendly++) {
      const canBuild = canBuildShootPattern(p, friendly, BULLET.screenCap);
      const legacy = friendly + real <= BULLET.screenCap;
      assert.equal(canBuild, legacy, `friendly=${friendly} 预判 ${canBuild} 与原逻辑 ${legacy} 不一致`);
    }
  });

  it("集成：屏上已有 140 发时，一帧内不再新增任何友方子弹", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    assert.equal(game().state(), STATE.PLAYING);
    const p = game().getPlayer();
    p.buffs.madHunt = 999;
    p.skills.scatter = 6;
    p.skills.volley = 6;
    p.fireCd = -1;

    for (let i = 0; i < 140; i++) {
      game().fireBullet(0, 1, p, p.x, p.y - p.h / 2, 0);
    }
    const before = maxFriendlyBullets();
    assert.equal(before, 140);

    rafCb();
    const after = maxFriendlyBullets();
    assert.equal(after, before, `满屏时不应再发射（前 ${before}，后 ${after}）`);
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("集成：屏上空时，同一配置一帧内正常发射满一波 140 发", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    assert.equal(game().state(), STATE.PLAYING);
    const p = game().getPlayer();
    p.buffs.madHunt = 999;
    p.skills.scatter = 6;
    p.skills.volley = 6;
    p.fireCd = -1;

    assert.equal(maxFriendlyBullets(), 0);
    rafCb();
    const after = maxFriendlyBullets();
    assert.equal(after, 140, `非满屏时应正常发出整波（实际 ${after}）`);
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});