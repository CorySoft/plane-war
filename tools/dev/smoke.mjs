/* ============================================================
 * tools/dev/smoke.mjs — 真机冒烟测试（开发用，不参与 npm test）
 *
 * 用途：起一个临时 HTTP 服务，用无头 Chromium 实际加载游戏、点击开始、
 *       跑一段对局、切各个菜单子页，收集所有 console error / pageerror / 404。
 *
 * 用法（需先装 playwright）：
 *   node tools/dev/smoke.mjs                 # 默认 420x740 竖屏
 *   W=900 H=620 node tools/dev/smoke.mjs     # 横屏
 *
 * 说明：仓库原来根目录下的 test.mjs / test_http.cjs 就是干这个的，
 *       但它们把路径硬编码成了 /mnt/data/plane_war、/root/.cache/ms-playwright/...，
 *       换台机器必定失败，且不属于 npm test。这里改成可移植版本，
 *       并放到 tools/ 下（deploy.sh 已排除 tools/，不会被上传）。
 * ============================================================ */

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.PORT || 18099);
const VW = Number(process.env.W || 420);
const VH = Number(process.env.H || 740);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent((req.url || "/").split("?")[0]);
  const fpath = path.join(ROOT, rel === "/" ? "index.html" : rel);
  // 目录穿越防护：解析后必须仍在项目根内
  if (!fpath.startsWith(ROOT + path.sep) && fpath !== ROOT) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(fpath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fpath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

async function main() {
  await new Promise(r => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, hasTouch: true });

  // 版本化入口在本地仓库里不存在（部署时才生成），404 并回退到 js/game.js 是预期路径，
  // 浏览器会同时打一条 console error 与一条 requestfailed / 404 response，这三处都要放行
  const isVersionedEntry = (u) => /\/js\/game\.v[^/]*\.js$/.test(u || "");
  page.on("console", m => {
    if (m.type() === "error") {
      if (isVersionedEntry(m.location()?.url)) return;
      consoleErrors.push(m.text());
    }
  });
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("requestfailed", r => {
    if (isVersionedEntry(r.url())) return;
    failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`);
  });
  page.on("response", r => {
    if (r.status() >= 400 && !isVersionedEntry(r.url())) {
      failedRequests.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  const boot = await page.evaluate(() => ({
    gameReady: !!window.__gameReady,
    fallbackShown: document.getElementById("fallback")?.style.display || "none",
    loaderRemoved: !document.getElementById("loader"),
    skin: window.__game?.getSkinProgress?.() || null,
  }));

  // 逻辑坐标 → CSS 坐标（canvas 被 CSS 缩放过）
  const geo = await page.evaluate(() => {
    const c = document.getElementById("game");
    const r = c.getBoundingClientRect();
    return { l: r.left, t: r.top, cw: r.width, ch: r.height, lw: c.width, lh: c.height };
  });
  const sx = geo.cw / geo.lw, sy = geo.ch / geo.lh;
  const click = (lx, ly) => page.mouse.click(geo.l + lx * sx, geo.t + ly * sy);

  // 主菜单 → 开始游戏 → 跳过教程
  await click(geo.lw / 2, geo.lh * 0.485);
  await page.waitForTimeout(400);
  await click(geo.lw / 2, geo.lh * 0.70);
  await page.waitForTimeout(300);

  // 跑 6 秒对局（中途加压到高难度）
  await page.evaluate(() => window.__game?.setScore?.(60000));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__game?.setScore?.(120000));
  await page.waitForTimeout(3000);

  const mid = await page.evaluate(() => ({
    state: window.__game?.state?.(),
    score: window.__game?.getScore?.(),
    enemies: window.__game?.enemies?.length ?? 0,
    bullets: window.__game?.bullets?.length ?? 0,
  }));

  // 暂停面板
  await page.keyboard.press("KeyP");
  await page.waitForTimeout(250);
  const pausedState = await page.evaluate(() => window.__game?.state?.());
  if (pausedState === 4) await page.keyboard.press("KeyP");
  await page.waitForTimeout(200);

  // 回主菜单并遍历所有子页
  await page.evaluate(() => { window.__game.setMenuPage("main"); });
  for (const pg of ["codex", "powerupCodex", "hangar", "talent", "shop", "achieve", "settings", "main"]) {
    await page.evaluate(p => window.__game.setMenuPage(p), pg);
    await page.waitForTimeout(120);
  }

  console.log("=== 冒烟结果 ===");
  console.log("视口:", `${VW}x${VH}`, " 逻辑分辨率:", `${geo.lw}x${geo.lh}`, " 缩放:", sx.toFixed(3));
  console.log("启动:", JSON.stringify(boot));
  console.log("对局中:", JSON.stringify(mid));
  console.log("暂停状态值:", pausedState, "(4=PAUSED)");
  console.log("console error:", consoleErrors.length ? consoleErrors.join("\n") : "(无)");
  console.log("pageerror:", pageErrors.length ? pageErrors.join("\n") : "(无)");
  console.log("失败请求/404:", failedRequests.length ? failedRequests.join("\n") : "(无)");

  const bad = consoleErrors.length + pageErrors.length + failedRequests.length;
  await browser.close();
  server.close();
  if (bad > 0 || !boot.gameReady) {
    console.log("\n[FAIL] 存在异常");
    process.exitCode = 1;
  } else {
    console.log("\n[OK] 无异常");
  }
}

main().catch(e => {
  console.error("冒烟脚本异常:", e);
  server.close();
  process.exitCode = 1;
});
