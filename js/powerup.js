/* ===========================================================
 * powerup.js — 道具系统
 * =========================================================== */

import { W, H, POWERUP_DEFS, POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE, TAU } from "./config.js";
import { rand, weightedPick, setf } from "./utils.js";
import { spawnParticles } from "./particles.js";
import { sfx } from "./audio.js";
// bomb/freeze 通过 player 标记由 game.js 消费，无需直接调用

export let powerups = [];

export function spawnPowerup(x, y, level = 1) {
  if (Math.random() < 0.15) {
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
  } else if (type === "bomb") {
    player._bomb = true;
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
  }
  sfx.pickup();
  spawnParticles(p.x, p.y, def.color, 16, 4.5);
  player._toast = { text: def.name, t: 1.2, color: def.color };
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
