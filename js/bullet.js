/* ===========================================================
 * bullet.js — 子弹系统（范围制 + 行为模式）
 * =========================================================== */

import { W, H, BULLET } from "./config.js";
import { hypot } from "./utils.js";

export let bullets = [];

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

  bullets.push({
    x: x ?? player.x,
    y: y ?? (player.y - player.h / 2),
    vx: Math.sin(angle) * 3,
    vy: -finalSpd,
    baseSpd: finalSpd,    // 天基武器用于加速计算
    accel,
    dmg: finalDmg,
    r: isCrit ? BULLET.critRadius : BULLET.baseRadius,
    baseR: isCrit ? BULLET.critRadius : BULLET.baseRadius,
    friendly: true,
    color: behaviorColor(behaviors, isCrit),
    traveled: 0,
    maxRange,
    behaviors,
    pierceCount: 0,
    maxPierce: behaviors.has("penetrate") ? penetrateLv : 0,
    splitCount: behaviors.has("split") ? (1 + splitLv * BULLET.splitCountPerLevel) : 0,
    explosionRadius: behaviors.has("explosion") ? BULLET.explosionBaseRadius + explosionLv * BULLET.explosionRadiusPerLevel : 0,
    isScatter: false,
    isCrit,
    _refire: false, // 该子弹是否已被用于触发下一波射击（防止同波多弹反复触发）
  });
}

/** 创建分裂弹碎片（由分裂/爆炸技能触发） */
export function spawnSplitBullet(x, y, angle, dmg, color, parentR = 4) {
  const spd = BULLET.splitSpeed;
  bullets.push({
    x, y,
    vx: Math.sin(angle) * 2,
    vy: -spd,
    dmg,
    r: Math.max(1.5, parentR * 0.4), // 分裂碎片更小
    friendly: true,
    color: color || "#a0ffd0",
    traveled: 0,
    maxRange: 200,
    behaviors: new Set(),
    pierceCount: 0,
    maxPierce: 0,
    splitCount: 0,
    explosionRadius: 0,
    isScatter: true,
    isCrit: false,
  });
}

/** 创建敌方子弹 */
export function spawnEnemyBullet(e, playerX, playerY, fireScale = 1) {
  const dx = playerX - e.x;
  const dy = playerY - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const sp = (3 + Math.random() * 1.5) * fireScale;
  bullets.push({
    x: e.x,
    y: e.y + e.r * 0.5,
    vx: (dx / len) * sp,
    vy: (dy / len) * sp,
    r: 5,
    friendly: false,
    color: "#ff8fa3",
    traveled: 0,
    maxRange: 600,
    life: 6,
    behaviors: new Set(),
  });
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
    if (b.friendly) {
      if (b.traveled >= b.maxRange || b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) continue;
    } else {
      b.life = (b.life || 6) - dt;
      if (b.life <= 0 || b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) continue;
    }
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
    bullets = bullets.filter(b => b.friendly);
  } else {
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
