/* ===========================================================
 * theme.js — 统一视觉主题：配色 / 渐变 / 发光 / 面板 / 按钮 / 进度条
 * 纯绘制辅助，不改变坐标与命中矩形，方便各 UI 模块复用。
 * =========================================================== */

import { clamp, roundRect, setf } from "./utils.js";

export const C = {
  // 基础
  bgDeep: "#04070f",
  bgPanel: "rgba(13,18,36,.86)",
  ink: "#e8f4ff",
  white: "#ffffff",
  whiteSoft: "rgba(255,255,255,.75)",
  whiteDim: "rgba(255,255,255,.5)",
  whiteFaint: "rgba(255,255,255,.35)",
  // 青系：射击/速度/攻击
  cyan: "#5ee6ff",
  cyanSoft: "#9adcff",
  cyanDark: "#2f7bff",
  // 金系：分数/完成/稀有
  gold: "#ffd166",
  goldSoft: "#ffe9b0",
  goldDark: "#ffd93b",
  // 粉系：生命/暴击/放弃
  pink: "#ff6b9d",
  pinkSoft: "#ff8fa3",
  pinkDark: "#ff9a9a",
  // 红系：结束/敌机/危险
  red: "#ff5c6a",
  redSoft: "#ff6b6b",
  // 绿系：成就/生命力
  green: "#7CFC00",
  greenSoft: "#9dff57",
  // 紫系：天赋/辅助/商城
  lilac: "#c8a6ff",
  lilacSoft: "#e0c2ff",
  lilacDark: "#d0a6ff",
  // 橙系：爆炸/追击
  orange: "#ff8a55",
  orangeSoft: "#ffa94d",
  // 背景深色
  panelDark: "#05121c",
  bgDark: "#03202e",
  // 进度条轨道
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
  // 乘算而非覆盖：保留调用方已设置的透明度（如 toast 淡出），
  // 覆盖会让淡出中的文字被强制拉回全亮直到瞬间消失
  ctx.globalAlpha *= alpha;
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

/**
 * 玻璃面板：纯色底 + 描边 + 顶部高光 + 可选外发光。
 * 早期版本用 top/mid/bottom 三段做垂直渐变，改成纯色后这三个键只剩名字、
 * 没有作用（靠 `void top; void bottom;` 消除未使用告警），
 * 但调用方还在传，看着像能调色。现在只保留真正生效的 mid，调用方同步清理。
 */
export function softPanel(ctx, x, y, w, h, r = 14, opts = {}) {
  const {
    mid = "rgba(16,26,52,.60)",
    border = "rgba(150,205,255,.28)",
    borderW = 1,
    glow = 0,
    highlight = true,
  } = opts;
  const rr = Math.max(1, r);
  ctx.save();
  if (glow > 0) { ctx.shadowColor = border; ctx.shadowBlur = glow; }
  roundRect(ctx, x, y, w, h, rr);
  ctx.fillStyle = mid;
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
  // 深色文字（如 bgDark / #4a3000）需要更亮的底色才能看清；
  // 亮色文字用半透明底色即可。
  const darkText = isDarkHex(textColor);
  ctx.save();
  ctx.globalAlpha *= alpha;   // 乘算保留调用方透明度（同 glowText）
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = hexToRgba(color, darkText ? 0.62 : 0.32);
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow * 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.shadowBlur = 0;
  glowText(ctx, {
    text: label, x: x + w / 2, y: y + h / 2,
    size, weight, color: textColor, blur: darkText ? 0 : glow,
    align: "center", baseline: "middle", fontFamily,
  });
  ctx.restore();
}

/** 判断十六进制颜色是否偏暗（用于文字/底色对比度自适应） */
export function isDarkHex(color) {
  if (typeof color !== "string" || color[0] !== "#") return false;
  let h = color.slice(1);
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length !== 6) return false;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 98;
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
