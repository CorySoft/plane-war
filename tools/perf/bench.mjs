#!/usr/bin/env node
import "../../test/_env.mjs";
import { performance } from "node:perf_hooks";

import { setf } from "../../js/utils.js";
import { hexToRgba } from "../../js/theme.js";
import { getShootPattern } from "../../js/player.js";
import {
  fireBullet, updateBullets, clearBullets, bullets,
  countFriendlyBullets, maxMainBulletTraveled, markMainBulletsTriggered,
} from "../../js/bullet.js";
import { BULLET, calcFireRate, refireGateDistance } from "../../js/config.js";
import { makeCtx } from "../../test/_env.mjs";

const noop = () => {};
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
  getElementById: (id) => (id === "game" ? canvas : makeEl()),
  querySelector: (sel) => (sel === ".touch-ui" ? touchUi : null),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: noop, removeEventListener: noop, body: makeEl(),
};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = noop;
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = noop;

const { expectedMadHuntPatterns, canBuildShootPattern } = await import("../../js/game.js");

const FPS = 60;
const DT = 1 / FPS;
const ENEMY_COUNT = 20;
const SIM_SECONDS = 60;
const WARMUP_SECONDS = 5;

function median(a) {
  const s = a.slice().sort((x, y) => x - y);
  return s[s.length >> 1];
}

function benchOps(name, fn, iters) {
  const warm = Math.min(iters, 20000);
  for (let i = 0; i < warm; i++) fn(i);
  const samples = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn(i);
    samples.push(performance.now() - t0);
  }
  const ms = median(samples);
  return { name, iters, usPerOp: (ms * 1000) / iters, opsPerSec: iters / (ms / 1000) };
}

function benchBatch(name, fn, reps) {
  for (let i = 0; i < 20; i++) fn();
  const samples = [];
  for (let k = 0; k < 7; k++) {
    const t0 = performance.now();
    for (let i = 0; i < reps; i++) fn();
    samples.push((performance.now() - t0) / reps);
  }
  return { name, usPerCall: median(samples) * 1000 };
}

function makeFullPlayer() {
  return {
    x: 240, y: 560, w: 44, h: 52,
    power: 4, level: 30,
    baseDmgMul: 1, fireRateMul: 1, talentDmg: 0, talentCrit: 0,
    skills: {
      dmg: 6, rate: 5, range: 6, crit: 0, critdmg: 0,
      scatter: 6, volley: 6, dual: 4, sideBullets: 4, bulletSpeed: 4,
      orbital: 5, penetrate: 0, explosion: 0, expChance: 0, expDmg: 0,
      expRange: 0, split: 0, splitDist: 0, knockback: 0,
    },
    buffs: { rapid: 0, madHunt: 999, critboost: 0, knockback: 0 },
  };
}

function makeEnemies(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: 40 + (i * 97) % 400, y: 60 + (i * 53) % 400, uid: i + 1 });
  }
  return out;
}

function homingPassLegacy(list, enemies, dt) {
  for (const b of list) {
    if (!b) continue;
    if (!b.friendly || !b.homing) continue;
    let best = null, bd = Infinity;
    for (const e of enemies) {
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    const cur = Math.atan2(b.vy, b.vx);
    const target = Math.atan2(best.y - b.y, best.x - b.x);
    let da = target - cur;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const sp = Math.hypot(b.vx, b.vy);
    const na = cur + da * Math.min(1, 10 * dt);
    b.vx = Math.cos(na) * sp;
    b.vy = Math.sin(na) * sp;
  }
}

function homingPass(list, enemies, dt) {
  for (const b of list) {
    if (!b) continue;
    if (!b.friendly || !b.homing) continue;
    let best = null, bd = Infinity;
    for (const e of enemies) {
      const dx = e.x - b.x, dy = e.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = e; }
    }
    if (!best) continue;
    const cur = Math.atan2(b.vy, b.vx);
    const target = Math.atan2(best.y - b.y, best.x - b.x);
    let da = target - cur;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const na = cur + da * Math.min(1, 10 * dt);
    b.vx = Math.cos(na) * sp;
    b.vy = Math.sin(na) * sp;
  }
}

function bytesPerPatternObject() {
  if (typeof global.gc !== "function") return null;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const keep = new Array(100000);
  for (let i = 0; i < 100000; i++) keep[i] = { angle: i * 0.01, dmg: 6, homing: true };
  const after = process.memoryUsage().heapUsed;
  global.gc();
  void keep;
  return (after - before) / 100000;
}

function simulateMadHunt(seconds, enemies, precheck) {
  clearBullets();
  const player = makeFullPlayer();
  const frames = Math.round(seconds * FPS);
  const expected = expectedMadHuntPatterns(player);
  let fireCd = 0;
  let attempts = 0, emittedWaves = 0, droppedWaves = 0, emittedBullets = 0;
  let patternObjects = 0, droppedPatternObjects = 0;
  let peakBullets = 0;
  const perFrame = [];
  let updateMs = 0;
  let homingMs = 0;

  for (let f = 0; f < frames; f++) {
    const fr = calcFireRate(player);
    const gate = refireGateDistance(fr);
    fireCd -= DT;
    const maxTraveled = maxMainBulletTraveled();
    const refireReady = maxTraveled <= 0 || maxTraveled >= gate;

    if (fireCd <= 0 && refireReady) {
      attempts++;
      markMainBulletsTriggered();
      const friendly = countFriendlyBullets();
      const canBuild = precheck ? canBuildShootPattern(player, friendly, BULLET.screenCap) : true;
      const patterns = canBuild ? getShootPattern(player) : null;
      if (patterns) {
        patternObjects += patterns.length;
        if (friendly + patterns.length <= BULLET.screenCap) {
          for (const p of patterns) {
            fireBullet(p.angle, p.dmg, player, p.x, p.y, p.spd, p.isExplosion, p.homing);
          }
          emittedWaves++;
          emittedBullets += patterns.length;
        } else {
          droppedWaves++;
          droppedPatternObjects += patterns.length;
        }
      } else {
        droppedWaves++;
      }
      fireCd = fr;
    }

    const t0 = performance.now();
    updateBullets(DT);
    updateMs += performance.now() - t0;

    const t1 = performance.now();
    homingPass(bullets, enemies, DT);
    homingMs += performance.now() - t1;

    peakBullets = Math.max(peakBullets, bullets.length);
    perFrame.push(bullets.length);
  }

  perFrame.sort((a, b) => a - b);
  return {
    seconds, frames, attempts, emittedWaves, droppedWaves, emittedBullets,
    expectedPatterns: expected, patternObjects, droppedPatternObjects, peakBullets,
    p50Bullets: perFrame[perFrame.length >> 1],
    p95Bullets: perFrame[Math.floor(perFrame.length * 0.95)],
    avgBullets: perFrame.reduce((a, b) => a + b, 0) / perFrame.length,
    updateMsPerFrame: updateMs / frames,
    homingMsPerFrame: homingMs / frames,
  };
}

console.log("=== plane_war perf baseline ===");
console.log(`node ${process.version} / gc ${typeof global.gc === "function" ? "on" : "off"}`);

const ctx = makeCtx();
const setfFonts = [
  "bold 22px 'sans-serif'",
  "13px 'sans-serif'",
  "bold 54px 'sans-serif'",
  "bold 12px 'Courier New', monospace",
];
let fontIdx = 0;
const setfRes = benchOps("setf(ctx, fontStr)", () => { setf(ctx, setfFonts[fontIdx++ & 3]); }, 300000);
const hexRes = benchOps("hexToRgba(#5ee6ff, .8)", () => hexToRgba("#5ee6ff", 0.8), 500000);
const hexShort = benchOps("hexToRgba(#abc, .8)", () => hexToRgba("#abc", 0.8), 500000);
const hexPass = benchOps("hexToRgba(rgba pass-through)", () => hexToRgba("rgba(1,2,3,.5)", 0.8), 500000);

const player = makeFullPlayer();
clearBullets();
const patternRes = benchBatch("getShootPattern(madHunt 满技能)", () => {
  const p = getShootPattern(player);
  if (p.length !== 140) throw new Error("unexpected pattern length " + p.length);
}, 2000);

clearBullets();
for (const p of getShootPattern(player)) {
  fireBullet(p.angle, p.dmg, player, p.x, p.y, p.spd, p.isExplosion, p.homing);
}
const bulletCount = bullets.length;
const updateRes = benchBatch(`updateBullets @ ${bulletCount} bullets`, () => updateBullets(DT * 0.001), 2000);

const enemies = makeEnemies(ENEMY_COUNT);
const homingLegacyRes = benchBatch(`homing legacy @ ${bulletCount}b x ${ENEMY_COUNT}e`, () => homingPassLegacy(bullets, enemies, DT), 3000);
const homingRes = benchBatch(`homing optimized @ ${bulletCount}b x ${ENEMY_COUNT}e`, () => homingPass(bullets, enemies, DT), 3000);

clearBullets();
const warm = simulateMadHunt(WARMUP_SECONDS, enemies, true);
const legacy = simulateMadHunt(SIM_SECONDS, enemies, false);
const optimized = simulateMadHunt(SIM_SECONDS, enemies, true);
const bytesPerObj = bytesPerPatternObject();

const perFrameBudgetMs = 1000 / FPS;
const measuredMs = optimized.updateMsPerFrame + optimized.homingMsPerFrame;
const uiCallsPerFrame = 10;
const uiMsPerFrame = (setfRes.usPerOp * uiCallsPerFrame + hexRes.usPerOp * uiCallsPerFrame) / 1000;

console.log("\n--- micro-benchmark ---");
for (const r of [setfRes, hexRes, hexShort, hexPass]) {
  console.log(`${r.name.padEnd(38)} ${r.usPerOp.toFixed(3).padStart(8)} us/op  ${Math.round(r.opsPerSec).toLocaleString()} ops/s`);
}
console.log(`${patternRes.name.padEnd(38)} ${patternRes.usPerCall.toFixed(1).padStart(8)} us/call  -> 140 objects`);
console.log(`${updateRes.name.padEnd(38)} ${updateRes.usPerCall.toFixed(1).padStart(8)} us/frame`);
console.log(`${homingLegacyRes.name.padEnd(38)} ${homingLegacyRes.usPerCall.toFixed(1).padStart(8)} us/frame`);
console.log(`${homingRes.name.padEnd(38)} ${homingRes.usPerCall.toFixed(1).padStart(8)} us/frame`);

console.log("\n--- madHunt 60s: legacy vs optimized (equivalent?) ---");
console.log(JSON.stringify({ warmup: warm, legacy, optimized }, null, 2));
console.log(`emittedWaves identical        : ${legacy.emittedWaves === optimized.emittedWaves}`);
console.log(`droppedWaves identical        : ${legacy.droppedWaves === optimized.droppedWaves}`);
console.log(`emittedBullets identical      : ${legacy.emittedBullets === optimized.emittedBullets}`);
console.log(`peak/p50/p95 identical        : ${legacy.peakBullets === optimized.peakBullets && legacy.p50Bullets === optimized.p50Bullets && legacy.p95Bullets === optimized.p95Bullets}`);

if (bytesPerObj !== null) {
  const lMB = (legacy.patternObjects * bytesPerObj) / 1048576;
  const oMB = (optimized.patternObjects * bytesPerObj) / 1048576;
  console.log(`\npattern object ≈ ${bytesPerObj.toFixed(1)} B`);
  console.log(`legacy     : ${legacy.patternObjects} objects ≈ ${lMB.toFixed(1)} MB / ${legacy.seconds}s`);
  console.log(`optimized  : ${optimized.patternObjects} objects ≈ ${oMB.toFixed(1)} MB / ${optimized.seconds}s`);
  console.log(`allocation cut ≈ ${((1 - optimized.patternObjects / legacy.patternObjects) * 100).toFixed(1)}%`);
}

console.log("\n--- homing scaling (140 bullets x enemy count) ---");
for (const e of [10, 20, 40, 80]) {
  const list = makeEnemies(e);
  const a = benchBatch(`legacy @ ${e}e`, () => homingPassLegacy(bullets, list, DT), 2000);
  const b = benchBatch(`optimized @ ${e}e`, () => homingPass(bullets, list, DT), 2000);
  console.log(`enemies=${String(e).padStart(2)}  legacy ${a.usPerCall.toFixed(1).padStart(7)} us  optimized ${b.usPerCall.toFixed(1).padStart(7)} us  cut ${((1 - b.usPerCall / a.usPerCall) * 100).toFixed(0)}%`);
}

console.log("\n--- frame budget (16.67ms @60fps, optimized) ---");
console.log(`updateBullets + homing : ${measuredMs.toFixed(3)} ms/frame (${(measuredMs / perFrameBudgetMs * 100).toFixed(1)}%)`);
console.log(`setf+hexToRgba x${uiCallsPerFrame}       : ${uiMsPerFrame.toFixed(4)} ms/frame (${(uiMsPerFrame / perFrameBudgetMs * 100).toFixed(3)}%)`);
console.log(`homing cut             : ${((1 - homingRes.usPerCall / homingLegacyRes.usPerCall) * 100).toFixed(1)}%`);