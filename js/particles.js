/* ===========================================================
 * particles.js — 粒子特效系统
 * =========================================================== */

import { rand, clamp } from "./utils.js";

export let particles = [];

export function spawnParticles(x, y, color, n = 12, speed = 4) {
  for (let i = 0; i < n; i++) {
    if (particles.length >= 400) break; // 防爆量：粒子上限防卡顿
    const a = Math.random() * Math.PI * 2;
    const v = rand(1, speed);
    const life = rand(0.3, 0.8);
    particles.push({
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life,
      maxLife: life,   // 记录初始寿命，使透明度从 1 开始线性衰减
      r: rand(1.5, 3.5),
      color,
    });
  }
}

export function updateParticles(dt) {
  // 原地更新 + 重建数组，避免 splice 的 O(n) 元素移动
  const next = [];
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    p.vy += 0.1 * dt * 60; // 重力
    p.life -= dt;
    if (p.life > 0) next.push(p);
  }
  particles = next;
}

export function drawParticles(ctx) {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function clearParticles() {
  particles = [];
}
