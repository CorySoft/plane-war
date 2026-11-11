/* ============================================================
 * tools/dev/touch.mjs — 真机触控验证（开发用，不参与 npm test）
 *
 * 验证「战机按自身速度移动到手指点击位置」在真实触屏坐标系下成立：
 *   - 起临时 HTTP 服务，用带 hasTouch 的无头 Chromium 加载游戏
 *   - 进对局后分别点击屏幕左/右四分之一处
 *   - 断言战机 x 收敛到对应逻辑坐标（容差内）
 *
 * 用法：node tools/dev/touch.mjs
 * 注意：依赖 playwright（仓库已装）与本地 chromium；tools/ 已被 deploy.sh 排除，不会上传。
 * ============================================================ */

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.PORT || 18098);
const VW = Number(process.env.W || 420);
const VH = Number(process.env.H || 740);
const TOL = Number(process.env.TOL || 10);          // 逻辑像素容差（含每帧步长与吸附）
const SETTLE = Number(process.env.SETTLE || 1800);  // 每次点击后等待战机收敛（ms）

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
  if (!fpath.startsWith(ROOT + path.sep) && fpath !== ROOT) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(fpath, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fpath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

async function main() {
  await new Promise(r => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, hasTouch: true });

  const errors = [];
  // 版本化入口在本地仓库里不存在（部署时才生成），404 并回退到 js/game.js 是预期路径，放行
  const isVersionedEntry = (u) => /\/js\/game\.v[^/]*\.js$/.test(u || "");
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => {
    if (m.type() !== "error") return;
    if (isVersionedEntry(m.location()?.url)) return;   // 本地无版本化入口，预期 404
    if (m.text() === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
    errors.push(m.text());
  });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2000);

  // 关闭首局帮助面板，并跳过教程，确定性进对局
  await page.evaluate(async () => {
    const meta = await import("/js/meta.js");
    const ui = await import("/js/ui.js");
    meta.setSetting("helpSeen", true);
    if (ui.isHelpOpen()) ui.closeHelp();
    meta.setSetting("skipTutorial", true);
    window.__game.resetGame();   // 直接进 PLAYING（resetGame 已清触摸目标）
  });
  await page.waitForFunction(() => window.__game?.state?.() === 1, null, { timeout: 15000 });
  await page.waitForTimeout(300);

  // canvas 几何：viewport 像素 → 逻辑像素
  const geo = await page.evaluate(() => {
    const c = document.getElementById("game");
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, cw: r.width, ch: r.height, lw: c.width, lh: c.height };
  });

  // 把逻辑 x 比例换算成 viewport 坐标并真机点击
  async function tapLogicalX(frac) {
    const vx = geo.left + frac * geo.cw;
    const vy = geo.top + geo.ch * 0.5;
    await page.touchscreen.tap(vx, vy);
    await page.waitForTimeout(SETTLE);
  }
  // 读战机逻辑 x（y 锁死，只关心水平跟随）
  const playerX = () => page.evaluate(() => window.__game.getPlayer().x);
  const targetX = frac => frac * geo.lw;

  const cases = [
    { frac: 0.25, label: "左四分之一" },
    { frac: 0.75, label: "右四分之一" },
  ];
  const results = [];
  for (const c of cases) {
    await tapLogicalX(c.frac);
    const x = await playerX();
    const want = targetX(c.frac);
    const ok = Math.abs(x - want) <= TOL;
    results.push({ label: c.label, want: +want.toFixed(1), got: +x.toFixed(1), ok });
  }

  console.log("=== 真机触控跟随结果 ===");
  console.log("视口:", `${VW}x${VH}`, " 逻辑分辨率:", `${geo.lw}x${geo.lh}`, " 容差:", TOL);
  for (const r of results) {
    console.log(`  ${r.label}: 期望 x≈${r.want} 实际 x=${r.got} ${r.ok ? "OK" : "FAIL"}`);
  }
  console.log("pageerror/console error:", errors.length ? errors.join("\n") : "(无)");

  await browser.close();
  server.close();
  const allOk = results.every(r => r.ok) && errors.length === 0;
  console.log(allOk ? "\n[OK] 战机按速度收敛到点击位置" : "\n[FAIL] 触控跟随未达预期");
  if (!allOk) process.exitCode = 1;
}

main().catch(e => {
  console.error("触控脚本异常:", e);
  server.close();
  process.exitCode = 1;
});
