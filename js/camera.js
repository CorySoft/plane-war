/* ===========================================================
 * camera.js — 屏幕震动 / 慢动作
 * =========================================================== */

import { rand, clamp } from "./utils.js";

export let shake = 0;
export let slowmo = 1;
let targetSlowmo = 1;

export function triggerShake(intensity) {
  shake = Math.max(shake, intensity);
}

/**
 * @param {number} dt
 * @param {number} combo
 * @param {number} [deathTarget] - 死亡慢动作目标值（>0时覆盖combo慢动作，0=不覆盖）
 */
export function updateCamera(dt, combo, deathTarget) {
  shake = Math.max(0, shake - dt * 8);
  if (deathTarget > 0) {
    slowmo += (deathTarget - slowmo) * Math.min(1, dt * 6);
  } else {
    targetSlowmo = clamp(1 - combo * 0.02, 0.55, 1);
    slowmo += (targetSlowmo - slowmo) * Math.min(1, dt * 6);
  }
}

export function applyCamera(ctx) {
  if (shake > 0) {
    ctx.translate(rand(-6, 6) * shake, rand(-6, 6) * shake);
  }
}

export function resetCamera() {
  shake = 0;
  slowmo = 1;
  targetSlowmo = 1;
}
