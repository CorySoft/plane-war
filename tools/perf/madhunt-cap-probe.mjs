/* ===========================================================
 * madhunt-cap-probe.mjs — 1b madHuntWaveCap 取值的运行期实测
 *
 * 目的：验证 config 注释里「5s 窗口约 432 发」这类按 0.556s 间隔算出的数字。
 * 真实间隔是 calcFireRate 的 madHunt 分支 0.045s（≈22 波/秒），
 * 所以实际吞吐由 screenCap 闸门 + 命中排空决定，不是由波数决定。
 * 用法：node tools/perf/madhunt-cap-probe.mjs   （只读，不改代码）
 * =========================================================== */

import { makeCtx } from "../../test/_env.mjs";

// 播种（缺此则同配置多次运行不可比：实测同一 cap=48 得到 163/145/385/334 四种吞吐）
const SEED = Number(process.env.SEED || 20261108);
{ let s = SEED >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

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
const listeners = new Map();
const addL = (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); };
const dispatch = (t, ev) => { for (const fn of listeners.get(t) || []) fn(ev); };
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
globalThis.window.addEventListener = addL;
globalThis.window.removeEventListener = noop;
globalThis.performance = { now: () => (fakeNow += 16.7) };
globalThis.window.performance = globalThis.performance;
globalThis.AudioContext = undefined;        // 与 test/_env.mjs 一致：音频走 no-op 分支
globalThis.webkitAudioContext = undefined;

const errors = [];
console.error = (...a) => { errors.push(a.map(String).join(" ")); };

const cfg = await import("../../js/config.js");
const { BULLET, STATE } = cfg;
const { getSettings } = await import("../../js/meta.js");
await import("../../js/game.js");

const game = () => globalThis.window.__game;
getSettings().skipTutorial = true;
game().resetGame();
if (game().state() !== STATE.PLAYING) throw new Error("未进入 PLAYING，实际 state=" + game().state());

const p = game().getPlayer();
Object.assign(p, { power: 4, level: 30, baseDmgMul: 1, fireRateMul: 1, talentDmg: 0, talentCrit: 0 });
for (const k of Object.keys(p.skills)) p.skills[k] = 0;
p.skills.dmg = 6; p.skills.rate = 5; p.skills.range = 6; p.skills.scatter = 6; p.skills.volley = 6;
p.buffs.madHunt = 999;            // 整窗持续追击（update 每帧只递减一点）

const FRAMES = 300;              // 5s @60fps

function friendlyCount() {
  let n = 0;
  for (const b of game().bullets) if (b && b.friendly) n++;
  return n;
}
function enemyCount() {
  let n = 0;
  for (const e of game().enemies) if (e && e.hp > 0) n++;
  return n;
}

const stats = { waves: 0, spawned: 0, peak: 0, saturatedFrames: 0, minGap: Infinity, lastWaveFrame: -1, sumGap: 0 };
let prev = 0;
let framesPlayed = 0, levelUps = 0, blockedFrames = 0, gachaFrames = 0, breakState = null;
game().setScore(30000);          // 把难度推到 level≈6，保证窗内有足够敌机供弹命中
const scoreAt = game().getScore();

for (let f = 0; f < FRAMES; f++) {
  // 锁定构筑与生存：升级会随机选卡、无输入写轮机会被撞死，两者都会污染「波次闸门」这一项测量
  p.invincible = 999;
  p.skills.scatter = 6; p.skills.volley = 6; p.buffs.madHunt = 999;
  if (game().state() === STATE.LEVELUP) {
    levelUps++;
    dispatch("keydown", { code: "Digit1", preventDefault: noop, repeat: false });
    continue;
  }
  if (game().state() === STATE.GACHA) {           // 扭蛋演出会抢占状态：按键跳过，否则窗口被截断
    gachaFrames++;
    dispatch("keydown", { code: "Space", preventDefault: noop, repeat: false });
    continue;
  }
  if (game().state() !== STATE.PLAYING) { breakState = game().state(); break; }
  rafCb(fakeNow);
  framesPlayed = f + 1;
  const n = friendlyCount();
  const delta = n - prev;
  if (delta > 0) {
    stats.waves++;
    stats.spawned += delta;
    if (stats.lastWaveFrame >= 0) {
      const gap = f - stats.lastWaveFrame;
      stats.minGap = Math.min(stats.minGap, gap);
      stats.sumGap += gap;
    }
    stats.lastWaveFrame = f;
  }
  stats.peak = Math.max(stats.peak, n);
  if (n >= BULLET.screenCap) stats.saturatedFrames++;
  if (n > BULLET.screenCap - BULLET.madHuntWaveCap) blockedFrames++;   // 下一波会被 screenCap 闸门整批评掉
  prev = n;
}

const builtWaves = stats.waves;
console.log(JSON.stringify({
  seed: SEED,
  madHuntWaveCap: BULLET.madHuntWaveCap,
  screenCap: BULLET.screenCap,
  nativePattern: (8 + 2 * 6) * (1 + 6),
  interval: cfg.calcFireRate(p).toFixed(3) + "s",
  framesPlayed,
  wavesBuilt: builtWaves,
  levelUps,
  gateBlockedFrames: blockedFrames,
  totalSpawned: stats.spawned,
  perSecSpawned: Math.round(stats.spawned / (framesPlayed / 60)),
  peakFriendly: stats.peak,
  saturatedFrames: stats.saturatedFrames,
  avgGapFrames: builtWaves > 1 ? +(stats.sumGap / (builtWaves - 1)).toFixed(2) : null,
  minGapFrames: stats.minGap === Infinity ? null : stats.minGap,
  gachaFrames,
  breakState,
  scoreDelta: game().getScore() - scoreAt,
  enemiesAlive: enemyCount(),
  stateEnd: game().state(),
  livesEnd: game().getLives(),
  errors: errors.slice(0, 3),
}));
