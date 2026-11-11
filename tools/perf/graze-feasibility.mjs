/* ===========================================================
 * graze-feasibility.mjs — P2 擦弹「是否真实发生」的决定性实证
 *
 * 口径：
 *  - 不修改任何产品代码；用 Playwright + initScript 固定 LCG 与时钟，
 *    手动驱动 rAF 队列，等价复刻 game.js:656-673 的敌弹→玩家距离判定。
 *  - 判定环：PLAYER.hitRadius(20) <= dist < grazeRadius(34)，每颗敌弹只计一次。
 *  - 只统计 PLAYING 态；升级态自动选第 1 张卡、复活态自动放弃，死亡即停。
 *  - 输出：每配置的擦弹数/每分钟/间隔分布/满槽估算/死亡帧/等级事件。
 * 用法：node tools/perf/graze-feasibility.mjs [--out=path]
 * =========================================================== */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

const HIT_R = 20;
const GRAZE_R = 34;
const CAP_PER_RUN = 3;      // Qoder 方案建议值
const SLOT_COST = 20;       // 满槽阈值假设（Qoder 未给定，本测量统一按 20 次/槽）
const MOVE_AMP = 90;        // 走位振幅（px）
const MOVE_PERIOD = 2.0;    // 走位周期（秒）

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const f = path.join(ROOT, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

const browser = await chromium.launch({ headless: true });

async function runOne({ seed, fps, frames, move, mode = "default" }) {
  const step = 1000 / fps;
  const context = await browser.newContext({ viewport: { width: 480, height: 720 } });
  await context.addInitScript(({ s }) => {
    let seed = s >>> 0;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    window.__clock = 1000;
    performance.now = () => window.__clock;
    window.__rafQueue = [];
    window.requestAnimationFrame = cb => { window.__rafQueue.push(cb); return 1; };
    window.cancelAnimationFrame = () => {};
  }, { s: seed });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !String(m.text()).includes("Failed to load resource")) errors.push("console: " + m.text()); });
  await page.goto(BASE + (mode === "bossrush" ? "?bossrush=1" : ""), { waitUntil: "load", timeout: 60000 });
  await new Promise(r => setTimeout(r, 2500));

  const out = await page.evaluate(async ({ frames, step, hitR, grazeR, move, synth, moveAmp, movePeriod, slotCost, cap }) => {
    const meta = await import("/js/meta.js");
    const ui = await import("/js/ui.js");
    meta.getSettings().skipTutorial = true;
    if (ui.isHelpOpen()) ui.closeHelp();
    const g = window.__game;
    g.resetGame();
    const p = g.getPlayer();
    const W = 480;

    const seen = new Map();          // bullet 对象 → { lastFrame, counted, d2, x, y }
    const eventsLife = [];           // 口径 A：每颗弹（对象生命周期）只计一次
    const eventsPass = [];           // 口径 B：每次穿带计一次（出带重新武装）
    let playedFrames = 0, levelUps = 0, deathFrame = null, gachaFrames = 0;
    // —— 以下三项是 Qoder CN 追加的自证指标（不改判定口径）——
    let xMin = 1e9, xMax = -1e9, xAbsSum = 0;   // 实际横向走位幅度（防「走位组=静止组」空转）
    const nearSteps = [];                        // 近场敌弹每帧位移（与 14px 环带宽度对比）
    let peakHostile = 0;                         // 同屏敌弹峰值
    let hostileSeen = 0;                         // 累计出现过的敌弹对象数（唯一）
    let minDistEver = 1e9;                        // 玩家与任一敌弹的历史最近距离
    let peakEnemies = 0;                          // 同屏敌机峰值
    const hostileTimeline = [];                   // 每秒同屏敌弹数（看密度形态）

    for (let f = 0; f < frames; f++) {
      if (move && g.state() === 1) {
        const t = (f * step) / 1000;
        p.x = Math.max(40, Math.min(W - 40, W / 2 + moveAmp * Math.sin((2 * Math.PI * t) / movePeriod)));
      }
      window.__clock += step;         // 每帧只推进一次时钟（loop 内多次 now 也不会漂）
      const cb = window.__rafQueue.shift();
      if (!cb) break;
      cb();
      const st = g.state();
      if (st === 1) playedFrames++;
      if (st === 7) gachaFrames++;

      // —— 等价复刻 game.js:656-673 的几何判定（只读，不改产品代码）——
      if (st === 1) {
        const px = p.x, py = p.y;
        const lo2 = hitR * hitR, hi2 = grazeR * grazeR;
        let hostile = 0;
        for (const b of g.bullets) {
          if (!b || b.friendly) continue;
          hostile++;
          const rec = seen.get(b);
          if (!rec) hostileSeen++;
          const fresh = !rec || rec.lastFrame !== f - 1;
          const r = rec || { lastFrame: -9, counted: false };
          if (fresh) r.counted = false;
          // 近场每帧位移：上一帧与本帧都在 60px 内才采样（跨帧步进 = 环带漏检的根因）
          const sx = px - b.x, sy = py - b.y;
          const sd2 = sx * sx + sy * sy;
          if (!fresh && r.sd2 !== undefined && r.sd2 < 3600 && sd2 < 3600 && nearSteps.length < 4000) {
            nearSteps.push(Math.hypot(b.x - r.bx, b.y - r.by));
          }
          if (sd2 < minDistEver) minDistEver = sd2;
          const inBand = sd2 >= lo2 && sd2 < hi2;
          if (!inBand && sd2 >= hi2) r.armed = true;        // 出带重新武装（穿带语义）
          if (inBand) {
            if (!r.countedLife) { r.countedLife = true; eventsLife.push((f * step) / 1000); }
            if (r.armed) { r.armed = false; eventsPass.push((f * step) / 1000); }
          }
          r.sd2 = sd2; r.bx = b.x; r.by = b.y;
          r.lastFrame = f;
          seen.set(b, r);
        }
        if (hostile > peakHostile) peakHostile = hostile;
        const en = g.enemies ? g.enemies.length : 0;
        if (en > peakEnemies) peakEnemies = en;
        if (f % 60 === 0) hostileTimeline.push(hostile);
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        xAbsSum += Math.abs(p.x - 240);
      }

      // 合成发射器（mode==="synth"）：悬停 patternRef 敌机，走真实 buildPatternSpecs + 密度预算路径
    if (synth && g.state() === 1) {
      if (!window.__synthE) {
        const cfgm = await import("/js/config.js");
        const diff = cfgm.DIFFICULTY_PRESETS.normal;
        window.__synthE = [0, 1].map(i => {
          const e = g.spawnEnemy(3, diff, 1, i === 0 ? 140 : 340, 220, {
            type: "big", patternRef: "ring",
            params: { count: 10, speed: 3.0, baseAngleDeg: i * 18, color: "#ff8fa3", radius: 5, maxRange: 600, life: 6 },
          });
          if (e) { e.hp = 1e9; e.vy = 0; e.vx = 0; e.fireCd = 0.3 + i * 0.15; }
          return e;
        });
      }
      for (let i = 0; i < window.__synthE.length; i++) {
        const e = window.__synthE[i];
        if (!e) continue;
        e.hp = 1e9; e.vy = 0; e.y = 220; e.x = i === 0 ? 140 : 340;
        if (e.fireCd <= 0) e.fireCd = 0.9 + i * 0.15;
      }
    }
      if (st === 3) { levelUps++; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1" })); }
      else if (st === 6) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" })); }
      else if (st === 2) { deathFrame = f; break; }
    }

    const playedSec = (playedFrames * step) / 1000;
    const mk = (ev) => ({ n: ev.length,
      perMin: playedSec > 0 ? +(ev.length / playedSec * 60).toFixed(1) : 0,
      intervals: (() => { const a = []; for (let i = 1; i < ev.length; i++) a.push(+(ev[i] - ev[i - 1]).toFixed(3));
        const s2 = a.slice().sort((x, y) => x - y);
        return { n: a.length, min: s2[0] ?? null, p50: s2.length ? s2[Math.floor(s2.length / 2)] : null,
          max: s2[s2.length - 1] ?? null, mean: a.length ? +(a.reduce((u, v) => u + v, 0) / a.length).toFixed(2) : null }; })() });
    const A = mk(eventsLife), B = mk(eventsPass);
    const events = eventsPass;

    return {
      grazes: B.n, grazesLife: A.n, grazesPass: B.n,
      perMinLife: A.perMin, perMinPass: B.perMin,
      playedSec: +playedSec.toFixed(2),
      perMinute: B.perMin,
      deathFrame,
      died: deathFrame !== null,
      levelUps,
      gachaFrames,
      intervals: B.intervals, intervalsLife: A.intervals,
      fullSlots: Math.min(cap, Math.floor(events.length / slotCost)),
      // 满槽阈值是 Qoder 未钉的假设，这里一次给出多档，供终稿按实测钉 DANGER.full
      fullSlotsAt: Object.fromEntries([5, 10, 15, 20, 30].map(t => [t, Math.min(cap, Math.floor(B.n / t))])),
      slotCost,
      cap,
      // —— Qoder CN 追加自证指标 ——
      xTrace: { minX: xMin === 1e9 ? null : +xMin.toFixed(1), maxX: xMax === -1e9 ? null : +xMax.toFixed(1),
        span: xMin === 1e9 ? 0 : +(xMax - xMin).toFixed(1),
        meanAbsFromCenter: playedFrames ? +(xAbsSum / playedFrames).toFixed(1) : 0 },
      nearStep: (() => {
        const s = nearSteps.slice().sort((a, b) => a - b);
        const q = r => (s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * r))].toFixed(2) : null);
        return { n: s.length, p50: q(0.5), p90: q(0.9), p99: q(0.99),
          over14: s.length ? +(s.filter(v => v > 14).length / s.length * 100).toFixed(1) : null,
          over34: s.length ? +(s.filter(v => v > 34).length / s.length * 100).toFixed(1) : null };
      })(),
      peakHostile,
      density: { hostileSeen, minDist: minDistEver === 1e9 ? null : +Math.sqrt(minDistEver).toFixed(1),
        peakEnemies, hostileTimeline,
        score: g.getScore(), playerLevel: null },
    };
  }, { frames, step, hitR: HIT_R, grazeR: GRAZE_R, move, synth: mode === "synth", moveAmp: MOVE_AMP, movePeriod: MOVE_PERIOD, slotCost: SLOT_COST, cap: CAP_PER_RUN });

  await context.close();
  return { seed, fps, frames, isMove: move, mode, ...out, errors };
}

const seeds = [20261108, 123456789, 987654321];
const results = [];

// A) 10 秒短窗：静止 vs 走位，60fps 与 30fps（同游戏时长）
for (const seed of seeds) {
  results.push(await runOne({ seed, fps: 60, frames: 600, move: false }));
  results.push(await runOne({ seed, fps: 60, frames: 600, move: true }));
  results.push(await runOne({ seed, fps: 30, frames: 300, move: true }));

}
// B) 单局窗口：60s 或死亡为止（用于 Qoder「每局 <20」判据）
for (const seed of seeds) {
  results.push(await runOne({ seed, fps: 60, frames: 3600, move: false }));
  results.push(await runOne({ seed, fps: 60, frames: 3600, move: true }));
}

// C) Boss Rush（高密度对照）：与 A 同参数
for (const seed of seeds) {
  results.push(await runOne({ seed, fps: 60, frames: 600, move: false, mode: "bossrush" }));
  results.push(await runOne({ seed, fps: 60, frames: 600, move: true, mode: "bossrush" }));
  results.push(await runOne({ seed, fps: 30, frames: 300, move: true, mode: "bossrush" }));
}

// D) 合成弹幕层：固定供给（每 0.9s 两环 ×10 发），测「有弹幕时产出率」与帧率敏感性
for (const seed of seeds) {
  results.push(await runOne({ seed, fps: 60, frames: 1800, move: false, mode: "synth" }));
  results.push(await runOne({ seed, fps: 60, frames: 1800, move: true, mode: "synth" }));
  results.push(await runOne({ seed, fps: 30, frames: 900, move: true, mode: "synth" }));
  results.push(await runOne({ seed, fps: 30, frames: 900, move: false, mode: "synth" }));
}

const groups = {};
for (const r of results) {
  const key = `${r.mode}/${r.fps}fps/${r.frames}f/${r.isMove ? "move" : "static"}`;
  (groups[key] ||= []).push(r);
}
const summary = Object.fromEntries(Object.entries(groups).map(([k, arr]) => [k, {
  runs: arr.length,
  grazes: arr.map(r => r.grazes), grazesLife: arr.map(r => r.grazesLife),
  perMinPass: arr.map(r => r.perMinPass), perMinLife: arr.map(r => r.perMinLife),
  perMinute: arr.map(r => r.perMinute),
  fullAt5: arr.map(r => r.fullSlotsAt[5]), fullAt15: arr.map(r => r.fullSlotsAt[15]),
  deaths: arr.filter(r => r.died).length,
  fullSlots: arr.map(r => r.fullSlots),
  avgPerMin: +(arr.reduce((s, r) => s + r.perMinute, 0) / arr.length).toFixed(1),
  avgFull: +(arr.reduce((s, r) => s + r.fullSlots, 0) / arr.length).toFixed(2),
  span: arr.map(r => r.xTrace.span),
  hostileSeen: arr.map(r => r.density.hostileSeen),
  minDist: arr.map(r => r.density.minDist),
  peakEnemies: Math.max(...arr.map(r => r.density.peakEnemies)),
  over14: arr.map(r => r.nearStep.over14),
  stepP90: arr.map(r => r.nearStep.p90),
  peakHostile: Math.max(...arr.map(r => r.peakHostile)),
  totalFrames: arr.reduce((s, r) => s + r.playedSec, 0).toFixed(1),
}]));

// 帧率敏感性：同 10s、走位：60fps/600 帧 vs 30fps/300 帧
// 合成层帧率敏感性（同 15s：60fps/1800 帧 vs 30fps/900 帧）
const fpsDevSynth = seeds.flatMap(seed => ["move", "static"].map(mv => {
  const a = results.find(r => r.seed === seed && r.mode === "synth" && r.fps === 60 && r.isMove === (mv === "move"));
  const b = results.find(r => r.seed === seed && r.mode === "synth" && r.fps === 30 && r.isMove === (mv === "move"));
  return { seed, mv, f60: a?.grazesPass ?? null, f30: b?.grazesPass ?? null,
    devPct: a && b && a.grazesPass ? +((b.grazesPass - a.grazesPass) / a.grazesPass * 100).toFixed(1) : null };
}));

const fpsDev = seeds.map(seed => {
  const a = results.find(r => r.seed === seed && r.mode === "default" && r.fps === 60 && r.frames === 600 && r.isMove);
  const b = results.find(r => r.seed === seed && r.mode === "default" && r.fps === 30 && r.frames === 300 && r.isMove);
  const dev = a.grazes === 0 ? (b.grazes === 0 ? 0 : 100) : +((b.grazes - a.grazes) / a.grazes * 100).toFixed(1);
  return { seed, fps60: a.grazes, fps30: b.grazes, devPct: dev };
});

const outPath = process.argv.find(a => a.startsWith("--out="))?.slice(6) || "/tmp/graze-feasibility.json";
fs.writeFileSync(outPath, JSON.stringify({ meta: { HIT_R, GRAZE_R, SLOT_COST, CAP_PER_RUN, MOVE_AMP, MOVE_PERIOD, node: process.version, counting: "A=每弹一次(生命周期) / B=每穿带一次" }, summary, fpsDev, fpsDevSynth, results }, null, 2));
console.log(JSON.stringify({ summary, fpsDev, fpsDevSynth, outPath }, null, 2));

await browser.close();
server.close();