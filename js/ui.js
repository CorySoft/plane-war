/* ===========================================================
 * ui.js — 菜单 / 结束 / 升级选择 / 暂停 / 伤害飘字
 * =========================================================== */

import { W, H, STATE, TAU, SKILLS, POWERUP_DEFS, SHOP_ITEMS, getShopItemCost, ACHIEVEMENTS, DAILY_QUESTS, META } from "./config.js";
import { clamp, roundRect, setf } from "./utils.js";
import { glowText, softPanel, lineBtn, bar, hexToRgba, C, pulse, veil } from "./theme.js";
import {
  getStardust, getQuestView, getAchievementView, getDiscoveredPowerups, getShopLevels, getShopLevel,
  isAircraftUnlocked, getSelectedAircraft, isTalentPurchased, getSettings,
} from "./meta.js";

// ---------- 伤害飘字 ----------
let damageNumbers = [];

export function spawnDamageNumber(x, y, text, color = "#fff", big = false) {
  const now = performance.now();
  // 持续密集伤害：同一区域的相同飘字 180ms 内不重复出现，避免叠成一片
  if (!big) {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const d = damageNumbers[i];
      if (now - d.born < 180 && d.text === text && Math.hypot(d.x - x, d.y - y) < 18) {
        return;
      }
    }
  }
  if (damageNumbers.length >= 60) damageNumbers.shift(); // 防爆量
  damageNumbers.push({
    x, y, text, color, big,
    vy: -2.5,
    life: 1.0,
    maxLife: 1.0,
    born: now,
  });
}

export function updateDamageNumbers(dt) {
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const d = damageNumbers[i];
    d.y += d.vy * dt * 60;
    d.vy *= 0.96;
    d.life -= dt;
    if (d.life <= 0) damageNumbers.splice(i, 1);
  }
}

export function drawDamageNumbers(ctx) {
  for (const d of damageNumbers) {
    const a = clamp(d.life / d.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = d.color;
    setf(ctx, d.big ? "bold 22px 'Courier New', monospace" : "bold 15px 'Courier New', monospace");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.globalAlpha = 1;
}

export function clearDamageNumbers() {
  damageNumbers = [];
}

// ---------- 星空 ----------
let stars = [];

export function initStars() {
  stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.7,
      sp: 0.4 + Math.random() * 2.2,
      tw: Math.random() * TAU,
    });
  }
}

export function updateStars(dt) {
  for (const s of stars) {
    s.y += s.sp * dt * 60;
    if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
  }
}

export function drawStars(ctx, frame) {
  for (const s of stars) {
    const a = 0.45 + 0.4 * Math.sin(frame * 0.04 + s.tw);
    const rgb = s.r > 1.6 ? "255,236,190" : (s.r > 1.2 ? "190,225,255" : "210,228,255");
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
}

// ---------- 菜单 ----------
let btnStartRect = null;
let btnRestartRect = null;
let btnGameOverMenuRect = null;
let btnPauseResumeRect = null;
let btnPauseQuitRect = null;
let btnPauseRect = null;
let btnCodexRect = null;      // 主菜单「技能图鉴」按钮
let btnCodexBackRect = null;  // 图鉴页「返回」按钮
let btnPowerupCodexRect = null;      // 主菜单「道具图鉴」按钮
let btnPowerupCodexBackRect = null;  // 道具图鉴页「返回」按钮
let btnAchieveRect = null;      // 主菜单「成就·任务」按钮
let btnAchieveBackRect = null;  // 成就页「返回」按钮
let btnReviveYesRect = null;    // 复活面板「复活」按钮
let btnReviveNoRect = null;     // 复活面板「放弃」按钮
let btnShopRect = null;          // 主菜单「系统商城」按钮
let btnShopBackRect = null;      // 商城页「返回」按钮
let btnShopBuyRects = [];        // 商城页购买按钮
let btnClearCacheRect = null;    // 主菜单「清除缓存」按钮
let btnHangarRect = null;
let btnHangarBackRect = null;
let btnTalentRect = null;
let btnTalentBackRect = null;
let btnSettingsRect = null;
let btnSettingsBackRect = null;
let skillCards = [];
let difficultyRects = {};
let questClaimRects = [];       // 任务页各「领取」按钮
let hangarCardRects = [];
let talentCardRects = [];
let settingToggleRects = [];

// 详情卡片：点击图鉴卡片时弹出详细信息
let detailCard = null;  // { type, data }
export const setDetailCard = d => { detailCard = d; };
export const getDetailCard = () => detailCard;

// 清除缓存确认框
let showClearCache = false;
export const setShowClearCache = v => { showClearCache = v; };
export const getShowClearCache = () => showClearCache;
let btnClearYesRect = null;
let btnClearNoRect = null;
export function getClearYesButton() { return btnClearYesRect; }
export function getClearNoButton() { return btnClearNoRect; }

// 可点击的图鉴卡片区域（每帧重建）
let codexCardRects = [];        // 技能图鉴 [{rect, skill, got}]
let powerupCardRects = [];      // 道具图鉴 [{rect, key, def, got}]
let achieveCardRects = [];      // 成就 [{rect, def, achieved}]

// 主菜单子页面：main / codex / achieve / powerupCodex / shop / hangar / talent / settings
let menuPage = "main";

// 整页切换过渡：切页瞬间记录时间，页面绘制完成后叠一层深空面纱淡出
const PAGE_VEIL_DUR = 0.22;
let pageVeilAt = -1e9;
export const setMenuPage = p => {
  if (menuPage === p) return;
  menuPage = p;
  pageVeilAt = uiTime();
};
export const getMenuPage = () => menuPage;
function pageVeilAlpha() {
  const t = (uiTime() - pageVeilAt) / PAGE_VEIL_DUR;
  if (t >= 1 || t < 0) return 0;
  return (1 - t) * (1 - t);
}
export const getPageVeilAlpha = () => pageVeilAlpha();
function drawPageVeil(ctx) {
  veil(ctx, W, H, pageVeilAlpha());
}

// 菜单动画用秒级时间（Node/测试环境无 performance 时退化为 0）
const uiTime = () => (typeof performance !== "undefined" ? performance.now() : 0) / 1000;

/** 页面小标题：发光 + 字距 */
function sectionLabel(ctx, text, x, y, color = "rgba(255,255,255,.75)", size = 15) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  setf(ctx, "bold " + size + "px 'sans-serif'");
  ctx.fillStyle = color;
  const spaced = text.split("").join(" ");
  ctx.fillText(spaced, x, y);
  ctx.restore();
}

/** 子页大标题：白色→主题色渐变 + 辉光 */
function pageTitle(ctx, text, x, y, color, size = 32, font = "'sans-serif'") {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const g = ctx.createLinearGradient(0, y, 0, y + size * 1.25);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, hexToRgba(color, 1));
  g.addColorStop(1, hexToRgba(color, 0.8));
  setf(ctx, "bold " + size + "px " + font);
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 标题下方渐隐装饰线 */
function titleRule(ctx, x, y, halfW, color) {
  ctx.save();
  const g = ctx.createLinearGradient(x - halfW, 0, x + halfW, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, hexToRgba(color, 0.8));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - halfW, y, halfW * 2, 2);
  ctx.restore();
}

export function hitTestButton(mx, my, rect) {
  return rect && mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
}

export function getPauseButton() { return btnPauseRect; }
export function getStartButton() { return btnStartRect; }
export function getRestartButton() { return btnRestartRect; }
export function getGameOverMenuButton() { return btnGameOverMenuRect; }
export function getPauseResumeButton() { return btnPauseResumeRect; }
export function getPauseQuitButton() { return btnPauseQuitRect; }
export function getSkillCards() { return skillCards; }
export function getDifficultyRects() { return difficultyRects; }
export function getCodexButton() { return btnCodexRect; }
export function getCodexBackButton() { return btnCodexBackRect; }
export function getPowerupCodexButton() { return btnPowerupCodexRect; }
export function getPowerupCodexBackButton() { return btnPowerupCodexBackRect; }
export function getAchieveButton() { return btnAchieveRect; }
export function getAchieveBackButton() { return btnAchieveBackRect; }
export function getQuestClaimButtons() { return questClaimRects; }
export function getReviveYesButton() { return btnReviveYesRect; }
export function getReviveNoButton() { return btnReviveNoRect; }
export function getShopButton() { return btnShopRect; }
export function getShopBackButton() { return btnShopBackRect; }
export function getShopBuyButtons() { return btnShopBuyRects; }
export function getClearCacheButton() { return btnClearCacheRect; }
export function getCodexCardRects() { return codexCardRects; }
export function getPowerupCardRects() { return powerupCardRects; }
export function getAchieveCardRects() { return achieveCardRects; }
export function getHangarButton() { return btnHangarRect; }
export function getHangarBackButton() { return btnHangarBackRect; }
export function getTalentButton() { return btnTalentRect; }
export function getTalentBackButton() { return btnTalentBackRect; }
export function getSettingsButton() { return btnSettingsRect; }
export function getSettingsBackButton() { return btnSettingsBackRect; }
export function getHangarCards() { return hangarCardRects; }
export function getTalentCards() { return talentCardRects; }
export function getSettingToggles() { return settingToggleRects; }

export function drawMenu(ctx, best, difficultyKey, presets, discovered = []) {
  // 压暗以聚焦内容，同时保留背景的星云层次
  const dim = ctx.createLinearGradient(0, 0, 0, H);
  dim.addColorStop(0, "rgba(3,5,14,.5)");
  dim.addColorStop(0.35, "rgba(3,5,14,.05)");
  dim.addColorStop(0.72, "rgba(3,5,14,.2)");
  dim.addColorStop(1, "rgba(3,5,14,.66)");
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, W, H);

  hangarCardRects = [];
  talentCardRects = [];
  settingToggleRects = [];
  questClaimRects = [];
  codexCardRects = [];
  powerupCardRects = [];
  achieveCardRects = [];
  btnHangarRect = btnHangarBackRect = null;
  btnTalentRect = btnTalentBackRect = null;
  btnSettingsRect = btnSettingsBackRect = null;
  btnCodexRect = btnCodexBackRect = null;
  btnAchieveRect = btnAchieveBackRect = null;
  btnPowerupCodexRect = btnPowerupCodexBackRect = null;
  btnShopRect = btnShopBackRect = null;
  btnShopBuyRects = [];
  btnClearCacheRect = null;

  if (menuPage === "codex") { drawSkillCodex(ctx, discovered); drawPageVeil(ctx); return; }
  if (menuPage === "achieve") { drawAchieve(ctx); drawPageVeil(ctx); return; }
  if (menuPage === "hangar") { drawHangar(ctx); drawPageVeil(ctx); return; }
  if (menuPage === "talent") { drawTalent(ctx); drawPageVeil(ctx); return; }
  if (menuPage === "settings") { drawSettings(ctx); drawPageVeil(ctx); return; }
  if (menuPage === "powerupCodex") { drawPowerupCodex(ctx, getDiscoveredPowerups()); drawPageVeil(ctx); return; }
  if (menuPage === "shop") { drawShop(ctx); drawPageVeil(ctx); return; }

  // ---- 标题：渐变填充 + 辉光，底层放大制造光晕 ----
  const ty = H * 0.08;
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.globalAlpha = 0.55;
  ctx.shadowColor = "rgba(90,220,255,.9)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#04101f";
  setf(ctx, "bold 56px 'Courier New', monospace");
  ctx.fillText("飞机大战", W / 2, ty + 2);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  const tg = ctx.createLinearGradient(0, ty, 0, ty + 60);
  tg.addColorStop(0, "#c2f8ff");
  tg.addColorStop(0.55, "#63d8ff");
  tg.addColorStop(1, "#2f7bff");
  setf(ctx, "bold 52px 'Courier New', monospace");
  ctx.fillStyle = tg;
  ctx.fillText("飞机大战", W / 2, ty);
  ctx.restore();

  // 清除缓存按钮（右上角）
  const ccx = W - 60, ccy = 20, ccw = 40, cch = 30;
  ctx.fillStyle = "rgba(255,107,107,.15)";
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 1.5;
  roundRect(ctx, ccx, ccy, ccw, cch, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 11px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("清除缓存", ccx + ccw / 2, ccy + cch / 2 + 1);
  btnClearCacheRect = { x: ccx, y: ccy, w: ccw, h: cch };

  ctx.fillStyle = "rgba(255,255,255,.72)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("方向键 / A D 移动 · 自动射击 · 升级三选一", W / 2, H * 0.175);

  // 星尘徽章
  const starStr = "星尘 ✦ " + getStardust();
  setf(ctx, "bold 15px 'sans-serif'");
  const mw = ctx.measureText ? (ctx.measureText(starStr).width || starStr.length * 15) : starStr.length * 15;
  const sw = mw + 30;
  softPanel(ctx, W / 2 - sw / 2, H * 0.215 - 10, sw, 30, 15, {
    top: "rgba(200,150,255,.34)", mid: "rgba(64,40,128,.42)",
    bottom: "rgba(28,16,66,.62)", border: "rgba(208,166,255,.7)", glow: 10,
  });
  glowText(ctx, {
    text: starStr, x: W / 2, y: H * 0.215 - 6, size: 15, weight: "bold",
    color: "#ecd6ff", blur: 8, align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  if (best > 0) {
    glowText(ctx, {
      text: "★ 最高分  " + best, x: W / 2, y: H * 0.252, size: 15, weight: "bold",
      color: "#ffd166", blur: 12, align: "center", baseline: "top", fontFamily: "'Courier New', monospace",
    });
  }

  const craft = META.aircraft[getSelectedAircraft()] || META.aircraft.falcon;
  glowText(ctx, {
    text: "出战 " + craft.name + "  " + craft.desc, x: W / 2, y: H * 0.286,
    size: 13, color: "rgba(208,240,255,.95)", blur: 7, align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  const keys = Object.keys(presets);
  const dw = 80, dh = 30, gap = 8;
  const totalW = keys.length * dw + (keys.length - 1) * gap;
  const startX = W / 2 - totalW / 2;
  const dy = H * 0.33;
  difficultyRects = {};
  const nowD = uiTime();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = presets[k];
    const x = startX + i * (dw + gap);
    const selected = k === difficultyKey;
    ctx.save();
    if (selected) {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12 + 8 * pulse(nowD, 3, i * 0.7);
    }
    const g = ctx.createLinearGradient(0, dy, 0, dy + dh);
    if (selected) {
      g.addColorStop(0, hexToRgba(p.color, 0.92));
      g.addColorStop(1, hexToRgba(p.color, 0.42));
    } else {
      g.addColorStop(0, "rgba(24,34,60,.9)");
      g.addColorStop(1, "rgba(11,15,30,.95)");
    }
    roundRect(ctx, x, dy, dw, dh, 10);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = selected ? 2.4 : 1.2;
    roundRect(ctx, x + 0.5, dy + 0.5, dw - 1, dh - 1, 9);
    ctx.stroke();
    ctx.fillStyle = selected ? "#05121c" : p.color;
    setf(ctx, "bold 15px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((selected ? "✓ " : "") + p.name, x + dw / 2, dy + dh / 2 + 1);
    ctx.restore();
    difficultyRects[k] = { x, y: dy, w: dw, h: dh };
  }
  const cur = presets[difficultyKey];
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.62)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText(cur.desc, W / 2, dy + dh + 10);

  const bx = W / 2 - 90, by = H * 0.46, bw = 180, bh = 50;
  const pulseS = pulse(uiTime(), 2.6);
  lineBtn(ctx, bx, by, bw, bh, "#31d6ff", "开始游戏", {
    size: 25, weight: "bold", glow: 16 + 14 * pulseS, r: 14,
    fontFamily: "'Courier New', monospace", textColor: "#03202e",
  });
  // CTA 顶部微光描线，呼应飞船驾驶舱玻璃质感
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + 20, by + 4);
  ctx.lineTo(bx + bw - 20, by + 4);
  ctx.stroke();
  ctx.restore();
  btnStartRect = { x: bx, y: by, w: bw, h: bh };

  // 导航瓦片：机库 / 天赋 / 图鉴 / 成就 / 设置 / 道具图鉴 / 商城
  const nav = [
    ["hangar", "机库", "#66e0ff"],
    ["talent", "天赋", "#c8a6ff"],
    ["codex", "图鉴 " + discovered.length + "/" + SKILLS.length, "#ffd93b"],
    ["achieve", "成就任务", "#7CFC00"],
    ["settings", "设置", "#9be8ff"],
    ["powerupCodex", "道具图鉴", "#ff6b6b"],
    ["shop", "系统商城", "#d0a6ff"],
  ];
  const nw = 148, nh = 40, ng = 8;
  const nStartY = H * 0.56;
  for (let i = 0; i < nav.length; i++) {
    const [id, label, color] = nav[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const nx = i === nav.length - 1 ? W / 2 - nw / 2 : W / 2 - nw - ng / 2 + col * (nw + ng);
    const ny = nStartY + row * (nh + ng);
    // 玻璃质感导航瓦片：渐变底 + 彩色描边 + 左侧色条
    ctx.save();
    const g = ctx.createLinearGradient(0, ny, 0, ny + nh);
    g.addColorStop(0, "rgba(34,46,78,.55)");
    g.addColorStop(1, "rgba(10,14,30,.92)");
    roundRect(ctx, nx, ny, nw, nh, 10);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = hexToRgba(color, 0.8);
    ctx.stroke();
    ctx.fillStyle = color;
    roundRect(ctx, nx + 7, ny + 7, 4, nh - 14, 2);
    ctx.fill();
    ctx.restore();
    glowText(ctx, {
      text: label, x: nx + nw / 2 + 3, y: ny + nh / 2 + 1, size: 15, weight: "bold",
      color, blur: 7, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
    });
    const rect = { x: nx, y: ny, w: nw, h: nh };
    if (id === "hangar") btnHangarRect = rect;
    else if (id === "talent") btnTalentRect = rect;
    else if (id === "codex") btnCodexRect = rect;
    else if (id === "achieve") btnAchieveRect = rect;
    else if (id === "settings") btnSettingsRect = rect;
    else if (id === "powerupCodex") btnPowerupCodexRect = rect;
    else btnShopRect = rect;
  }

  drawPageVeil(ctx);
}

/** 技能图鉴：主菜单子页面，已习得的技能点亮，未习得置灰 */
function drawSkillCodex(ctx, discovered) {
  const total = SKILLS.length;
  const lit = discovered.length;

  pageTitle(ctx, "技 能 图 鉴", W / 2, H * 0.055, "#ffd93b", 32);
  titleRule(ctx, W / 2, H * 0.105, 90, "#ffd93b");

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const full = lit >= total;
  ctx.fillStyle = full ? "#7CFC00" : "rgba(255,255,255,.88)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("已收录 " + lit + " / " + total + (full ? " · 全部点亮！" : ""), W / 2, H * 0.12);
  const pbarW = 150, pbarX = W / 2 - pbarW / 2, pbarY = H * 0.16;
  bar(ctx, pbarX, pbarY, pbarW, 6, lit / total, full ? "#7CFC00" : "#ffd93b", { rounded: 3, glow: 8 });
  ctx.fillStyle = "rgba(255,255,255,.4)";
  setf(ctx, "11px 'sans-serif'");
  ctx.fillText("在游戏中习得技能，图鉴自动点亮", W / 2, pbarY + 14);

  // 网格：窄屏自动减列
  const cols = W >= 360 ? 4 : 3;
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const cardH = W >= 360 ? 62 : 54;
  const startY = H * 0.20;
  const gx = pad;

  ctx.textBaseline = "middle";
  codexCardRects = [];
  for (let i = 0; i < SKILLS.length; i++) {
    const s = SKILLS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (cardW + gap);
    const y = startY + row * (cardH + gap);
    const got = discovered.includes(s.id);

    // 卡片
    ctx.save();
    const cg = ctx.createLinearGradient(0, y, 0, y + cardH);
    cg.addColorStop(0, got ? hexToRgba(s.color, 0.28) : "rgba(255,255,255,.06)");
    cg.addColorStop(1, got ? "rgba(22,30,52,.96)" : "rgba(8,11,22,.92)");
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = got ? hexToRgba(s.color, 0.95) : "rgba(255,255,255,.16)";
    ctx.lineWidth = got ? 1.6 : 1.1;
    ctx.stroke();
    ctx.restore();

    // 点亮标记
    if (got) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x + cardW - 10, y + 10, 4, 0, TAU);
      ctx.fill();
    }

    // 名称
    ctx.fillStyle = got ? s.color : "rgba(255,255,255,.30)";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(s.name, x + cardW / 2, y + cardH * 0.32);
    ctx.fillStyle = got ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(got ? s.desc : "未点亮", x + cardW / 2, y + cardH * 0.76);
    codexCardRects.push({ x: { x, y, w: cardW, h: cardH }, skill: s, got });
  }

  // 返回按钮
  const bw = 180, bx = W / 2 - bw / 2, by = H * 0.90, bh = 44;
  lineBtn(ctx, bx, by, bw, bh, "#5ee6ff", "← 返回主菜单", { size: 17, weight: "bold", glow: 10, r: 12 });
  btnCodexBackRect = { x: bx, y: by, w: bw, h: bh };
  btnCodexRect = null;
}

/** 系统商城：星尘兑换永久加成 */
function drawShop(ctx) {
  const stardust = getStardust();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#d0a6ff";
  setf(ctx, "bold 30px 'sans-serif'");
  ctx.fillText("系 统 商 城", W / 2, H * 0.05);
  ctx.fillStyle = "#ffd166";
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText("星尘  ✦ " + stardust, W / 2, H * 0.10);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText("消耗星尘永久提升各项能力", W / 2, H * 0.135);

  const cols = W >= 360 ? 2 : 1;
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const cardH = 52;
  const startY = H * 0.18;
  const gx = pad;

  btnShopBuyRects = [];
  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const item = SHOP_ITEMS[i];
    const lv = getShopLevel(item.id);
    const maxed = lv >= item.max;
    const cost = getShopItemCost(item, lv);
    const affordable = stardust >= cost && !maxed;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    ctx.fillStyle = maxed ? "rgba(124,252,0,.08)" : affordable ? "rgba(24,32,52,.92)" : "rgba(13,16,26,.85)";
    ctx.strokeStyle = maxed ? "#7CFC00" : affordable ? "#d0a6ff" : "rgba(255,255,255,.22)";
    ctx.lineWidth = affordable ? 2 : 1.2;
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fill(); ctx.stroke();

    // 图标
    ctx.fillStyle = maxed ? "#7CFC00" : affordable ? "#d0a6ff" : "rgba(255,255,255,.30)";
    setf(ctx, "bold 18px monospace");
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(item.icon, x + 10, y + cardH * 0.5);

    // 名称 + 描述
    ctx.fillStyle = maxed ? "#7CFC00" : affordable ? "#fff" : "rgba(255,255,255,.50)";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(item.name + " " + lv + "/" + item.max, x + 32, y + cardH * 0.32);
    ctx.fillStyle = "rgba(255,255,255,.50)";
    setf(ctx, "10px 'sans-serif'");
    ctx.fillText(item.desc, x + 32, y + cardH * 0.72);

    // 价格/已满
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    if (maxed) {
      ctx.fillStyle = "#7CFC00";
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText("已满级", x + cardW - 10, y + cardH * 0.5);
    } else {
      ctx.fillStyle = affordable ? "#ffd166" : "rgba(255,255,255,.35)";
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText("✦ " + cost, x + cardW - 10, y + cardH * 0.5);
    }

    // 点击区域（整张卡片可买）
    if (!maxed) btnShopBuyRects.push({ x, y, w: cardW, h: cardH, id: item.id });
  }

  btnShopBackRect = drawBackButton(ctx);
  btnShopRect = null;
}

function drawBackButton(ctx, label = "← 返回主菜单") {
  const bw = 180, bx = W / 2 - bw / 2, by = H * 0.92, bh = 40;
  lineBtn(ctx, bx, by, bw, bh, "#5ee6ff", label, { size: 16, weight: "bold", glow: 9, r: 12 });
  return { x: bx, y: by, w: bw, h: bh };
}

/** 道具图鉴：主菜单子页面，已拾取的道具点亮，未拾取置灰 */
function drawPowerupCodex(ctx, discovered) {
  const allKeys = Object.keys(POWERUP_DEFS);
  const total = allKeys.length;
  const lit = discovered.length;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 32px 'sans-serif'");
  ctx.fillText("道 具 图 鉴", W / 2, H * 0.06);
  ctx.fillStyle = lit >= total ? "#7CFC00" : "rgba(255,255,255,.8)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("已收录 " + lit + " / " + total + (lit >= total ? " · 全部点亮！" : ""), W / 2, H * 0.11);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText("在游戏中拾取道具，图鉴自动点亮", W / 2, H * 0.145);

  const cols = W >= 360 ? 4 : 3;
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const cardH = 60;
  const startY = H * 0.19;
  const gx = pad;

  ctx.textBaseline = "middle";
  powerupCardRects = [];
  for (let i = 0; i < allKeys.length; i++) {
    const k = allKeys[i];
    const def = POWERUP_DEFS[k];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (cardW + gap);
    const y = startY + row * (cardH + gap);
    const got = discovered.includes(k);

    ctx.fillStyle = got ? "rgba(24,32,52,.92)" : "rgba(13,16,26,.85)";
    ctx.strokeStyle = got ? def.color : "rgba(255,255,255,.22)";
    ctx.lineWidth = got ? 2 : 1.2;
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fill(); ctx.stroke();

    if (got) {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x + cardW - 10, y + 10, 4, 0, TAU);
      ctx.fill();
    }

    // 名称
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = got ? def.color : "rgba(255,255,255,.30)";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(def.name, x + cardW / 2, y + cardH * 0.32);

    // 描述（已精简，无需截断）
    ctx.fillStyle = got ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)";
    setf(ctx, "11px 'sans-serif'");
    const desc = got ? String(powerupDesc(k)) : "未拾取";
    ctx.fillText(desc, x + cardW / 2, y + cardH * 0.76);
    powerupCardRects.push({ x: { x, y, w: cardW, h: cardH }, key: k, def, got });
  }

  btnPowerupCodexBackRect = drawBackButton(ctx);
  btnPowerupCodexRect = null;
}

function powerupDesc(k) {
  return {
    power: "火力+1，15秒",
    life: "回复1生命",
    shield: "护盾+1层",
    madHunt: "8秒追踪弹",
    rapid: "8秒射速大增",
    speed: "8秒移速+30%",
    freeze: "冻结全场",
    magnet: "8秒吸道具",
    double: "8秒得分×2",
    xppack: "+50经验",
    skillup: "随机升级技能",
    drop: "8秒掉率大增",
    critboost: "8秒必暴击",
    knockback: "8秒子弹击退",
    randomSkill: "随机获取技能",
  }[k] || "";
}

export function powerupDescFull(k) {
  return {
    power: "本局火力等级 +1，持续 15 秒",
    life: "立即回复 1 点生命",
    shield: "获得 1 层护盾，可抵消 1 次伤害",
    madHunt: "8 秒内子弹向四周 360° 散发并追踪敌机",
    rapid: "8 秒内射击间隔大幅缩短",
    speed: "8 秒内移动速度提升 30%",
    freeze: "冻结全场敌机与敌方子弹",
    magnet: "8 秒内自动吸引附近道具",
    double: "8 秒内得分翻倍",
    xppack: "立即获得 50 点经验",
    skillup: "随机升级一个已拥有技能",
    randomSkill: "随机获得一个全新技能",
    drop: "8 秒内道具掉落率大幅提升",
    critboost: "8 秒内必定暴击且暴击倍率提升",
    knockback: "8 秒内子弹附带击退效果",
  }[k] || "";
}

function drawHangar(ctx) {
  pageTitle(ctx, "机  库", W / 2, H * 0.045, "#66e0ff", 32);
  titleRule(ctx, W / 2, H * 0.095, 66, "#66e0ff");
  glowText(ctx, {
    text: "星尘 ✦ " + getStardust(), x: W / 2, y: H * 0.108,
    size: 15, weight: "bold", color: "#e0c2ff", blur: 9,
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  const ids = Object.keys(META.aircraft);
  const selected = getSelectedAircraft();
  hangarCardRects = [];
  const cols = 2, pad = 14, gap = 8;
  const cardW = (W - pad * 2 - gap) / cols;
  const cardH = 118;
  const startY = H * 0.15;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const cfg = META.aircraft[id];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cardW + gap);
    const y = startY + row * (cardH + gap);
    const unlocked = isAircraftUnlocked(id);
    const on = selected === id;
    ctx.save();
    if (on) { ctx.shadowColor = "rgba(102,224,255,.85)"; ctx.shadowBlur = 16; }
    const g = ctx.createLinearGradient(0, y, 0, y + cardH);
    if (on) {
      g.addColorStop(0, "rgba(32,74,116,.95)");
      g.addColorStop(1, "rgba(10,20,46,.97)");
    } else if (unlocked) {
      g.addColorStop(0, "rgba(32,46,82,.9)");
      g.addColorStop(1, "rgba(12,17,34,.94)");
    } else {
      g.addColorStop(0, "rgba(20,22,38,.88)");
      g.addColorStop(1, "rgba(8,9,20,.95)");
    }
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = on ? "#66e0ff" : unlocked ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.12)";
    ctx.lineWidth = on ? 2 : 1.1;
    roundRect(ctx, x + 0.5, y + 0.5, cardW - 1, cardH - 1, 11);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 14, y + 1.5); ctx.lineTo(x + cardW - 14, y + 1.5); ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = on ? "#66e0ff" : unlocked ? "#fff" : "rgba(255,255,255,.4)";
    setf(ctx, "bold 16px 'sans-serif'");
    ctx.fillText(cfg.name, x + cardW / 2, y + 10);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(cfg.desc, x + cardW / 2, y + 34);
    ctx.fillText("速" + cfg.speed + " 伤×" + cfg.baseDmg + " 射×" + cfg.fireRate, x + cardW / 2, y + 54);
    ctx.fillText("生命 " + cfg.startHp, x + cardW / 2, y + 72);
    ctx.fillStyle = unlocked ? (on ? "#7CFC00" : "#ffd166") : "#d0a6ff";
    setf(ctx, "bold 13px 'sans-serif'");
    let tag;
    if (on) tag = "出战中";
    else if (unlocked) tag = "选择";
    else tag = cfg.cost + " 星尘";
    ctx.fillText(tag, x + cardW / 2, y + 92);
    hangarCardRects.push({ id, x, y, w: cardW, h: cardH, unlocked, cost: cfg.cost });
  }
  btnHangarBackRect = drawBackButton(ctx);
}

function drawTalent(ctx) {
  pageTitle(ctx, "天  赋", W / 2, H * 0.03, "#c8a6ff", 32);
  titleRule(ctx, W / 2, H * 0.078, 56, "#c8a6ff");
  glowText(ctx, {
    text: "星尘 ✦ " + getStardust(), x: W / 2, y: H * 0.095,
    size: 15, weight: "bold", color: "#e0c2ff", blur: 9,
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  const branches = [
    ["offense", "进攻", "#ffd166"],
    ["defense", "防御", "#66e0ff"],
    ["utility", "辅助", "#8ad4ff"],
  ];
  talentCardRects = [];
  const colW = (W - 28) / 3;
  for (let c = 0; c < branches.length; c++) {
    const [branch, title, color] = branches[c];
    const x = 10 + c * colW;
    ctx.fillStyle = color;
    setf(ctx, "bold 14px 'sans-serif'");
    ctx.fillText(title, x + colW / 2, H * 0.135);
    const list = META.talents.filter(t => t.branch === branch);
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const y = H * 0.17 + i * 112;
      const bought = isTalentPurchased(t.id);
      const locked = t.requires && !isTalentPurchased(t.requires);
      ctx.save();
      const gy = ctx.createLinearGradient(0, y, 0, y + 104);
      if (bought) {
        gy.addColorStop(0, hexToRgba(color, 0.32));
        gy.addColorStop(1, "rgba(20,26,46,.97)");
        ctx.shadowColor = color;
        ctx.shadowBlur = 13;
      } else {
        gy.addColorStop(0, "rgba(27,34,58,.92)");
        gy.addColorStop(1, "rgba(10,13,28,.96)");
      }
      roundRect(ctx, x + 4, y, colW - 12, 104, 10);
      ctx.fillStyle = gy;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = bought ? hexToRgba(color, 0.95) : locked ? "rgba(255,255,255,.14)" : hexToRgba(color, 0.5);
      ctx.lineWidth = bought ? 1.8 : 1;
      ctx.stroke();
      if (bought) {
        ctx.fillStyle = "rgba(255,255,255,.12)";
        roundRect(ctx, x + 5, y + 1.5, colW - 14, 2.5, 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = bought ? color : locked ? "rgba(255,255,255,.35)" : "#fff";
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText(t.name, x + colW / 2, y + 12);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      setf(ctx, "10px 'sans-serif'");
      ctx.fillText(t.desc, x + colW / 2, y + 36);
      ctx.fillStyle = bought ? "#7CFC00" : locked ? "rgba(255,255,255,.3)" : "#ffd166";
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText(bought ? "已解锁" : (locked ? "需前置" : t.cost + " 星尘"), x + colW / 2, y + 72);
      talentCardRects.push({ id: t.id, x: x + 4, y, w: colW - 12, h: 104, bought, locked, cost: t.cost });
    }
  }
  btnTalentBackRect = drawBackButton(ctx);
}

function drawSettings(ctx) {
  pageTitle(ctx, "设  置", W / 2, H * 0.07, "#9be8ff", 32);
  titleRule(ctx, W / 2, H * 0.12, 52, "#9be8ff");

  const s = getSettings();
  const rows = [
    ["音效", "游戏内音效 · 命中 / 爆炸 / 升级", !s.sfxMuted, "sfxMuted"],
    ["音乐", "背景音乐开关", !s.musicMuted, "musicMuted"],
    ["跳过教程", "开局直接跳过操作教学", !!s.skipTutorial, "skipTutorial"],
  ];
  settingToggleRects = [];
  for (let i = 0; i < rows.length; i++) {
    const [label, hint, on, key] = rows[i];
    const y = H * 0.2 + i * 92;
    const x = 40, w = W - 80, h = 78;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(36,52,92,.5)");
    g.addColorStop(1, "rgba(12,16,34,.92)");
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = on ? "rgba(155,232,255,.6)" : "rgba(155,232,255,.22)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 18, y + 2); ctx.lineTo(x + w - 18, y + 2); ctx.stroke();
    ctx.restore();

    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    setf(ctx, "bold 18px 'sans-serif'");
    ctx.fillText(label, x + 22, y + 18);
    ctx.fillStyle = "rgba(255,255,255,.45)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(hint, x + 22, y + 46);

    // 右侧滑块开关
    const swW = 52, swH = 28;
    const swX = x + w - swW - 20, swY = y + (h - swH) / 2;
    ctx.save();
    ctx.shadowColor = on ? "#9be8ff" : "rgba(255,255,255,.2)";
    ctx.shadowBlur = on ? 10 : 0;
    const tg = ctx.createLinearGradient(0, swY, 0, swY + swH);
    if (on) { tg.addColorStop(0, "#5ee6ff"); tg.addColorStop(1, "#2f7bff"); }
    else { tg.addColorStop(0, "rgba(90,100,130,.4)"); tg.addColorStop(1, "rgba(40,46,66,.5)"); }
    roundRect(ctx, swX, swY, swW, swH, swH / 2);
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.shadowBlur = 0;
    const kx = on ? swX + swW - swH : swX;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(kx + swH / 2, swY + swH / 2, swH / 2 - 3, 0, TAU);
    ctx.fill();
    ctx.restore();

    settingToggleRects.push({ key, x, y, w, h });
  }
  btnSettingsBackRect = drawBackButton(ctx);
}

export function drawGameOver(ctx, score, best, isNewBest = false) {
  const now = uiTime();
  // 聚焦暗角 + 底部红光
  const dg = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.42, H * 1.0);
  dg.addColorStop(0, "rgba(30,8,18,.86)");
  dg.addColorStop(1, "rgba(4,3,10,.93)");
  ctx.fillStyle = dg;
  ctx.fillRect(0, 0, W, H);
  const rg = ctx.createRadialGradient(W / 2, H * 0.88, 10, W / 2, H * 0.9, H * 0.5);
  rg.addColorStop(0, "rgba(255,70,70,.18)");
  rg.addColorStop(1, "rgba(255,70,70,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, H * 0.4, W, H * 0.6);

  glowText(ctx, {
    text: "游 戏 结 束", x: W / 2, y: H * 0.30, size: 50, weight: "bold",
    color: "#ff9a9a", blur: 26 + 12 * pulse(now, 3.2),
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  // 成绩玻璃面板
  const py = H * 0.40, ph = 112, pw = Math.min(304, W - 56), px = W / 2 - pw / 2;
  softPanel(ctx, px, py, pw, ph, 16, {
    top: "rgba(255,120,120,.16)", mid: "rgba(24,16,36,.5)",
    bottom: "rgba(8,6,16,.9)", border: isNewBest ? "rgba(255,209,102,.65)" : "rgba(255,255,255,.18)",
    glow: isNewBest ? 16 : 4,
  });

  ctx.textAlign = "center"; ctx.textBaseline = "top";
  glowText(ctx, {
    text: "得分  " + score, x: W / 2, y: py + 16, size: 28, weight: "bold",
    color: "#ffffff", blur: 12, align: "center", baseline: "top", fontFamily: "'Courier New', monospace",
  });
  if (isNewBest) {
    glowText(ctx, {
      text: "★ 新纪录！", x: W / 2, y: py + 56, size: 18, weight: "bold",
      color: "#ffd166", blur: 16 + 8 * pulse(now, 4), align: "center", baseline: "top", fontFamily: "'sans-serif'",
    });
  } else {
    ctx.fillStyle = "rgba(255,255,255,.6)";
    setf(ctx, "16px 'Courier New', monospace");
    ctx.fillText("最高分  " + best, W / 2, py + 56);
  }

  // 星尘奖励
  const stardust = Math.floor(score / 10000);
  if (stardust > 0) {
    glowText(ctx, {
      text: "获得 " + stardust + " 星尘 ✦", x: W / 2, y: py + 86, size: 15, weight: "bold",
      color: "#d0a6ff", blur: 9, align: "center", baseline: "top", fontFamily: "'sans-serif'",
    });
  }

  // 重开按钮
  const bx = W / 2 - 100, by = H * 0.58, bw = 200, bh = 54;
  lineBtn(ctx, bx, by, bw, bh, "#ff5c6a", "重新开始", {
    size: 24, weight: "bold", glow: 16 + 8 * pulse(now, 3), r: 14,
    fontFamily: "'Courier New', monospace", textColor: "#fff",
  });
  btnRestartRect = { x: bx, y: by, w: bw, h: bh };

  // 返回主界面按钮
  const mx2 = W / 2 - 100, my2 = H * 0.66, mw2 = 200, mh2 = 50;
  ctx.fillStyle = "rgba(94,230,255,.12)";
  ctx.strokeStyle = "#5ee6ff";
  ctx.lineWidth = 2;
  roundRect(ctx, mx2, my2, mw2, mh2, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#5ee6ff";
  setf(ctx, "bold 22px 'Courier New', monospace");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("返回主菜单", W / 2, my2 + mh2 / 2);
  btnGameOverMenuRect = { x: mx2, y: my2, w: mw2, h: mh2 };
}

export function drawLevelUp(ctx, choices, playerSkills) {
  if (!choices || choices.length === 0) return;
  const now = uiTime();
  const ov = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.95);
  ov.addColorStop(0, "rgba(10,16,34,.62)");
  ov.addColorStop(1, "rgba(3,4,12,.94)");
  ctx.fillStyle = ov;
  ctx.fillRect(0, 0, W, H);

  glowText(ctx, {
    text: "升 级 ！", x: W / 2, y: H * 0.145, size: 40, weight: "bold",
    color: "#8ad4ff", blur: 26 + 10 * pulse(now, 3.4), align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.82)";
  setf(ctx, "16px 'sans-serif'");
  ctx.fillText("生命 +1 · 选择一个技能强化", W / 2, H * 0.215);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("按 1 / 2 / 3 或点击选择", W / 2, H * 0.26);

  const cardW = 280, cardH = 88, gap = 18;
  const startY = H * 0.34;
  skillCards = [];
  for (let i = 0; i < choices.length; i++) {
    const s = choices[i];
    const cy = startY + i * (cardH + gap);
    const cx = W / 2;
    ctx.save();
    const cg = ctx.createLinearGradient(0, cy, 0, cy + cardH);
    cg.addColorStop(0, hexToRgba(s.color, 0.26));
    cg.addColorStop(0.45, "rgba(22,30,54,.92)");
    cg.addColorStop(1, "rgba(9,12,26,.97)");
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 12;
    roundRect(ctx, cx - cardW / 2, cy, cardW, cardH, 14);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(s.color, 0.9);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - cardW / 2 + 18, cy + 2); ctx.lineTo(cx + cardW / 2 - 18, cy + 2); ctx.stroke();
    ctx.restore();
    // 序号
    const ncx = cx - cardW / 2 + 26;
    const ncy = cy + cardH / 2;
    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 10;
    const ng = ctx.createRadialGradient(ncx, ncy, 2, ncx, ncy, 17);
    ng.addColorStop(0, hexToRgba(s.color, 1));
    ng.addColorStop(1, hexToRgba(s.color, 0.55));
    ctx.beginPath();
    ctx.arc(ncx, ncy, 17, 0, TAU);
    ctx.fillStyle = ng;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#05070f";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    setf(ctx, "bold 18px 'Courier New', monospace");
    // 用字形实际边界精确垂直居中（textBaseline=middle 基于字体行盒，数字会偏高）
    const numStr = String(i + 1);
    const tm = ctx.measureText(numStr);
    const aHeight = (tm.actualBoundingBoxAscent != null && tm.actualBoundingBoxDescent != null)
      ? (tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent) / 2
      : 0;
    ctx.fillText(numStr, ncx, ncy + aHeight);
    // 技能名
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = s.color;
    setf(ctx, "bold 19px 'sans-serif'");
    const cur = playerSkills[s.id] || 0;
    ctx.fillText(s.name + (cur > 0 ? "  " + cur + "级" : ""), cx - cardW / 2 + 54, cy + 28);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    setf(ctx, "14px 'sans-serif'");
    ctx.fillText(s.desc, cx - cardW / 2 + 54, cy + 58);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    skillCards.push({ id: s.id, x: cx - cardW / 2, y: cy, w: cardW, h: cardH });
  }
}

// 游戏内顶部居中暂停按钮
export function drawPauseButton(ctx) {
  const bx = W / 2 - 19, by = 14, bw = 38, bh = 38;
  ctx.save();
  ctx.globalAlpha = 0.92;
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, "rgba(130,205,255,.34)");
  g.addColorStop(1, "rgba(8,12,30,.55)");
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.6)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // 播放图标 ⏸（两道竖条）
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#fff";
  ctx.fillRect(bx + 13, by + 11, 4.5, 16);
  ctx.fillRect(bx + 22, by + 11, 4.5, 16);
  ctx.restore();
  btnPauseRect = { x: bx, y: by, w: bw, h: bh };
}

/** 详情卡片：点击图鉴卡片后弹出 */
let detailCloseRect = null;
export function getDetailCloseRect() { return detailCloseRect; }

export function drawDetailCard(ctx) {
  if (!detailCard) return;
  detailCloseRect = null;
  const { type, data } = detailCard;

  // 半透明遮罩
  ctx.fillStyle = "rgba(5,7,15,.78)";
  ctx.fillRect(0, 0, W, H);

  // 卡片
  const cw = Math.min(360, W - 40), ch = 220;
  const cx = W / 2 - cw / 2, cy = H / 2 - ch / 2;
  const isGot = data.got || data.achieved;
  const color = data.color || "#5ee6ff";

  ctx.fillStyle = isGot ? "rgba(24,32,52,.98)" : "rgba(13,16,26,.98)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill(); ctx.stroke();

  ctx.textAlign = "center"; ctx.textBaseline = "top";

  // 图标/标记
  ctx.fillStyle = isGot ? color : "rgba(255,255,255,.30)";
  setf(ctx, "bold 36px monospace");
  ctx.fillText(data.icon || "✦", W / 2, cy + 14);

  // 名称
  ctx.fillStyle = isGot ? color : "rgba(255,255,255,.50)";
  setf(ctx, "bold 20px 'sans-serif'");
  ctx.fillText(data.name, W / 2, cy + 60);

  // 描述
  ctx.fillStyle = "rgba(255,255,255,.75)";
  setf(ctx, "14px 'sans-serif'");
  const desc = data.fullDesc || data.desc || "";
  const maxChars = 24;
  const lines = [];
  for (let i = 0; i < desc.length; i += maxChars) lines.push(desc.slice(i, i + maxChars));
  lines.forEach((line, i) => ctx.fillText(line, W / 2, cy + 92 + i * 20));

  // 附加信息行
  let extra = "";
  if (type === "skill") {
    extra = "当前等级 " + data.curLv + "/" + data.max;
  } else if (type === "powerup") {
    extra = "稀有度 " + data.rarity + "/5 · 权重 " + (data.weight || "-");
  } else if (type === "achievement") {
    extra = (data.achieved ? "✦ 已达成" : "未达成") + " · 奖励 " + (data.reward || 0) + " 星尘";
  }
  if (extra) {
    ctx.fillStyle = isGot ? color : "rgba(255,255,255,.40)";
    setf(ctx, "bold 12px 'sans-serif'");
    ctx.fillText(extra, W / 2, cy + 165);
  }

  // 关闭按钮
  ctx.textAlign = "right"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.6)";
  setf(ctx, "bold 13px 'sans-serif'");
  ctx.fillText("点击任意位置关闭", cx + cw - 12, cy + 6);

  // 整个卡片可关闭
  detailCloseRect = { x: cx, y: cy, w: cw, h: ch };
}

export function drawPause(ctx, player) {
  const now = uiTime();
  const ov = ctx.createRadialGradient(W / 2, H * 0.12, 30, W / 2, H / 2, H * 0.95);
  ov.addColorStop(0, "rgba(18,22,44,.6)");
  ov.addColorStop(1, "rgba(2,3,10,.9)");
  ctx.fillStyle = ov;
  ctx.fillRect(0, 0, W, H);

  glowText(ctx, {
    text: "暂 停", x: W / 2, y: H * 0.09, size: 48, weight: "bold",
    color: "#ffd166", blur: 28 + 10 * pulse(now, 3), align: "center", baseline: "top",
    fontFamily: "'Courier New', monospace",
  });

  // 战绩属性面板
  if (player) {
    const px = W / 2, py = H * 0.24;
    const lineH = 22;
    // 属性区域玻璃底板（衬托在战局画面上）
    softPanel(ctx, 16, H * 0.20, W - 32, H * 0.51, 18, {
      top: "rgba(255,209,102,.05)", mid: "rgba(14,18,36,.48)",
      bottom: "rgba(5,7,18,.85)", border: "rgba(255,209,102,.2)", glow: 2,
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setf(ctx, "bold 14px 'sans-serif'");

    // 计算实际属性
    const frMul = player.fireRateMul || 1;
    const baseFireRate = (0.16 - player.power * 0.012) * (1 - 0.08 * (player.skills.rate || 0)) * frMul;
    const rapidFireRate = baseFireRate * 0.5;
    const dps = Math.round((1 + (player.skills.dmg || 0)) / baseFireRate * 10) / 10;
    const moveSpd = Math.round(player.speed * (1 + 0.12 * (player.skills.move || 0)) * 10) / 10;
    const rangePx = Math.min(250 + (player.skills.range || 0) * 50 + ((player.level || 1) - 1) * 2.5, H + 80);
    const rangeM = Math.round(rangePx / 25);

    const stats = [
      ["♥ 生命", player._maxLivesUpdate ? (player.baseHp + (player.skills.maxhp || 0)) : player.baseHp, "#ff6b9d"],
      ["⚔ 攻击", 1 + (player.skills.dmg || 0), "#ffd166"],
      ["🔥 射速", (baseFireRate * 1000).toFixed(0) + "ms", "#ffe066"],
      ["🚀 移速", moveSpd, "#9be8ff"],
      ["📏 射程", rangeM + "m", "#88ddff"],
      ["🎯 暴击", Math.round(((player.skills.crit || 0) * 12 + (player.talentCrit || 0) * 100)) + "%", "#ff8fa3"],
    ];

    let sy = py;
    for (const [label, value, color] of stats) {
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillText(label, px - 70, sy);
      ctx.fillStyle = color;
      ctx.fillText(String(value), px + 70, sy);
      sy += lineH;
    }

    // 已学技能
    sy += 6;
    ctx.fillStyle = "rgba(255,255,255,.4)";
    setf(ctx, "12px 'sans-serif'");
    ctx.fillText("已学技能", px, sy);
    sy += 18;

    const skillNames = {
      dmg:"火力", rate:"射速", range:"射程", move:"机动", maxhp:"生命",
      shield:"护盾", crit:"暴击", dual:"侧翼", sideBullets:"护法", explosion:"爆炸", expChance:"爆破", expDmg:"爆裂", expRange:"扩域", volley:"连射",
      scatter:"散射", split:"分裂", penetrate:"穿透", guard:"护体",
      lifesteal:"吸取", xpboost:"经验", magnet:"磁力", score:"金币",
      bulletSpeed:"弹速", orbital:"天基", drop:"爆率", critdmg:"致命", knockback:"击退",
    };
    const learned = [];
    for (const [id, lv] of Object.entries(player.skills)) {
      if (lv > 0 && skillNames[id]) learned.push(skillNames[id] + lv + "级");
    }
    if (learned.length > 0) {
      ctx.fillStyle = "#5ee6ff";
      setf(ctx, "13px 'sans-serif'");
      // 分两列显示
      const colW = 100;
      const cols = Math.ceil(learned.length / 5);
      for (let c = 0; c < cols; c++) {
        const slice = learned.slice(c * 5, c * 5 + 5);
        for (let i = 0; i < slice.length; i++) {
          ctx.fillText(slice[i], px - colW * (cols - 1) / 2 + c * colW, sy + i * 18);
        }
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,.3)";
      ctx.fillText("暂无", px, sy);
    }
  }

  // 继续按钮
  const bx = W / 2 - 100, by = H * 0.78, bw = 200, bh = 46;
  lineBtn(ctx, bx, by, bw, bh, "#31d6ff", "继续游戏", {
    size: 22, weight: "bold", glow: 15, r: 13,
    fontFamily: "'Courier New', monospace", textColor: "#03202e",
  });
  btnPauseResumeRect = { x: bx, y: by, w: bw, h: bh };

  // 返回菜单按钮
  const bx2 = W / 2 - 100, by2 = H * 0.88, bw2 = 200, bh2 = 46;
  lineBtn(ctx, bx2, by2, bw2, bh2, "#ff5c6a", "返回菜单", {
    size: 22, weight: "bold", glow: 12, r: 13,
    fontFamily: "'Courier New', monospace", textColor: "#fff",
  });
  btnPauseQuitRect = { x: bx2, y: by2, w: bw2, h: bh2 };
}

export function drawToast(ctx, toast) {
  if (!toast || toast.t <= 0) return;
  const a = clamp(toast.t / 1.2, 0, 1);
  const size = 30;
  ctx.save();
  ctx.globalAlpha = a;
  setf(ctx, "bold " + size + "px 'sans-serif'");
  const mw = ctx.measureText ? (ctx.measureText(toast.text).width || toast.text.length * size) : toast.text.length * size;
  const w = mw + 56, h = 54;
  const x = W / 2 - w / 2, y = H * 0.38 - h / 2;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, hexToRgba(toast.color, 0.28));
  g.addColorStop(1, "rgba(6,8,18,.92)");
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = toast.color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = hexToRgba(toast.color, 0.8);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  glowText(ctx, {
    text: toast.text, x: W / 2, y: H * 0.38, size, weight: "bold",
    color: toast.color, blur: 14, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });
  ctx.restore();
}

/** 技能获得过场动画（skillup 升级 / randomSkill 随机获取） */
export function drawSkillAnim(ctx, player) {
  if (!player || !player._skillAnim) return;
  const anim = player._skillAnim;
  const p = 1 - anim.t / anim.maxT;  // 0→1
  const s = anim.skill;
  const isAcquire = anim.type === "acquire";
  const color = s.color;
  const title = isAcquire ? "随机获取技能" : "技能升级";

  // 半透明遮罩（渐入渐出）
  const alpha = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
  ctx.globalAlpha = alpha * 0.8;
  ctx.fillStyle = "rgba(5,7,15,.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // 扩散光环
  for (let i = 0; i < 3; i++) {
    const ringP = clamp((p * 3 + i * 0.2) % 1, 0, 1);
    const radius = 30 + ringP * 80;
    ctx.globalAlpha = (1 - ringP) * 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * (1 - ringP) + 0.5;
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.38, radius, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 卡片
  const cw = Math.min(280, W - 60), ch = 140;
  const cx = W / 2 - cw / 2, cy = H * 0.38 - ch / 2;
  ctx.fillStyle = "rgba(24,32,52,.98)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill(); ctx.stroke();

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // 标题
  ctx.fillStyle = color;
  setf(ctx, "bold 18px 'sans-serif'");
  ctx.fillText(title, W / 2, cy + 28);

  // 技能名
  ctx.fillStyle = "#fff";
  setf(ctx, "bold 26px 'sans-serif'");
  ctx.fillText(s.name, W / 2, cy + 65);

  // 描述
  ctx.fillStyle = "rgba(255,255,255,.65)";
  setf(ctx, "14px 'sans-serif'");
  ctx.fillText(s.desc, W / 2, cy + 100);

  // 等级
  const lv = player.skills[s.id] || 0;
  ctx.fillStyle = color;
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText("Lv." + lv + " / " + s.max, W / 2, cy + 125);
}

/** 复活面板：死亡后花星尘立即续命 */
export function drawRevive(ctx, stardust, cost) {
  const now = uiTime();
  const ov = ctx.createRadialGradient(W / 2, H * 0.28, 30, W / 2, H * 0.3, H * 0.95);
  ov.addColorStop(0, "rgba(40,28,8,.6)");
  ov.addColorStop(1, "rgba(3,3,8,.94)");
  ctx.fillStyle = ov;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  glowText(ctx, {
    text: "再战一次？", x: W / 2, y: H * 0.28, size: 40, weight: "bold",
    color: "#ffd166", blur: 26 + 10 * pulse(now, 3), align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });

  ctx.fillStyle = "rgba(255,255,255,.9)";
  setf(ctx, "17px 'sans-serif'");
  ctx.fillText("死亡后消耗 " + cost + " 星尘原地复活 1 次", W / 2, H * 0.37);
  ctx.fillStyle = "rgba(255,255,255,.62)";
  setf(ctx, "14px 'sans-serif'");
  ctx.fillText("复活后拥有 1 条命 · 短暂无敌 · 仅限本局 1 次", W / 2, H * 0.42);

  glowText(ctx, {
    text: "当前星尘  ✦ " + stardust, x: W / 2, y: H * 0.5, size: 20, weight: "bold",
    color: "#e0c2ff", blur: 12, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });

  // 复活按钮
  const bw = 150, bh = 54, by = H * 0.60;
  const bx1 = W / 2 - 160;
  lineBtn(ctx, bx1, by, bw, bh, "#ffd166", "复活  -" + cost, {
    size: 20, weight: "bold", glow: 18 + 8 * pulse(now, 3.4), r: 14,
    fontFamily: "'Courier New', monospace", textColor: "#4a3000",
  });
  btnReviveYesRect = { x: bx1, y: by, w: bw, h: bh };

  // 放弃按钮
  const bx2 = W / 2 + 10;
  lineBtn(ctx, bx2, by, bw, bh, "#ff5c6a", "放弃", {
    size: 20, weight: "bold", glow: 10, r: 14,
    fontFamily: "'Courier New', monospace", textColor: "#fff",
  });
  btnReviveNoRect = { x: bx2, y: by, w: bw, h: bh };

  ctx.fillStyle = "rgba(255,255,255,.4)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("星尘可在每局结算时获得，也可通过成就与每日任务获取", W / 2, H * 0.72);
}

/** 成就 · 每日任务面板：上半部分每日任务（可领取），下半部分成就图鉴 */
function drawAchieve(ctx) {
  pageTitle(ctx, "成就 · 每日任务", W / 2, H * 0.048, "#9dff57", 30);
  titleRule(ctx, W / 2, H * 0.10, 104, "#9dff57");
  glowText(ctx, {
    text: "星尘  ✦ " + getStardust(), x: W / 2, y: H * 0.115,
    size: 16, weight: "bold", color: "#e0c2ff", blur: 10,
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  // ===== 每日任务 =====
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.75)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("每日任务", 16, H * 0.145);
  ctx.fillStyle = "rgba(255,255,255,.4)";
  setf(ctx, "11px 'sans-serif'");
  ctx.fillText("每日 0 点刷新 · 领取后发放星尘", 16 + 76, H * 0.15);

  const qv = getQuestView();
  const rowH = 46;
  questClaimRects = [];
  for (let i = 0; i < qv.items.length; i++) {
    const it = qv.items[i];
    const ry = H * 0.19 + i * rowH;
    const rG = ctx.createLinearGradient(0, ry, 0, ry + rowH - 6);
    rG.addColorStop(0, "rgba(36,50,88,.55)");
    rG.addColorStop(1, "rgba(12,16,34,.95)");
    roundRect(ctx, 10, ry, W - 20, rowH - 6, 10);
    ctx.fillStyle = rG;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, ry + 1.5); ctx.lineTo(W - 16, ry + 1.5); ctx.stroke();

    // 名称
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(it.def.name, 20, ry + 6);
    // 进度
    ctx.fillStyle = "rgba(255,255,255,.55)";
    setf(ctx, "12px 'sans-serif'");
    ctx.fillText(it.def.desc + "   " + Math.min(it.cur, it.def.target) + "/" + it.def.target, 20, ry + 23);

    // 进度条
    const bx = 20, byy = ry + 40, bw = W - 176, bbh = 5;
    const p = it.claimed ? 0 : clamp(it.cur / it.def.target, 0, 1);
    bar(ctx, bx, byy, bw, bbh, p, it.claimed ? "rgba(255,255,255,.4)" : "#7CFC00", { rounded: 2, glow: 6 });

    // 领取按钮
    const cbtn = { x: W - 142, y: ry + 7, w: 124, h: 28 };
    let label, style;
    if (it.claimed) { label = "已领取"; style = "rgba(255,255,255,.35)"; }
    else if (it.cur >= it.def.target) { label = "领取 +" + it.def.reward; style = "#7CFC00"; }
    else { label = "未完成"; style = "rgba(255,255,255,.28)"; }
    ctx.fillStyle = it.claimed ? "rgba(255,255,255,.08)" : "rgba(124,252,0,.10)";
    ctx.strokeStyle = style;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); roundRect(ctx, cbtn.x, cbtn.y, cbtn.w, cbtn.h, 8); ctx.stroke();
    ctx.fillStyle = style;
    setf(ctx, it.claimed ? "12px 'sans-serif'" : "bold 12px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cbtn.x + cbtn.w / 2, cbtn.y + cbtn.h / 2);
    questClaimRects.push(cbtn);
  }

  // ===== 成就 =====
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.75)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("成就", 16, H * 0.535);
  const done = ACHIEVEMENTS.filter(a => getAchievementView().find(v => v.def.id === a.id).achieved).length;
  ctx.fillStyle = "rgba(255,255,255,.45)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText("已达成 " + done + " / " + ACHIEVEMENTS.length, 16, H * 0.555);

  const cols = 3;
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const cardH = W >= 360 ? 54 : 46;
  const startY = H * 0.585;
  const views = getAchievementView();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  achieveCardRects = [];
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cardW + gap);
    const y = startY + row * (cardH + 6);
    ctx.save();
    const ag = ctx.createLinearGradient(0, y, 0, y + cardH);
    ag.addColorStop(0, v.achieved ? hexToRgba(v.def.color, 0.28) : "rgba(255,255,255,.05)");
    ag.addColorStop(1, v.achieved ? "rgba(22,30,52,.96)" : "rgba(8,11,22,.92)");
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.strokeStyle = v.achieved ? hexToRgba(v.def.color, 0.95) : "rgba(255,255,255,.16)";
    ctx.lineWidth = v.achieved ? 1.6 : 1.1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = v.achieved ? v.def.color : "rgba(255,255,255,.30)";
    setf(ctx, "bold 12px 'sans-serif'");
    ctx.fillText(v.def.name, x + cardW / 2, y + cardH * 0.3);
    ctx.fillStyle = "rgba(255,255,255,.5)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(v.def.desc, x + cardW / 2, y + cardH * 0.72);
    achieveCardRects.push({ x: { x, y, w: cardW, h: cardH }, def: v.def, achieved: v.achieved });
  }

  // 返回按钮
  const bw = 180, bx = W / 2 - bw / 2, by = H * 0.935, bh = 40;
  lineBtn(ctx, bx, by, bw, bh, "#5ee6ff", "← 返回主菜单", { size: 16, weight: "bold", glow: 9, r: 11 });
  btnAchieveBackRect = { x: bx, y: by, w: bw, h: bh };
  btnCodexBackRect = null;
}

export function drawClearCacheConfirm(ctx) {
  if (!showClearCache) return;
  btnClearYesRect = null;
  btnClearNoRect = null;

  ctx.fillStyle = "rgba(5,7,15,.82)";
  ctx.fillRect(0, 0, W, H);

  // 卡片
  const cw = 280, ch = 200;
  const cx = W / 2 - cw / 2, cy = H * 0.27;
  ctx.fillStyle = "rgba(24,32,52,.98)";
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2.5;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill(); ctx.stroke();

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 22px 'sans-serif'");
  ctx.fillText("清除缓存", W / 2, cy + 35);

  ctx.fillStyle = "rgba(255,255,255,.75)";
  setf(ctx, "14px 'sans-serif'");
  ctx.fillText("确定清除全部存档数据？", W / 2, cy + 80);
  ctx.fillText("星尘 / 最高分 / 图鉴进度将丢失", W / 2, cy + 105);
  ctx.fillText("此操作不可恢复", W / 2, cy + 128);

  // 确认 / 取消
  const bw = 100, bh = 44, by = cy + ch - 62;
  const bx1 = W / 2 - 130;
  ctx.fillStyle = "rgba(255,107,107,.15)";
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2;
  roundRect(ctx, bx1, by, bw, bh, 11);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText("确认清除", bx1 + bw / 2, by + bh / 2 + 1);
  btnClearYesRect = { x: bx1, y: by, w: bw, h: bh };

  const bx2 = W / 2 + 30;
  ctx.fillStyle = "rgba(94,230,255,.12)";
  ctx.strokeStyle = "#5ee6ff";
  ctx.lineWidth = 2;
  roundRect(ctx, bx2, by, bw, bh, 11);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#5ee6ff";
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText("取消", bx2 + bw / 2, by + bh / 2 + 1);
  btnClearNoRect = { x: bx2, y: by, w: bw, h: bh };
}
