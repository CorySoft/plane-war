/* ===========================================================
 * particles.js — 粒子特效系统
 * =========================================================== */

import { rand, clamp } from "./utils.js";

export let particles = [];

// ---------- 粒子对象池 ----------
const pool = [];

function allocParticle() {
  if (pool.length > 0) return pool.pop();
  return {};
}

function freeParticle(p) {
  if (pool.length < 600) pool.push(p);
}

export function spawnParticles(x, y, color, n = 12, speed = 4) {
  for (let i = 0; i < n; i++) {
    if (particles.length >= 400) break; // 防爆量：粒子上限防卡顿
    const a = Math.random() * Math.PI * 2;
    const v = rand(1, speed);
    const life = rand(0.3, 0.8);
    const p = allocParticle();
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    p.life = life;
    p.maxLife = life;
    p.r = rand(1.5, 3.5);
    p.color = color;
    particles.push(p);
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
    if (p.life > 0) {
      next.push(p);
    } else {
      freeParticle(p);
    }
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
  for (const p of particles) freeParticle(p);
  particles = [];
}
