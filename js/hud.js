/* ===========================================================
 * hud.js — HUD 绘制
 * =========================================================== */

import { W, H } from "./config.js";
import { clamp, roundRect, setf } from "./utils.js";

export function drawHUD(ctx, { score, best, level, enemyLevel, pLevel, xp, xpNeed, lives, maxLives, combo, player, frame }) {
  // 分数
  ctx.fillStyle = "#5ee6ff";
  setf(ctx, "bold 22px 'sans-serif'");
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText("得分", 16, 14);
  setf(ctx, "bold 30px 'Courier New', monospace");
  ctx.fillStyle = "#fff";
  ctx.fillText(String(score).padStart(6, "0"), 16, 38);

  // 最高分
  setf(ctx, "13px 'sans-serif'");
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillText("最高 " + String(best).padStart(6, "0"), 16, 76);

  // 难度等级（右侧贴边，与左侧得分区对称；暂停按钮已移到顶部居中）
  const rEdge = W - 16;
  ctx.textAlign = "right";
  setf(ctx, "bold 16px 'sans-serif'");
  ctx.fillStyle = "#ffd166";
  ctx.fillText("难度 Lv." + level, rEdge, 12);

  // 玩家等级
  ctx.fillStyle = "#8ad4ff";
  ctx.fillText("等级 Lv." + pLevel, rEdge, 30);

  // 经验条（紧跟等级下方）
  const xpW = 90, xpH = 5;
  const xpY = 48;
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.fillRect(rEdge - xpW, xpY, xpW, xpH);
  ctx.fillStyle = "#8ad4ff";
  ctx.fillRect(rEdge - xpW, xpY, xpW * clamp(xp / xpNeed, 0, 1), xpH);
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rEdge - 0.5 - xpW, xpY + 0.5, xpW - 1, xpH - 1);

  // 敌方等级
  ctx.fillStyle = "#ff6b6b";
  ctx.fillText("敌方 Lv." + enemyLevel, rEdge, 62);

  // 连击
  if (combo >= 3) {
    ctx.fillStyle = combo >= 8 ? "#ff6b6b" : "#ffd166";
    setf(ctx, "bold 18px 'sans-serif'");
    ctx.textAlign = "right";
    ctx.fillText("连击 ×" + combo, rEdge, 82);
  }

  // 生命
  ctx.textAlign = "left";
  for (let i = 0; i < lives; i++) {
    ctx.fillStyle = "#ff6b9d";
    setf(ctx, "22px sans-serif");
    ctx.fillText("♥", 18 + i * 26, H - 34);
  }

  // 火力等级
  ctx.textAlign = "right";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillStyle = player.power >= 4 ? "#ffd166" : "rgba(255,255,255,.5)";
  ctx.fillText("火力 " + player.power + "/4", W - 16, H - 30);

  // 射程指示（以米为单位，1米 = 25 像素）
  ctx.textAlign = "left";
  const rangeLvl = player.skills.range || 0;
  const levelBonus = ((player.level || 1) - 1) * 2.5;
  const rangePx = Math.min(250 + rangeLvl * 50 + levelBonus, H + 80);
  const rangeM = Math.round(rangePx / 25);
  const rangeText = "射程 " + rangeM + "m";
  ctx.fillStyle = rangeLvl > 0 ? "#88ddff" : "rgba(255,255,255,.35)";
  ctx.fillText(rangeText, 18, H - 56);

  // 子弹行为指示
  const behavior = getBehaviorLabel(player);
  if (behavior) {
    ctx.fillStyle = behavior.color;
    ctx.fillText(behavior.label, 18, H - 72);
  }

  // buff 状态条
  const activeBuffs = [];
  if (player.buffs.rapid > 0) activeBuffs.push(["rapid", "⚡急速", "#ffe066", 8, player.buffs.rapid]);
  if (player.buffs.speed > 0) activeBuffs.push(["speed", "»加速", "#9be8ff", 8, player.buffs.speed]);
  if (player.buffs.double > 0) activeBuffs.push(["double", "双倍", "#ffa8d9", 8, player.buffs.double]);
  if (player.shield > 0) activeBuffs.push(["shield", "护盾", "#66e0ff", player.maxShield, player.shield]);
  if ((player.skills.magnet || 0) > 0 && player.buffs.magnet <= 0) activeBuffs.push(["magnet", "磁力", "#d0a6ff", 1, 1]);
  if (player.powerTime > 0) activeBuffs.push(["power", "火力", "#ffd166", 15, player.powerTime]);
  if (player.buffs.madHunt > 0) activeBuffs.push(["madHunt", "追击", "#fca311", 8, player.buffs.madHunt]);
  if (player.buffs.drop > 0) activeBuffs.push(["drop", "☘爆率", "#ffd93b", 8, player.buffs.drop]);
  if (player.buffs.critboost > 0) activeBuffs.push(["critboost", "致命", "#ff8fa3", 8, player.buffs.critboost]);
  if (player.buffs.knockback > 0) activeBuffs.push(["knockback", "»击退", "#5ee6ff", 8, player.buffs.knockback]);

  let bx = 16;
  const len = activeBuffs.length;
  // 竖屏窄屏(W<480)时压缩条宽，避免 buff 条溢出右侧
  const slot = len > 0 ? (W - 32 - (len - 1) * 6) / len : 0;
  const w = Math.min(74, Math.max(44, slot));
  for (const [key, label, color, total, remain] of activeBuffs) {
    if (bx + w > W - 6) break;
    ctx.fillStyle = "rgba(255,255,255,.1)";
    ctx.fillRect(bx, H - 96, w, 16);
    ctx.fillStyle = color;
    ctx.fillRect(bx, H - 96, w * clamp(remain / total, 0, 1), 16);
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, H - 95.5, w - 1, 15);
    ctx.fillStyle = "#fff";
    setf(ctx, "bold 11px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, bx + w / 2, H - 88);
    bx += w + 6;
  }
}

function getBehaviorLabel(player) {
  const s = player.skills;
  let label = null;
  if (s.penetrate > 0) label = { label: "◆穿透 " + s.penetrate + "级", color: "#aa66ff" };
  else if (s.explosion > 0) {
    const ch = s.expChance || 0, dm = s.expDmg || 0, rn = s.expRange || 0;
    label = { label: "◆爆炸 " + ch + "/" + dm + "/" + rn, color: "#ff6633" };
  }
  else if (s.split > 0) label = { label: "◆分裂 " + s.split + "级", color: "#7bd67b" };
  const extras = [];
  if ((s.orbital || 0) > 0) extras.push("天基" + s.orbital + "级");
  if ((s.bulletSpeed || 0) > 0) extras.push("弹速" + s.bulletSpeed + "级");
  if ((s.volley || 0) > 0) extras.push("连射" + s.volley + "级");
  if ((s.scatter || 0) > 0) extras.push("散射" + s.scatter + "级");
  if (extras.length > 0) {
    if (!label) label = { label: "", color: "#fff" };
    label.label = (label.label ? label.label + "  " : "") + extras.join(" ");
    if ((s.sideBullets || 0) > 0) label.label += " 左右护法" + s.sideBullets + "级";
  }
  return label;
}
