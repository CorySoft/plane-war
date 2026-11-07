/**
 * explosion-audit.mjs — 爆炸技能链路审计（只读，不改产品代码）
 *
 * 通过真实 game loop + 调试接口构造可控场景：
 *  A. 边缘表：目标敌机在爆炸半径 r±10px 处是否被 AOE 命中
 *  B. 远距连锁：两架相距 2r+50 能否连锁
 *  C. 连锁深度：10 架等距（<r）一次击杀最多引爆几架、几次爆炸
 *  D. 时序：伤害生效帧 vs 视觉半径膨胀到 r 的帧
 *
 * 用法：node tools/perf/explosion-audit.mjs
 */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.PORT || 18161);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const f = path.join(ROOT, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(PORT, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 480, height: 720 } });
const errors = [];
page.on("pageerror", e => errors.push(String(e)));

await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 20000 });
await page.waitForTimeout(500);

const out = await page.evaluate(async () => {
  const g = window.__game;
  const meta = await import("/js/meta.js");
  meta.getSettings().skipTutorial = true;
  g.resetGame();
  let p = g.getPlayer();
  const FULL = { dmg: 10, rate: 6, range: 10, move: 6, maxhp: 4, shield: 4,
    crit: 6, critdmg: 6, dual: 4, sideBullets: 5, explosion: 1, expChance: 6, expDmg: 6,
    expRange: 6, volley: 6, scatter: 6, split: 5, splitDist: 5, penetrate: 6, guard: 5,
    lifesteal: 4, xpboost: 6, magnet: 1, score: 6, drop: 6, knockback: 6, bulletSpeed: 6, orbital: 5 };
  const configure = pl => {
    Object.assign(pl.skills, FULL);
    pl.power = 4; pl.invincible = 999; pl.fireCd = 999;
  };
  configure(p);

  const diff = { hpScale: 1, speedScale: 1, fireCdScale: 1 };
  const freeze = () => {
    p.fireCd = 999;
    p.invincible = 999;
    for (const e of g.enemies) { e.vy = 0; e.vx = 0; e.fireCd = 999; }
  };
  const frame = () => new Promise(r => requestAnimationFrame(() => { freeze(); r(); }));

  const spawn = (x, y, hp) => {
    g.spawnEnemy(1, diff, 1, x, y, { type: "small" });
    const e = g.enemies[g.enemies.length - 1];
    e.hp = hp; e.maxHp = hp; e.vy = 0; e.vx = 0; e.fireCd = 999;
    return e;
  };
  // 每个场景前 resetGame：清空敌机/子弹/特效池，并复位经验等级，避免升级弹窗与 fxBlasts 上限污染
  const reset = () => {
    g.resetGame();
    p = g.getPlayer();
    configure(p);
    g.enemies.splice(0);
    g.bullets.splice(0);
  };

  // 实测爆炸半径：满级 expRange=6 → 40+72=112；small(hp=1) scale=1 → r=112
  const R = 112;

  async function edgeCase(d) {
    reset();
    const a = spawn(240, 650, 1);
    const b = spawn(240 + d, 650, 999);
    const before = b.hp;
    const bBefore = g.getFxCounts().blasts;
    g.fireBullet(0, 1, p, a.x, a.y, 0, true);
    const hadExplosion = g.bullets.some(x => x && x.behaviors && x.behaviors.has("explosion"));
    await frame(); await frame();
    return { d, hit: b.hp < before, delta: b.hp - before, hadExplosion,
      aAlive: g.enemies.includes(a), blasts: g.getFxCounts().blasts - bBefore,
      bulletsLeft: g.bullets.length, state: g.state(), pLevel: p.level };
  }

  async function chainCase(count, gap) {
    reset();
    for (let i = 0; i < count; i++) spawn(100 + i * gap, 650, 1);
    const before = { n: g.enemies.length, blasts: g.getFxCounts().blasts };
    const a = g.enemies[0];
    g.fireBullet(0, 1, p, a.x, a.y, 0, true);
    const deadByFrame = [];
    const visibleBlastsByFrame = [];
    for (let f = 1; f <= 6; f++) {
      await frame();
      deadByFrame.push(before.n - g.enemies.length);
      visibleBlastsByFrame.push(g.getFxBlasts().filter(b => (b.delay || 0) <= 0).length);
    }
    return {
      count, gap,
      total: before.n,
      dead: before.n - g.enemies.length,
      blasts: g.getFxCounts().blasts - before.blasts,
      deadByFrame,
      visibleBlastsByFrame,
      blastsWithDelay: g.getFxBlasts().filter(b => (b.delay || 0) > 0).length,
      aAlive: g.enemies.includes(a),
      bulletsLeft: g.bullets.length,
      state: g.state(), pLevel: p.level,
    };
  }

  async function timingCase() {
    reset();
    const a = spawn(240, 650, 1);
    const b = spawn(240 + 60, 650, 999);
    const before = b.hp;
    g.fireBullet(0, 1, p, a.x, a.y, 0, true);
    let hitFrame = null;
    for (let f = 1; f <= 12; f++) {
      await frame();
      if (hitFrame === null && b.hp < before) hitFrame = f;
    }
    return { hitFrame, visualFullRadiusFrame: Math.round(0.15 * 60),
      aAlive: g.enemies.includes(a), bHp: b.hp, blasts: g.getFxCounts().blasts,
      state: g.state(), pLevel: p.level };
  }

  const edges = [];
  for (const d of [R - 10, R - 1, R, R + 1, R + 10]) edges.push(await edgeCase(d));
  const far = await chainCase(2, 2 * R + 50);
  const chain = await chainCase(10, 56);
  async function madHuntCase() {
    reset();
    p.buffs.madHunt = 5;
    let frames = 0;
    while (p.buffs.madHunt > 0 && frames < 1200) {
      await frame();
      frames++;
    }
    return { configuredSeconds: 5, framesToZero: frames, remaining: p.buffs.madHunt };
  }

  const timing = await timingCase();
  const madHunt = await madHuntCase();

  return { R, edges, far, chain, timing, madHunt };
});

console.log(JSON.stringify({ ...out, errors }, null, 2));
await browser.close();
server.close();