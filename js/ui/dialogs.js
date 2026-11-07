import { W, H } from "../config.js";
import { roundRect, setf } from "../utils.js";
import { hexToRgba, C } from "../theme.js";
import { drawSprite } from "../assets.js";
import { getStardust } from "../meta.js";
import { uiState } from "./state.js";

export const setDetailCard = d => { uiState.detailCard = d; };
export const getDetailCard = () => uiState.detailCard;
export const setShowClearCache = v => { uiState.showClearCache = v; };
export const getShowClearCache = () => uiState.showClearCache;
export function getClearYesButton() { return uiState.btnClearYesRect; }
export function getClearNoButton() { return uiState.btnClearNoRect; }
export const setHangarConfirm = v => { uiState.hangarConfirm = v; };
export const getHangarConfirm = () => uiState.hangarConfirm;
export function getHangarConfirmYesButton() { return uiState.btnHangarConfirmYesRect; }
export function getHangarConfirmNoButton() { return uiState.btnHangarConfirmNoRect; }
export const setTalentConfirm = v => { uiState.talentConfirm = v; };
export const getTalentConfirm = () => uiState.talentConfirm;
export function getTalentConfirmYesButton() { return uiState.btnTalentConfirmYesRect; }
export function getTalentConfirmNoButton() { return uiState.btnTalentConfirmNoRect; }

function drawDialogBackdrop(ctx) {
  ctx.fillStyle = "rgba(5,7,15,.82)";
  ctx.fillRect(0, 0, W, H);
}

function drawDialogPanel(ctx, x, y, w, h, border) {
  ctx.fillStyle = "rgba(24,32,52,.98)";
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
}

function drawConfirmButtons(ctx, y, yesX, noX, width, height, yesLabel) {
  ctx.fillStyle = "rgba(255,107,107,.15)";
  ctx.strokeStyle = C.redSoft;
  ctx.lineWidth = 2;
  roundRect(ctx, yesX, y, width, height, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.redSoft;
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText(yesLabel, yesX + width / 2, y + height / 2 + 1);

  ctx.fillStyle = hexToRgba(C.cyan, 0.12);
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 2;
  roundRect(ctx, noX, y, width, height, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.cyan;
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillText("取消", noX + width / 2, y + height / 2 + 1);
  return {
    yes: { x: yesX, y, w: width, h: height },
    no: { x: noX, y, w: width, h: height },
  };
}

export function drawDetailCard(ctx) {
  if (!uiState.detailCard) return;
  const { type, data } = uiState.detailCard;

  // 半透明遮罩
  ctx.fillStyle = "rgba(5,7,15,.78)";
  ctx.fillRect(0, 0, W, H);

  // 卡片
  const cw = Math.min(360, W - 40), ch = 220;
  const cx = W / 2 - cw / 2, cy = H / 2 - ch / 2;
  const isGot = data.got || data.achieved;
  const color = data.color || C.cyan;

  ctx.fillStyle = isGot ? "rgba(24,32,52,.98)" : "rgba(13,16,26,.98)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill(); ctx.stroke();

  ctx.textAlign = "center"; ctx.textBaseline = "top";

  // 图标/标记：优先贴图（道具/技能），缺图回退字母或 ✦；未收录时压暗
  const prevAlpha = ctx.globalAlpha;
  if (!isGot) ctx.globalAlpha = 0.3;
  const iconDrawn = !!data.spriteId
    && drawSprite(ctx, data.spriteId, W / 2, cy + 33, 40, 40);
  ctx.globalAlpha = prevAlpha;
  if (!iconDrawn) {
    ctx.fillStyle = isGot ? color : "rgba(255,255,255,.30)";
    setf(ctx, "bold 36px monospace");
    ctx.fillText(data.icon || "✦", W / 2, cy + 14);
  }

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
    // got=图鉴已收录（账号级），curLv=本局当前等级，二者需区分展示
    if (!data.got) extra = "未习得 · 有概率随机获得";
    else if (data.curLv >= data.max) extra = "已获得最大等级 Lv." + data.max + " / " + data.max;
    else if (data.curLv > 0) extra = "已获得 Lv." + data.curLv + " / " + data.max;
    else extra = "已习得 · 本局未获得";
  } else if (type === "powerup") {
    extra = data.unique ? "稀有技能道具 · 拾取获得/升级技能" : "拾取后即时生效";
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
}

export function drawClearCacheConfirm(ctx) {
  if (!uiState.showClearCache) return;
  uiState.btnClearYesRect = null;
  uiState.btnClearNoRect = null;

  drawDialogBackdrop(ctx);

  // 卡片
  const cw = 280, ch = 200;
  const cx = W / 2 - cw / 2, cy = H * 0.27;
  drawDialogPanel(ctx, cx, cy, cw, ch, C.redSoft);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = C.redSoft;
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
  const bx2 = W / 2 + 30;
  const buttons = drawConfirmButtons(ctx, by, bx1, bx2, bw, bh, "确认清除");
  uiState.btnClearYesRect = buttons.yes;
  uiState.btnClearNoRect = buttons.no;
}

export function drawHangarConfirm(ctx) {
  if (!uiState.hangarConfirm) return;
  uiState.btnHangarConfirmYesRect = null;
  uiState.btnHangarConfirmNoRect = null;

  drawDialogBackdrop(ctx);

  const cw = 300, ch = 218;
  const cx = W / 2 - cw / 2, cy = H * 0.27;
  drawDialogPanel(ctx, cx, cy, cw, ch, C.gold);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = C.gold;
  setf(ctx, "bold 22px 'sans-serif'");
  ctx.fillText("确认购买", W / 2, cy + 36);

  ctx.fillStyle = C.white;
  setf(ctx, "bold 17px 'sans-serif'");
  ctx.fillText("战机：" + (uiState.hangarConfirm.name || ""), W / 2, cy + 78);

  ctx.fillStyle = C.lilacSoft;
  setf(ctx, "15px 'sans-serif'");
  ctx.fillText("花费 " + uiState.hangarConfirm.cost + " 星尘", W / 2, cy + 108);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText("当前星尘 ✦ " + getStardust(), W / 2, cy + 130);

  const bw = 108, bh = 44, by = cy + ch - 60;
  const bx1 = W / 2 - 132;
  const bx2 = W / 2 + 24;
  const buttons = drawConfirmButtons(ctx, by, bx1, bx2, bw, bh, "确认");
  uiState.btnHangarConfirmYesRect = buttons.yes;
  uiState.btnHangarConfirmNoRect = buttons.no;
}

export function drawTalentConfirm(ctx) {
  if (!uiState.talentConfirm) return;
  uiState.btnTalentConfirmYesRect = null;
  uiState.btnTalentConfirmNoRect = null;

  drawDialogBackdrop(ctx);

  const cw = 300, ch = 240;
  const cx = W / 2 - cw / 2, cy = H * 0.26;
  drawDialogPanel(ctx, cx, cy, cw, ch, C.lilac);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = C.lilac;
  setf(ctx, "bold 22px 'sans-serif'");
  ctx.fillText("确认解锁天赋", W / 2, cy + 34);

  ctx.fillStyle = C.white;
  setf(ctx, "bold 17px 'sans-serif'");
  ctx.fillText("天赋：" + (uiState.talentConfirm.name || ""), W / 2, cy + 70);

  ctx.fillStyle = "rgba(255,255,255,.7)";
  setf(ctx, "13px 'sans-serif'");
  // 描述按 24 字宽折行，避免超出卡片
  const desc = uiState.talentConfirm.desc || "";
  for (let i = 0; i < desc.length; i += 24) {
    ctx.fillText(desc.slice(i, i + 24), W / 2, cy + 96 + Math.floor(i / 24) * 18);
  }

  ctx.fillStyle = C.lilacSoft;
  setf(ctx, "15px 'sans-serif'");
  ctx.fillText("花费 " + uiState.talentConfirm.cost + " 星尘", W / 2, cy + 150);
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText("当前星尘 ✦ " + getStardust(), W / 2, cy + 172);

  const bw = 108, bh = 44, by = cy + ch - 56;
  const bx1 = W / 2 - 132;
  const bx2 = W / 2 + 24;
  const buttons = drawConfirmButtons(ctx, by, bx1, bx2, bw, bh, "确认");
  uiState.btnTalentConfirmYesRect = buttons.yes;
  uiState.btnTalentConfirmNoRect = buttons.no;
}
