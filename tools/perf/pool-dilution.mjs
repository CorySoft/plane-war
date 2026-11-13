/* ===========================================================
 * pool-dilution.mjs — 「新敌种入池是否把敌方压力推高」的量具
 *
 * 为什么另开一个文件而不进 phase1-baseline.mjs：
 *   phase1-baseline 的 commit 轴已经背了 3557386 / 503c2d1 / da83521 / 3c679dd 四个标签，
 *   再混进「Phase 3 六型池 vs 三型池」会让每个数的被测版本都要重新解释一遍。
 *   本脚本只服务一件事：**同 seed 家族、同一份播放脚本、只差 js/** 的池构成**。
 *
 * 判据（主持人裁定 B，不许自行放宽）：单 seed 达标 =
 *   peakHostile ≤ 对照 ×1.25 且 hostileFrames ≤ 对照 ×1.25
 *   且 deniedVolleys 不逐秒单调上涨 且 存活不劣于对照；总体 ≥5/6 seeds 达标才通过。
 *
 * 两条腿，各自回答不同问题，不许混用：
 *   pressure —— 每帧钉 invincible=999 + 满命。玩家不会死，**测的是敌方的供给能力**，
 *               两个臂因此能在同一个 150s / 600s 窗上对齐。peakHostile / hostileFrames /
 *               denied 逐秒曲线 / 池成分全部出自这条腿。
 *   survival —— 完全不钉（inv=null、命不动）。**测的是写轮玩家的真实下场**：
 *               何时打完命、终局分数、等级轨迹。Phase 5 的 `at` 标定用这条腿的 score–time
 *               当下界，pressure 那条当上界（仿真写轮不会躲避，两界之间才是真人区间）。
 *
 * 「存活不劣于对照」这条**不用** survival 腿的寿命做判据：写轮 bot ~11s 就打光命，而新种要到
 *   L3（~90s）才进池，寿命整个落在「两臂必然相同」的区段里，是空读数（补命腿也试过：15 命、
 *   100 命都在 36.9s 出局，够不到 150s 窗）。改用 pressure 腿上的 **危险帧**——每帧独立重算
 *   `hypot(player, 敌弹) < PLAYER.hitRadius`，与 js/game.js 的敌弹→玩家判定同一个式子、同一个常数
 *   （两臂 config 均为 20），只是**读数不改状态**：不碰命、不碰无敌、不碰复活。
 *   不钉 invincible 而是几何重算，正是为了不去扰动受击与扣命机制本身。
 *
 * 口径红线：本脚本是 **Node 无头仿真 + 写轮**，与 docs/perf-baseline.md 里
 * 浏览器版 graze-fuel-probe 的 hostileFrames/peakHostile **不同源**，绝对值不可并排比；
 * 只有「同 harness 的臂间比值」是合法读数。
 *
 * 用法：
 *   node tools/perf/pool-dilution.mjs                       # 6 seeds × 两腿 × 600s
 *   SEED=20261108 SWEEP=2 LEG=pressure node tools/perf/pool-dilution.mjs
 *   OUT=/tmp/x.json node tools/perf/pool-dilution.mjs
 * =========================================================== */
import { makeCtx } from "../../test/_env.mjs";

const SEED = Number(process.env.SEED || 20261108);
const SWEEP = Number(process.env.SWEEP || 6);
const LEG = process.env.LEG || "both";
const OUT = process.env.OUT || "/tmp/pool-dilution.json";
const SECS = Number(process.env.SECONDS || 600);
const DILUTION_CUT_SEC = 150;                       // 裁定 B 指定的稀释窗口
const SAMPLE_SEC = [30, 60, 90, 120, 150, 180, 240, 300, 450, 600];
const GRAZE = Number(process.env.GRAZE || 12);      // 危险帧外的擦弹带（px），只为看「密度形状」，不入判据
const sweepSeeds = (n) => Array.from({ length: n }, (_, i) => (SEED + i * 7919) >>> 0);

let seedState = SEED >>> 0;
function reseed(s) { seedState = (s >>> 0) || 1; }
Math.random = () => { seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0; return seedState / 4294967296; };

const noop = () => {};
let rafCb = null, clockMs = 0;
function step() { clockMs += 16.7; rafCb(clockMs); }
const ctx2d = makeCtx();
const canvas = {
  width: 480, height: 720, style: {},
  addEventListener: noop, removeEventListener: noop,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
};
const listeners = new Map();
const addL = (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); };
const dispatch = (t, ev) => { for (const fn of listeners.get(t) || []) fn(ev); };
const winListeners = new Map();
const addW = (t, fn) => { if (!winListeners.has(t)) winListeners.set(t, new Set()); winListeners.get(t).add(fn); };
const makeEl = () => ({ style: {}, classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, addEventListener: addL, removeEventListener: noop, appendChild: noop, parentNode: null });
globalThis.document = {
  getElementById: (id) => (id === "game" ? canvas : makeEl()),
  querySelector: () => makeEl(),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: addL, removeEventListener: noop, body: makeEl(),
};
globalThis.window = globalThis.window || {};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.cancelAnimationFrame = noop;
globalThis.window.cancelAnimationFrame = noop;
globalThis.window.addEventListener = (t, fn) => { addW(t, fn); addL(t, fn); };
globalThis.window.removeEventListener = noop;
globalThis.performance = { now: () => clockMs };   // 纯读数：只在 step() 里前进（同 phase1-baseline 的教训）
globalThis.window.performance = globalThis.performance;
globalThis.AudioContext = undefined;
globalThis.webkitAudioContext = undefined;

const errors = [];
const realErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); };

const cfg = await import("../../js/config.js");
const { STATE } = cfg;
const { getSettings } = await import("../../js/meta.js");
const { setLivesForTest } = await import("../../js/game.js");
const bulletMod = await import("../../js/bullet.js");

const game = () => globalThis.window.__game;
getSettings().skipTutorial = true;

/** 每帧钉构筑：只钉「不让玩家猝死」需要的两项，别的都不动（两臂同一份脚本才有可比性） */
function lock(p, mode) {
  if (mode === "pressure") {
    p.invincible = 999;
    setLivesForTest(game().getMaxLives());
  }
}

/**
 * 跑一个 seed 的一腿。
 * 计数全部在**帧末**采样：敌弹的生成与消解都发生在这一帧内，帧末是唯一
 * 「两臂同相位」的时刻（帧首会漏掉上一帧最后一步生成的弹）。
 */
function runOne(seed, mode) {
  reseed(seed);
  game().resetGame();
  if (game().state() !== STATE.PLAYING) return { seed, mode, error: "未进入 PLAYING" };
  const p = game().getPlayer();
  const frames = SECS * 60;
  let peakHostile = 0, hostileFrames = 0, framesPlayed = 0;
  let peakHostileCut = 0, hostileFramesCut = 0;
  let deniedAtCut = 0;
  const deniedPerSec = [];
  let deniedPrev = 0;
  const seen = new Set();               // 累计见过的 uid（敌机有对象池，用对象身份会漏计复用件）
  const spawnMix = {};
  const scoreAt = {}; const levelAt = {}; const enemyLevelAt = {};
  const samples = new Set(SAMPLE_SEC.map((s) => s * 60));
  const cut = DILUTION_CUT_SEC * 60;
  let livesEnd = null, deaths = 0, livesPrev = game().getLives(), breakState = null;
  let deathsCut = 0, deniedEndAll = 0;
  let mixCut = {};
  let maxActiveSeen = 0;
  let dangerFrames = 0, grazeFrames = 0, dangerFramesCut = 0, grazeFramesCut = 0;
  // 幕跃迁时刻：逐帧问 actFromScore（只读，且函数不存在时整段跳过 —— 早期 commit 无 Phase-5）
  const readAct = typeof cfg.actFromScore === "function" ? (s) => cfg.actFromScore(s) : null;
  let actIdxPrev = 0;
  const actCrossSec = {};

  for (let f = 0; f < frames; f++) {
    lock(p, mode);
    const st = game().state();
    if (st === STATE.LEVELUP) { dispatch("keydown", { code: "Digit1", preventDefault: noop, repeat: false }); continue; }
    if (st === STATE.GACHA) { dispatch("keydown", { code: "Space", preventDefault: noop, repeat: false }); continue; }
    if (st !== STATE.PLAYING) { breakState = st; break; }
    step();
    framesPlayed = f + 1;

    let hostile = 0;
    let danger = 0, graze = 0;
    for (const b of game().bullets) {
      if (!b || b.friendly) continue;
      hostile++;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < cfg.PLAYER.hitRadius) danger++;
      else if (d < cfg.PLAYER.hitRadius + GRAZE) graze++;
    }
    if (danger > 0) dangerFrames++;
    if (graze > 0) grazeFrames++;
    hostileFrames += hostile;
    if (hostile > peakHostile) peakHostile = hostile;
    for (const e of game().enemies) {
      if (!e) continue;
      const key = e.uid === undefined ? e : e.uid;   // 对象池会复用 e，uid 才是「一次生成」
      if (seen.has(key)) continue;
      seen.add(key);
      spawnMix[e.type] = (spawnMix[e.type] || 0) + 1;
    }
    if (f === cut - 1) {
      peakHostileCut = peakHostile; hostileFramesCut = hostileFrames;
      deathsCut = deaths;
      dangerFramesCut = dangerFrames; grazeFramesCut = grazeFrames;
      mixCut = { ...spawnMix };
      deniedEndAll = bulletMod.getHostileBulletBudgetStats().deniedVolleys;
      deniedAtCut = bulletMod.getHostileBulletBudgetStats().deniedVolleys;
    }
    if (f % 60 === 59) {
      const d = bulletMod.getHostileBulletBudgetStats().deniedVolleys;
      deniedPerSec.push(d - deniedPrev);
      deniedPrev = d;
      maxActiveSeen = Math.max(maxActiveSeen, bulletMod.getHostileBulletBudgetStats().active);
    }
    const secsDone = (f + 1) / 60;
    if (readAct) {
      const a = readAct(game().getScore());
      if (a.index > actIdxPrev) {
        for (let k = actIdxPrev + 1; k <= a.index; k++) if (actCrossSec[k] === undefined) actCrossSec[k] = +secsDone.toFixed(1);
        actIdxPrev = a.index;
      }
    }
    if (samples.has(f + 1)) {
      scoreAt[secsDone] = game().getScore();
      levelAt[secsDone] = game().getPlayer().level;
      enemyLevelAt[secsDone] = game().getEnemyLevel();
    }
    const l = game().getLives();
    if (l < livesPrev) deaths += livesPrev - l;
    livesPrev = l;
  }
  livesEnd = game().getLives();

  // 「denied 逐秒单调上涨」判据：只看稀释窗内（前 150s）的逐秒增量，允许噪声，
  // 但要求「连续 5 秒严格上涨」不出现 —— 那才是被预算卡住的形态
  const seg = deniedPerSec.slice(0, DILUTION_CUT_SEC);
  let run = 0, longestRise = 0;
  for (let i = 1; i < seg.length; i++) {
    if (seg[i] > seg[i - 1]) { run++; if (run > longestRise) longestRise = run; } else run = 0;
  }
  return {
    seed, mode, framesPlayed, seconds: +(framesPlayed / 60).toFixed(1), 满窗: framesPlayed >= frames,
    breakState, 阵亡次数: deaths, 阵亡次数_150s: deathsCut, livesEnd,
    peakHostile_150s: peakHostileCut, hostileFrames_150s: hostileFramesCut,
    peakHostile_full: peakHostile, hostileFrames_full: hostileFrames,
    同屏敌弹均值_150s: hostileFramesCut > 0 ? +(hostileFramesCut / cut).toFixed(3) : null,
    denied_150s: deniedAtCut, 最长连续上涨秒数: longestRise,
    危险帧_150s: dangerFramesCut, 擦弹帧_150s: grazeFramesCut,
    危险帧_全程: dangerFrames,
    危险帧占比_150s: +((dangerFramesCut / cut) * 100).toFixed(2),
    同屏active峰值: maxActiveSeen,
    池成分_150s: mixCut, deniedVolleys_全程: deniedEndAll, 池成分: spawnMix, 池成分_新种占比: (() => {
      const t = Object.entries(spawnMix);
      const all = t.reduce((a, [, v]) => a + v, 0);
      const nw = t.filter(([k]) => ["weaver", "tank", "swarm"].includes(k)).reduce((a, [, v]) => a + v, 0);
      return all ? +(nw / all * 100).toFixed(1) : 0;
    })(),
    scoreAt, levelAt, enemyLevelAt,
    幕跃迁时刻: actCrossSec, 分数_终局: game().getScore(),
  };
}

const rows = [];
for (const seed of sweepSeeds(SWEEP)) {
  for (const mode of (LEG === "both" ? ["pressure", "survival"] : [LEG])) {
    rows.push(runOne(seed, mode));
    process.stderr.write(`·`);
  }
}
process.stderr.write(`\n`);
const out = {
  tool: "pool-dilution", seedBase: SEED, sweep: SWEEP, leg: LEG,
  secondsWindow: SECS, dilutionCutSec: DILUTION_CUT_SEC,
  被测commit提示: "读数只属于跑它的那个 worktree 的 HEAD；用 HEAD_LABEL 显式带出，避免在错误的树上读数",
  head: process.env.HEAD_LABEL || "未标注（跑之前请 HEAD_LABEL=$(git rev-parse --short HEAD)）",
  jsEnemyTypes: Object.keys(cfg.ENEMY_TYPES),
  幕占位at: Array.isArray(cfg.ENDLESS_ACTS) ? cfg.ENDLESS_ACTS.map((a) => a.at) : null,
  rows, errors,
};
const fs = await import("node:fs");
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
realErr(JSON.stringify({ head: out.head, 敌型数: out.jsEnemyTypes.length, 行数: rows.length, errors: errors.length, out: OUT }));
