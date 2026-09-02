/* ===========================================================
 * powerup.js — 道具系统
 * =========================================================== */

import { W, H, POWERUP_DEFS, POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE, SKILLS, POWERUP_DROP, TAU } from "./config.js";
import { rand, weightedPick, setf } from "./utils.js";
import { spawnParticles } from "./particles.js";
import { applySkill } from "./skill.js";
import { sfx } from "./audio.js";
import { addPowerupCollected } from "./meta.js";
// freeze 通过 player 标记由 game.js 消费；madHunt/xppack 直接操作 buff/标记，无需直接调用

const XP_PACK_XP = 50;    // 经验包固定经验值

export let powerups = [];

/**
 * 生成道具
 * @param {number} x
 * @param {number} y
 * @param {number} [level] 难度等级（决定权重重心）
 * @param {number} [dropBonus] 掉落率加成（爆率技能/+buff/天赋叠加，概率加算）
 */
export function spawnPowerup(x, y, level = 1, dropBonus = 0) {
  if (Math.random() < POWERUP_DROP.base + dropBonus) {
    const weights = level >= 2 ? POWERUP_WEIGHTS_LATE : POWERUP_WEIGHTS_EARLY;
    const type = weightedPick(weights);
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
  const { type } = p;
  const def = POWERUP_DEFS[type];
  if (type === "power") {
    player.power = Math.min(4, player.power + 1);
    player.powerTime = 15;
  } else if (type === "life") {
    // lives 由外部 Game 对象管理
    player._addLife = true;
  } else if (type === "shield") {
    player.shield = Math.min(player.maxShield, player.shield + 1);
  } else if (type === "madHunt") {
    player.buffs.madHunt = 8; // 疯狂追击：8秒
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
    player._xp = XP_PACK_XP;
  } else if (type === "drop") {
    player.buffs.drop = 8; // 幸运爆率：8秒内掉落率大幅提升
  } else if (type === "critboost") {
    player.buffs.critboost = 8; // 致命暴击：8秒内必定暴击且伤害倍率提升
  } else if (type === "skillup") {
    const sk = pickUpgradableSkill(player.skills);
    if (!sk) return;
    const t = applySkill(sk, player);   // 会播放拾取音效并返回提示
    player._toast = t;
    spawnParticles(p.x, p.y, def.color, 16, 4.5);
    return;
  }
  sfx.pickup();
  spawnParticles(p.x, p.y, def.color, 16, 4.5);
  player._toast = { text: def.name, t: 1.2, color: def.color };
}

// 随机选择一个“可升级技能”：优先从已拥有的技能里升，若一个没有（或全部满级）
// 则随机授予一个未满级的新技能，保证道具永远有效。
function pickUpgradableSkill(playerSkills) {
  const owned = SKILLS.filter(s => {
    const cur = playerSkills[s.id] || 0;
    return cur > 0 && cur < s.max;
  });
  if (owned.length > 0) return owned[Math.floor(Math.random() * owned.length)];
  const pool = SKILLS.filter(s => (playerSkills[s.id] || 0) < s.max);
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
    // 图标
    ctx.fillStyle = def.color;
    setf(ctx, "bold 15px monospace");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(def.icon, 0, 1);
    ctx.restore();
  }
}

export function clearPowerups() {
  powerups = [];
}
