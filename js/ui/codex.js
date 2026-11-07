import { W, H, TAU, SKILLS, POWERUP_DEFS } from "../config.js";
import { clamp, roundRect, setf } from "../utils.js";
import { bar, hexToRgba, C } from "../theme.js";
import { drawSprite } from "../assets.js";
import { uiState } from "./state.js";
import { drawBackButton, pageTitle, titleRule } from "./common.js";

export function getCodexScroll() { return uiState.codexScroll; }
export function getCodexMaxScroll() { return uiState.codexMaxScroll; }
export function getCodexViewport() { return uiState.codexViewport; }
export function setCodexScroll(v) {
  uiState.codexScroll = uiState.codexMaxScroll > 0 ? clamp(Math.round(v), 0, uiState.codexMaxScroll) : 0;
}
export function getCodexCardRects() { return uiState.codexCardRects; }
export function getPowerupCardRects() { return uiState.powerupCardRects; }
export function resetCodexScroll() { uiState.codexScroll = 0; }

function beginCodexGrid(ctx, total, cardH, cols, startY) {
  const pad = 14, gap = 8;
  const cardW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
  const viewBot = H * 0.90;
  uiState.codexViewport = { x: pad, y: startY, w: W - pad * 2, h: viewBot - startY };
  const rows = Math.ceil(total / cols);
  const contentH = rows * (cardH + gap) - gap;
  uiState.codexMaxScroll = Math.max(0, contentH - uiState.codexViewport.h);
  if (uiState.codexScroll > uiState.codexMaxScroll) {
    uiState.codexScroll = uiState.codexMaxScroll;
  }
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.beginPath();
  ctx.rect(uiState.codexViewport.x, uiState.codexViewport.y, uiState.codexViewport.w, uiState.codexViewport.h);
  ctx.clip();
  return { cardW, gap, gx: pad, viewBot };
}

function visibleCardRect(x, y, cardW, cardH) {
  const visTop = Math.max(y, uiState.codexViewport.y);
  const visBot = Math.min(y + cardH, uiState.codexViewport.y + uiState.codexViewport.h);
  return visBot > visTop ? { x, y: visTop, w: cardW, h: visBot - visTop } : null;
}

function drawCodexScrollbar(ctx, startY, viewBot) {
  if (uiState.codexMaxScroll <= 0) return;
  const sbX = W - 8, sbW = 4, div = 24;
  const sbTop = startY, sbBot = viewBot;
  const track = sbBot - sbTop - div;
  const thumbH = Math.max(div, uiState.codexViewport.h
    / (uiState.codexViewport.h + uiState.codexMaxScroll) * (sbBot - sbTop));
  const thumbY = thumbH >= div
    ? sbTop + (track - 0) * (uiState.codexScroll / uiState.codexMaxScroll)
    : sbTop;
  ctx.fillStyle = "rgba(255,255,255,.12)";
  roundRect(ctx, sbX, sbTop, sbW, sbBot - sbTop, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(140,220,255,.55)";
  roundRect(ctx, sbX, clamp(thumbY, sbTop, sbBot - thumbH), sbW, thumbH, 2);
  ctx.fill();
}

export function drawSkillCodex(ctx, discovered, player) {
  const total = SKILLS.length;
  const lit = discovered.length;

  pageTitle(ctx, "技 能 图 鉴", W / 2, H * 0.055, C.goldDark, 32);
  titleRule(ctx, W / 2, H * 0.105, 90, C.goldDark);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const full = lit >= total;
  ctx.fillStyle = full ? C.green : "rgba(255,255,255,.88)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("已收录 " + lit + " / " + total + (full ? " · 全部点亮！" : ""), W / 2, H * 0.12);
  const pbarW = 150, pbarX = W / 2 - pbarW / 2, pbarY = H * 0.16;
  bar(ctx, pbarX, pbarY, pbarW, 6, lit / total, full ? C.green : C.goldDark, { rounded: 3, glow: 8 });
  ctx.fillStyle = "rgba(255,255,255,.4)";
  setf(ctx, "11px 'sans-serif'");
  ctx.fillText("在游戏中习得技能，图鉴自动点亮", W / 2, pbarY + 13);
  // 技能升级说明：自动升级已完全关闭，全部由玩家选择
  ctx.fillStyle = "rgba(255,255,255,.32)";
  setf(ctx, "10px 'sans-serif'");
  ctx.fillText("技能仅在升级三选一或拾取道具时提升，由你完全掌控", W / 2, pbarY + 27);

  // 网格：宽屏 4 列；中屏 3 列；窄屏 3 列
  const cols = W >= 420 ? 4 : 3;
  // 加高到 76：为「名称/描述/成长进度条+Lv文本」三段留足垂直间距，杜绝文字重合
  const cardH = 76;
  const startY = H * 0.235;
  const { cardW, gap, gx, viewBot } = beginCodexGrid(ctx, SKILLS.length, cardH, cols, startY);
  uiState.codexCardRects = [];

  for (let i = 0; i < SKILLS.length; i++) {
    const s = SKILLS[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (cardW + gap);
    const y = startY - uiState.codexScroll + row * (cardH + gap);
    const got = discovered.includes(s.id);

    // 卡片
    ctx.save();
    roundRect(ctx, x, y, cardW, cardH, 9);
    ctx.fillStyle = got ? hexToRgba(s.color, 0.20) : "rgba(10,14,28,.9)";
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

    // 名称（顶部）
    ctx.fillStyle = got ? s.color : "#b8c5dc";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(s.name, x + cardW / 2, y + 12);
    // 描述（名称下方，未点亮时显示「未点亮」）
    ctx.fillStyle = got ? "rgba(255,255,255,.72)" : "#aebbd2";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(got ? s.desc : "未点亮", x + cardW / 2, y + 30);

    // 命中矩形裁剪到可视区：被 clip 掉的部分不可点，
    // 否则滚动后点击标题/返回按钮区域会误开详情卡
    const rect = visibleCardRect(x, y, cardW, cardH);
    if (rect) uiState.codexCardRects.push({ rect, skill: s, got });
  }
  ctx.restore();

  drawCodexScrollbar(ctx, startY, viewBot);

  // 返回按钮（固定于可视区下方，永远可点；与道具图鉴共用同一返回按钮样式）
  uiState.btnCodexBackRect = drawBackButton(ctx);
  uiState.btnCodexRect = null;
}

export function drawPowerupCodex(ctx, discovered) {
  const allKeys = Object.keys(POWERUP_DEFS);
  const total = allKeys.length;
  const lit = discovered.length;

  pageTitle(ctx, "道 具 图 鉴", W / 2, H * 0.055, C.redSoft, 32);
  titleRule(ctx, W / 2, H * 0.105, 90, C.redSoft);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const full = lit >= total;
  ctx.fillStyle = full ? C.green : "rgba(255,255,255,.88)";
  setf(ctx, "bold 15px 'sans-serif'");
  ctx.fillText("已收录 " + lit + " / " + total + (full ? " · 全部点亮！" : ""), W / 2, H * 0.12);
  const pbarW = 150, pbarX = W / 2 - pbarW / 2, pbarY = H * 0.16;
  bar(ctx, pbarX, pbarY, pbarW, 6, lit / total, full ? C.green : C.redSoft, { rounded: 3, glow: 8 });
  ctx.fillStyle = "rgba(255,255,255,.4)";
  setf(ctx, "11px 'sans-serif'");
  ctx.fillText("在游戏中拾取道具，图鉴自动点亮", W / 2, pbarY + 14);

  const cols = W >= 420 ? 4 : W >= 360 ? 3 : 2;
  const cardH = 62;
  const startY = H * 0.20;
  const { cardW, gap, gx, viewBot } = beginCodexGrid(ctx, total, cardH, cols, startY);
  uiState.powerupCardRects = [];

  for (let i = 0; i < allKeys.length; i++) {
    const k = allKeys[i];
    const def = POWERUP_DEFS[k];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gx + col * (cardW + gap);
    const y = startY - uiState.codexScroll + row * (cardH + gap);
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

    // 图标（顶部居中）：缺图时静默省略，卡片靠色框/文字仍可辨认
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (got) {
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.95;
      drawSprite(ctx, "powerup_" + k, x + cardW / 2, y + 13, 17, 17);
      ctx.globalAlpha = prevAlpha;
    }

    // 名称
    ctx.fillStyle = got ? def.color : "#b8c5dc";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText(def.name, x + cardW / 2, y + 35);

    // 描述（已精简，无需截断）
    ctx.fillStyle = got ? "rgba(255,255,255,.72)" : "#aebbd2";
    setf(ctx, "11px 'sans-serif'");
    const desc = got ? String(powerupDesc(k)) : "未拾取";
    ctx.fillText(desc, x + cardW / 2, y + 52);
    const rect = visibleCardRect(x, y, cardW, cardH);
    if (rect) uiState.powerupCardRects.push({ rect, key: k, def, got });
  }
  ctx.restore();

  drawCodexScrollbar(ctx, startY, viewBot);

  uiState.btnPowerupCodexBackRect = drawBackButton(ctx);
  uiState.btnPowerupCodexRect = null;
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
    madHunt: "5 秒内子弹向四周 360° 散发并追踪敌机",
    rapid: "8 秒内射击间隔大幅缩短",
    speed: "8 秒内移动速度提升 30%",
    freeze: "冻结全场敌机与敌方子弹",
    magnet: "8 秒内自动吸引附近道具",
    double: "8 秒内得分翻倍",
    xppack: "立即提升 1 级",
    skillup: "随机升级一个已拥有技能",
    randomSkill: "随机获得一个全新技能",
    drop: "8 秒内道具掉落率大幅提升",
    critboost: "8 秒内必定暴击且暴击倍率提升",
    knockback: "8 秒内子弹附带击退效果",
  }[k] || "";
}
