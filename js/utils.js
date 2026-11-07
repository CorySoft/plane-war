/* ===========================================================
 * utils.js — 工具函数
 * =========================================================== */

import { W } from "./config.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
// NaN 防线：NaN 与任何数比较均为 false 会原样透传，下游 slowmo/坐标一旦吃到即整局报废
export const clamp = (v, a, b) => (Number.isNaN(v) ? a : v < a ? a : v > b ? b : v);
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

// 渐变对象按 (ctx, key) 缓存。仅当坐标/色标及创建时的画布变换都固定时安全复用；
// 受 translate/rotate 影响的动态渐变必须按帧创建，CanvasGradient 不跟随后续变换。
const gradientCaches = new WeakMap();
const MAX_GRADIENTS_PER_CONTEXT = 128;
function gradientMap(ctx) {
  let map = gradientCaches.get(ctx);
  if (!map) { map = new Map(); gradientCaches.set(ctx, map); }
  return map;
}

function cachedGradient(ctx, key, create) {
  const map = gradientMap(ctx);
  let g = map.get(key);
  if (!g) {
    g = create();
    if (map.size >= MAX_GRADIENTS_PER_CONTEXT) map.delete(map.keys().next().value);
    map.set(key, g);
  }
  return g;
}

export function cachedLinearGradient(ctx, key, x0, y0, x1, y1, init) {
  return cachedGradient(ctx, key, () => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    if (init) init(g);
    return g;
  });
}

export function cachedRadialGradient(ctx, key, x0, y0, r0, x1, y1, r1, init) {
  return cachedGradient(ctx, key, () => {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    if (init) init(g);
    return g;
  });
}
