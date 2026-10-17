/* ===========================================================
 * bullet.js — 子弹系统（范围制 + 行为模式）
 * =========================================================== */

import { W, H, BULLET, calcRangePx } from "./config.js";
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
    splitCount: 0, explosionRadius: 0, expChance: 0, expDmgRatio: 0, isScatter: false, isCrit: false,
    _refire: false, life: 0, homing: 0, knockback: 0, nextSplitDist: 0, splitRange: 0,
    hitUids: new Set(),   // 已命中过的敌机 uid（穿透/碎片每敌只结算一次）
  };
}

/**
 * 该子弹是否尚未命中过这架敌机。
 * 穿透弹与分裂碎片命中后不会立即销毁，若不去重会在重叠的每一帧重复扣血，
 * 造成「碎片贴脸秒杀」的异常伤害。
 */
export function canHitEnemy(b, e) {
  if (!b || !e) return false;
  if (!b.hitUids) b.hitUids = new Set();
  return !b.hitUids.has(e.uid);
}

/** 记录一次命中（幂等） */
export function markHitEnemy(b, e) {
  if (!b || !e) return;
  if (!b.hitUids) b.hitUids = new Set();
  b.hitUids.add(e.uid);
}

/** 释放子弹回池（重置动态字段） */
function freeBullet(b) {
  b.behaviors.clear();
  b.traveled = 0;
  b.pierceCount = 0;
  b.maxPierce = 0;
  b.splitCount = 0;
  b.explosionRadius = 0;
  b.expDmgRatio = 0;
  b.isScatter = false;
  b.isCrit = false;
  b._refire = false; b.life = 0; b.homing = 0; b.knockback = 0;
  b.nextSplitDist = 0; b.splitRange = 0;
  b.hitUids.clear();
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
export function fireBullet(angle, dmg, player, x, y, spd = BULLET.baseSpeed, isExplosion, isHoming) {
  // 射程统一走 player.js 的 calcRangePx：HUD/暂停面板都读同一个值，
  // 旧实现在这个函数里另算了一遍，常量改一处就会两边对不上。
  const maxRange = calcRangePx(player);
  const behaviors = getBulletBehaviors(player, isExplosion);
  const critLvl = player.skills.crit || 0;
  const critBuff = (player.buffs?.critboost || 0) > 0;
  const critChance = BULLET.critChance * critLvl + (player.talentCrit || 0);
  const isCrit = critBuff || (critChance > 0 && Math.random() < critChance);
  // 暴击倍率：基础 2.5 + 致命暴击技能每级 +0.5 + 致命 buff 额外 +0.5
  const critMulti = BULLET.critMulti
    + 0.5 * (player.skills.critdmg || 0)
    + (critBuff ? 0.5 : 0);
  const finalDmg = isCrit ? Math.round(dmg * critMulti) : dmg;

  // 子弹速度加成（收敛：每级 +15%，满级 +90%）
  const speedMul = 1 + (player.skills.bulletSpeed || 0) * 0.15;
  const finalSpd = spd * speedMul;

  // 天基武器：出膛后加速
  const orbitalLv = player.skills.orbital || 0;
  const accel = orbitalLv > 0 ? BULLET.orbitalAccel + (orbitalLv - 1) * BULLET.orbitalAccelPerLevel : 0;

  // 各行为属性独立设置（不再互斥）
  const penetrateLv = player.skills.penetrate || 0;
  const splitLv = player.skills.split || 0;
  const isExplosionBullet = behaviors.has("explosion");
  const expRangeLv = player.skills.expRange || 0;
  const expDmgLv = player.skills.expDmg || 0;

  const b = allocBullet();
  b.x = x ?? player.x;
  b.y = y ?? (player.y - player.h / 2);
  b.vx = Math.sin(angle) * finalSpd;
  b.vy = -Math.cos(angle) * finalSpd;
  b.baseSpd = finalSpd;
  b.accel = accel;
  b.dmg = finalDmg;
  b.r = isCrit ? BULLET.critRadius : BULLET.baseRadius;
  b.baseR = isCrit ? BULLET.critRadius : BULLET.baseRadius;
  b.friendly = true;
  b.color = behaviorColor(behaviors, isCrit);
  b.homing = isHoming ? 1 : 0;
  if (isHoming) b.color = "#fca311";
  b.traveled = 0;
  b.maxRange = maxRange;
  b.behaviors = behaviors;
  b.pierceCount = 0;
  b.maxPierce = behaviors.has("penetrate") ? penetrateLv : 0;
  b.splitCount = behaviors.has("split") ? (1 + splitLv * BULLET.splitCountPerLevel) : 0;
  // 「分裂距离」技能：决定碎片飞行射程（默认为基础值）
  const splitDistLv = player.skills.splitDist || 0;
  b.splitRange = behaviors.has("split")
    ? BULLET.splitFragBaseRange + splitDistLv * BULLET.splitFragRangePerLevel
    : 0;
  b.explosionRadius = isExplosionBullet ? BULLET.explosionBaseRadius + expRangeLv * BULLET.explosionRadiusPerLevel : 0;
  b.expDmgRatio = isExplosionBullet ? (BULLET.explosionBaseDmgRatio + expDmgLv * BULLET.explosionDmgRatioPerLevel) : 0;
  b.isScatter = false;
  b.isCrit = isCrit;
  b._refire = false;
  b.life = 0;
  // 击退力：技能每级 +30% 伤害，buff 期间额外 +30%
  const kbLvl = player.skills.knockback || 0;
  const kbBuff = (player.buffs?.knockback || 0) > 0;
  b.knockback = (kbLvl > 0 || kbBuff) ? b.dmg * (BULLET.knockbackPerLevel * kbLvl + (kbBuff ? 0.3 : 0)) : 0;
  pushBullet(b);
  return b;
}

/** 创建分裂弹碎片（由分裂/爆炸技能触发） */
export function spawnSplitBullet(x, y, angle, dmg, color, parentR = 4, range = 200) {
  const spd = BULLET.splitSpeed;
  const b = allocBullet();
  b.x = x; b.y = y;
  b.vx = Math.sin(angle) * spd;
  b.vy = -Math.cos(angle) * spd;
  b.dmg = dmg;
  b.r = Math.max(2, parentR * 0.45);   // 小圆子弹：半径稍大于原碎片
  b.baseR = b.r;
  b.friendly = true;
  b.color = color || "#a0ffd0";
  b.traveled = 0;
  b.maxRange = range;
  b.behaviors.clear();
  b.pierceCount = 0; b.maxPierce = 0;
  b.splitCount = 0; b.explosionRadius = 0; b.expDmgRatio = 0;
  b.isScatter = true; b.isCrit = false;
  b._refire = false; b.life = 0; b.accel = 0;
  b.nextSplitDist = 0; b.knockback = 0;
  b.hitUids.clear();
  pushBullet(b);
  return b;
}

/**
 * 速度矢量 → 子弹角度（本项目约定：0 = 正上方，正值顺时针）。
 * fireBullet 用 (sin a, -cos a) 生成速度，因此由 (vx,vy) 反解为 atan2(vx, -vy)。
 * 直接用 atan2(vy, vx) 会相差 90°，表现为「碎片朝侧面而不是朝前飞」。
 */
export function headingToBulletAngle(vx, vy) {
  return Math.atan2(vx, -vy);
}

/**
 * 主弹命中/飞行触发分裂：围绕子弹飞行方向的前向等间距扇形碎片
 * @param {number} travelDir 主弹飞行方向（子弹角度制：0 = 正上方）
 * @param {number} range 碎片射程（分裂距离技能加成）
 * @returns {number} 生成的碎片数
 */
export function spawnSplitBurst(x, y, travelDir, count, dmg, color, parentR = 4, range = 200) {
  if (count <= 0) return 0;
  const n = Math.min(Math.max(count, 1), 12);       // 单轮碎片数量上限，防爆量
  // 前向窄扇形：各方向围绕主弹行进方向（纵深延伸），满级也不横向横散
  const arc = Math.min(1.2, n * 0.2);               // ±最大约 34°，随片数微张
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1);          // 0..1
    const ang = travelDir + (t - 0.5) * arc;
    spawnSplitBullet(x, y, ang, dmg, color, parentR, range);
  }
  return n;
}

/** 从对象池取出一发敌方子弹 */
export function spawnHostileBullet(x, y, vx, vy, opts = {}) {
  const b = allocBullet();
  b.x = x; b.y = y;
  b.vx = vx; b.vy = vy;
  b.r = opts.r ?? 5;
  b.baseR = b.r;
  b.friendly = false;
  b.color = opts.color || "#ff8fa3";
  b.traveled = 0;
  b.maxRange = opts.maxRange ?? 600;
  b.life = opts.life ?? 6;
  b.behaviors.clear();
  b.pierceCount = 0; b.maxPierce = 0;
  b.splitCount = 0; b.explosionRadius = 0;
  b.isScatter = false; b.isCrit = false;
  b._refire = false; b.accel = 0; b.homing = 0;
  b.knockback = 0;
  b.hitUids.clear();
  b.dmg = opts.dmg || 0;
  pushBullet(b);
  return b;
}

/** 创建敌方子弹 */
export function spawnEnemyBullet(e, playerX, playerY, fireScale = 1) {
  const dx = playerX - e.x;
  const dy = playerY - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const sp = (3 + Math.random() * 1.5) * fireScale;
  return spawnHostileBullet(e.x, e.y + e.r * 0.5, (dx / len) * sp, (dy / len) * sp, {
    r: 5, color: "#ff8fa3", maxRange: 600, life: 6,
  });
}

/** 激光敌机：三发平行快弹朝向玩家 */
export function spawnLaserVolley(e, playerX, playerY, fireScale = 1) {
  const dx = playerX - e.x;
  const dy = playerY - e.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const px = -ny, py = nx;
  const sp = (8.5 + Math.random() * 1.2) * fireScale;
  const shots = [];
  for (let i = -1; i <= 1; i++) {
    shots.push(spawnHostileBullet(
      e.x + px * i * 11,
      e.y + e.r * 0.5 + py * i * 11,
      nx * sp, ny * sp,
      { r: 3.5, color: "#ff4444", maxRange: 720, life: 2.4 },
    ));
  }
  return shots;
}

/**
 * 穿透弹命中后消耗一层穿透；耗尽或非穿透则销毁。
 * @returns {boolean} 子弹是否已移除
 */
export function applyPierceOrRemove(b) {
  if (!b) return true;
  if (b.behaviors.has("penetrate") && b.pierceCount < b.maxPierce) {
    b.pierceCount++;
    return false;
  }
  if (b.isScatter) return false;
  removeBullet(b);
  return true;
}

export function updateBullets(dt) {
  // 原地更新 + filter 重建，避免逐次 splice 的 O(n) 元素移动
  // （碰撞检测中按对象引用 indexOf，不依赖索引，此处重排安全）
  const next = [];
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b) continue;

    // 天基武器：沿子弹自身飞行方向加速（旧实现直接改写 vy，会把左右护法的
    // 水平弹强行掰成向上飞，必须按速度矢量等比放大）
    if (b.accel > 0 && b.friendly && !b.isScatter) {
      const curSpd = Math.hypot(b.vx, b.vy);
      if (curSpd > 0.001) {
        const newSpd = Math.min(curSpd + b.accel * dt * 60, BULLET.orbitalMaxSpeed);
        const k = newSpd / curSpd;
        b.vx *= k;
        b.vy *= k;
      }
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

/* ===========================================================
 * 子弹绘制：霓虹弹
 *
 * 与皮肤（assets/skin/<style>）同一套观感，而不是旧版的纯色色块：
 *   拖尾（沿飞行反方向的两段亮线）→ 本色弹体 → 高光内芯 → 圆形弹外圈亮环
 * 再叠 shadowBlur 光晕（仅子弹少时开启，见 useShadow）。
 *
 * 性能：仍按颜色分组共享 fillStyle/shadowColor，每组只发起常数次
 * 批量绘制（stroke/fill 各 2~3 次），同屏上百发也只有十几次 draw 调用；
 * 胶囊路径直接算顶点+圆弧，不用 translate/rotate，省掉每颗子弹的矩阵操作。
 * =========================================================== */

const DRAW_TAU = Math.PI * 2;

// 友方主弹：总长 16、宽 5（与旧版一致；碰撞判定不依赖绘制尺寸）
const FB_W = 5, FB_H = 16;
// 内芯占弹体宽度的比例 / 内芯两端内缩量（留出本色描边感）
const CORE_W_RATIO = 0.22, CORE_INSET = 1.6;

/** #rgb / #rrggbb → [r,g,b]；非 hex（rgba()/关键字）返回 null */
function parseHex(hex) {
  if (typeof hex !== "string") return null;
  let s = hex.trim();
  if (s.charAt(0) !== "#") return null;
  s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length !== 6 || /[^0-9a-fA-F]/.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// 高光内芯色 = 弹体色与白色混合，按「颜色+比例」缓存，避免每帧做字符串运算
const coreCache = new Map();
function coreColor(color, t = 0.62) {
  const key = color + "|" + t;
  const hit = coreCache.get(key);
  if (hit !== undefined) return hit;
  const rgb = parseHex(color);
  let out = "#ffffff";
  if (rgb) {
    const m = (c) => Math.round(c + (255 - c) * t);
    out = "rgb(" + m(rgb[0]) + "," + m(rgb[1]) + "," + m(rgb[2]) + ")";
  }
  coreCache.set(key, out);
  return out;
}

/** 飞行方向单位向量（速度为 0 时按「向上」退化，避免除零画不出弹） */
function dirOf(b) {
  const sp = Math.hypot(b.vx, b.vy);
  if (!(sp > 1e-6)) return [0, -1];
  return [b.vx / sp, b.vy / sp];
}

/**
 * 胶囊（圆头长条）路径：中心 (x,y)、直段半长 L、半宽 W，沿 (ux,uy) 展开。
 * 直接算顶点与两段圆弧，不使用 ctx.rotate —— 路径点在构造时即被变换，
 * 所以同一 color 组仍能攒成一条 path 一次 fill。
 */
function capsulePath(ctx, x, y, ux, uy, L, W) {
  const px = -uy, py = ux;                 // 垂直于飞行方向
  const ax = x + ux * L, ay = y + uy * L;  // 前帽圆心
  const bx = x - ux * L, by = y - uy * L;  // 后帽圆心
  const a0 = Math.atan2(py, px);           // 「+垂直」一侧的极角
  ctx.moveTo(bx + px * W, by + py * W);
  ctx.lineTo(ax + px * W, ay + py * W);
  ctx.arc(ax, ay, W, a0, a0 - Math.PI, true);  // 绕前帽，扫过飞行方向一侧
  ctx.lineTo(bx - px * W, by - py * W);
  ctx.arc(bx, by, W, a0 - Math.PI, a0, true);  // 绕后帽回到起点
  ctx.closePath();
}

function circlePath(ctx, x, y, r) {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, DRAW_TAU);
}

/** 是否按圆绘制（敌弹与散射碎片）；友方主弹走胶囊 */
function isOrb(b) { return !b.friendly || b.isScatter; }

/** 拖尾线段起点/终点（seg=1 近段，seg=2 远段） */
function trailSeg(ctx, b, seg) {
  const d = dirOf(b);
  const ux = d[0], uy = d[1];
  const tail = isOrb(b) ? b.r : FB_H / 2;
  const len = seg === 1 ? 4 : 9;
  ctx.moveTo(b.x - ux * tail, b.y - uy * tail);
  ctx.lineTo(b.x - ux * (tail + len), b.y - uy * (tail + len));
}

/** 弹体路径 */
function bodyPath(ctx, b) {
  if (isOrb(b)) {
    circlePath(ctx, b.x, b.y, b.r);
  } else {
    const d = dirOf(b);
    capsulePath(ctx, b.x, b.y, d[0], d[1], FB_H / 2 - FB_W / 2, FB_W / 2);
  }
}

/** 高光内芯路径（比弹体短/窄一圈） */
function corePath(ctx, b) {
  if (isOrb(b)) {
    circlePath(ctx, b.x, b.y, b.r * 0.45);
  } else {
    const d = dirOf(b);
    const w = FB_W * CORE_W_RATIO;
    capsulePath(ctx, b.x, b.y, d[0], d[1], FB_H / 2 - CORE_INSET - w, w);
  }
}

export function drawBullets(ctx) {
  // shadowBlur 是 Canvas 最贵操作之一。子单位数时保留发光观感，
  // 数量多时（弹幕场景）关闭 shadow 保帧率——拖尾/内芯/亮环不依赖 shadow，照画。
  const useShadow = bullets.length <= 24;
  ctx.save();
  if (useShadow) ctx.shadowBlur = 10;

  // 按颜色分组：同色子弹共享一次 fillStyle / shadowColor 设置
  const groups = new Map();
  for (const b of bullets) {
    if (!b) continue;
    let arr = groups.get(b.color);
    if (!arr) { arr = []; groups.set(b.color, arr); }
    arr.push(b);
  }

  for (const [color, arr] of groups) {
    if (useShadow) ctx.shadowColor = color;
    ctx.lineCap = "round";

    // 1) 拖尾：沿飞行反方向两段递减亮线（同组一次 stroke）
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    for (const b of arr) trailSeg(ctx, b, 1);
    ctx.stroke();

    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    for (const b of arr) trailSeg(ctx, b, 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 2) 弹体
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const b of arr) bodyPath(ctx, b);
    ctx.fill();

    // 3) 高光内芯
    const core = coreColor(color);
    ctx.fillStyle = core;
    ctx.beginPath();
    for (const b of arr) corePath(ctx, b);
    ctx.fill();

    // 4) 圆形弹的外圈亮环（同组一次 stroke）
    let orb = false;
    ctx.beginPath();
    for (const b of arr) {
      if (!isOrb(b)) continue;
      circlePath(ctx, b.x, b.y, Math.max(1, b.r - 0.7));
      orb = true;
    }
    if (orb) {
      ctx.strokeStyle = core;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function clearBullets(keepFriendly = false) {
  if (keepFriendly) {
    // 释放敌方子弹回池，保留友方
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      if (!b) continue;
      if (!b.friendly) {
        freeBullet(b);
        bullets.splice(i, 1);
      }
    }
  } else {
    for (const b of bullets) { if (b) freeBullet(b); }
    bullets = [];
  }
}

/**
 * 飞得最远的那颗「尚未触发过射击」的玩家主弹已飞行多少像素。
 * 每颗主弹只允许触发一次下一波射击（_refire 标记），避免同一波多颗子弹
 * 依次越过 refireDist 时反复触发，造成误连射。
 */
export function maxMainBulletTraveled() {
  let m = 0;
  for (const b of bullets) {
    if (!b) continue;
    if (b.friendly && !b.isScatter && !b._refire && b.traveled > m) m = b.traveled;
  }
  return m;
}

/** 当前同屏友方子弹数量（密度兜底用） */
export function countFriendlyBullets() {
  let n = 0;
  for (const b of bullets) {
    if (b && b.friendly) n++;
  }
  return n;
}

/** 把当前所有尚未触发的主弹标记为「已触发」（下一波射击发出后调用） */
export function markMainBulletsTriggered() {
  for (const b of bullets) {
    if (!b) continue;
    if (b.friendly && !b.isScatter && !b._refire) b._refire = true;
  }
}

// ---------- 内部工具 ----------

/** 返回所有激活行为（可叠加） */
function getBulletBehaviors(player, isExplosion) {
  const s = player.skills;
  const set = new Set();
  if (isExplosion) set.add("explosion");
  if (s.penetrate > 0) set.add("penetrate");
  if (s.explosion > 0 && Math.random() < (BULLET.explosionBaseChance + (s.expChance || 0) * BULLET.explosionChancePerLevel)) {
    set.add("explosion");
  }
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
