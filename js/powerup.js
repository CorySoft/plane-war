/* ===========================================================
 * powerup.js — 道具系统
 * =========================================================== */

import { W, H, POWERUP_DEFS, POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE, SKILLS, POWERUP_DROP, TAU } from "./config.js";
import { rand, weightedPick, setf, clamp, roundRect } from "./utils.js";
import { spawnParticles } from "./particles.js";
import { applySkill } from "./skill.js";
import { sfx } from "./audio.js";
import { addPowerupCollected, discoverPowerup } from "./meta.js";
import { drawSprite } from "./assets.js";
// freeze 通过 player 标记由 game.js 消费；madHunt/xppack 直接操作 buff/标记，无需直接调用

// 经验包：固定保底值 + 按当前升级需求的百分比。
// 纯固定值在后期（升级需求上千）几乎等于没用，故改成与需求挂钩。
const XP_PACK_BASE = 50;
const XP_PACK_RATIO = 0.2;

/** 经验包实际经验值：max(50, 当前升级需求的 20%) */
export function xpPackAmount(xpNeed) {
  return Math.max(XP_PACK_BASE, Math.round((xpNeed || 0) * XP_PACK_RATIO));
}

export let powerups = [];

export let gachaAnim = null;  // { phase: 'rolling'|'reveal', t: number, maxT: number, skill: object, previewSkills: object[] }

/**
 * 生成道具
 * @param {number} x
 * @param {number} y
 * @param {number} [level] 难度等级（决定权重重心）
 * @param {number} [dropBonus] 掉落率加成（爆率技能/+buff/天赋叠加，概率加算）
 */
export function spawnPowerup(x, y, level = 1, dropBonus = 0, isBoss = false) {
  if (Math.random() < POWERUP_DROP.base + dropBonus) {
    let type;
    if (isBoss) {
      type = ["skillup", "randomSkill"][Math.floor(Math.random() * 2)];
    } else {
      const weights = level >= 2 ? POWERUP_WEIGHTS_LATE : POWERUP_WEIGHTS_EARLY;
      type = weightedPick(weights);
    }
    powerups.push({ x, y, vy: 1.8, t: rand(0, TAU), type });
  }
}

export function updatePowerups(dt, player, magnetActive) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += p.vy * dt * 60;
    p.t += dt;
    if (p.y > H + 20) { powerups.splice(i, 1); continue; }

    // 磁铁吸引
    if (magnetActive) {
      const d = Math.hypot(player.x - p.x, player.y - p.y);
      const range = player.buffs.magnet > 0 ? 200 : 120;
      if (d < range && d > 1) {
        const pull = 6 * dt * 60;
        p.x += (player.x - p.x) / d * pull;
        p.y += (player.y - p.y) / d * pull;
      }
    }

    // 拾取
    const d2 = Math.hypot(player.x - p.x, player.y - p.y);
    if (d2 < 32) {
      applyPowerup(p, player);
      powerups.splice(i, 1);
      addPowerupCollected();
    }
  }
}

export function applyPowerup(p, player) {
  discoverPowerup(p.type);
  const { type } = p;
  const def = POWERUP_DEFS[type];
  if (type === "power") {
    player.power = Math.min(4, player.power + 1);
    player.powerTime = 15;
  } else if (type === "life") {
    player._addLife = true;
  } else if (type === "shield") {
    player.shield = Math.min(player.maxShield, player.shield + 1);
  } else if (type === "madHunt") {
    player.buffs.madHunt = 8;
  } else if (type === "rapid") {
    player.buffs.rapid = 8;
  } else if (type === "speed") {
    player.buffs.speed = 8;
  } else if (type === "freeze") {
    player._freeze = true;
  } else if (type === "magnet") {
    player.buffs.magnet = 8;
  } else if (type === "double") {
    player.buffs.double = 8;
  } else if (type === "xppack") {
    player._xpPack = true;   // 具体数值由 game.js 按当前 xpNeed 折算
  } else if (type === "drop") {
    player.buffs.drop = 8;
  } else if (type === "critboost") {
    player.buffs.critboost = 8;
  } else if (type === "knockback") {
    player.buffs.knockback = 8;
  } else if (type === "skillup") {
    const sk = pickUpgradableSkill(player.skills);
    if (!sk) {
      player._toast = { text: "技能已全部满级", t: 1.4, color: def.color };
      sfx.pickup();
      return;
    }
    const t = applySkill(sk, player);
    player._toast = t;
    setGachaAnim(sk, "skillup");
    spawnParticles(p.x, p.y, def.color, 30, 8);
    sfx.power();
    return;
  } else if (type === "randomSkill") {
    const sk = pickAnySkill(player.skills);
    if (!sk) {
      player._toast = { text: "技能已全部满级", t: 1.4, color: def.color };
      sfx.pickup();
      return;
    }
    const t = applySkill(sk, player);
    player._toast = t;
    setGachaAnim(sk, "randomSkill");
    spawnParticles(p.x, p.y, def.color, 30, 8);
    sfx.power();
    return;
  }
  sfx.pickup();
  spawnParticles(p.x, p.y, def.color, 16, 4.5);
  player._toast = { text: def.name, t: 1.2, color: def.color };
}

function unlockedSkill(s, playerSkills) {
  return !s.requires || (playerSkills[s.requires] || 0) > 0;
}

// 随机选择一个“可升级技能”：优先从已拥有的技能里升，若一个没有（或全部满级）
// 则随机授予一个未满级的新技能，保证道具永远有效。
function pickUpgradableSkill(playerSkills) {
  const owned = SKILLS.filter(s => {
    const cur = playerSkills[s.id] || 0;
    return cur > 0 && cur < s.max && unlockedSkill(s, playerSkills);
  });
  if (owned.length > 0) return owned[Math.floor(Math.random() * owned.length)];
  const pool = SKILLS.filter(s => (playerSkills[s.id] || 0) < s.max && unlockedSkill(s, playerSkills));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 随机获取一个任意技能（未满级即可，可能是全新技能） */
function pickAnySkill(playerSkills) {
  const pool = SKILLS.filter(s => (playerSkills[s.id] || 0) < s.max && unlockedSkill(s, playerSkills));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function drawPowerups(ctx) {
  for (const p of powerups) {
    const def = POWERUP_DEFS[p.type];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(p.t * 3) * 0.2);
    ctx.shadowBlur = 14;
    ctx.shadowColor = def.color;
    
    // 技能类道具特效（金色光柱+粒子）
    if (def.unique) {
      // 金色光柱
      const pillarH = 80 + Math.sin(p.t * 4) * 8;
      const grad = ctx.createLinearGradient(0, -pillarH, 0, 0);
      grad.addColorStop(0, "rgba(255,215,0,0)");
      grad.addColorStop(0.5, "rgba(255,215,0,0.25)");
      grad.addColorStop(1, "rgba(255,215,0,0.6)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(-4, -pillarH);
      ctx.lineTo(4, -pillarH);
      ctx.lineTo(8, 0);
      ctx.closePath();
      ctx.fill();
      
      // 旋转粒子环
      const particleCount = 8;
      for (let i = 0; i < particleCount; i++) {
        const a = p.t * 3 + i * Math.PI * 2 / 8;
        const r = 22 + Math.sin(p.t * 2 + i) * 3;
        ctx.fillStyle = "#ffd700";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // 六边形底板
    ctx.fillStyle = "rgba(10,14,25,.85)";
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = Math.cos(a) * 16, py = Math.sin(a) * 16;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 图标：优先贴图（24px 霓虹图标），缺图回退原来的单字母
    if (!drawSprite(ctx, "powerup_" + p.type, 0, 1, 26, 26)) {
      ctx.fillStyle = def.color;
      setf(ctx, "bold 15px monospace");
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.icon, 0, 1);
    }
    ctx.restore();
  }
}

export function clearPowerups() {
  powerups = [];
}

function getSkillIcon(skill) {
  return (skill.icon || skill.id.charAt(0)).toUpperCase();
}

/**
 * 抽奖滚动池：真实技能 id。顺序即 `skill_<id>` 贴图的对应关系，
 * 贴图缺失时回退各自的单字母图标。
 */
export const GACHA_SKILL_POOL_IDS = [
  "dmg", "rate", "move", "lifesteal", "explosion", "knockback",
  "shield", "crit", "split", "penetrate", "volley", "scatter",
];

function buildGachaPool() {
  return GACHA_SKILL_POOL_IDS.map((id) => {
    const s = SKILLS.find((x) => x.id === id);
    return s
      ? { id, icon: getSkillIcon(s), name: s.name, color: s.color, desc: s.desc }
      : { id, icon: id.charAt(0).toUpperCase(), name: id, color: "#5ee6ff", desc: "" };
  });
}

export function setGachaAnim(skill, subtype) {
  const displaySkill = Object.assign({}, skill, { icon: getSkillIcon(skill) });
  const pool = buildGachaPool();
  const lh = 26;
  const slots = 28;
  const previewSkills = [];
  for (let i = 0; i < slots; i++) {
    previewSkills.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  previewSkills.push(displaySkill);
  gachaAnim = {
    phase: "rolling",
    t: 2.0,
    maxT: 2.0,
    skill: displaySkill,
    subtype,
    previewSkills,
    lineHeight: lh,
    totalScroll: slots * lh,
    rollOffset: 0,
    revealT: 0,
  };
}

export function getGachaAnim() {
  return gachaAnim;
}

export function clearGachaAnim() {
  gachaAnim = null;
}

export function updateGachaAnim(dt) {
  if (!gachaAnim) return;
  const a = gachaAnim;
  if (a.phase === "rolling") {
    a.t -= dt;
    const progress = clamp(1 - a.t / a.maxT, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    a.rollOffset = eased * a.totalScroll;
    if (a.t <= 0) {
      a.phase = "reveal";
      a.rollOffset = a.totalScroll;
      a.revealT = 0;
    }
  } else if (a.phase === "reveal") {
    a.revealT = Math.min(a.revealT + dt, 1);
  }
}

export function drawGachaAnim(ctx) {
  if (!gachaAnim) return;
  const anim = gachaAnim;
  const color = anim.skill.color;
  const title = anim.subtype === "skillup" ? "技能升级" : "技能随机获取";
  const lh = anim.lineHeight;

  ctx.globalAlpha = 0.82;
  ctx.fillStyle = "rgba(5,7,15,.8)";
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const cw = Math.min(280, W - 80), ch = 170;
  const cx = W / 2 - cw / 2, cy = H * 0.38 - ch / 2;
  ctx.fillStyle = "rgba(24,32,52,.98)";
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 3;
  roundRect(ctx, cx, cy, cw, ch, 14);
  ctx.fill(); ctx.stroke();

  ctx.strokeStyle = "rgba(255,215,0,.4)";
  ctx.lineWidth = 1;
  roundRect(ctx, cx - 3, cy - 3, cw + 6, ch + 6, 16);
  ctx.stroke();

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.fillStyle = "#ffd700";
  setf(ctx, "bold 18px 'sans-serif'");
  ctx.fillText(title, W / 2, cy + 26);

  if (anim.phase === "rolling") {
    const centerY = cy + 80;
    const visRange = 2;

    ctx.fillStyle = "rgba(255,215,0,.12)";
    ctx.fillRect(cx + 20, centerY - lh, cw - 40, lh * 2);
    ctx.strokeStyle = "rgba(255,215,0,.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + 20, centerY - lh, cw - 40, lh * 2);

    const offset = anim.rollOffset;
    const baseIdx = Math.floor(offset / lh);
    const subOffset = offset % lh;

    for (let i = -visRange; i <= visRange + 1; i++) {
      const idx = ((baseIdx + i) % anim.previewSkills.length + anim.previewSkills.length) % anim.previewSkills.length;
      const sk = anim.previewSkills[idx];
      const dy = i * lh - subOffset;
      if (Math.abs(dy) > lh * (visRange + 1)) continue;
      const dist = Math.abs(dy) / lh;
      const opacity = Math.max(0, 1 - dist * 0.35);
      ctx.globalAlpha = opacity;
      // 技能贴图，缺图回退字母
      if (!drawSprite(ctx, "skill_" + (sk.id || ""), cx + 32, centerY + dy, 16, 16)) {
        ctx.fillStyle = "#fff";
        setf(ctx, "bold 14px monospace");
        ctx.fillText(sk.icon, cx + 32, centerY + dy);
      }
      ctx.fillStyle = sk.color;
      setf(ctx, "13px 'sans-serif'");
      ctx.fillText(sk.name, W / 2, centerY + dy);
    }
    ctx.globalAlpha = 1;
  } else {
    const rp = anim.revealT;

    for (let i = 0; i < 3; i++) {
      const ringP = clamp(rp * 2 + i * 0.15, 0, 1);
      const radius = 30 + ringP * 60;
      ctx.globalAlpha = (1 - ringP) * 0.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 * (1 - ringP) + 0.5;
      ctx.beginPath();
      ctx.arc(W / 2, cy + 65, radius, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const iconScale = clamp(rp * 2.5, 0, 1);
    ctx.save();
    ctx.translate(W / 2, cy + 60);
    ctx.scale(iconScale, iconScale);
    ctx.fillStyle = "#ffd700";
    setf(ctx, "bold 42px monospace");
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#ffd700";
    if (!drawSprite(ctx, "skill_" + (anim.skill.id || ""), 0, 0, 44, 44)) {
      ctx.fillText(anim.skill.icon, 0, 0);
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.globalAlpha = clamp((rp - 0.15) * 2.5, 0, 1);
    ctx.fillStyle = "#fff";
    setf(ctx, "bold 20px 'sans-serif'");
    ctx.fillText(anim.skill.name, W / 2, cy + 100);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = clamp((rp - 0.3) * 2.5, 0, 1);
    ctx.fillStyle = "rgba(255,255,255,.65)";
    setf(ctx, "11px 'sans-serif'");
    ctx.fillText(anim.skill.desc, W / 2, cy + 122);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = clamp((rp - 0.45) * 2.5, 0, 1);
    ctx.fillStyle = "#ffd700";
    setf(ctx, "bold 13px 'sans-serif'");
    ctx.fillText("恭喜获得", W / 2, cy + 148);
    ctx.globalAlpha = 1;

    const particleCount = 10;
    for (let i = 0; i < particleCount; i++) {
      const a = rp * Math.PI * 4 + i * Math.PI * 2 / particleCount;
      const r = 30 + rp * 55;
      const px = W / 2 + Math.cos(a) * r;
      const py = cy + 65 + Math.sin(a) * r;
      ctx.fillStyle = "#ffd700";
      ctx.globalAlpha = 0.8 - rp * 0.2;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const blink = 0.5 + 0.5 * Math.sin(performance.now() / 250);
    ctx.globalAlpha = blink;
    ctx.fillStyle = "#5ee6ff";
    setf(ctx, "bold 16px 'sans-serif'");
    ctx.fillText("点击任意处继续", W / 2, cy + ch + 42);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#ffd700";
  setf(ctx, "bold 11px monospace");
  ctx.fillText("★ RARE ★", W / 2, cy + ch + 14);
}
