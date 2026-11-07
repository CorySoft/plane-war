#!/usr/bin/env node
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, ".clawbench", "shots");
const PORT = Number(process.env.PORT || 18100);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  const file = path.resolve(ROOT, rel === "/" ? "index.html" : `.${rel}`);
  if (!file.startsWith(`${ROOT}${path.sep}`)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runViewport(browser, width, height) {
  const label = `${width}x${height}`;
  const dir = path.join(OUT, label);
  await fs.promises.mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  async function boot() {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__gameReady && window.__game, null, { timeout: 15000 });
    await page.waitForFunction(() => {
      const skin = window.__game?.getSkinProgress?.();
      return skin && skin.ok === skin.total;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    // 首局主菜单会自动弹帮助面板，它会整层压住菜单截图（实测菜单系截图全被覆盖）。
    // 截图前确定性关闭并断言，否则拍出来的「菜单」其实是帮助面板。
    const helpClosed = await page.evaluate(async () => {
      const meta = await import("/js/meta.js");
      const ui = await import("/js/ui.js");
      meta.setSetting("helpSeen", true);
      if (ui.isHelpOpen()) ui.closeHelp();
      return !ui.isHelpOpen();
    });
    if (!helpClosed) throw new Error("help panel is still open after closeHelp()");
    await page.evaluate(async () => {
      window.__uidumpUi = await import("/js/ui.js");
      window.__uidumpConfig = await import("/js/config.js");
      window.__uidumpPowerup = await import("/js/powerup.js");
    });
  }

  async function shot(name, delay = 180) {
    await page.waitForTimeout(delay);
    if (await page.evaluate(() => window.__uidumpUi?.isHelpOpen?.())) {
      throw new Error(`截图 ${name} 时帮助面板仍处于打开状态`);
    }
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    console.log(`${label}/${name}.png`);
  }

  async function canvasInfo() {
    return page.evaluate(() => {
      const canvas = document.getElementById("game");
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.x, y: rect.y, cssWidth: rect.width, cssHeight: rect.height,
        logicalWidth: canvas.width / (window.devicePixelRatio || 1),
        logicalHeight: canvas.height / (window.devicePixelRatio || 1),
      };
    });
  }

  async function tapLogical(x, y) {
    const c = await canvasInfo();
    await page.mouse.click(c.x + x / c.logicalWidth * c.cssWidth, c.y + y / c.logicalHeight * c.cssHeight);
  }

  async function resetToTutorial() {
    await page.evaluate(() => window.__game.resetGame());
    await page.waitForFunction(() => window.__game.state() === 5, null, { timeout: 5000 });
  }

  async function startFromTutorial() {
    await tapLogical(240, 560);
    await page.waitForFunction(() => window.__game.state() === 1, null, { timeout: 5000 });
  }

  async function resetToPlaying() {
    await resetToTutorial();
    await startFromTutorial();
  }

  await boot();
  const info = await canvasInfo();
  const skinProgress = await page.evaluate(() => window.__game.getSkinProgress());
  const uiControls = [];
  async function recordControls(screen, getters) {
    const controls = await page.evaluate(names => {
      const ui = window.__uidumpUi;
      const out = {};
      const measure = value => {
        const rect = value.rect || value;
        return { rect, hit: ui.getTouchTargetRect(rect) };
      };
      for (const [name, getter] of Object.entries(names)) {
        const value = ui[getter]?.();
        if (Array.isArray(value)) out[name] = value.map(measure);
        else if (value && Number.isFinite(value.w) && Number.isFinite(value.h)) out[name] = measure(value);
        else if (value && typeof value === "object") out[name] = Object.values(value).map(measure);
      }
      return out;
    }, getters);
    const scale = info.cssWidth / info.logicalWidth;
    const measured = Object.entries(controls).flatMap(([group, rects]) =>
      (Array.isArray(rects) ? rects : [rects]).map((value, index) => ({ value, index }))
        .filter(({ value }) => value?.rect && value?.hit)
        .map(({ value: { rect, hit }, index }) => ({
          screen, group,
          control: Array.isArray(rects) ? `${group}[${index}]` : group,
          logical: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
          cssPixels: {
            x: Math.round(rect.x * scale * 10) / 10, y: Math.round(rect.y * scale * 10) / 10,
            w: Math.round(rect.w * scale * 10) / 10, h: Math.round(rect.h * scale * 10) / 10,
          },
          hitLogical: { x: hit.x, y: hit.y, w: hit.w, h: hit.h },
          hitCssPixels: {
            x: Math.round(hit.x * scale * 10) / 10, y: Math.round(hit.y * scale * 10) / 10,
            w: Math.round(hit.w * scale * 10) / 10, h: Math.round(hit.h * scale * 10) / 10,
          },
        }))
    );
    uiControls.push(...measured);
  }

  await shot("menu-main");
  await recordControls("menu-main", {
    start: "getStartButton", campaign: "getCampaignButton", clearCache: "getClearCacheButton",
    hangar: "getHangarButton", talent: "getTalentButton", skillCodex: "getCodexButton",
    achievements: "getAchieveButton", settings: "getSettingsButton",
    powerupCodex: "getPowerupCodexButton", shop: "getShopButton", feedback: "getFeedbackButton",
    difficulty: "getDifficultyRects",
  });

  for (const [pageName, image] of [
    ["hangar", "menu-hangar"],
    ["talent", "menu-talent"],
    ["shop", "menu-shop"],
    ["codex", "menu-skill-codex"],
    ["powerupCodex", "menu-powerup-codex"],
    ["achieve", "menu-achievements"],
    ["settings", "menu-settings"],
  ]) {
    await page.evaluate(name => window.__game.setMenuPage(name), pageName);
    await shot(image);
    const getters = pageName === "hangar"
      ? { back: "getHangarBackButton", aircraftCards: "getHangarCards" }
          : pageName === "talent"
            ? { back: "getTalentBackButton", talentCards: "getTalentCards" }
      : pageName === "shop"
        ? { back: "getShopBackButton", purchaseCards: "getShopBuyButtons" }
        : pageName === "codex"
            ? { back: "getCodexBackButton", skillCards: "getCodexCardRects" }
          : pageName === "powerupCodex"
            ? { back: "getPowerupCodexBackButton", powerupCards: "getPowerupCardRects" }
          : pageName === "achieve"
            ? { back: "getAchieveBackButton", claimButtons: "getQuestClaimButtons", achievementCards: "getAchieveCardRects" }
            : { back: "getSettingsBackButton", settingRows: "getSettingToggles" };
    await recordControls(image, getters);
  }

  await page.evaluate(() => window.__game.setMenuPage("hangar"));
  await page.waitForTimeout(100);
  const aircraftDialogData = await page.evaluate(() => {
    const ui = window.__uidumpUi;
    const config = window.__uidumpConfig;
    const aircraft = ui.getHangarCards().find(card => !card.unlocked);
    const aircraftConfig = aircraft && config.META.aircraft[aircraft.id];
    return {
      aircraft: aircraft && { id: aircraft.id, name: aircraftConfig.name, cost: aircraft.cost },
    };
  });
  await page.evaluate(() => window.__game.setMenuPage("talent"));
  await page.waitForTimeout(100);
  const talentDialogData = await page.evaluate(() => {
    const ui = window.__uidumpUi;
    const config = window.__uidumpConfig;
    const talent = ui.getTalentCards().find(card => !card.bought && !card.locked);
    const talentConfig = talent && config.META.talents.find(item => item.id === talent.id);
    return talent && talentConfig
      ? { id: talent.id, name: talentConfig.name, cost: talent.cost, desc: talentConfig.desc }
      : null;
  });
  const dialogData = { aircraft: aircraftDialogData.aircraft, talent: talentDialogData };
  await page.evaluate(data => {
    const ui = window.__uidumpUi;
    ui.setMenuPage("main");
    ui.setShowClearCache(true);
  }, dialogData);
  await shot("dialog-clear-cache");
  await recordControls("dialog-clear-cache", { yes: "getClearYesButton", no: "getClearNoButton" });

  await page.evaluate(data => {
    const ui = window.__uidumpUi;
    ui.setShowClearCache(false);
    ui.setMenuPage("hangar");
    ui.setHangarConfirm(data.aircraft);
  }, dialogData);
  await shot("dialog-hangar-purchase");
  await recordControls("dialog-hangar-purchase", { yes: "getHangarConfirmYesButton", no: "getHangarConfirmNoButton" });

  await page.evaluate(data => {
    const ui = window.__uidumpUi;
    ui.setHangarConfirm(null);
    ui.setMenuPage("talent");
    ui.setTalentConfirm(data.talent);
  }, dialogData);
  await shot("dialog-talent-purchase");
  await recordControls("dialog-talent-purchase", { yes: "getTalentConfirmYesButton", no: "getTalentConfirmNoButton" });

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__gameReady && window.__game, null, { timeout: 15000 });
  await page.evaluate(async () => {
    window.__uidumpUi = await import("/js/ui.js");
    window.__uidumpConfig = await import("/js/config.js");
    window.__uidumpPowerup = await import("/js/powerup.js");
  });
  await resetToTutorial();
  await shot("tutorial");
  await startFromTutorial();
  await shot("hud-full-health");
  await recordControls("hud-full-health", { pause: "getPauseButton" });

  async function hitOnce() {
    const before = await page.evaluate(() => window.__game.getLives());
    await page.evaluate(() => {
      const game = window.__game;
      const player = game.getPlayer();
      player.invincible = 0;
      const enemy = game.spawnEnemy(1, window.__uidumpConfig.DIFFICULTY_PRESETS.normal, 1, player.x, player.y, { type: "small" });
      enemy.hp = 100000;
      enemy.vx = 0;
      enemy.vy = 0;
    });
    await page.waitForFunction(value => window.__game.getLives() === value - 1, before, { timeout: 5000, polling: "raf" });
  }

  await hitOnce();
  await shot("hud-after-hit", 0);
  await hitOnce();
  await shot("hud-low-health");
  await recordControls("hud-low-health", { pause: "getPauseButton" });

  await page.keyboard.press("KeyP");
  await page.waitForFunction(() => window.__game.state() === 4, null, { timeout: 3000 });
  await shot("pause");
  await recordControls("pause", { resume: "getPauseResumeButton", quit: "getPauseQuitButton" });

  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__gameReady && window.__game, null, { timeout: 15000 });
  await page.evaluate(async () => {
    window.__uidumpUi = await import("/js/ui.js");
    window.__uidumpConfig = await import("/js/config.js");
    window.__uidumpPowerup = await import("/js/powerup.js");
  });
  await resetToPlaying();
  await page.evaluate(async () => {
    const game = window.__game;
    for (let i = 0; i < 80 && game.state() === 1; i++) {
      game.getPlayer()._xpPack = true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });
  await page.waitForFunction(() => window.__game.state() === 3, null, { timeout: 10000 });
  await shot("levelup-choice-with-toast");
  await page.waitForTimeout(1500);
  await shot("levelup-choice");
  await recordControls("levelup-choice", { skillCards: "getSkillCards" });
  await page.keyboard.press("Digit1");
  await page.waitForFunction(() => window.__game.state() === 1, null, { timeout: 3000 });
  await shot("levelup-result-with-toast");
  await page.evaluate(() => window.__game.setGachaAnim(window.__uidumpConfig.SKILLS[0], "skillup"));
  await shot("skillup-animation-with-toast");
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__uidumpPowerup.clearGachaAnim());
  await shot("levelup-result");
  await page.evaluate(() => window.__game.setGachaAnim(window.__uidumpConfig.SKILLS[0], "skillup"));
  await shot("skillup-animation");

  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.__uidumpUi.drawRevive(document.getElementById("game").getContext("2d"), 10, 40));
  await shot("revive");
  await recordControls("revive", { yes: "getReviveYesButton", no: "getReviveNoButton" });
  await page.evaluate(() => window.__uidumpUi.drawGameOver(document.getElementById("game").getContext("2d"), 92000, 64000, false, false));
  await shot("gameover-endless");
  await recordControls("gameover-endless", { restart: "getRestartButton", menu: "getGameOverMenuButton" });
  await page.evaluate(() => window.__uidumpUi.drawGameOver(document.getElementById("game").getContext("2d"), 92000, 64000, true, true));
  await shot("gameover-campaign");
  await recordControls("gameover-campaign", { restart: "getRestartButton", menu: "getGameOverMenuButton" });

  await fs.promises.writeFile(path.join(dir, "controls.json"), JSON.stringify({
    viewport: label, canvas: info, skinProgress, controls: uiControls,
  }, null, 2));
  await page.close();
  if (pageErrors.length) throw new Error(`${label} page errors: ${pageErrors.join("; ")}`);
}

async function main() {
  await fs.promises.mkdir(OUT, { recursive: true });
  await new Promise(resolve => server.listen(PORT, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    await runViewport(browser, 480, 720);
    await runViewport(browser, 360, 640);
    console.log(`Screenshots and hit-area measurements saved under ${path.relative(ROOT, OUT)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
