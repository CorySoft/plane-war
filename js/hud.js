/* ===========================================================
 * hud.js — HUD 绘制
 * =========================================================== */

import { W, H } from "./config.js";
import { clamp, roundRect, setf } from "./utils.js";
import { bar, glowText, softPanel, hexToRgba, pulse } from "./theme.js";

// 分数滚动显示（跨帧向真实分数趋近，数字变化更顺滑）
let shownScore = -1;

export function drawHUD(ctx, { score, best, level, enemyLevel, pLevel, xp, xpNeed, lives, maxLives, combo, player, frame }) {
  if (shownScore < 0 || score < shownScore) shownScore = score;
  else shownScore += Math.max(1, Math.round((score - shownScore) * 0.2));
  const dispScore = Math.min(score, shownScore);

  const rEdge = W - 16;

  // ===== 左上：得分玻璃板 =====
  softPanel(ctx, 8, 6, 152, 90, 14, {
    top: "rgba(94,230,255,.12)", mid: "rgba(14,20,42,.44)",
    bottom: "rgba(5,7,18,.72)", border: "rgba(94,230,255,.22)",
  });
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "#5ee6ff";
  setf(ctx, "bold 22px 'sans-serif'");
  ctx.fillText("得分", 20, 13);
  glowText(ctx, {
    text: String(dispScore).padStart(6, "0"), x: 20, y: 40,
    size: 29, weight: "bold", color: "#ffffff", blur: 7,
    align: "left", baseline: "top", fontFamily: "'Courier New', monospace",
  });
  ctx.fillStyle = "rgba(255,255,255,.6)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("最高 " + String(best).padStart(6, "0"), 20, 78);

  // ===== 右上：难度 / 等级 / 经验玻璃板 =====
  softPanel(ctx, rEdge - 124, 6, 124, 80, 14, {
    top: "rgba(255,209,102,.08)", mid: "rgba(16,22,42,.42)",
    bottom: "rgba(5,7,18,.72)", border: "rgba(255,209,102,.2)",
  });
  ctx.textAlign = "right";
  glowText(ctx, {
    text: "难度 Lv." + level, x: rEdge - 10, y: 10, size: 15, weight: "bold",
    color: "#ffd166", blur: 8, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });
  glowText(ctx, {
    text: "等级 Lv." + pLevel, x: rEdge - 10, y: 29, size: 15, weight: "bold",
    color: "#8ad4ff", blur: 8, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });
  // 经验条
  const xpW = 94, xpH = 6, xpY = 51;
  bar(ctx, rEdge - 10 - xpW, xpY, xpW, xpH, clamp(xp / xpNeed, 0, 1), "#8ad4ff", { rounded: 3, glow: 6 });
  glowText(ctx, {
    text: "敌方 Lv." + enemyLevel, x: rEdge - 10, y: 62, size: 13, weight: "bold",
    color: "#ff6b6b", blur: 7, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });

  // ===== 连击（带热度脉动） =====
  if (combo >= 3) {
    const hot = combo >= 8;
    const cc = hot ? "#ff5c6a" : "#ffd166";
    const k = hot ? clamp((combo - 8) / 6, 0, 1) : clamp((combo - 3) / 5, 0, 1);
    const pull = 1 + (hot ? 0.12 + 0.06 * pulse(frame * 1, 6) : 0.05 * pulse(frame * 1, 6));
    ctx.save();
    ctx.translate(rEdge - 6, 106);
    ctx.scale(pull, pull);
    glowText(ctx, {
      text: "连击 ×" + combo, x: 0, y: 0, size: hot ? 20 : 17, weight: "bold",
      color: cc, blur: 10 + 14 * k, align: "right", baseline: "middle", fontFamily: "'sans-serif'",
    });
    ctx.restore();
    // 热度短线
    const bw2 = 20 + 34 * k;
    ctx.save();
    ctx.globalAlpha = 0.7;
    const hg = ctx.createLinearGradient(rEdge - 6 - bw2, 0, rEdge - 6, 0);
    hg.addColorStop(0, "rgba(0,0,0,0)");
    hg.addColorStop(1, hexToRgba(cc, 0.9));
    ctx.fillStyle = hg;
    ctx.fillRect(rEdge - 6 - bw2, 124, bw2, 2);
    ctx.restore();
  }

  // ===== 生命（低血量脉动） =====
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  for (let i = 0; i < lives; i++) {
    const bob = lives === 1 ? 1 + 0.07 * Math.sin(frame * 0.22) : 1;
    ctx.save();
    ctx.translate(20 + i * 28, H - 34);
    ctx.scale(bob, bob);
    ctx.shadowColor = "#ff6b9d";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#ff6b9d";
    setf(ctx, "22px 'sans-serif'");
    ctx.fillText("♥", 0, 0);
    ctx.restore();
  }

  // 火力等级
  glowText(ctx, {
    text: "火力 " + player.power + "/4", x: W - 16, y: H - 30, size: 13,
    weight: "bold", color: player.power >= 4 ? "#ffd166" : "rgba(255,255,255,.55)",
    blur: player.power >= 4 ? 8 : 0, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });

  // 射程指示
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const rangeLvl = player.skills.range || 0;
  const levelBonus = ((player.level || 1) - 1) * 2.5;
  const rangePx = Math.min(250 + rangeLvl * 50 + levelBonus, H + 80);
  const rangeM = Math.round(rangePx / 25);
  const rangeText = "射程 " + rangeM + "m";
  ctx.fillStyle = rangeLvl > 0 ? "#88ddff" : "rgba(255,255,255,.35)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText(rangeText, 18, H - 56);

  // 子弹行为指示
  const behavior = getBehaviorLabel(player);
  if (behavior) {
    glowText(ctx, {
      text: behavior.label, x: 18, y: H - 72, size: 13, weight: "bold",
      color: behavior.color, blur: 7, align: "left", baseline: "top", fontFamily: "'sans-serif'",
    });
  }

  // ===== buff 状态条 =====
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
  const w = Math.min(74, Math.max(46, slot));
  for (const [key, label, color, total, remain] of activeBuffs) {
    if (bx + w > W - 6) break;
    const by = H - 98, bh = 20;
    ctx.save();
    // 胶囊底
    const cg = ctx.createLinearGradient(0, by, 0, by + bh);
    cg.addColorStop(0, hexToRgba(color, 0.2));
    cg.addColorStop(1, "rgba(10,14,30,.9)");
    roundRect(ctx, bx, by, w, bh, 8);
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    // 时长进度（底部细条）
    const p = clamp(remain / total, 0, 1);
    if (p > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.fillStyle = color;
      roundRect(ctx, bx + 3, by + bh - 4, (w - 6) * p, 2.5, 1.5);
      ctx.fill();
    }
    ctx.restore();
    // 文字（居中偏上）
    glowText(ctx, {
      text: label, x: bx + w / 2, y: by + bh / 2 - 2, size: 11, weight: "bold",
      color: "#ffffff", blur: 4, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
    });
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
