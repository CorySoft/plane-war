/* ===========================================================
 * endless-acts.test.mjs — Phase 5（U2-step1）无尽「幕」护栏
 * 覆盖：actFromScore（从 ENDLESS_ACTS 常量派生，不写死 at 字面值）、
 *       resolveEndlessAct 在战役/BossRush 下恒 null、updateWaves 第 5 参缺省兼容、
 *       幕 Boss 周期事件、幕跃迁刹车只触发一次且不涨 pLevel。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { ENDLESS_ACTS, actFromScore, resolveEndlessAct } from "../js/config.js";
import { getSettings } from "../js/meta.js";
import { updateWaves, resetWaves } from "../js/wave.js";

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
const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

const { chooseSkill } = await import("../js/game.js");
const game = () => globalThis.window.__game;
getSettings().skipTutorial = true;
const step = n => { for (let i = 0; i < n && typeof rafCb === "function"; i++) rafCb(); };

const DIFF = { hpScale: 1, speedScale: 1, spawnScale: 1, enemyFireScale: 1, fireCdScale: 1 };

describe("Phase 5 无尽幕：actFromScore（不写死 at）", () => {
  it("边界与单调性全部从 ENDLESS_ACTS 常量派生", () => {
    assert.ok(ENDLESS_ACTS.length >= 2, "至少需要两幕");
    assert.equal(ENDLESS_ACTS[0].at, 0, "首幕必须从 0 开始");
    for (let i = 1; i < ENDLESS_ACTS.length; i++) {
      assert.ok(ENDLESS_ACTS[i].at > ENDLESS_ACTS[i - 1].at, "at 必须严格递增");
    }
    assert.equal(actFromScore(0).index, 0);
    assert.equal(actFromScore(Number.MAX_SAFE_INTEGER).index, ENDLESS_ACTS.length - 1);
    for (let i = 0; i < ENDLESS_ACTS.length; i++) {
      assert.equal(actFromScore(ENDLESS_ACTS[i].at).index, i, `at=${ENDLESS_ACTS[i].at} 应进入第 ${i} 幕`);
      if (i > 0) {
        assert.equal(actFromScore(ENDLESS_ACTS[i].at - 1).index, i - 1, "阈值前一分为上一幕");
      }
    }
    // 非法输入回落首幕，不抛错
    for (const bad of [-1, NaN, Infinity, "x", null]) {
      assert.equal(actFromScore(bad).index, 0, `非法分数 ${String(bad)} 应回落首幕`);
    }
  });

  it("幕只作用于默认无尽：战役 / Boss Rush 恒 null", () => {
    assert.equal(resolveEndlessAct({ campaign: true, score: 1e9 }), null);
    assert.equal(resolveEndlessAct({ bossRush: true, score: 1e9 }), null);
    assert.equal(resolveEndlessAct({ campaign: true, bossRush: true, score: 1e9 }), null);
    const normal = resolveEndlessAct({ score: 0 });
    assert.ok(normal && normal.index === 0 && normal.act === ENDLESS_ACTS[0]);
  });
});

describe("Phase 5 无尽幕：波次兼容与幕 Boss", () => {
  it("updateWaves 第 5 参缺省时与显式 null 逐位一致（旧调用不受影响）", () => {
    const run = (passAct) => {
      resetWaves();
      const seq = [];
      for (let i = 0; i < 900; i++) {
        const ev = passAct
          ? updateWaves(1 / 60, 1, DIFF, 1, null)
          : updateWaves(1 / 60, 1, DIFF, 1);
        seq.push(ev);
      }
      return seq.join("|");
    };
    assert.equal(run(false), run(true), "缺省参数必须与显式 null 完全一致");
  });

  it("幕 Boss 周期在 level 1 也能独立触发（warn→boss 各一次）", () => {
    resetWaves();
    const act = { ...ENDLESS_ACTS[0], bossCycleSec: 60, eliteMul: 1 };
    const seq = [];
    for (let i = 0; i < 60 * 60 + 10; i++) seq.push(updateWaves(1 / 60, 1, DIFF, 1, act));
    assert.equal(seq.filter(x => x === "bossWarn").length, 1, "应恰好预警一次");
    assert.equal(seq.filter(x => x === "boss").length, 1, "应恰好触发一次幕 Boss");
    const warnAt = seq.indexOf("bossWarn");
    const bossAt = seq.indexOf("boss");
    assert.ok(bossAt > warnAt, "boss 必须在 warn 之后");
  });

  it("幕跃迁只触发一次刹车，且不改 pLevel", () => {
    game().resetGame();
    step(2);   // 首帧初始化 lastActIndex=0，不触发刹车
    assert.equal(game().state(), 1);
    assert.equal(game().getEndlessAct().index, 0);
    const level0 = game().getPlayer().level;

    game().setScore(ENDLESS_ACTS[1].at);
    step(1);
    assert.equal(game().state(), 3, "幕跃迁应打开三选一（LEVELUP）");
    assert.equal(game().getPlayer().level, level0, "刹车不得改变 pLevel");

    const choices = game().getSkillChoices();
    assert.ok(choices && choices.length, "三选一应有候选");
    chooseSkill(choices[0].id);
    assert.equal(game().state(), 1, "选完技能应回到对局");

    step(5);
    assert.equal(game().state(), 1, "同一幕内不应重复触发刹车");
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});