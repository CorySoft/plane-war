/* ===========================================================
 * hud.js — HUD 绘制
 * =========================================================== */

import { W, H, calcRangePx } from "./config.js";
import { clamp, roundRect, setf } from "./utils.js";
import { bar, glowText, hexToRgba, pulse, C } from "./theme.js";

// 分数滚动显示（跨帧向真实分数趋近，数字变化更顺滑）
let shownScore = -1;

export function drawHUD(ctx, { score, best, level, enemyLevel, pLevel, xp, xpNeed, lives, maxLives, combo, comboFrac, player, frame }) {
  if (shownScore < 0 || score < shownScore) shownScore = score;
  else shownScore += Math.max(1, Math.round((score - shownScore) * 0.2));
  const dispScore = Math.min(score, shownScore);

  const rEdge = W - 16;

  // ===== 左上：得分 =====
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = C.cyan;
  setf(ctx, "bold 22px 'sans-serif'");
  ctx.fillText("得分", 20, 13);
  glowText(ctx, {
    text: String(dispScore).padStart(6, "0"), x: 20, y: 40,
    size: 29, weight: "bold", color: "#ffffff", blur: 7,
    align: "left", baseline: "top", fontFamily: "'Courier New', monospace",
  });
  ctx.fillStyle = C.whiteDim;
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("最高 " + String(best).padStart(6, "0"), 20, 78);

  // ===== 右上：难度 / 等级 / 经验 =====
  ctx.textAlign = "right";
  glowText(ctx, {
    text: "难度 Lv." + level, x: rEdge - 10, y: 10, size: 15, weight: "bold",
    color: C.gold, blur: 8, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });
  glowText(ctx, {
    text: "等级 Lv." + pLevel, x: rEdge - 10, y: 29, size: 15, weight: "bold",
    color: C.cyanSoft, blur: 8, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });
  // 经验条
  const xpW = 94, xpH = 6, xpY = 51;
  bar(ctx, rEdge - 10 - xpW, xpY, xpW, xpH, clamp(xp / xpNeed, 0, 1), C.cyanSoft, { rounded: 3, glow: 6 });
  glowText(ctx, {
    text: "敌方 Lv." + enemyLevel, x: rEdge - 10, y: 62, size: 13, weight: "bold",
    color: C.redSoft, blur: 7, align: "right", baseline: "top", fontFamily: "'sans-serif'",
  });

  // ===== 连击（带热度脉动） =====
  if (combo >= 3) {
    const hot = combo >= 8;
    const cc = hot ? C.red : C.gold;
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
    // 连击倒计时条：显示 comboTime 剩余比例，走完之后连击归零
    const cbw = 52, cbh = 4, cby = 132;
    const cRatio = clamp(comboFrac ?? 1, 0, 1);
    ctx.save();
    roundRect(ctx, rEdge - 6 - cbw, cby, cbw, cbh, 2);
    ctx.fillStyle = hexToRgba(cc, 0.22);
    ctx.fill();
    if (cRatio > 0) {
      ctx.shadowColor = cc;
      ctx.shadowBlur = 5;
      ctx.fillStyle = hexToRgba(cc, 0.95);
      roundRect(ctx, rEdge - 6 - cbw, cby, cbw * cRatio, cbh, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ===== 生命（低血量脉动） =====
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  for (let i = 0; i < lives; i++) {
    const bob = lives === 1 ? 1 + 0.07 * Math.sin(frame * 0.22) : 1;
    ctx.save();
    ctx.translate(20 + i * 28, H - 34);
    ctx.scale(bob, bob);
    ctx.shadowColor = C.pink;
    ctx.shadowBlur = 8;
    ctx.fillStyle = C.pink;
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

  // 射程指示：直接读共享公式，旧实现在此硬编码了 250/50/2.5/80 四份常量
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const rangeM = Math.round(calcRangePx(player) / 25);
  const rangeText = "射程 " + rangeM + "m";
  ctx.fillStyle = (player.skills.range || 0) > 0 ? "#88ddff" : "rgba(255,255,255,.35)";
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

  // ===== buff 状态条（按功能合并色组） =====
  const activeBuffs = [];
  if (player.buffs.rapid > 0) activeBuffs.push(["rapid", "⚡急速", "#5ee6ff", 8, player.buffs.rapid]);
  if (player.buffs.speed > 0) activeBuffs.push(["speed", "»加速", "#5ee6ff", 8, player.buffs.speed]);
  if (player.buffs.double > 0) activeBuffs.push(["double", "双倍", "#ffd166", 8, player.buffs.double]);
  if (player.shield > 0) activeBuffs.push(["shield", "护盾", "#66e0ff", player.maxShield, player.shield]);
  if ((player.skills.magnet || 0) > 0 && player.buffs.magnet <= 0) activeBuffs.push(["magnet", "磁力", "#66e0ff", 1, 1]);
  if (player.powerTime > 0) activeBuffs.push(["power", "火力", "#ffd166", 15, player.powerTime]);
  if (player.buffs.madHunt > 0) activeBuffs.push(["madHunt", "追击", "#fca311", 8, player.buffs.madHunt]);
  if (player.buffs.drop > 0) activeBuffs.push(["drop", "☘爆率", "#7CFC00", 8, player.buffs.drop]);
  if (player.buffs.critboost > 0) activeBuffs.push(["critboost", "致命", "#ff8fa3", 8, player.buffs.critboost]);
  if (player.buffs.knockback > 0) activeBuffs.push(["knockback", "»击退", "#ff8fa3", 8, player.buffs.knockback]);

  let bx = 16;
  let by = H - 98;
  const bh = 20;
  const len = activeBuffs.length;
  // 竖屏窄屏(W<480)时压缩条宽，避免 buff 条溢出右侧
  const slot = len > 0 ? (W - 32 - (len - 1) * 6) / len : 0;
  const w = Math.min(74, Math.max(40, slot));
  for (const [key, label, color, total, remain] of activeBuffs) {
    // 一行放不下则换行到上一行，避免 buff 被静默丢弃
    if (bx + w > W - 6) { bx = 16; by -= bh + 6; }
    ctx.save();
    // 胶囊底
    roundRect(ctx, bx, by, w, bh, 8);
    ctx.fillStyle = hexToRgba(color, 0.18);
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
  if (s.penetrate > 0) label = { label: "◆穿透 " + s.penetrate + "级", color: "#5ee6ff" };
  else if (s.explosion > 0) {
    const ch = s.expChance || 0, dm = s.expDmg || 0, rn = s.expRange || 0;
    label = { label: "◆爆炸 " + ch + "/" + dm + "/" + rn, color: "#ff8a55" };
  }
  else if (s.split > 0) label = { label: "◆分裂 " + s.split + "级", color: "#ff8a55" };
  const extras = [];
  if ((s.splitDist || 0) > 0) extras.push("分距" + s.splitDist + "级");
  if ((s.orbital || 0) > 0) extras.push("天基" + s.orbital + "级");
  if ((s.bulletSpeed || 0) > 0) extras.push("弹速" + s.bulletSpeed + "级");
  if ((s.volley || 0) > 0) extras.push("连射" + s.volley + "级");
  if ((s.scatter || 0) > 0) extras.push("散射" + s.scatter + "级");
  if ((s.sideBullets || 0) > 0) extras.push("左右护法" + s.sideBullets + "级");
  if (extras.length > 0) {
    if (!label) label = { label: "", color: "#fff" };
    label.label = (label.label ? label.label + "  " : "") + extras.join(" ");
  }
  return label;
}
