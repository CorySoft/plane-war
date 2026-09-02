/* ===========================================================
 * player.js — 玩家逻辑 + 渲染
 * =========================================================== */

import { W, H, PLAYER_BASE, BULLET, TAU } from "./config.js";
import { clamp, rand, setf } from "./utils.js";
import { pressed, getStickDir } from "./input.js";

export function createPlayer(aircraftCfg, talentEffects) {
  const base = { ...PLAYER_BASE };
  // 属性倍率（飞机 / 天赋叠加）
  let baseDmgMul = 1;
  let fireRateMul = 1;
  const startSkills = {};

  // 应用飞机加成
  if (aircraftCfg) {
    base.speed = aircraftCfg.speed;
    base.startHp = aircraftCfg.startHp;
    baseDmgMul *= (aircraftCfg.baseDmg ?? 1);
    fireRateMul *= (aircraftCfg.fireRate ?? 1);
    const armSkills = aircraftCfg.startSkills;
    if (armSkills) {
      for (const [id, lv] of Object.entries(armSkills)) {
        if (id === "range") {
          // 射程起始加成通过基础射程体现（由 fireBullet 的 skills.range 读取）
          startSkills.range = lv;
        } else {
          startSkills[id] = lv;
        }
      }
    }
  }

  // 应用天赋加成
  if (talentEffects) {
    base.speed += (talentEffects.speedAdd || 0);
    base.startHp += (talentEffects.startHp || 0);
    base.invincibleTime += (talentEffects.invTime || 0);
    if (talentEffects.maxShield) base.maxShield += talentEffects.maxShield;
    baseDmgMul *= (1 + (talentEffects.baseDmg || 0));
    fireRateMul *= (talentEffects.fireRateMul || 1);
    if (talentEffects.startRange) {
      // 起始射程天赋折算为射程技能等级（按每级射程 2m 换算）
      startSkills.range = (startSkills.range || 0) + Math.round(talentEffects.startRange / BULLET.rangePerLevel);
    }
  }

  return {
    x: W / 2,
    y: H - 100,
    w: base.width,
    h: base.height,
    speed: base.speed,
    radius: base.radius,
    level: 1,
    fireCd: 0,
    invincible: 0,
    invincibleTime: base.invincibleTime,
    power: 1 + (talentEffects?.startPower || 0),
    powerTime: 0,
    shield: 0,
    maxShield: base.maxShield,
    baseHp: base.startHp,
    baseDmgMul,
    fireRateMul,
    buffs: { rapid: 0, speed: 0, freeze: 0, magnet: 0, double: 0, madHunt: 0, drop: 0, critboost: 0 },
    skills: { ...startSkills },
    orbit: [],   // 护体弹：围绕玩家旋转的特殊子弹

    // 内部事件标记（由 update 消费）
    _addLife: false,
    _freeze: false,
    _heal: 0,
    _toast: null,
  };
}

export function updatePlayer(dt, player, refireDist = 0, maxTraveled = 0) {
  player.y = H - 100;
  const sp = player.speed
    * (1 + 0.12 * (player.skills.move || 0))
    * (player.buffs.speed > 0 ? 1.5 : 1);

  // 移动：摇杆优先（触摸激活时），否则键盘
  const stickDir = getStickDir();
  if (stickDir !== 0) {
    player.x += stickDir * sp * dt * 60;
  } else {
    if (pressed.left)  player.x -= sp * dt * 60;
    if (pressed.right) player.x += sp * dt * 60;
  }
  player.x = clamp(player.x, 20, W - 20);

  // 射击冷却（应用飞机/天赋射速倍率）
  const frMul = player.fireRateMul || 1;
  const rapid = player.buffs.rapid > 0;
  const mad = player.buffs.madHunt > 0;
  const fireRate = rapid
    ? 0.055 * frMul
    : mad
      ? 0.1 * frMul
      : (0.16 - player.power * 0.012) * (1 - 0.08 * (player.skills.rate || 0)) * frMul;
  if (player.fireCd > 0) player.fireCd -= dt;
  // 距离/销毁触发：上一发主弹飞行超过 refireDist(10m) 或已销毁（无主弹在屏），
  // 且冷却结束即可再射。形成连续弹幕而非单发锁死。
  const mainInFlight = maxTraveled > 0;
  const refireReady = !mainInFlight || maxTraveled >= refireDist;
  let shouldFire = player.fireCd <= 0 && refireReady;
  if (!refireReady && player.fireCd <= 0) player.fireCd = 0.05; // 等待飞行距离达标，保留微小冷却防抖
  if (shouldFire) player.fireCd = fireRate;

  // 无敌帧
  if (player.invincible > 0) player.invincible -= dt;

  // 武器等级计时
  if (player.powerTime > 0) {
    player.powerTime -= dt;
    if (player.powerTime <= 0) player.power = 1;
  }

  // 计时类buff
  for (const k of ["rapid", "speed", "magnet", "double", "madHunt", "drop", "critboost"]) {
    if (player.buffs[k] > 0) {
      player.buffs[k] -= dt;
      if (player.buffs[k] < 0) player.buffs[k] = 0;
    }
  }

  // toast衰减
  if (player._toast) {
    player._toast.t -= dt;
    if (player._toast.t <= 0) player._toast = null;
  }

  // 护体弹旋转与补充
  updateOrbit(player, dt);

  return shouldFire;
}

// ---------- 护体弹（特殊子弹围绕己方旋转） ----------
const ORBIT_RADIUS = 46;       // 轨道半径
const ORBIT_SPEED = 2.2;       // 角速度(弧度/秒)
const ORBIT_RESPAWN = 2.5;     // 被击毁后重生秒数
const ORBIT_GROW_INTERVAL = 30; // 无技能时每 30 秒增长一颗
const ORBIT_MAX_BASE = 2;      // 护体弹数量上限基础值
const ORBIT_MAX_PER_LEVEL = 2; // 每级护体技能 +2 上限

/** 生成一颗护体弹 */
function makeOrbitBullet(player) {
  return {
    angle: Math.random() * TAU,
    respawn: 0,
    dmg: Math.max(1, Math.round(player.power)),
  };
}

/**
 * 维护护体弹：
 * - 初始 1 颗；之后每 ORBIT_GROW_INTERVAL 秒自动 +1 颗（直到上限）
 * - 护体技能每升 1 级，增长间隔减半（30→15→7.5→3.75s），上限 +2
 */
function updateOrbit(player, dt) {
  const guard = player.skills.guard || 0;
  const orbit = player.orbit;
  if (!Array.isArray(orbit)) player.orbit = [];
  if (player.orbitGrowTimer === undefined) player.orbitGrowTimer = 0;

  // 保底 1 颗
  if (player.orbit.length === 0) {
    player.orbit.push(makeOrbitBullet(player));
  }

  // 随时间增长（技能等级越高间隔越短）
  const maxOrbit = ORBIT_MAX_BASE + guard * ORBIT_MAX_PER_LEVEL;
  if (player.orbit.length < maxOrbit) {
    const interval = ORBIT_GROW_INTERVAL / Math.pow(2, guard);
    player.orbitGrowTimer += dt;
    while (player.orbit.length < maxOrbit && player.orbitGrowTimer >= interval) {
      player.orbit.push(makeOrbitBullet(player));
      player.orbitGrowTimer -= interval;
    }
  } else {
    player.orbitGrowTimer = 0;
  }

  for (const ob of player.orbit) {
    if (ob.respawn > 0) {
      ob.respawn -= dt;
      if (ob.respawn <= 0) { ob.angle = Math.random() * TAU; ob.dmg = Math.max(1, Math.round(player.power)); }
      continue;
    }
    ob.angle += ORBIT_SPEED * dt;
    ob.x = player.x + Math.cos(ob.angle) * ORBIT_RADIUS;
    ob.y = player.y + Math.sin(ob.angle) * ORBIT_RADIUS;
  }
}

/** 供碰撞检测读取当前活跃的护体弹（含坐标与伤害） */
export function getOrbitBullets(player) {
  if (!player || !Array.isArray(player.orbit)) return [];
  return player.orbit.filter(o => o.respawn <= 0);
}

/** 命中后移除一颗护体弹（一段时间后重生） */
export function removeOrbitBullet(player, ob) {
  ob.respawn = ORBIT_RESPAWN;
}

/**
 * 执行一次射击（返回生成的子弹参数列表）
 */
export function getShootPattern(player) {
  const lvl = player.power;
  const dmgLv = player.skills.dmg || 0;
  const baseDmg = Math.round((1 + dmgLv) * (player.baseDmgMul || 1));
  const dualLv = player.skills.dual || 0;
  const rapid = player.buffs.rapid > 0;
  const scatterLv = player.skills.scatter || 0;   // 散射：每次发射同时多发
  const volleyLv = player.skills.volley || 0;     // 连射：一前一后多发
  // 爆炸弹行为由 getBulletBehavior(player) 决定（只要 player.skills.explosion>0 全部爆炸），
  // 真正的爆炸在 enemyDeathExplosion 中触发（敌机死亡时按实力缩放），这里不再做预算限制
  const patterns = [];

  // 疯狂追击：全屏散弹 + 连射，子弹向四周 360° 散发并追踪敌机
  if (player.buffs.madHunt > 0) {
    const N = 8;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * TAU;
      addBullet({ angle: ang, dmg: baseDmg * 2, homing: true });
    }
    return patterns; // 主打全屏追踪弹，不再叠加散射/连射/侧翼，控制弹量
  }

  let dirs;
  if (lvl === 1) dirs = [0];
  else if (lvl === 2) dirs = [-0.06, 0.06];
  else if (lvl === 3) dirs = [-0.12, 0, 0.12];
  else dirs = [-0.16, -0.05, 0.05, 0.16];

  const base = [];
  if (rapid) {
    base.push(0);
    for (const d of dirs) base.push(d + 0.22, d - 0.22);
  } else {
    for (const d of dirs) base.push(d);
  }

  function addBullet(b) {
    patterns.push(b);
  }

  // 每根主弹：加上散射（同时、带扩散角）与连射（一前一后）
  for (const d of base) {
    addBullet({ angle: d, dmg: rapid ? baseDmg * 2 : baseDmg });
    for (let k = 1; k <= scatterLv; k++) {
      const off = BULLET.scatterSpread * ((k % 2 === 1) ? 1 : -1) * Math.ceil(k / 2);
      addBullet({ angle: d + off, dmg: rapid ? baseDmg * 2 : baseDmg });
    }
    for (let k = 1; k <= volleyLv; k++) {
      addBullet({
        angle: d,
        dmg: rapid ? baseDmg * 2 : baseDmg,
        x: player.x,
        y: player.y + BULLET.volleySpacing * k,
      });
    }
  }

  if (dualLv > 0) {
    const ox = player.w * 0.6;
    for (let k = 1; k <= dualLv; k++) {
      addBullet({ angle: 0.05, dmg: baseDmg, x: player.x - ox * k, y: player.y + 8 });
      addBullet({ angle: -0.05, dmg: baseDmg, x: player.x + ox * k, y: player.y + 8 });
    }
  }

  return patterns;
}

export function drawPlayer(ctx, player, frame) {
  const { x, y, w, h } = player;
  if (player.invincible > 0 && Math.floor(frame / 4) % 2 === 0) return;

  ctx.save();
  ctx.translate(x, y);

  // 引擎火焰
  const fl = rand(0.6, 1);
  const grad = ctx.createLinearGradient(0, h / 2 - 4, 0, h / 2 + 22);
  grad.addColorStop(0, "#ffd166");
  grad.addColorStop(1, "rgba(255,80,40,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-7, h / 2 - 4);
  ctx.lineTo(7, h / 2 - 4);
  ctx.lineTo(0, h / 2 + 8 + 14 * fl);
  ctx.closePath();
  ctx.fill();

  // 机体
  ctx.fillStyle = "#4cc9f0";
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w / 2, -h / 6);
  ctx.lineTo(w / 2 - 2, h / 4);
  ctx.lineTo(w / 4, h / 3);
  ctx.lineTo(0, h / 2 - 6);
  ctx.lineTo(-w / 4, h / 3);
  ctx.lineTo(-w / 2 + 2, h / 4);
  ctx.lineTo(-w / 2, -h / 6);
  ctx.closePath();
  ctx.fill();

  // 座舱
  ctx.fillStyle = "#a8f0ff";
  ctx.beginPath();
  ctx.ellipse(0, -4, 5, 11, 0, 0, TAU);
  ctx.fill();

  // 机翼线条
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 6); ctx.lineTo(-8, 8);
  ctx.moveTo(w / 2, -h / 6);  ctx.lineTo(8, 8);
  ctx.stroke();

  // 护盾
  if (player.shield > 0) {
    const sr = 32 + (frame % 40) * 0.05;
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#66e0ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, sr, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, sr + 5, frame * 0.06, frame * 0.06 + TAU * (player.shield / player.maxShield));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#66e0ff";
    setf(ctx, "bold 12px 'Courier New', monospace");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(player.shield, 0, -sr - 12);
  }

  // 护体弹
  if (Array.isArray(player.orbit)) {
    for (const ob of player.orbit) {
      if (ob.respawn > 0) continue;
      const lx = ob.x - player.x;
      const ly = ob.y - player.y;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ob.angle + Math.PI / 2);
      ctx.fillStyle = "#7bf1a8";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#7bf1a8";
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}
