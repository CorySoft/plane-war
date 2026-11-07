import { W, H, TAU } from "../config.js";
import { clamp, setf } from "../utils.js";
import { C } from "../theme.js";
import { uiState } from "./state.js";

const STAR_TINTS = ["210,228,255", "190,225,255", "255,236,190"];
const STAR_ALPHA_STEPS = 6;

export function spawnDamageNumber(x, y, text, color = C.white, big = false) {
  const now = performance.now();
  // 持续密集伤害：同一区域的相同飘字 180ms 内不重复出现，避免叠成一片
  if (!big) {
    for (let i = uiState.damageNumbers.length - 1; i >= 0; i--) {
      const d = uiState.damageNumbers[i];
      if (now - d.born < 180 && d.text === text && Math.hypot(d.x - x, d.y - y) < 18) {
        return;
      }
    }
  }
  if (uiState.damageNumbers.length >= 60) uiState.damageNumbers.shift(); // 防爆量
  uiState.damageNumbers.push({
    x, y, text, color, big,
    vy: -2.5,
    life: 1.0,
    maxLife: 1.0,
    born: now,
  });
}

export function updateDamageNumbers(dt) {
  for (let i = uiState.damageNumbers.length - 1; i >= 0; i--) {
    const d = uiState.damageNumbers[i];
    d.y += d.vy * dt * 60;
    d.vy *= 0.96;
    d.life -= dt;
    if (d.life <= 0) uiState.damageNumbers.splice(i, 1);
  }
}

export function drawDamageNumbers(ctx) {
  for (const d of uiState.damageNumbers) {
    const a = clamp(d.life / d.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = d.color;
    setf(ctx, d.big ? "bold 22px 'Courier New', monospace" : "bold 15px 'Courier New', monospace");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.globalAlpha = 1;
}

export function clearDamageNumbers() {
  uiState.damageNumbers = [];
}

export function initStars() {
  uiState.stars = [];
  for (let i = 0; i < 90; i++) {
    uiState.stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.7,
      sp: 0.4 + Math.random() * 2.2,
      tw: Math.random() * TAU,
    });
  }
}

export function updateStars(dt) {
  for (const s of uiState.stars) {
    s.y += s.sp * dt * 60;
    if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
  }
}

export function drawStars(ctx, frame) {
  // 桶：tint 索引 × alpha 档位 → 星体数组（复用，避免每帧重建）
  if (!drawStars._buckets) {
    drawStars._buckets = [];
    for (let i = 0; i < STAR_TINTS.length * STAR_ALPHA_STEPS; i++) drawStars._buckets.push([]);
  }
  const buckets = drawStars._buckets;
  for (const b of buckets) b.length = 0;

  for (const s of uiState.stars) {
    const a = 0.45 + 0.4 * Math.sin(frame * 0.04 + s.tw);
    const tint = s.r > 1.6 ? 2 : (s.r > 1.2 ? 1 : 0);
    // 透明度量化：0.05~0.85 → 0..5
    const step = Math.min(STAR_ALPHA_STEPS - 1, Math.max(0, Math.round((a - 0.05) / 0.8 * (STAR_ALPHA_STEPS - 1))));
    buckets[tint * STAR_ALPHA_STEPS + step].push(s);
  }

  for (let i = 0; i < buckets.length; i++) {
    const list = buckets[i];
    if (list.length === 0) continue;
    const beat = 0.05 + 0.8 * ((i % STAR_ALPHA_STEPS) / (STAR_ALPHA_STEPS - 1));
    ctx.fillStyle = "rgba(" + STAR_TINTS[(i / STAR_ALPHA_STEPS) | 0] + "," + beat.toFixed(2) + ")";
    ctx.beginPath();
    for (const s of list) {
      ctx.moveTo(s.x + s.r, s.y);
      ctx.arc(s.x, s.y, s.r, 0, TAU);
    }
    ctx.fill();
  }
}
