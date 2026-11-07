/**
 * render-audit.mjs — 绘制层量化审计（只读，不改游戏代码）
 *
 * 两次独立采样：
 *  1) 插桩模式：统计每帧 shadowBlur 绘制、渐变创建、fill/stroke/drawImage 调用量
 *  2) 干净模式：正常 CPU + CDP 4x CPU throttling，采集 rAF 帧间隔直方图
 *
 * 用法：node tools/uidump/render-audit.mjs
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.PORT || 18111);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const rel = decodeURIComponent(url.pathname);
  const file = path.join(ROOT, rel === "/" ? "index.html" : rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const FULL_SKILLS = {
  dmg: 10, rate: 6, range: 10, move: 6, maxhp: 4, shield: 4, crit: 6, critdmg: 6,
  dual: 4, sideBullets: 5, explosion: 1, expChance: 6, expDmg: 6, expRange: 6,
  volley: 6, scatter: 6, split: 5, splitDist: 5, penetrate: 6, guard: 5,
  lifesteal: 4, xpboost: 6, magnet: 1, score: 6, drop: 6, knockback: 6,
  bulletSpeed: 6, orbital: 5,
};

async function setupScene(page) {
  await page.evaluate(async skills => {
    const meta = await import("/js/meta.js");
    meta.getSettings().skipTutorial = true;
    const g = window.__game;
    g.resetGame();
    g.setLevel(14);
    const p = g.getPlayer();
    p.skills = { ...p.skills, ...skills };
    p.power = 4;
    const tick = () => {
      const pl = g.getPlayer();
      if (pl) {
        pl.invincible = 99;
        pl.buffs.madHunt = 1;
        let target = null, best = Infinity;
        for (const e of g.enemies) {
          if (e.y >= pl.y - 20 || e.y <= 10) continue;
          const d = Math.abs(e.x - pl.x) + (pl.y - e.y) * 0.15;
          if (d < best) { best = d; target = e; }
        }
        if (target) pl.x = target.x;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, FULL_SKILLS);
  await page.waitForFunction(() => window.__game?.getCampaignStatus && window.__game.state?.() === 1, null, { timeout: 15000 });
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

await new Promise(r => server.listen(PORT, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
  ],
});

const common = {
  viewport: { width: 480, height: 720 },
  deviceScaleFactor: 2,
};

const out = {};

// ---------- 1) 插桩计数 ----------
{
  const page = await browser.newPage(common);
  await page.addInitScript(() => {
    const rp = { fill: 0, stroke: 0, drawImage: 0, lin: 0, rad: 0, shadowFill: 0, shadowStroke: 0, shadowDraw: 0, frames: [] };
    window.__rp = rp;
    const P = CanvasRenderingContext2D.prototype;
    const of = P.fill, os = P.stroke, od = P.drawImage, ol = P.createLinearGradient, orr = P.createRadialGradient;
    P.fill = function (...a) { rp.fill++; if (this.shadowBlur > 0) rp.shadowFill++; return of.apply(this, a); };
    P.stroke = function (...a) { rp.stroke++; if (this.shadowBlur > 0) rp.shadowStroke++; return os.apply(this, a); };
    P.drawImage = function (...a) { rp.drawImage++; if (this.shadowBlur > 0) rp.shadowDraw++; return od.apply(this, a); };
    P.createLinearGradient = function (...a) { rp.lin++; return ol.apply(this, a); };
    P.createRadialGradient = function (...a) { rp.rad++; return orr.apply(this, a); };
    let last = performance.now();
    const loop = t => {
      const dt = t - last; last = t;
      if (rp.frames.length < 4000 && window.__rpOn) rp.frames.push(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 20000 });
  await setupScene(page);
  const resource = await page.evaluate(() => {
    const list = performance.getEntriesByType("resource").filter(e => /assets\//.test(e.name));
    return {
      count: list.length,
      bytes: list.reduce((s, e) => s + (e.transferSize || e.decodedBodySize || 0), 0),
      slowest: list.map(e => ({ name: e.name.split("/").slice(-2).join("/"), ms: +e.duration.toFixed(1), kb: Math.round((e.transferSize || 0) / 1024) }))
        .sort((a, b) => b.ms - a.ms).slice(0, 5),
    };
  });
  await page.evaluate(() => { window.__rpOn = true; });
  await wait(60000);
  const rp = await page.evaluate(() => { window.__rpOn = false; return window.__rp; });
  const frames = rp.frames.slice(10);
  const avg = k => +(rp[k] / frames.length).toFixed(2);
  out.instrumented = {
    frames: frames.length,
    perFrame: {
      fill: avg("fill"), stroke: avg("stroke"), drawImage: avg("drawImage"),
      linearGradient: avg("lin"), radialGradient: avg("rad"),
      shadowFill: avg("shadowFill"), shadowStroke: avg("shadowStroke"), shadowDrawImage: avg("shadowDraw"),
      shadowTotal: +((rp.shadowFill + rp.shadowStroke + rp.shadowDraw) / frames.length).toFixed(2),
    },
    totals: rp,
    resource,
  };
  await page.close();
}

// ---------- 2) 干净帧间隔：菜单/峰值 × 1x/2x × CPU ----------
const cleanCases = [
  ["menu-1x", 1, false, 8000, 1, false],
  ["peak-1x", 1, true, 20000, 1, false],
  ["peak-2x", 2, true, 20000, 1, false],
  ["peak-1x-noshadow", 1, true, 20000, 1, true],
  ["peak-2x-noshadow", 2, true, 20000, 1, true],
  ["peak-2x-cpu4x", 2, true, 20000, 4, false],
];
for (const [label, dpr, peak, ms, throttle, noShadow] of cleanCases) {
  const page = await browser.newPage({ viewport: { width: 480, height: 720 }, deviceScaleFactor: dpr });
  await page.addInitScript(() => {
    window.__ft = [];
    let last = performance.now();
    const loop = t => {
      if (window.__ftOn) window.__ft.push(t - last);
      last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  if (noShadow) {
    await page.addInitScript(() => {
      const P = CanvasRenderingContext2D.prototype;
      const d = Object.getOwnPropertyDescriptor(P, "shadowBlur");
      Object.defineProperty(P, "shadowBlur", {
        get() { return d.get.call(this); },
        set() { d.set.call(this, 0); },
        configurable: true,
      });
    });
  }
  if (throttle > 1) {
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 20000 });
  if (peak) await setupScene(page);
  await page.evaluate(() => { window.__ftOn = true; });
  await wait(ms);
  const ft = await page.evaluate(() => { window.__ftOn = false; return window.__ft; });
  const s = ft.slice(5).sort((a, b) => a - b);
  const pct = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  out[label] = {
    dpr, peak, ms,
    samples: s.length,
    p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
    max: +s[s.length - 1].toFixed(1),
    fps_p50: +(1000 / pct(0.5)).toFixed(1),
    over16_7: +(s.filter(x => x > 16.7).length / s.length * 100).toFixed(1),
    over33: +(s.filter(x => x > 33).length / s.length * 100).toFixed(1),
    mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
  };
  await page.close();
}

await browser.close();
server.close();
console.log(JSON.stringify(out, null, 2));