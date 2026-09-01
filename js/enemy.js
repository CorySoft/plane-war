/* ===========================================================
 * enemy.js — 敌机类型 + AI + 生成
 * =========================================================== */

import { W, H, ENEMY_TYPES, DIFFICULTY, ENEMY_LEVEL, TAU } from "./config.js";
import { rand, pick } from "./utils.js";

export let enemies = [];

/** 根据难度等级获取可用敌机类型池 */
function getPool(level) {
  let pool = ["small"];
  if (level >= 2) pool.push("small", "mid");
  if (level >= 3) pool.push("mid", "mid");
  if (level >= 4) pool.push("laser");
  if (level >= 5) pool.push("big", "shield");
  if (level >= 6) pool.push("split");
  if (level >= 7) pool.push("big");
  if (level >= 8) pool.push("shield", "laser");
  return pool;
}

export function spawnEnemy(level, diff, enemyLevel = 1) {
  if (enemies.length >= 60) return; // 防爆量：同屏敌机上限
  const pool = getPool(level);
  const type = pick(pool);
  const cfg = ENEMY_TYPES[type];
  // 敌方等级缩放
  const elvl = Math.max(1, enemyLevel);
  const hpMul = 1 + (elvl - 1) * ENEMY_LEVEL.hpPerLevel;
  const rewardMul = 1 + (elvl - 1) * ENEMY_LEVEL.rewardPerLevel;
  const hp = Math.max(1, Math.round(cfg.hp * (diff?.hpScale ?? 1) * hpMul));
  const e = {
    type,
    r: cfg.r,
    hp,
    maxHp: hp,
    score: Math.round(cfg.score * rewardMul),
    xp: Math.round(cfg.xp * rewardMul),
    speed: cfg.speed,
    color: cfg.color,
    x: rand(cfg.r + 10, W - cfg.r - 10),
    y: -cfg.r - 10,
    vy: cfg.speed * (diff?.speedScale ?? 1) * rand(0.8, 1.25) * (1 + level * DIFFICULTY.speedScalePerLevel),
    vx: rand(-0.4, 0.4),
    fireCd: rand(cfg.fireCd[0], cfg.fireCd[1]) * (diff?.fireCdScale ?? 1) * (1 + (elvl - 1) * ENEMY_LEVEL.fireCdPerLevel),
    t: rand(0, TAU),
    hitFlash: 0,
    frozen: 0,
    shieldHp: type === "shield" ? 3 : 0,     // 护盾敌机自带护盾
    splitChildren: type === "split" ? 2 : 0, // 分裂敌机子代数
    laserTimer: type === "laser" ? rand(1, 2) : 0,
    enemyLevel: elvl,
  };
  enemies.push(e);
  return e;
}

export function updateEnemies(dt, level, playerX, playerY, playerH) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (e.frozen > 0) {
      e.frozen -= dt;
      e.t += dt;
    } else {
      e.y += e.vy * dt * 60;
      e.x += e.vx * dt * 60 + Math.sin(e.t * 1.5) * 0.4;
      e.t += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 8);

      // 墙壁弹射
      if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
      if (e.x > W - e.r) { e.x = W - e.r; e.vx = -Math.abs(e.vx); }

      // 激光敌机蓄力
      if (e.type === "laser") {
        e.laserTimer -= dt;
      }
    }

    // 飞出屏幕
    if (e.y - e.r > H + 30) {
      enemies.splice(i, 1);
    }
  }
}

/** 获取需要发射子弹的敌机 */
export function getEnemyShooters(playerX, playerY) {
  const shooters = [];
  for (const e of enemies) {
    if (e.frozen > 0) continue;
    if (e.y <= 10 || e.y >= H * 0.7) continue;
    e.fireCd -= 1 / 60; // 近似每帧
    if (e.fireCd <= 0) {
      shooters.push(e);
      const cd = e.type === "big" ? 2.2 : e.type === "mid" ? 3.2 : e.type === "laser" ? 2.5 : e.type === "shield" ? 3.5 : rand(4, 6);
      e.fireCd = cd;
    }
  }
  return shooters;
}

export function drawEnemies(ctx, frame) {
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.sin(e.t * 2) * 0.15);
    const r = e.r;

    // 冰冻特效
    if (e.frozen > 0) {
      for (let i = 0; i < 3; i++) {
        const a = frame * 0.1 + i * TAU / 3;
        ctx.fillStyle = "rgba(150,220,255,.85)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, 2.5, 0, TAU);
        ctx.fill();
      }
    }

    // 身体
    ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : e.color;
    ctx.beginPath();
    if (e.type === "small" || e.type === "split") {
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.85, r * 0.3);
      ctx.lineTo(r * 0.5, r);
      ctx.lineTo(-r * 0.5, r);
      ctx.lineTo(-r * 0.85, r * 0.3);
    } else if (e.type === "mid" || e.type === "laser") {
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.6, r);
      ctx.lineTo(-r * 0.6, r);
      ctx.lineTo(-r, 0);
    } else if (e.type === "shield") {
      // 菱形
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, 0);
    } else {
      ctx.arc(0, 0, r, 0, TAU);
    }
    ctx.closePath();
    ctx.fill();

    // 护盾敌机护盾环
    if (e.shieldHp > 0) {
      ctx.strokeStyle = `rgba(100,200,255,${0.5 + Math.sin(frame * 0.1) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, TAU * (e.shieldHp / 3));
      ctx.stroke();
    }

    // 血条
    if (e.maxHp > 1) {
      const w = r * 2;
      const pct = e.hp / e.maxHp;
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(-w / 2, r + 6, w, 4);
      ctx.fillStyle = pct > 0.5 ? "#7CFC00" : pct > 0.25 ? "#ffd166" : "#ff6b6b";
      ctx.fillRect(-w / 2, r + 6, w * pct, 4);
    }

    // 眼睛
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, r * 0.18, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.2, r * 0.18, 0, TAU); ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(-r * 0.3 + r * 0.05, -r * 0.2, r * 0.08, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.3 + r * 0.05, -r * 0.2, r * 0.08, 0, TAU); ctx.fill();

    ctx.restore();
  }
}

export function clearEnemies() {
  enemies = [];
}

/** 生成分裂子代 */
export function spawnSplitChildren(parent) {
  for (let i = 0; i < parent.splitChildren; i++) {
    const cfg = ENEMY_TYPES.small;
    const angle = (i / parent.splitChildren) * Math.PI - Math.PI / 2;
    enemies.push({
      type: "small",
      r: cfg.r * 0.7,
      hp: 1,
      maxHp: 1,
      score: 50,
      xp: 5,
      speed: cfg.speed * 1.3,
      color: parent.color,
      x: parent.x + Math.cos(angle) * 15,
      y: parent.y + Math.sin(angle) * 15,
      vy: cfg.speed * 1.3,
      vx: Math.cos(angle) * 1.5,
      fireCd: rand(5, 8),
      t: rand(0, TAU),
      hitFlash: 0,
      frozen: 0,
      shieldHp: 0,
      splitChildren: 0,
      laserTimer: 0,
    });
  }
}
