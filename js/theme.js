/* ===========================================================
 * theme.js — 统一视觉主题：配色 / 渐变 / 发光 / 面板 / 按钮 / 进度条
 * 纯绘制辅助，不改变坐标与命中矩形，方便各 UI 模块复用。
 * =========================================================== */

import { clamp, roundRect, setf } from "./utils.js";

export const C = {
  bgDeep: "#04070f",
  bgPanel: "rgba(13,18,36,.86)",
  ink: "#e8f4ff",
  white: "#ffffff",
  cyan: "#5ee6ff",
  cyanSoft: "#9adcff",
  gold: "#ffd166",
  goldSoft: "#ffe9b0",
  pink: "#ff6b9d",
  red: "#ff5c6a",
  orange: "#ff8a3d",
  lilac: "#c7a6ff",
  violet: "#8a7bff",
  green: "#7dffb0",
  track: "rgba(255,255,255,.1)",
};

/** "#rrggbb" / "#rgb" → "rgba(r,g,b,a)"；非十六进制原样返回 */
export function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== "string" || hex[0] !== "#") return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** 垂直线性渐变对象 */
export function vGrad(ctx, x, y, w, h, c0, c1) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

/** 发光文字：自动按逻辑宽度缩放字号 */
export function glowText(ctx, o) {
  const {
    text, x, y,
    size = 18, weight = "normal",
    color = "#fff", blur = 12,
    align = "center", baseline = "middle",
    fontFamily = "sans-serif", alpha = 1,
  } = o;
  if (text === undefined || text === null) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const wstr = weight ? weight + " " : "";
  setf(ctx, wstr + size + "px " + fontFamily);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(String(text), x, y);
  ctx.restore();
}

/** 玻璃面板：渐变底 + 描边 + 顶部高光 + 可选外发光 */
export function softPanel(ctx, x, y, w, h, r = 14, opts = {}) {
  const {
    top = "rgba(84,150,255,.20)",
    mid = "rgba(16,26,52,.60)",
    bottom = "rgba(4,8,20,.86)",
    border = "rgba(150,205,255,.28)",
    borderW = 1,
    glow = 0,
    highlight = true,
  } = opts;
  const rr = Math.max(1, r);
  ctx.save();
  if (glow > 0) { ctx.shadowColor = border; ctx.shadowBlur = glow; }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, bottom);
  roundRect(ctx, x, y, w, h, rr);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = borderW;
  ctx.strokeStyle = border;
  ctx.stroke();
  if (highlight) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.beginPath();
    ctx.moveTo(x + rr, y + 1);
    ctx.lineTo(x + w - rr, y + 1);
    ctx.stroke();
  }
  ctx.restore();
}

/** 发光渐变按钮（含文字），颜色传十六进制 */
export function lineBtn(ctx, x, y, w, h, color, label, o = {}) {
  const {
    size = 18, weight = "bold", glow = 14,
    textColor = color, alpha = 1,
    fontFamily = "sans-serif", r = 13,
  } = o;
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, hexToRgba(color, 0.5));
  g.addColorStop(1, hexToRgba(color, 0.06));
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow * 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  glowText(ctx, {
    text: label, x: x + w / 2, y: y + h / 2,
    size, weight, color: textColor, blur: glow,
    align: "center", baseline: "middle", fontFamily,
  });
  ctx.restore();
}

/** 圆角进度条 */
export function bar(ctx, x, y, w, h, p, color, o = {}) {
  if (h <= 0 || w <= 0) return;
  const { track = C.track, rounded = Math.min(h / 2, 3), glow = 3, bgStroke = "rgba(255,255,255,.14)" } = o;
  const pw = clamp(p || 0, 0, 1) * w;
  ctx.save();
  ctx.fillStyle = track;
  roundRect(ctx, x, y, w, h, rounded);
  ctx.fill();
  if (pw > 1) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, pw, h, rounded);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = bgStroke;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, Math.max(0, h - 1), rounded);
  ctx.stroke();
  ctx.restore();
}

/** 0~1 循环脉动值（用于按钮/标题呼吸光） */
export const pulse = (t, speed = 4, offset = 0) => (Math.sin(t * speed + offset) + 1) / 2;

/** 整页过渡面纱：alpha<=0 时跳过绘制，否则用深空色覆盖整屏 */
export function veil(ctx, w, h, a, color = "#070b1f") {
  if (a <= 0) return;
  ctx.save();
  ctx.fillStyle = hexToRgba(color, Math.min(1, a));
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
