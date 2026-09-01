/* ===========================================================
 * bullet.js — 子弹系统（范围制 + 行为模式）
 * =========================================================== */

import { W, H, BULLET } from "./config.js";
import { hypot } from "./utils.js";

export let bullets = [];

// ---------- 子弹对象池 ----------
const pool = [];

/** 从池中取一颗子弹对象（无则新建），字段由调用方赋初值 */
function allocBullet() {
  if (pool.length > 0) return pool.pop();
  return {
    behaviors: new Set(),
    x: 0, y: 0, vx: 0, vy: 0, baseSpd: 0, accel: 0,
    dmg: 0, r: 0, baseR: 0, friendly: true, color: "",
    traveled: 0, maxRange: 0, pierceCount: 0, maxPierce: 0,
    splitCount: 0, explosionRadius: 0, isScatter: false, isCrit: false,
    _refire: false, life: 0,
  };
}

/** 释放子弹回池（重置动态字段） */
function freeBullet(b) {
  b.behaviors.clear();
  b.traveled = 0;
  b.pierceCount = 0;
  b.maxPierce = 0;
  b.splitCount = 0;
  b.explosionRadius = 0;
  b.isScatter = false;
  b.isCrit = false;
  b._refire = false;
  b.life = 0;
  if (pool.length < 400) pool.push(b); // 防爆量：池上限
}

function pushBullet(b) { bullets.push(b); }

/** 从数组中移除子弹并释放回池（供碰撞处理调用） */
export function removeBullet(b) {
  const idx = bullets.indexOf(b);
  if (idx !== -1) bullets.splice(idx, 1);
  freeBullet(b);
}

/**
 * 创建玩家子弹
 * @param {number} angle  - 偏转角(弧度)
 * @param {number} dmg    - 伤害
 * @param {object} player - 玩家对象(读取 skills)
 * @param {number} [x]    - 起始X
 * @param {number} [y]    - 起始Y
 * @param {number} [spd]  - 速度
 */
/**
 * @param {boolean} [isExplosion] - 已弃用：爆炸行为现由 getBulletBehavior 判定
 *                                  （player.skills.explosion>0 时全部爆炸）
 */
export function fireBullet(angle, dmg, player, x, y, spd = BULLET.baseSpeed, isExplosion) {
  const rangeLvl = player.skills.range || 0;
  // 每级攻击范围自动 +10%（以玩家等级计，初始等级 1 不加成）
  const levelMul = 1 + ((player.level || 1) - 1) * 0.10;
  const maxRange = (BULLET.baseRange + rangeLvl * BULLET.rangePerLevel) * levelMul;
  const behaviors = getBulletBehaviors(player, isExplosion);
  const critLvl = player.skills.crit || 0;
  const isCrit = critLvl > 0 && Math.random() < BULLET.critChance * critLvl;
  const finalDmg = isCrit ? Math.round(dmg * BULLET.critMulti) : dmg;

  // 子弹速度加成
  const speedMul = 1 + (player.skills.bulletSpeed || 0) * 0.20;
  const finalSpd = spd * speedMul;

  // 天基武器：出膛后加速
  const orbitalLv = player.skills.orbital || 0;
  const accel = orbitalLv > 0 ? BULLET.orbitalAccel + (orbitalLv - 1) * BULLET.orbitalAccelPerLevel : 0;

  // 各行为属性独立设置（不再互斥）
  const penetrateLv = player.skills.penetrate || 0;
  const splitLv = player.skills.split || 0;
  const explosionLv = player.skills.explosion || 0;

  const b = allocBullet();
  b.x = x ?? player.x;
  b.y = y ?? (player.y - player.h / 2);
  b.vx = Math.sin(angle) * 3;
  b.vy = -finalSpd;
  b.baseSpd = finalSpd;
  b.accel = accel;
  b.dmg = finalDmg;
  b.r = isCrit ? BULLET.critRadius : BULLET.baseRadius;
  b.baseR = isCrit ? BULLET.critRadius : BULLET.baseRadius;
  b.friendly = true;
  b.color = behaviorColor(behaviors, isCrit);
  b.traveled = 0;
  b.maxRange = maxRange;
  b.behaviors = behaviors;
  b.pierceCount = 0;
  b.maxPierce = behaviors.has("penetrate") ? penetrateLv : 0;
  b.splitCount = behaviors.has("split") ? (1 + splitLv * BULLET.splitCountPerLevel) : 0;
  b.explosionRadius = behaviors.has("explosion") ? BULLET.explosionBaseRadius + explosionLv * BULLET.explosionRadiusPerLevel : 0;
  b.isScatter = false;
  b.isCrit = isCrit;
  b._refire = false;
  b.life = 0;
  pushBullet(b);
  return b;
}

/** 创建分裂弹碎片（由分裂/爆炸技能触发） */
export function spawnSplitBullet(x, y, angle, dmg, color, parentR = 4) {
  const spd = BULLET.splitSpeed;
  const b = allocBullet();
  b.x = x; b.y = y;
  b.vx = Math.sin(angle) * 2;
  b.vy = -spd;
  b.dmg = dmg;
  b.r = Math.max(1.5, parentR * 0.4);
  b.baseR = b.r;
  b.friendly = true;
  b.color = color || "#a0ffd0";
  b.traveled = 0;
  b.maxRange = 200;
  b.behaviors.clear();
  b.pierceCount = 0; b.maxPierce = 0;
  b.splitCount = 0; b.explosionRadius = 0;
  b.isScatter = true; b.isCrit = false;
  b._refire = false; b.life = 0; b.accel = 0;
  pushBullet(b);
  return b;
}

/** 创建敌方子弹 */
export function spawnEnemyBullet(e, playerX, playerY, fireScale = 1) {
  const dx = playerX - e.x;
  const dy = playerY - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const sp = (3 + Math.random() * 1.5) * fireScale;
  const b = allocBullet();
  b.x = e.x;
  b.y = e.y + e.r * 0.5;
  b.vx = (dx / len) * sp;
  b.vy = (dy / len) * sp;
  b.r = 5; b.baseR = 5;
  b.friendly = false;
  b.color = "#ff8fa3";
  b.traveled = 0;
  b.maxRange = 600;
  b.life = 6;
  b.behaviors.clear();
  b.pierceCount = 0; b.maxPierce = 0;
  b.splitCount = 0; b.explosionRadius = 0;
  b.isScatter = false; b.isCrit = false;
  b._refire = false; b.accel = 0;
  pushBullet(b);
  return b;
}

export function updateBullets(dt) {
  // 原地更新 + filter 重建，避免逐次 splice 的 O(n) 元素移动
  // （碰撞检测中按对象引用 indexOf，不依赖索引，此处重排安全）
  const next = [];
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];

    // 天基武器：子弹出膛后不断加速
    if (b.accel > 0 && b.friendly && !b.isScatter) {
      const curSpd = Math.abs(b.vy);
      const newSpd = Math.min(curSpd + b.accel * dt * 60, BULLET.orbitalMaxSpeed);
      b.vy = -newSpd;
    }

    const dx = b.vx * dt * 60;
    const dy = b.vy * dt * 60;
    b.x += dx;
    b.y += dy;
    b.traveled += Math.hypot(dx, dy);
    let dead = false;
    if (b.friendly) {
      if (b.traveled >= b.maxRange || b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) dead = true;
    } else {
      b.life = (b.life || 6) - dt;
      if (b.life <= 0 || b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) dead = true;
    }
    if (dead) { freeBullet(b); continue; }
    next.push(b);
  }
  bullets = next;
}

export function drawBullets(ctx) {
  // shadowBlur 是 Canvas 最贵操作之一。子单位数时保留发光观感，
  // 数量多时（弹幕场景）关闭 shadow 并批量绘制同色子弹以保帧率。
  const useShadow = bullets.length <= 24;
  ctx.save();
  if (useShadow) ctx.shadowBlur = 10;

  // 按颜色分组：同色子弹共享一次 fillStyle / shadowColor 设置
  const groups = new Map();
  for (const b of bullets) {
    let arr = groups.get(b.color);
    if (!arr) { arr = []; groups.set(b.color, arr); }
    arr.push(b);
  }
  for (const [color, arr] of groups) {
    ctx.fillStyle = color;
    if (useShadow) ctx.shadowColor = color;
    // 友方矩形与敌方圆形分离绘制，减少路径切换
    for (const b of arr) {
      if (b.friendly) {
        const bw = 5, bh = 16;
        ctx.fillRect(b.x - bw / 2, b.y - bh / 2, bw, bh);
      }
    }
    ctx.beginPath();
    let hasArc = false;
    for (const b of arr) {
      if (!b.friendly) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); hasArc = true; }
    }
    if (hasArc) ctx.fill();
  }
  ctx.restore();
}

export function clearBullets(keepFriendly = false) {
  if (keepFriendly) {
    // 释放敌方子弹回池，保留友方
    for (let i = bullets.length - 1; i >= 0; i--) {
      if (!bullets[i].friendly) {
        freeBullet(bullets[i]);
        bullets.splice(i, 1);
      }
    }
  } else {
    for (const b of bullets) freeBullet(b);
    bullets = [];
  }
}

/** 屏上是否仍有玩家主弹（非散射弹）在飞行 */
export function hasPlayerMainBullet() {
  for (const b of bullets) {
    if (b.friendly && !b.isScatter) return true;
  }
  return false;
}

/**
 * 飞得最远的那颗「尚未触发过射击」的玩家主弹已飞行多少像素。
 * 每颗主弹只允许触发一次下一波射击（_refire 标记），避免同一波多颗子弹
 * 依次越过 refireDist 时反复触发，造成误连射。
 */
export function maxMainBulletTraveled() {
  let m = 0;
  for (const b of bullets) {
    if (b.friendly && !b.isScatter && !b._refire && b.traveled > m) m = b.traveled;
  }
  return m;
}

/** 把当前所有尚未触发的主弹标记为「已触发」（下一波射击发出后调用） */
export function markMainBulletsTriggered() {
  for (const b of bullets) {
    if (b.friendly && !b.isScatter && !b._refire) b._refire = true;
  }
}

// ---------- 内部工具 ----------

/** 返回所有激活的行为（可叠加） */
function getBulletBehaviors(player, isExplosion) {
  const s = player.skills;
  const set = new Set();
  if (isExplosion) set.add("explosion");
  if (s.penetrate > 0) set.add("penetrate");
  if (s.explosion > 0) set.add("explosion");
  if (s.split > 0) set.add("split");
  return set;
}

/** 取主行为用于染色（优先级：穿透 > 爆炸 > 分裂） */
function primaryBehavior(behaviors) {
  if (behaviors.has("penetrate")) return "penetrate";
  if (behaviors.has("explosion")) return "explosion";
  if (behaviors.has("split")) return "split";
  return "normal";
}

function behaviorColor(behaviors, isCrit) {
  if (isCrit) return "#ff8fa3";
  const b = primaryBehavior(behaviors);
  if (b === "explosion") return "#ff6633";
  if (b === "split") return "#7bd67b";
  if (b === "penetrate") return "#aa66ff";
  return "#5ee6ff";
}
