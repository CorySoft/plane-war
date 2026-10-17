/* ===========================================================
 * enemy.js — 敌机类型 + AI + 生成
 * =========================================================== */

import { W, H, ENEMY_TYPES, DIFFICULTY, ENEMY_LEVEL, TAU, enemyLevelScale } from "./config.js";
import { rand, pick } from "./utils.js";
import { drawSprite, drawSpriteFlash } from "./assets.js";

export let enemies = [];

// 敌机唯一 id：对象池会复用对象，碰撞去重必须靠 uid 而非对象引用
let uidSeq = 1;
export function nextEnemyUid() { return uidSeq++; }

// ---------- 敌机对象池 ----------
const pool = [];

function allocEnemy() {
  if (pool.length > 0) return pool.pop();
  return {};
}

/** 释放敌机回池（重置动态字段） */
function freeEnemy(e) {
  // Boss 不回池：普通敌机池复用会残留 bossType/phases/spawnTimer 等专属字段
  if (e.isBoss) return;
  if (pool.length < 60) pool.push(e);
}

function pushEnemy(e) { enemies.push(e); }

/** 从数组中移除敌机并释放回池 */
export function removeEnemyEx(idx) {
  const e = enemies[idx];
  if (!e) return;
  enemies.splice(idx, 1);
  freeEnemy(e);
}

/**
 * 根据难度等级获取可用敌机类型池。
 * 注意：局部变量名不能叫 pool——模块级已经有敌机对象池 const pool = []，
 * 同名遮蔽会让「往对象池归还敌机」的误写变成往类型数组里塞对象。
 */
function getEnemyTypePool(level) {
  const types = ["small"];
  if (level >= 2) types.push("small", "mid");
  if (level >= 3) types.push("mid", "mid");
  if (level >= 4) types.push("laser");
  if (level >= 5) types.push("big", "shield");
  if (level >= 6) types.push("split");
  if (level >= 7) types.push("big");
  if (level >= 8) types.push("shield", "laser");
  return types;
}

export function spawnEnemy(level, diff, enemyLevel = 1, atX, atY) {
  if (enemies.length >= 60) return; // 防爆量：同屏敌机上限
  const type = pick(getEnemyTypePool(level));
  const cfg = ENEMY_TYPES[type];
  // 敌方等级缩放
  const elvl = Math.max(1, enemyLevel);
  const scale = enemyLevelScale(elvl);
  const hpMul = 1 + scale * ENEMY_LEVEL.hpPerLevel;
  const rewardMul = 1 + scale * ENEMY_LEVEL.rewardPerLevel;
  const hp = Math.max(1, Math.round(cfg.hp * (diff?.hpScale ?? 1) * hpMul));
  const e = allocEnemy();
  e.uid = nextEnemyUid();
  e.type = type;
  e.r = cfg.r;
  e.hp = hp;
  e.maxHp = hp;
  e.score = Math.round(cfg.score * rewardMul);
  e.xp = Math.round(cfg.xp * rewardMul);
  e.speed = cfg.speed;
  e.color = cfg.color;
  e.x = atX ?? rand(cfg.r + 10, W - cfg.r - 10);
  e.y = atY ?? -cfg.r - 10;
  e.vy = cfg.speed * (diff?.speedScale ?? 1) * rand(0.8, 1.25) * (1 + level * DIFFICULTY.speedScalePerLevel);
  e.vx = rand(-0.4, 0.4);
  e.fireCd = rand(cfg.fireCd[0], cfg.fireCd[1]) * (diff?.fireCdScale ?? 1) * (1 + scale * ENEMY_LEVEL.fireCdPerLevel);
  e.t = rand(0, TAU);
  e.hitFlash = 0;
  e.frozen = 0;
  e.shieldHp = type === "shield" ? 3 : 0;
  e.splitChildren = type === "split" ? 2 : 0;
  e.laserTimer = type === "laser" ? rand(1, 2) : 0;
  e.enemyLevel = elvl;
  e.isBoss = false;
  e._laserShot = false;
  e._deathExplosion = null;
  e.kx = 0; e.ky = 0; e.kbTimer = 0;
  pushEnemy(e);
  return e;
}

export function updateEnemies(dt, level, playerX, playerY, playerH) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e) continue;

    // Boss 的移动/部署由 game.js 的 updateBossAI 负责，这里只累计时间，
    // 避免普通敌机推进逻辑（如原生 vy 下坠）把 Boss 一路带出屏幕。
    if (e.isBoss) {
      if (e.frozen > 0) e.frozen -= dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 8);   // Boss 分支同样衰减，否则受击后永久白闪
      e.t += dt;
      continue;
    }

    if (e.frozen > 0) {
      e.frozen -= dt;
      e.t += dt;
    } else {
      // 击退生效：叠加击退位移
      if (e.kbTimer > 0) {
        e.kbTimer -= dt;
        e.x += e.kx * dt * 60;
        e.y += e.ky * dt * 60;
      }
      e.y += e.vy * dt * 60;
      e.x += e.vx * dt * 60 + Math.sin(e.t * 1.5) * 0.4;
      e.t += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 8);

      // 墙壁弹射
      if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
      if (e.x > W - e.r) { e.x = W - e.r; e.vx = -Math.abs(e.vx); }

      if (e.type === "laser" && e.laserTimer > 0) e.laserTimer -= dt;
    }

    // 飞出屏幕
    if (e.y - e.r > H + 30) {
      removeEnemyEx(i);
    }
  }
}

/**
 * 取敌方 Boss 当前的相位配置（按剩余血量百分比）。
 * 相位遍历逻辑原本在 enemy.js 与 wave.js 各有一份（bossPhaseOf / getCurrentBossPhase），
 * 现在统一由这里提供，wave.js 直接再导出，避免两份实现日后各自漂移。
 */
export function getCurrentBossPhase(e) {
  if (!e || !e.phases || e.phases.length === 0) return null;
  const pct = e.hp / e.maxHp;
  let ph = e.phases[0];
  for (const p of e.phases) {
    if (pct <= p.hpPct) ph = p;
  }
  return ph;
}

/**
 * 获取需要发射子弹的敌机
 * @param {number} playerX
 * @param {number} playerY
 * @param {number} dt
 * @param {number} [fireCdScale] 难度开火间隔缩放（Boss 享受同款难度倍率）
 */
export function getEnemyShooters(playerX, playerY, dt, fireCdScale = 1) {
  const shooters = [];
  for (const e of enemies) {
    if (!e) continue;
    if (e.frozen > 0) continue;
    if (e.y <= 10 || e.y >= H * 0.7) continue;
    // Boss：按相位配置的开火间隔射击；无枪相位（如母舰空军召唤）跳过
    if (e.isBoss) {
      const ph = getCurrentBossPhase(e);
      if (!ph || (ph.fireInterval ?? 0) >= 50) continue;
      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        shooters.push(e);
        e.fireCd = ph.fireInterval * fireCdScale;
      }
      continue;
    }
    if (e.type === "laser") {
      if (e.laserTimer <= 0) {
        e._laserShot = true;
        shooters.push(e);
        e.laserTimer = rand(2.4, 3.6) * fireCdScale;
      }
      continue;
    }
    e.fireCd -= dt;
    if (e.fireCd <= 0) {
      shooters.push(e);
      const cd = e.type === "big" ? 2.2 : e.type === "mid" ? 3.2 : e.type === "shield" ? 3.5 : rand(4, 6);
      e.fireCd = cd * fireCdScale;
    }
  }
  return shooters;
}

// 敌机类型 → 贴图 id 缓存（键为 "类型|bossType"，值恒定）
const spriteIdCache = new Map();
function enemySpriteId(e) {
  const key = e.type === "boss" ? "b" + e.bossType : e.type;
  let id = spriteIdCache.get(key);
  if (id === undefined) {
    id = e.type === "boss" ? "boss_" + e.bossType : "enemy_" + e.type;
    spriteIdCache.set(key, id);
  }
  return id;
}

export function drawEnemies(ctx, frame) {
  for (const e of enemies) {
    if (!e) continue;
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

    // 身体：优先贴图（Boss 用 boss_<类型>，普通机用 enemy_<类型>）。
    // 贴图 id 按类型缓存：旧实现每帧每架敌机都拼一次模板字符串，
    // 同屏 60 架就是 60 次字符串分配。
    const spriteId = enemySpriteId(e);
    const box = r * 2.35;   // 贴图带 4% 透明留白，略放大补偿
    const skinned = drawSprite(ctx, spriteId, 0, 0, box, box);
    if (skinned) {
      // 受击白闪：叠一层白色剪影（无 document 环境返回 false，直接跳过）
      if (e.hitFlash > 0) drawSpriteFlash(ctx, spriteId, 0, 0, box, box, e.hitFlash);
    } else {
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
    }

    if (e.type === "laser" && e.laserTimer > 0 && e.laserTimer < 0.55) {
      ctx.strokeStyle = `rgba(255,68,68,${0.45 + Math.sin(frame * 0.4) * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(0, r + 18 + (0.55 - e.laserTimer) * 40);
      ctx.stroke();
    }

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

    // 眼睛（贴图自带面部细节，走贴图时不再画程序化眼睛）
    if (!skinned) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, r * 0.18, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.2, r * 0.18, 0, TAU); ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.arc(-r * 0.3 + r * 0.05, -r * 0.2, r * 0.08, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3 + r * 0.05, -r * 0.2, r * 0.08, 0, TAU); ctx.fill();
    }

    ctx.restore();
  }
}

export function clearEnemies() {
  for (const e of enemies) freeEnemy(e);
  enemies = [];
}

/** 生成分裂子代 */
export function spawnSplitChildren(parent) {
  for (let i = 0; i < parent.splitChildren; i++) {
    if (enemies.length >= 60) return;   // 与 spawnEnemy 同款防爆量上限
    const cfg = ENEMY_TYPES.small;
    const angle = (i / parent.splitChildren) * Math.PI - Math.PI / 2;
    const e = allocEnemy();
    e.uid = nextEnemyUid();
    e.type = "small";
    e.r = cfg.r * 0.7;
    e.hp = 1;
    e.maxHp = 1;
    e.score = 50;
    e.xp = 5;
    e.speed = cfg.speed * 1.3;
    e.color = parent.color;
    e.x = parent.x + Math.cos(angle) * 15;
    e.y = parent.y + Math.sin(angle) * 15;
    e.vy = cfg.speed * 1.3;
    e.vx = Math.cos(angle) * 1.5;
    e.fireCd = rand(5, 8);
    e.t = rand(0, TAU);
    e.hitFlash = 0;
    e.frozen = 0;
    e.shieldHp = 0;
    e.splitChildren = 0;
    e.laserTimer = 0;
    e.isBoss = false;
    e._deathExplosion = null;
    e._laserShot = false;
    e.enemyLevel = 1;
    e.kx = 0; e.ky = 0; e.kbTimer = 0;
    pushEnemy(e);
  }
}
