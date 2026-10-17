/* ===========================================================
 * player.js — 玩家逻辑 + 渲染
 * =========================================================== */

import { W, H, PLAYER_BASE, BULLET, TAU, refireGateDistance, calcFireRate, META } from "./config.js";
import { clamp, rand, setf } from "./utils.js";
import { pressed, getStickDir } from "./input.js";
import { drawSpriteNose } from "./assets.js";

export function createPlayer(aircraftCfg, talentEffects, shopEffects) {
  const base = { ...PLAYER_BASE, startHp: PLAYER_BASE.startLives };
  // 属性倍率（飞机 / 天赋叠加）
  let baseDmgMul = 1;
  let fireRateMul = 1;
  let talentDmg = 0;
  let talentCrit = 0;
  const startSkills = {};

  // 应用飞机加成（speed 兜底：残缺配置会导致 undefined×dt=NaN，战机直接消失）
  if (aircraftCfg) {
    base.speed = aircraftCfg.speed ?? PLAYER_BASE.speed;
    base.startHp = aircraftCfg.startHp ?? PLAYER_BASE.startLives;
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
    talentDmg += talentEffects.baseDmg || 0;
    talentCrit += talentEffects.critAdd || 0;
    fireRateMul *= (talentEffects.fireRateMul || 1);
    if (talentEffects.startRange) {
      startSkills.range = (startSkills.range || 0) + Math.round(talentEffects.startRange / BULLET.rangePerLevel);
    }
  }

  // 应用商店加成
  if (shopEffects) {
    base.startHp += (shopEffects.startHp || 0);
    base.invincibleTime += (shopEffects.invTime || 0);
    if (shopEffects.maxShield) base.maxShield += shopEffects.maxShield;
    baseDmgMul += (shopEffects.baseDmg || 0);
    fireRateMul *= (shopEffects.fireRateMul || 1);
  }

  return {
    x: W / 2,
    y: H - 160,
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
    talentDmg,
    talentCrit,
    fireRateMul,
    buffs: { rapid: 0, speed: 0, freeze: 0, magnet: 0, double: 0, madHunt: 0, drop: 0, critboost: 0, knockback: 0 },
    skills: { ...startSkills },
    orbit: [],   // 护体弹：围绕玩家旋转的特殊子弹

    // 当前战机 id（供贴图选择）：getSelectedAircraftConfig 带 id；
    // 直接传 META.aircraft.x 原始配置（测试/旧调用）时按引用反查，再回退 falcon
    aircraftId: aircraftCfg?.id
      || Object.entries(META.aircraft).find(([, c]) => c === aircraftCfg)?.[0]
      || "falcon",

    // 内部事件标记（由 update 消费）
    _addLife: false,
    _freeze: false,
    _heal: 0,
    _toast: null,
  };
}

export function updatePlayer(dt, player, refireDist = 0, maxTraveled = 0) {
  player.y = H - 160;
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

  // 射击冷却（应用飞机/天赋射速倍率），公式统一走 calcFireRate
  const fireRate = calcFireRate(player);
  if (player.fireCd > 0) player.fireCd -= dt;
  // 距离/销毁触发：上一发主弹飞行超过闸门距离或已销毁（无主弹在屏）即可再射。
  // 闸门距离与射击间隔联动（refireGateDistance）：射速越快波间距越小。
  // 旧实现固定 250px，射速技能/急速道具会被飞行距离闸门完全抵消，
  // 且实际节奏取决于子弹何时销毁，后期表现为「发射越来越不规律」。
  const gate = refireDist > 0 ? refireDist : refireGateDistance(fireRate);
  const mainInFlight = maxTraveled > 0;
  const refireReady = !mainInFlight || maxTraveled >= gate;
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
  for (const k of ["rapid", "speed", "magnet", "double", "madHunt", "drop", "critboost", "knockback"]) {
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
const ORBIT_MAX_BASE = 0;      // 无护体技能时不生成护体弹
const ORBIT_MAX_PER_LEVEL = 1; // 每级护体技能上限 1+level（1级2颗…满级6颗）

/**
 * 护体弹伤害：随火力等级与「火力强化」技能成长。
 * 旧实现只取 round(power)，1 级火力时仅 1 点，护体弹几乎只是装饰。
 */
export function orbitDamage(player) {
  const power = Math.max(1, Math.round(player.power || 1));
  const dmgSkill = player.skills?.dmg || 0;
  return Math.max(2, power + Math.round(dmgSkill * 0.5));
}

/** 生成一颗护体弹 */
function makeOrbitBullet(player) {
  return {
    angle: Math.random() * TAU,
    respawn: 0,
    dmg: orbitDamage(player),
  };
}

/**
 * 维护护体弹：
 * - 无护体技能时不生成；有技能时立即生成 1 颗保底
 * - 之后每 ORBIT_GROW_INTERVAL 秒自动 +1 颗（直到上限）
 * - 护体技能每升 1 级，增长间隔线性缩短（30→26→22→18→10s），上限 +1（1级2颗…满级6颗）
 */
function updateOrbit(player, dt) {
  const guard = player.skills.guard || 0;
  const orbit = player.orbit;
  if (!Array.isArray(orbit)) player.orbit = [];
  if (player.orbitGrowTimer === undefined) player.orbitGrowTimer = 0;

  const maxOrbit = (guard > 0 ? 1 : 0) + guard * ORBIT_MAX_PER_LEVEL;

  // 保底：仅在有护体技能时才初始生成
  if (maxOrbit > 0 && player.orbit.length === 0) {
    player.orbit.push(makeOrbitBullet(player));
  }

  if (player.orbit.length < maxOrbit) {
    // 下限保护：间隔若被压到 0 会让下面的 while 死循环
    const interval = Math.max(4, ORBIT_GROW_INTERVAL - guard * 4);   // 线性缩短，避免指数爆量
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
      if (ob.respawn <= 0) { ob.angle = Math.random() * TAU; ob.dmg = orbitDamage(player); }
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
  // 护体技能越高，补充越快（2.5s → 满级 1.3s），让高等级护体真有续航感
  const guard = player?.skills?.guard || 0;
  ob.respawn = Math.max(1.3, ORBIT_RESPAWN - guard * 0.24);
}

/**
 * 连射子弹的角度偏移系数序列（单位：volleyAngleGap × (volleyLv+0.5)）。
 * 规则：成对左右展开（±1、±2…），永不取 0（0 会与主弹重合）；
 * 奇数级多出的一发左右交替，避免长期偏向一侧。
 */
export function volleyOffsets(volleyLv, player) {
  const n = Math.max(0, Math.floor(volleyLv));
  if (n <= 0) return [];
  const offs = [];
  for (let i = 1; offs.length < n; i++) {
    offs.push(i);
    if (offs.length < n) offs.push(-i);
  }
  if (n % 2 === 1) {
    // 多出的一发在 + 侧，整体符号按射击次数交替
    const flip = !!(player && player._volleyFlip);
    if (player) player._volleyFlip = !flip;
    if (flip) return offs.map(v => -v);
  }
  return offs;
}

/**
 * 执行一次射击（返回生成的子弹参数列表）
 */
export function getShootPattern(player) {
  const lvl = player.power;
  const dmgLv = player.skills.dmg || 0;
  const baseDmg = Math.round((1 + dmgLv + (player.talentDmg || 0)) * (player.baseDmgMul || 1));
  const dualLv = Math.min(player.skills.dual || 0, 4);   // 侧翼炮上限 4
  const rapid = player.buffs.rapid > 0;
  const scatterLv = player.skills.scatter || 0;   // 散射：每通道左右对称 ±k 展开
  const volleyLv = player.skills.volley || 0;     // 连射：每通道微扇收束于主弹道
  const patterns = [];

  // 疯狂追击：保持现状——全屏 360° 追踪雨（时限道具）
  if (player.buffs.madHunt > 0) {
    const baseDirs = 8 + scatterLv * 2;
    const volleyCount = volleyLv;
    function addA(b) { patterns.push(b); }
    for (let k = 0; k < baseDirs; k++) {
      const ang = (k / baseDirs) * TAU;
      addA({ angle: ang, dmg: baseDmg * 3, homing: true });
      for (let v = 1; v <= volleyCount; v++) {
        const t = (v / (volleyCount + 1)) - 0.5;
        addA({
          angle: ang + t * BULLET.volleyAngleGap * (volleyCount + 0.5),
          dmg: baseDmg * 2,
          homing: true,
        });
      }
    }
    return patterns;
  }

  // 主弹道：按火力等级对称等距（比旧 0.16 更紧凑，队形更整齐）
  let dirs;
  if (lvl <= 1) dirs = [0];
  else if (lvl === 2) dirs = [-0.05, 0.05];
  else if (lvl === 3) dirs = [-0.10, 0, 0.10];
  else dirs = [-0.12, -0.04, 0.04, 0.12];

  // 通道：急速时每条通道拆成左右 ±0.10 双轨，整齐错位两列（替代旧 ±0.22 乱跳）
  const channels = [];
  if (rapid) {
    for (const d of dirs) { channels.push(d - 0.10); channels.push(d + 0.10); }
  } else {
    for (const d of dirs) channels.push(d);
  }

  const cap = BULLET.waveCap;
  const rapidMul = rapid ? 2 : 1;   // 急速主弹伤害翻倍，维持爆发感
  const sdmg = Math.round(baseDmg * 0.5 * rapidMul);  // 散射弹降权
  const vdmg = Math.round(baseDmg * 0.6 * rapidMul);  // 连射弹降权

  function addBullet(b) { patterns.push(b); }

  // ---- 副武器先预算名额 ----
  // 旧实现先填满主弹道再补副炮，结果是散射/连射一上来就把 16 发吃光，
  // 侧翼炮与左右护法在高火力下永远 0 发、技能完全失效。
  // 这里改成先算出副武器要占的额度（成对计），剩余才是主弹道的配额。
  const sideBulletsLv = player.skills.sideBullets || 0;
  const sidePairs = [];
  if (dualLv > 0 || sideBulletsLv > 0) {
    const ox1 = player.w * 0.6;
    const ox2 = player.w * 0.55;
    const sideDmg = Math.max(baseDmg + 1, Math.round(baseDmg * (1 + 0.3 * sideBulletsLv)));
    const sideSpd = BULLET.baseSpeed * 0.5;
    // 侧翼炮与左右护法交错排队，两条技能线都不会被对方饿死
    const n = Math.max(dualLv, sideBulletsLv);
    for (let k = 1; k <= n; k++) {
      if (k <= dualLv) {
        sidePairs.push([
          { angle: 0.05, dmg: baseDmg, x: player.x - ox1 * k, y: player.y + 8 },
          { angle: -0.05, dmg: baseDmg, x: player.x + ox1 * k, y: player.y + 8 },
        ]);
      }
      if (k <= sideBulletsLv) {
        sidePairs.push([
          { angle: -Math.PI / 2, dmg: sideDmg, x: player.x - ox2 * k, y: player.y + 4, spd: sideSpd },
          { angle: Math.PI / 2, dmg: sideDmg, x: player.x + ox2 * k, y: player.y + 4, spd: sideSpd },
        ]);
      }
    }
  }
  // 主弹道至少保留每个通道 1 发，避免副武器把主弹挤没
  const reserve = Math.min(cap - channels.length, sidePairs.length * 2);
  const mainCap = Math.max(channels.length, cap - Math.max(0, reserve));
  const perCh = Math.max(1, Math.floor(mainCap / channels.length));

  // 散射左右交替：每级只加 1 发（保持"升级多一颗"），但整组符号按射击次数翻转，
  // 使奇数级天生偏向一侧的弹道在相邻两轮之间左右互补，长期不再右偏。
  // 旧实现固定 +0.06/-0.12/+0.18…，被 perCh 裁剪后只剩最近的一发，整组齐刷刷右偏。
  const scatterSign = player._scatterFlip ? -1 : 1;
  player._scatterFlip = !player._scatterFlip;

  for (const d of channels) {
    const entries = [];
    entries.push({ ang: d, dmg: baseDmg * rapidMul, off: 0 });
    // 散射：每升 1 级只加 1 发，随等级向两侧扇形铺开
    for (let k = 1; k <= scatterLv; k++) {
      const sign = k % 2 === 1 ? 1 : -1;
      entries.push({ ang: d + scatterSign * sign * k * BULLET.scatterSpread, dmg: sdmg, off: k * BULLET.scatterSpread });
    }
    // 连射：紧贴主弹道的等间距小扇，偏移量恒不为 0（避免与主弹完全重合形成隐形弹）。
    // 成对左右展开；奇数级多出的那一发左右交替，长期保持视觉对称。
    const volleyOffs = volleyOffsets(volleyLv, player);
    for (const t of volleyOffs) {
      const off = Math.abs(t) * BULLET.volleyAngleGap * (volleyLv + 0.5);
      entries.push({ ang: d + t * BULLET.volleyAngleGap * (volleyLv + 0.5), dmg: vdmg, off });
    }
    // 按「相对本通道的偏移量」排序后裁剪到 perCh 层：
    // 先留中心主弹，再成对保留同偏移的左右两发（宁可少留也不破坏对称）。
    // 偏移按 1e-6 微弧圆整配对，规避浮点尾差。
    entries.sort((a, b) => a.off - b.off);
    const kept = [];
    for (let i = 0; i < entries.length && kept.length < perCh; i++) {
      const e = entries[i];
      if (kept.includes(e)) continue;                     // 已随对称对入列
      if (e.off === 0) { kept.push(e); continue; }
      const mate = entries.find(x => x !== e && Math.abs(x.off - e.off) < 1e-6 && !kept.includes(x));
      if (kept.length + (mate ? 2 : 1) <= perCh) {
        kept.push(e);
        if (mate) kept.push(mate);
      } else {
        break;
      }
    }
    for (const e of kept) addBullet({ angle: e.ang, dmg: e.dmg });
  }

  // 副武器补齐（双双成对，永不拆单）
  for (const pair of sidePairs) {
    if (patterns.length + 2 > cap) break;
    addBullet(pair[0]);
    addBullet(pair[1]);
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

  // 机体：优先贴图（Agnes 生成），未加载/失败则回退程序化绘制。
  // void_ 的贴图文件名是 player_void（资产清单里已去掉尾下划线）
  // 机鼻锚定到 -h/2：与子弹出膛点（js/bullet.js `player.y - player.h/2`）同一条线，
  // 各机型留白不同也不会再出现「枪口不在中轴/子弹脱空」。
  const spriteId = "player_" + String(player.aircraftId || "falcon").replace(/_$/, "");
  const skinned = drawSpriteNose(ctx, spriteId, 0, -h / 2, h * 1.1, w * 1.4);
  if (!skinned) {
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
  }

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
