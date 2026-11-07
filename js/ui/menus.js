import { W, H, TAU, SKILLS, SHOP_ITEMS, getShopItemCost, ACHIEVEMENTS, META } from "../config.js";
import { clamp, roundRect, setf } from "../utils.js";
import { glowText, softPanel, lineBtn, bar, hexToRgba, C, pulse, veil } from "../theme.js";
import { APP_VERSION } from "../version.js";
import {
  getStardust, getQuestView, getAchievementView, getDiscoveredPowerups, getShopLevel,
  isAircraftUnlocked, getSelectedAircraft, isTalentPurchased, getSettings, getCampaignProgress,
} from "../meta.js";
import { drawSprite } from "../assets.js";
import { uiState } from "./state.js";
import { drawBackButton, pageTitle, titleRule, uiTime } from "./common.js";
import { drawSkillCodex, drawPowerupCodex, resetCodexScroll } from "./codex.js";
import { setDetailCard, setHangarConfirm, setShowClearCache, setTalentConfirm } from "./dialogs.js";

const PAGE_VEIL_DUR = 0.22;
function pageVeilAlpha() {
  const t = (uiTime() - uiState.pageVeilAt) / PAGE_VEIL_DUR;
  if (t >= 1 || t < 0) return 0;
  return (1 - t) * (1 - t);
}
function drawPageVeil(ctx) { veil(ctx, W, H, pageVeilAlpha()); }
export const getPageVeilAlpha = () => pageVeilAlpha();
export const setMenuPage = p => {
  if (uiState.menuPage === p) return;
  uiState.menuPage = p;
  setHangarConfirm(null);
  setTalentConfirm(null);
  setShowClearCache(false);
  setDetailCard(null);
  if (p !== "codex" && p !== "powerupCodex") resetCodexScroll();
  uiState.pageVeilAt = uiTime();
};
export const getMenuPage = () => uiState.menuPage;
export function getStartButton() { return uiState.btnStartRect; }
export function getCampaignButton() { return uiState.btnCampaignRect; }
export function getCampaignSubtitleRect() { return uiState.campaignSubRect; }
export function getHelpButton() { return uiState.btnHelpRect; }
export function setCampaignLoading(loading) { uiState.campaignLoading = !!loading; }
export function getDifficultyRects() { return uiState.difficultyRects; }
export function getCodexButton() { return uiState.btnCodexRect; }
export function getCodexBackButton() { return uiState.btnCodexBackRect; }
export function getPowerupCodexButton() { return uiState.btnPowerupCodexRect; }
export function getPowerupCodexBackButton() { return uiState.btnPowerupCodexBackRect; }
export function getAchieveButton() { return uiState.btnAchieveRect; }
export function getAchieveBackButton() { return uiState.btnAchieveBackRect; }
export function getQuestClaimButtons() { return uiState.questClaimRects; }
export function getShopButton() { return uiState.btnShopRect; }
export function getShopBackButton() { return uiState.btnShopBackRect; }
export function getShopBuyButtons() { return uiState.btnShopBuyRects; }
export function getClearCacheButton() { return uiState.btnClearCacheRect; }
export function getAchieveCardRects() { return uiState.achieveCardRects; }
export function getHangarButton() { return uiState.btnHangarRect; }
export function getHangarBackButton() { return uiState.btnHangarBackRect; }
export function getTalentButton() { return uiState.btnTalentRect; }
export function getTalentBackButton() { return uiState.btnTalentBackRect; }
export function getSettingsButton() { return uiState.btnSettingsRect; }
export function getFeedbackButton() { return uiState.btnFeedbackRect; }
export function getSettingsBackButton() { return uiState.btnSettingsBackRect; }
export function getHangarCards() { return uiState.hangarCardRects; }
export function getHangarPreviewRect() { return uiState.hangarPreviewRect; }
export function setHangarPreview(id) { uiState.hangarPreviewId = id; }
export function getTalentCards() { return uiState.talentCardRects; }
export function getSettingToggles() { return uiState.settingToggleRects; }

export function drawMenu(ctx, best, difficultyKey, presets, discovered = [], player = null) {
  // 压暗以聚焦内容，同时保留背景的星云层次
  ctx.fillStyle = "rgba(5,7,16,.42)";
  ctx.fillRect(0, 0, W, H);

  uiState.hangarCardRects = [];
  uiState.talentCardRects = [];
  uiState.settingToggleRects = [];
  uiState.questClaimRects = [];
  uiState.codexCardRects = [];
  uiState.powerupCardRects = [];
  uiState.achieveCardRects = [];
  uiState.btnHangarRect = uiState.btnHangarBackRect = null;
  uiState.btnTalentRect = uiState.btnTalentBackRect = null;
  uiState.btnSettingsRect = uiState.btnSettingsBackRect = null;
  uiState.btnCodexRect = uiState.btnCodexBackRect = null;
  uiState.btnAchieveRect = uiState.btnAchieveBackRect = null;
  uiState.btnPowerupCodexRect = uiState.btnPowerupCodexBackRect = null;
  uiState.btnShopRect = uiState.btnShopBackRect = null;
  uiState.btnShopBuyRects = [];
  uiState.btnClearCacheRect = null;
  uiState.btnCampaignRect = null;
  uiState.campaignSubRect = null;

  if (uiState.menuPage === "codex") { drawSkillCodex(ctx, discovered, player); drawPageVeil(ctx); return; }
  if (uiState.menuPage === "achieve") { drawAchieve(ctx); drawPageVeil(ctx); return; }
  if (uiState.menuPage === "hangar") { drawHangar(ctx); drawPageVeil(ctx); return; }
  if (uiState.menuPage === "talent") { drawTalent(ctx); drawPageVeil(ctx); return; }
  if (uiState.menuPage === "settings") { drawSettings(ctx); drawPageVeil(ctx); return; }
  if (uiState.menuPage === "powerupCodex") { drawPowerupCodex(ctx, getDiscoveredPowerups()); drawPageVeil(ctx); return; }
  if (uiState.menuPage === "shop") { drawShop(ctx); drawPageVeil(ctx); return; }

  // 首次进入自动弹一次帮助：常驻提示移除后补偿首次引导（存档记 helpSeen）
  if (!uiState.helpSeenPrompted) {
    uiState.helpSeenPrompted = true;
    if (!getSettings().helpSeen) uiState.helpOpen = true;
  }

  // ---- 标题：纯色填充 + 辉光，底层放大制造光晕 ----
  const ty = H * 0.08;
  ctx.save();
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.globalAlpha = 0.55;
  ctx.shadowColor = "rgba(90,220,255,.9)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = C.panelDark;
  setf(ctx, "bold 56px 'Courier New', monospace");
  ctx.fillText("飞机大战", W / 2, ty + 2);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  setf(ctx, "bold 52px 'Courier New', monospace");
  ctx.fillStyle = C.cyan;
  ctx.fillText("飞机大战", W / 2, ty);
  ctx.restore();

  // 清除缓存按钮（右上角）
  const ccx = W - 92, ccy = 20, ccw = 80, cch = 30;
  ctx.fillStyle = "rgba(255,107,107,.15)";
  ctx.strokeStyle = C.redSoft;
  ctx.lineWidth = 1.5;
  roundRect(ctx, ccx, ccy, ccw, cch, 8);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.redSoft;
  setf(ctx, "bold 11px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("清除缓存", ccx + ccw / 2, ccy + cch / 2 + 1);
  uiState.btnClearCacheRect = { x: ccx, y: ccy, w: ccw, h: cch };

  // 帮助按钮（右上角，清除缓存下方）：原常驻操作提示已移除，改为按需查看
  const hx = ccx, hy = 66, hw = 34, hh = 34;
  ctx.save();
  ctx.fillStyle = "rgba(20,34,58,.9)";
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 1.6;
  roundRect(ctx, hx, hy, hw, hh, 17);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = C.cyan;
  setf(ctx, "bold 20px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("?", hx + hw / 2, hy + hh / 2 + 1);
  uiState.btnHelpRect = { x: hx, y: hy, w: hw, h: hh };

  // 星尘徽章
  const starStr = "星尘 ✦ " + getStardust();
  setf(ctx, "bold 15px 'sans-serif'");
  const mw = ctx.measureText ? (ctx.measureText(starStr).width || starStr.length * 15) : starStr.length * 15;
  const sw = mw + 30;
  softPanel(ctx, W / 2 - sw / 2, H * 0.215 - 10, sw, 30, 15, {
    mid: "rgba(64,40,128,.42)", border: "rgba(208,166,255,.7)", glow: 10,
  });
  glowText(ctx, {
    text: starStr, x: W / 2, y: H * 0.215 + 5, size: 15, weight: "bold",
    color: C.lilacSoft, blur: 8, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });

  if (best > 0) {
    glowText(ctx, {
      text: "★ 最高分  " + best, x: W / 2, y: H * 0.252, size: 15, weight: "bold",
      color: C.gold, blur: 12, align: "center", baseline: "top", fontFamily: "'Courier New', monospace",
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
  uiState.difficultyRects = {};
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
    roundRect(ctx, x, dy, dw, dh, 10);
    ctx.fillStyle = selected ? hexToRgba(p.color, 0.7) : "rgba(14,20,40,.92)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = selected ? 2.4 : 1.2;
    roundRect(ctx, x + 0.5, dy + 0.5, dw - 1, dh - 1, 9);
    ctx.stroke();
    ctx.fillStyle = selected ? C.panelDark : p.color;
    setf(ctx, "bold 15px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((selected ? "✓ " : "") + p.name, x + dw / 2, dy + dh / 2 + 1);
    ctx.restore();
    uiState.difficultyRects[k] = { x, y: dy, w: dw, h: dh };
  }
  const cur = presets[difficultyKey];
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.62)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText(cur.desc, W / 2, dy + dh + 10);

  const bx = W / 2 - 90, by = H * 0.46, bw = 180, bh = 50;
  const pulseS = pulse(uiTime(), 2.6);
  lineBtn(ctx, bx, by, bw, bh, C.cyan, "开始游戏", {
    size: 25, weight: "bold", glow: 16 + 14 * pulseS, r: 14,
    fontFamily: "'Courier New', monospace", textColor: C.bgDark,
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
  uiState.btnStartRect = { x: bx, y: by, w: bw, h: bh };

  const campaignButton = { x: W / 2 - 110, y: by + bh + 8, w: 220, h: 42 };
  const campaignProgress = getCampaignProgress("campaign-01");
  lineBtn(ctx, campaignButton.x, campaignButton.y, campaignButton.w, campaignButton.h,
    C.gold, uiState.campaignLoading ? "正在加载战役…" : "战役模式", {
      size: 20, weight: "bold", glow: 10, r: 12, textColor: C.bgDark,
    });
  ctx.fillStyle = C.redSoft;
  roundRect(ctx, campaignButton.x + campaignButton.w - 37, campaignButton.y + 4, 30, 16, 8);
  ctx.fill();
  ctx.fillStyle = C.bgDark;
  setf(ctx, "bold 10px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("新", campaignButton.x + campaignButton.w - 22, campaignButton.y + 12);
  // 副标题：与按钮底至少 8px；必须用 top 基线（middle 基线会让文字顶部压进按钮底边）
  const subY = campaignButton.y + campaignButton.h + 8;
  ctx.fillStyle = "rgba(255,255,255,.55)";
  setf(ctx, "10px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(`已通关 ${campaignProgress.completedStageIds.length}/6 · 点击继续`, W / 2, subY);
  uiState.btnCampaignRect = campaignButton;
  uiState.campaignSubRect = { x: W / 2 - 80, y: subY, w: 160, h: 10 };

  // 导航瓦片：机库 / 天赋 / 图鉴 / 成就 / 设置 / 道具图鉴 / 商城
  const nav = [
    ["hangar", "机库", C.cyan],
    ["talent", "天赋", C.lilac],
    ["codex", "图鉴 " + discovered.length + "/" + SKILLS.length, C.goldDark],
    ["achieve", "成就任务", C.green],
    ["settings", "设置", C.cyanSoft],
    ["powerupCodex", "道具图鉴", C.redSoft],
    ["shop", "系统商城", C.lilacDark],
  ];
  // 列表按项数自适应：行数随项数变化；纵向起点由「副标题底 + 8px」与底部安全区共同约束
  const navRows = Math.ceil(nav.length / 2);
  const nh = 40;
  const nga = 12;   // 横向列间距
  let ng = 12;      // 纵向行间距（空间不足时压缩，下限 4）
  const nw = Math.min(148, Math.floor((W - 24 - nga) / 2));
  const subBottom = uiState.campaignSubRect.y + uiState.campaignSubRect.h;
  const navMinTop = subBottom + 8;
  const navBottomSafe = H - 16;
  let navTotalH = navRows * nh + (navRows - 1) * ng;
  if (navMinTop + navTotalH > navBottomSafe && navRows > 1) {
    ng = Math.max(4, Math.floor((navBottomSafe - navMinTop - navRows * nh) / (navRows - 1)));
    navTotalH = navRows * nh + (navRows - 1) * ng;
  }
  const nStartY = Math.max(navMinTop, Math.min(H * 0.62, navBottomSafe - navTotalH));
  for (let i = 0; i < nav.length; i++) {
    const [id, label, color] = nav[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const nx = i === nav.length - 1 ? W / 2 - nw / 2 : W / 2 - nw - nga / 2 + col * (nw + nga);
    const ny = nStartY + row * (nh + ng);
    // 导航瓦片：纯色底 + 彩色描边 + 左侧色条
    ctx.save();
    roundRect(ctx, nx, ny, nw, nh, 10);
    ctx.fillStyle = "rgba(16,24,46,.66)";
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
    if (id === "hangar") uiState.btnHangarRect = rect;
    else if (id === "talent") uiState.btnTalentRect = rect;
    else if (id === "codex") uiState.btnCodexRect = rect;
    else if (id === "achieve") uiState.btnAchieveRect = rect;
    else if (id === "settings") uiState.btnSettingsRect = rect;
    else if (id === "powerupCodex") uiState.btnPowerupCodexRect = rect;
    else uiState.btnShopRect = rect;
  }

  // 反馈入口 + 版本号（右下角）
  ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255,255,255,.35)";
  setf(ctx, "11px 'sans-serif'");
  ctx.fillText("v" + APP_VERSION, W - 12, H - 10);
  const fbW = 70, fbH = 24;
  const fbX = W - 12 - ctx.measureText("v" + APP_VERSION).width - 6 - fbW;
  const fbY = H - 30;
  ctx.fillStyle = "rgba(20,34,58,.9)";
  ctx.strokeStyle = "rgba(90,220,255,.85)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, fbX, fbY, fbW, fbH, 11);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.95)";
  setf(ctx, "bold 12px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("反馈", fbX + fbW / 2, fbY + fbH / 2 + 1);
  uiState.btnFeedbackRect = { x: fbX, y: fbY, w: fbW, h: fbH };

  drawPageVeil(ctx);
}

function drawShop(ctx) {
  const stardust = getStardust();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = C.lilacDark;
  setf(ctx, "bold 30px 'sans-serif'");
  ctx.fillText("系 统 商 城", W / 2, H * 0.05);
  ctx.fillStyle = C.gold;
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText("星尘  ✦ " + stardust, W / 2, H * 0.10);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText("消耗星尘永久提升各项能力", W / 2, H * 0.135);

  const cols = W >= 320 ? 2 : 1;
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const cardH = 52;
  const startY = H * 0.18;
  const gx = pad;

  uiState.btnShopBuyRects = [];
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
    ctx.strokeStyle = maxed ? C.green : affordable ? C.lilacDark : "rgba(255,255,255,.22)";
    ctx.lineWidth = affordable ? 2 : 1.2;
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fill(); ctx.stroke();

    // 图标
    ctx.fillStyle = maxed ? C.green : affordable ? C.lilacDark : "#aebbd2";
    setf(ctx, "bold 18px monospace");
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(item.icon, x + 10, y + cardH * 0.5);

    // 名称 + 描述
    ctx.fillStyle = maxed ? C.green : "#e0e7f2";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(item.name + " " + lv + "/" + item.max, x + 32, y + cardH * 0.32);
    ctx.fillStyle = "#c2ccdd";
    setf(ctx, "10px 'sans-serif'");
    ctx.fillText(item.desc, x + 32, y + cardH * 0.72);

    // 价格/已满
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    if (maxed) {
      ctx.fillStyle = C.green;
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText("已满级", x + cardW - 10, y + cardH * 0.5);
    } else {
      ctx.fillStyle = affordable ? C.gold : "#aebbd2";
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText("✦ " + cost, x + cardW - 10, y + cardH * 0.5);
    }

    // 点击区域（整张卡片可买）
    if (!maxed) uiState.btnShopBuyRects.push({ x, y, w: cardW, h: cardH, id: item.id });
  }

  uiState.btnShopBackRect = drawBackButton(ctx);
  uiState.btnShopRect = null;
}

/** 机库大图预览：展示当前出战/最近点击机型的皮肤，未解锁时降亮度 */
function drawHangarPreview(ctx) {
  const ids = Object.keys(META.aircraft);
  const selected = getSelectedAircraft();
  const previewId = ids.includes(uiState.hangarPreviewId) ? uiState.hangarPreviewId : selected;
  const cfg = META.aircraft[previewId];
  const unlocked = isAircraftUnlocked(previewId);
  const on = selected === previewId;

  const px = 14, pw = W - 28;
  const py = H * 0.675, ph = 150;
  softPanel(ctx, px, py, pw, ph, 14, {
    mid: "rgba(18,26,48,.92)",
    border: unlocked ? "rgba(94,230,255,.55)" : "rgba(255,255,255,.16)",
    glow: unlocked ? 10 : 2,
  });

  const imgW = Math.min(148, pw * 0.42), imgH = ph - 18;
  const cx = px + 16 + imgW / 2, cy = py + ph / 2;
  ctx.save();
  if (!unlocked) ctx.globalAlpha = 0.38;
  // void_ 的资产 id 是 player_void（清单里已去掉尾下划线），与 drawPlayer 同规则
  drawSprite(ctx, "player_" + String(previewId).replace(/_$/, ""), cx, cy, imgW, imgH);
  ctx.restore();

  const tx = px + 16 + imgW + 16;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = unlocked ? C.white : "rgba(255,255,255,.72)";
  setf(ctx, "bold 18px 'sans-serif'");
  ctx.fillText(cfg.name, tx, py + 16);

  ctx.fillStyle = on ? C.green : unlocked ? C.gold : C.lilacDark;
  setf(ctx, "bold 12px 'sans-serif'");
  ctx.fillText(on ? "出战中" : unlocked ? "已拥有 · 点击选择" : "未解锁 · 点击购买", tx, py + 42);

  ctx.fillStyle = "rgba(255,255,255,.7)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText(`速度 ${cfg.speed}`, tx, py + 64);
  ctx.fillText(`伤害 ×${cfg.baseDmg}`, tx + 82, py + 64);
  ctx.fillText(`射速 ×${cfg.fireRate}`, tx, py + 84);
  ctx.fillText(`生命 ${cfg.startHp}`, tx + 82, py + 84);

  ctx.fillStyle = unlocked ? "rgba(255,255,255,.55)" : C.gold;
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText(unlocked ? cfg.desc : `${cfg.desc} · ${cfg.cost} 星尘解锁`, tx, py + 108);

  uiState.hangarPreviewRect = { x: px, y: py, w: pw, h: ph };
}

function drawHangar(ctx) {
  pageTitle(ctx, "机  库", W / 2, H * 0.045, C.cyan, 32);
  titleRule(ctx, W / 2, H * 0.095, 66, C.cyan);
  glowText(ctx, {
    text: "星尘 ✦ " + getStardust(), x: W / 2, y: H * 0.108,
    size: 15, weight: "bold", color: C.lilacSoft, blur: 9,
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  const ids = Object.keys(META.aircraft);
  const selected = getSelectedAircraft();
  uiState.hangarCardRects = [];
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
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fillStyle = on ? "rgba(24,58,92,.94)" : unlocked ? "rgba(22,32,62,.9)" : "rgba(14,16,28,.92)";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = on ? C.cyan : unlocked ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.12)";
    ctx.lineWidth = on ? 2 : 1.1;
    roundRect(ctx, x + 0.5, y + 0.5, cardW - 1, cardH - 1, 11);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 14, y + 1.5); ctx.lineTo(x + cardW - 14, y + 1.5); ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = on ? C.cyan : unlocked ? C.white : "rgba(255,255,255,.4)";
    setf(ctx, "bold 16px 'sans-serif'");
    ctx.fillText(cfg.name, x + cardW / 2, y + 10);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(cfg.desc, x + cardW / 2, y + 34);
    ctx.fillText("速" + cfg.speed + " 伤×" + cfg.baseDmg + " 射×" + cfg.fireRate, x + cardW / 2, y + 54);
    ctx.fillText("生命 " + cfg.startHp, x + cardW / 2, y + 72);
    ctx.fillStyle = unlocked ? (on ? C.green : C.gold) : C.lilacDark;
    setf(ctx, "bold 13px 'sans-serif'");
    let tag;
    if (on) tag = "出战中";
    else if (unlocked) tag = "选择";
    else tag = cfg.cost + " 星尘";
    ctx.fillText(tag, x + cardW / 2, y + 92);
    uiState.hangarCardRects.push({ id, x, y, w: cardW, h: cardH, unlocked, cost: cfg.cost });
  }
  drawHangarPreview(ctx);
  uiState.btnHangarBackRect = drawBackButton(ctx);
}

function drawTalent(ctx) {
  pageTitle(ctx, "天  赋", W / 2, H * 0.03, C.lilac, 32);
  titleRule(ctx, W / 2, H * 0.078, 56, C.lilac);
  glowText(ctx, {
    text: "星尘 ✦ " + getStardust(), x: W / 2, y: H * 0.095,
    size: 15, weight: "bold", color: C.lilacSoft, blur: 9,
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  const branches = [
    ["offense", "进攻", C.gold],
    ["defense", "防御", C.cyan],
    ["utility", "辅助", C.cyanSoft],
  ];
  uiState.talentCardRects = [];
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
      if (bought) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 13;
      }
      roundRect(ctx, x + 4, y, colW - 12, 104, 10);
      ctx.fillStyle = bought ? hexToRgba(color, 0.22) : "rgba(16,22,42,.94)";
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
      ctx.fillStyle = bought ? color : locked ? "rgba(255,255,255,.35)" : C.white;
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText(t.name, x + colW / 2, y + 12);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      setf(ctx, "10px 'sans-serif'");
      ctx.fillText(t.desc, x + colW / 2, y + 36);
      ctx.fillStyle = bought ? C.green : locked ? "rgba(255,255,255,.3)" : C.gold;
      setf(ctx, "bold 12px 'sans-serif'");
      ctx.fillText(bought ? "已解锁" : (locked ? "需前置" : t.cost + " 星尘"), x + colW / 2, y + 72);
      uiState.talentCardRects.push({ id: t.id, x: x + 4, y, w: colW - 12, h: 104, bought, locked, cost: t.cost });
    }
  }
  uiState.btnTalentBackRect = drawBackButton(ctx);
}

function drawSettings(ctx) {
  pageTitle(ctx, "设  置", W / 2, H * 0.07, C.cyanSoft, 32);
  titleRule(ctx, W / 2, H * 0.12, 52, C.cyanSoft);

  const s = getSettings();
  const rows = [
    ["音效", "游戏内音效 · 命中 / 爆炸 / 升级", !s.sfxMuted, "sfxMuted"],
    ["音乐", "背景音乐开关", !s.musicMuted, "musicMuted"],
    ["跳过教程", "开局直接跳过操作教学", !!s.skipTutorial, "skipTutorial"],
  ];
  uiState.settingToggleRects = [];
  for (let i = 0; i < rows.length; i++) {
    const [label, hint, on, key] = rows[i];
    const y = H * 0.2 + i * 92;
    const x = 40, w = W - 80, h = 78;
    ctx.save();
    roundRect(ctx, x, y, w, h, 14);
    ctx.fillStyle = "rgba(18,28,52,.7)";
    ctx.fill();
    ctx.strokeStyle = on ? "rgba(155,232,255,.6)" : "rgba(155,232,255,.22)";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 18, y + 2); ctx.lineTo(x + w - 18, y + 2); ctx.stroke();
    ctx.restore();

    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = C.white;
    setf(ctx, "bold 18px 'sans-serif'");
    ctx.fillText(label, x + 22, y + 18);
    ctx.fillStyle = "rgba(255,255,255,.45)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(hint, x + 22, y + 46);

    // 右侧滑块开关
    const swW = 52, swH = 28;
    const swX = x + w - swW - 20, swY = y + (h - swH) / 2;
    ctx.save();
    ctx.shadowColor = on ? C.cyanSoft : "rgba(255,255,255,.2)";
    ctx.shadowBlur = on ? 10 : 0;
    roundRect(ctx, swX, swY, swW, swH, swH / 2);
    ctx.fillStyle = on ? C.cyan : "rgba(60,70,96,.5)";
    ctx.fill();
    ctx.shadowBlur = 0;
    const kx = on ? swX + swW - swH : swX;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.arc(kx + swH / 2, swY + swH / 2, swH / 2 - 3, 0, TAU);
    ctx.fill();
    ctx.restore();

    uiState.settingToggleRects.push({ key, x, y, w, h });
  }
  uiState.btnSettingsBackRect = drawBackButton(ctx);
}

function drawAchieve(ctx) {
  pageTitle(ctx, "成就 · 每日任务", W / 2, H * 0.048, C.greenSoft, 30);
  titleRule(ctx, W / 2, H * 0.10, 104, C.greenSoft);
  glowText(ctx, {
    text: "星尘  ✦ " + getStardust(), x: W / 2, y: H * 0.115,
    size: 16, weight: "bold", color: C.lilacSoft, blur: 10,
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
  const rowH = 50;
  uiState.questClaimRects = [];
  for (let i = 0; i < qv.items.length; i++) {
    const it = qv.items[i];
    const ry = H * 0.19 + i * rowH;
    roundRect(ctx, 10, ry, W - 20, rowH - 6, 10);
    ctx.fillStyle = "rgba(18,28,52,.7)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.09)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, ry + 1.5); ctx.lineTo(W - 16, ry + 1.5); ctx.stroke();

    // 名称
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = C.white;
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(it.def.name, 20, ry + 6);
    // 进度
    ctx.fillStyle = "rgba(255,255,255,.55)";
    setf(ctx, "12px 'sans-serif'");
    ctx.fillText(it.def.desc + "   " + Math.min(it.cur, it.def.target) + "/" + it.def.target, 20, ry + 23);

    // 进度条
    const bx = 20, byy = ry + 40, bw = W - 176, bbh = 5;
    const p = it.claimed ? 0 : clamp(it.cur / it.def.target, 0, 1);
    bar(ctx, bx, byy, bw, bbh, p, it.claimed ? "rgba(255,255,255,.4)" : C.green, { rounded: 2, glow: 6 });

    // 领取按钮
    const cbtn = { x: W - 142, y: ry + 7, w: 124, h: 28 };
    let label, style;
    if (it.claimed) { label = "已领取"; style = "rgba(255,255,255,.35)"; }
    else if (it.cur >= it.def.target) { label = "领取 +" + it.def.reward; style = C.green; }
    else { label = "未完成"; style = "rgba(255,255,255,.28)"; }
    ctx.fillStyle = it.claimed ? "rgba(255,255,255,.08)" : "rgba(124,252,0,.10)";
    ctx.strokeStyle = style;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); roundRect(ctx, cbtn.x, cbtn.y, cbtn.w, cbtn.h, 8); ctx.stroke();
    ctx.fillStyle = style;
    setf(ctx, it.claimed ? "12px 'sans-serif'" : "bold 12px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, cbtn.x + cbtn.w / 2, cbtn.y + cbtn.h / 2);
    uiState.questClaimRects.push(cbtn);
  }

  // ===== 成就 =====
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.75)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("成就", 16, H * 0.535);
  const views = getAchievementView();
  const done = ACHIEVEMENTS.filter(a => views.find(v => v.def.id === a.id).achieved).length;
  ctx.fillStyle = "rgba(255,255,255,.45)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText("已达成 " + done + " / " + ACHIEVEMENTS.length, 16, H * 0.555);

  const cols = 3;
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const cardH = W >= 360 ? 54 : 46;
  const startY = H * 0.585;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  uiState.achieveCardRects = [];
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cardW + gap);
    const y = startY + row * (cardH + 6);
    ctx.save();
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fillStyle = v.achieved ? hexToRgba(v.def.color, 0.20) : "rgba(10,14,28,.9)";
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
    uiState.achieveCardRects.push({ rect: { x, y, w: cardW, h: cardH }, def: v.def, achieved: v.achieved });
  }

  // 返回按钮
  const bw = 180, bx = W / 2 - bw / 2, by = H * 0.935, bh = 40;
  lineBtn(ctx, bx, by, bw, bh, C.cyan, "← 返回主菜单", { size: 16, weight: "bold", glow: 9, r: 11 });
  uiState.btnAchieveBackRect = { x: bx, y: by, w: bw, h: bh };
  uiState.btnCodexBackRect = null;
}
