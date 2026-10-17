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

// 粒子按「颜色 × 透明度档位」分桶批量绘制。
// 旧实现最多 400 颗逐颗绘制：每颗都要改一次 globalAlpha + beginPath/arc/fill，
// 是后期最贵的一项。分桶后每帧 fill 次数 = 颜色数 × 档位数（个位数），
// 透明度按档位量化，视觉上与逐颗淡出无差别。
const PARTICLE_ALPHA_STEPS = 5;

export function drawParticles(ctx) {
  if (particles.length === 0) return;
  if (!drawParticles._groups) drawParticles._groups = new Map();
  const groups = drawParticles._groups;

  for (const arr of groups.values()) {
    for (const bucket of arr) bucket.length = 0;
  }

  for (const p of particles) {
    let arr = groups.get(p.color);
    if (!arr) {
      arr = [];
      for (let i = 0; i < PARTICLE_ALPHA_STEPS; i++) arr.push([]);
      groups.set(p.color, arr);
    }
    const a = clamp(p.life / p.maxLife, 0, 1);
    const step = a >= 1 ? PARTICLE_ALPHA_STEPS - 1 : (a * PARTICLE_ALPHA_STEPS) | 0;
    arr[step].push(p);
  }

  for (const [color, arr] of groups) {
    for (let step = 0; step < arr.length; step++) {
      const list = arr[step];
      if (list.length === 0) continue;
      ctx.globalAlpha = (step + 1) / PARTICLE_ALPHA_STEPS;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const p of list) {
        ctx.moveTo(p.x + p.r, p.y);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function clearParticles() {
  for (const p of particles) freeParticle(p);
  particles = [];
}
