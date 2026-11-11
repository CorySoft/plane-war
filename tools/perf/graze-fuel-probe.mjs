/* ===========================================================
 * graze-fuel-probe.mjs — 「默认模式为什么没有敌弹」燃料探针
 *
 * 目的：给 graze-feasibility.mjs 的实测结论定口径——擦弹机制的燃料
 *       是「敌弹与玩家的近距接触」，本脚本只观测不改产品代码：
 *   1) 敌机在开火窗口内(10 < y < H*0.7)停留了多少帧
 *   2) 敌机 fireCd 的分布（是否根本没走到 0）
 *   3) 同屏敌弹数时间线 + 敌弹与玩家的最近距离
 *   4) Boss Rush / 默认模式对照
 * 用法：node tools/perf/graze-fuel-probe.mjs
 * =========================================================== */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const f = path.join(ROOT, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const browser = await chromium.launch({ headless: true });

async function probe({ seed, frames, mode, fps = 60 }) {
  const step = 1000 / fps;
  const context = await browser.newContext({ viewport: { width: 480, height: 720 } });
  await context.addInitScript(({ s }) => {
    let sd = s >>> 0;
    Math.random = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
    window.__clock = 1000;
    performance.now = () => window.__clock;
    window.__rafQueue = [];
    window.requestAnimationFrame = cb => { window.__rafQueue.push(cb); return 1; };
    window.cancelAnimationFrame = () => {};
  }, { s: seed });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/index.html${mode === "bossrush" ? "?bossrush=1" : ""}`, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 2500));

  const out = await page.evaluate(async ({ frames, step }) => {
    const meta = await import("/js/meta.js");
    const ui = await import("/js/ui.js");
    meta.getSettings().skipTutorial = true;
    if (ui.isHelpOpen()) ui.closeHelp();
    const g = window.__game;
    g.resetGame();

    let inWindowFrames = 0, enemyFrames = 0, spawnFrames = 0;
    let hostileFrames = 0, peakHostile = 0, minD2 = 1e18;
    const fireCdZeroCrossings = new WeakMap();   // 敌机 → 上次观测到的 fireCd，用于数「开火次数」
    const cdSamples = [];
    const timeline = [];
    const types = {};

    for (let f = 0; f < frames; f++) {
      window.__clock += step;
      const cb = window.__rafQueue.shift();
      if (!cb) break;
      cb();
      if (g.state() !== 1) continue;
      const p = g.getPlayer();
      let hostile = 0;
      for (const b of g.bullets) {
        if (!b || b.friendly) continue;
        hostile++;
        const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < minD2) minD2 = d2;
      }
      hostileFrames += hostile;
      if (hostile > peakHostile) peakHostile = hostile;
      let winNow = 0, alive = 0;
      for (const e of g.enemies) {
        if (!e) continue;
        alive++;
        types[e.type] = (types[e.type] || 0) + 1;
        enemyFrames++;
        if (e.y > 10 && e.y < 720 * 0.7) { inWindowFrames++; winNow++; }
        if (typeof e.fireCd === "number") {
          const prev = fireCdZeroCrossings.get(e);
          if (prev !== undefined && prev <= 0 && e.fireCd > 0) cdSamples.push(+prev.toFixed(2));
          fireCdZeroCrossings.set(e, e.fireCd);
          if (f % 120 === 0) cdSamples.push(+e.fireCd.toFixed(2));
        }
      }
      if (alive > 0) spawnFrames++;
      if (f % 120 === 0) timeline.push({ f, alive, win: winNow, hostile });
    }
    const cdSorted = cdSamples.slice().sort((a, b) => a - b);
    return {
      framesPlayed: spawnFrames, aliveEnemyFrames: enemyFrames, inWindowFrames,
      windowShare: +(inWindowFrames / Math.max(1, enemyFrames) * 100).toFixed(1),
      hostileFrames, peakHostile,
      minDist: minD2 === 1e18 ? null : +Math.sqrt(minD2).toFixed(1),
      fireCdCrossings: cdSamples.length,
      cdP50: cdSorted.length ? cdSorted[Math.floor(cdSorted.length / 2)] : null,
      cdMin: cdSorted[0] ?? null,
      typeMix: types,
      timeline: timeline.slice(0, 30),
    };
  }, { frames, step });

  await context.close();
  return { seed, mode, fps, ...out, errors };
}

const rows = [];
for (const mode of ["default", "bossrush"]) {
  rows.push(await probe({ seed: 20261108, frames: 3600, mode }));
}
console.log(JSON.stringify(rows, null, 2));
fs.writeFileSync("/tmp/graze-fuel-probe.json", JSON.stringify(rows, null, 2));
await browser.close();
