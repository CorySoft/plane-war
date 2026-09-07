/* ===========================================================
 * utils.js — 工具函数
 * =========================================================== */

import { W } from "./config.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const hypot = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
export const lerp = (a, b, t) => a + (b - a) * t;

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function weightedPick(weights) {
  if (!weights || weights.length === 0) return undefined;
  let total = 0;
  for (const [, w] of weights) total += w;
  if (total <= 0) return weights[0][0];
  let r = Math.random() * total;
  for (const [t, w] of weights) {
    r -= w;
    if (r <= 0) return t;
  }
  return weights[weights.length - 1][0];
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/**
 * 设置 Canvas 字体，按当前逻辑宽度自动缩放像素值。
 * 竖屏时逻辑宽度 W < 480，CSS 会把 canvas 放大填满屏幕，
 * 字体跟着变大；setf 用 W/480 比例把字号缩回去，保证视觉大小不变。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} fontStr  标准 Canvas font 字符串，如 "bold 22px 'sans-serif'"
 */
export function setf(ctx, fontStr) {
  const m = fontStr.match(/(bold\s+|italic\s+)?(\d+(?:\.\d+)?)px/);
  if (!m) { ctx.font = fontStr; return; }
  const scaled = Math.max(8, Math.round(parseFloat(m[2]) * (W / 480)));
  ctx.font = fontStr.replace(/(\d+(?:\.\d+)?)px/, scaled + "px");
}
