import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, stubRandom } from "./_env.mjs";
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

  // ---------- 回归：爆炸闪光必须有上限 ----------
  // 旧实现只对 fxRings 封顶（48），漏了 fxBlasts；连锁清屏时一帧塞进几十个，
  // 每个都要逐帧 createRadialGradient，直接砸帧率。
  it("爆炸闪光数量有上限（连锁清屏不失控）", () => {
    // 爆炸触发、暴击、掉落都依赖 Math.random；固定成 0 让爆炸必定触发、必定不暴击，
    // 用例才能稳定走到封顶分支（否则偶发不满 24 个、测试闪烁）
    const restoreRandom = stubRandom([0]);
    try {
    getSettings().skipTutorial = true;
    game().resetGame();
    const p = game().getPlayer();
    p.skills.explosion = 1;   // 开启爆炸弹，使死亡爆炸递归成链
    p.skills.expChance = 6;
    p.skills.expDmg = 6;
    p.skills.expRange = 6;
    p.power = 4;
    // 在玩家前方堆 60 架小敌机（同屏上限），一发高伤爆炸弹把它们全部引爆
    for (let i = 0; i < 60; i++) {
      game().spawnEnemy(14, { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 }, 1, 220 + (i % 5) * 10, 300 + Math.floor(i / 5) * 12);
    }
    assert.ok(game().enemies.length > 0);
    game().fireBullet(0, 9999, p, p.x, p.y - p.h / 2, 20, true);
    // 闪光寿命只有 0.15s（约 9 帧），必须在循环里取峰值，
    // 跑完 60 帧再读只会读到 0，测不出有没有封顶
    let peakBlasts = 0, peakRings = 0;
    for (let i = 0; i < 60 && typeof rafCb === "function"; i++) {
      rafCb();
      const fx = game().getFxCounts();
      peakBlasts = Math.max(peakBlasts, fx.blasts);
      peakRings = Math.max(peakRings, fx.rings);
    }
    assert.ok(peakBlasts <= 24, "爆炸闪光不得超过 24（当前 " + peakBlasts + "）");
    assert.ok(peakRings <= 48, "爆炸波纹不得超过 48（当前 " + peakRings + "）");
    assert.ok(game().enemies.length === 0, "60 架敌机应被连锁清空");
    assert.equal(errors.length, 0, errors.join("\n"));
    } finally { restoreRandom(); }
  });

  it("难度档位持久化：切换难度后写入 settings", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    game().setDifficulty("hard");
    assert.equal(getSettings().difficulty, "hard", "选中的难度应写入存档");
    game().setDifficulty("normal");
    assert.equal(getSettings().difficulty, "normal");
  });

  // ---------- 回归：死亡后不再被重复结算 ----------
  // 旧实现里 hitPlayer 不判 lives<=0，死亡动画（2s）一结束还压在身上的敌机
  // 立刻再打中一次，deathTimer 重置回 2s，进入「死了却永不结算」的死循环，
  // lives 一路扣成负数。正常对局靠 2.2s 无敌帧掩盖（动画 2s < 无敌 2.2s），
  // 无敌时间被压缩时必现。
  it("死亡后 lives 不再下探，且恰好在一段死亡动画后进入结算", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    const p = game().getPlayer();
    p.invincibleTime = 0.001;   // 压掉无敌帧，复现旧 bug 的触发条件
    p.shield = 0;
    const DIFF = { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 };
    for (let i = 0; i < 6; i++) game().spawnEnemy(14, DIFF, 1, 225 + i * 6, 552);
    let minLives = Infinity;
    for (let f = 1; f <= 400; f++) {
      rafCb();
      minLives = Math.min(minLives, game().getLives());
      if (game().state() !== STATE.PLAYING) break;
    }
    assert.ok(minLives >= 0, "lives 不得变成负数（实测最低 " + minLives + "）");
    assert.notEqual(game().state(), STATE.PLAYING, "必须在一段死亡动画后离开 PLAYING");
    assert.ok(errors.length === 0, errors.join("\n"));
  });
});
