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
const CAMPAIGN = process.env.CAMPAIGN || "";
const MENU_CAMPAIGN = process.env.MENU_CAMPAIGN === "1";
const COMPLETE_FIRST_STAGE = process.env.COMPLETE_FIRST_STAGE === "1";
const EXPECT_CAMPAIGN_FALLBACK = process.env.EXPECT_CAMPAIGN_FALLBACK === "1";
const isExpectedCampaignRequest = url => {
  if (!EXPECT_CAMPAIGN_FALLBACK || !CAMPAIGN) return false;
  try {
    return new URL(url).pathname === `/assets/levels/${encodeURIComponent(CAMPAIGN)}.json`;
  } catch {
    return false;
  }
};

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
      if (EXPECT_CAMPAIGN_FALLBACK && m.text() === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
      consoleErrors.push(m.text());
    }
  });
  page.on("pageerror", e => pageErrors.push(e.message));
  page.on("requestfailed", r => {
    if (isVersionedEntry(r.url())) return;
    failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`);
  });
  page.on("response", r => {
    if (r.status() >= 400 && !isVersionedEntry(r.url())
        && !(r.status() === 404 && isExpectedCampaignRequest(r.url()))) {
      failedRequests.push(`${r.status()} ${r.url()}`);
    }
  });

  const campaignQuery = CAMPAIGN ? `?campaign=${encodeURIComponent(CAMPAIGN)}` : "";
  await page.goto(`http://127.0.0.1:${PORT}/index.html${campaignQuery}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  // 首局进入主菜单会自动弹出帮助面板（v0.4.7 起的首次引导）。它是菜单模态，
  // 点击会被它吞掉且不向下穿透：不先关掉，「点击开始」实际只是「关闭帮助」，
  // 冒烟会停在主菜单却仍报 OK（v0.4.7~v0.5.1 一直如此）。这里确定性关闭并校验。
  const helpClosed = await page.evaluate(async () => {
    const meta = await import("/js/meta.js");
    const ui = await import("/js/ui.js");
    meta.setSetting("helpSeen", true);
    if (ui.isHelpOpen()) ui.closeHelp();
    return !ui.isHelpOpen();
  });
  if (!helpClosed) throw new Error("help panel is still open after closeHelp()");

  const boot = await page.evaluate(() => ({
    gameReady: !!window.__gameReady,
    fallbackShown: document.getElementById("fallback")?.style.display || "none",
    loaderRemoved: !document.getElementById("loader"),
    skin: window.__game?.getSkinProgress?.() || null,
    campaign: window.__game?.getCampaignStatus?.() || null,
  }));

  // 逻辑坐标 → CSS 坐标（canvas 被 CSS 缩放过）
  const geo = await page.evaluate(() => {
    const c = document.getElementById("game");
    const r = c.getBoundingClientRect();
    return { l: r.left, t: r.top, cw: r.width, ch: r.height, lw: c.width, lh: c.height };
  });
  const sx = geo.cw / geo.lw, sy = geo.ch / geo.lh;
  const click = (lx, ly) => page.mouse.click(geo.l + lx * sx, geo.t + ly * sy);

  // 主菜单 → 无限模式或菜单战役入口 → 跳过教程
  if (MENU_CAMPAIGN) {
    const campaignButton = await page.evaluate(() => window.__game?.getCampaignButton?.());
    if (!campaignButton) throw new Error("campaign menu button is unavailable");
    await click(campaignButton.x + campaignButton.w / 2, campaignButton.y + campaignButton.h / 2);
    await page.waitForFunction(() => window.__game?.getCampaignStatus?.().active, null, { timeout: 8000 });
  } else {
    await click(geo.lw / 2, geo.lh * 0.485);
  }
  await page.waitForTimeout(400);
  await click(geo.lw / 2, geo.lh * 0.70);
  // 必须真的进入对局（state 1）；否则后面的对局数据与暂停检查都是假证据
  await page.waitForFunction(() => window.__game?.state?.() === 1, null, { timeout: 15000 });
  await page.waitForTimeout(300);

  let campaignProgression = null;
  if (MENU_CAMPAIGN && COMPLETE_FIRST_STAGE) {
    campaignProgression = await page.evaluate(async () => {
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const game = window.__game;
        game?.enemies?.splice(0);
        const status = game?.getCampaignStatus?.();
        if (status?.stageId === "level-02") {
          return { status, progress: game.getCampaignProgress?.() };
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return { status: window.__game?.getCampaignStatus?.(), progress: null };
    });
  }

  // 跑 6 秒对局（中途加压到高难度）
  await page.evaluate(() => window.__game?.setScore?.(60000));
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__game?.setScore?.(120000));
  await page.waitForTimeout(3000);

  const mid = await page.evaluate(async () => {
    // 取 1.5s 内的峰值占位：单帧可能恰好没有敌机/子弹，采样峰值才能证明对局在跑
    const deadline = performance.now() + 1500;
    let best = { enemies: 0, bullets: 0 };
    while (performance.now() < deadline) {
      const g = window.__game;
      const cur = { enemies: g?.enemies?.length ?? 0, bullets: g?.bullets?.length ?? 0 };
      if (cur.enemies + cur.bullets > best.enemies + best.bullets) best = cur;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return {
      state: window.__game?.state?.(),
      score: window.__game?.getScore?.(),
      enemies: best.enemies,
      bullets: best.bullets,
      campaign: window.__game?.getCampaignStatus?.() || null,
    };
  });

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
  if (campaignProgression) console.log("战役解锁:", JSON.stringify(campaignProgression));
  console.log("暂停状态值:", pausedState, "(4=PAUSED)");
  const expectedFallbackErrors = EXPECT_CAMPAIGN_FALLBACK
    ? consoleErrors.filter(message => message.startsWith("[plane_war] 关卡加载失败"))
    : [];
  const unexpectedConsoleErrors = consoleErrors.filter(message => !expectedFallbackErrors.includes(message));
  console.log("console error:", unexpectedConsoleErrors.length ? unexpectedConsoleErrors.join("\n") : "(无)");
  if (expectedFallbackErrors.length) console.log("预期的 campaign fallback:", expectedFallbackErrors.join("\n"));
  console.log("pageerror:", pageErrors.length ? pageErrors.join("\n") : "(无)");
  console.log("失败请求/404:", failedRequests.length ? failedRequests.join("\n") : "(无)");

  const bad = unexpectedConsoleErrors.length + pageErrors.length + failedRequests.length;
  // 门禁必须覆盖「真的在玩」：修复前 state 恒为 0（MENU）也照样报 OK
  const notPlaying = mid.state !== 1;
  const emptyField = (mid.enemies + mid.bullets) === 0;
  const campaignFailed = CAMPAIGN && (EXPECT_CAMPAIGN_FALLBACK
    ? (!mid.campaign?.fallbackError || mid.campaign.active)
    : (!mid.campaign?.active || mid.campaign.fallbackError));
  const menuCampaignFailed = MENU_CAMPAIGN
    && (!mid.campaign?.active || mid.campaign.requested !== "campaign-01" || mid.campaign.fallbackError);
  const progressionFailed = COMPLETE_FIRST_STAGE && MENU_CAMPAIGN
    && (campaignProgression?.status?.stageId !== "level-02"
      || !campaignProgression.progress?.completedStageIds?.includes("level-01")
      || !campaignProgression.progress?.unlockedStageIds?.includes("level-02"));
  await browser.close();
  server.close();
  if (bad > 0 || !boot.gameReady || notPlaying || emptyField || campaignFailed || menuCampaignFailed || progressionFailed) {
    if (notPlaying) console.log("  -> 未进入对局（state 应为 1，实际 " + mid.state + "）");
    if (emptyField) console.log("  -> 对局数据为空（敌机与子弹峰值均为 0）");
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
