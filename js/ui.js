/* ===========================================================
 * ui.js — 菜单 / 结束 / 升级选择 / 暂停 / 伤害飘字
 * =========================================================== */

import { W, H, STATE, TAU } from "./config.js";
import { clamp, roundRect, setf } from "./utils.js";

// ---------- 伤害飘字 ----------
let damageNumbers = [];

export function spawnDamageNumber(x, y, text, color = "#fff", big = false) {
  if (damageNumbers.length >= 60) damageNumbers.shift(); // 防爆量
  damageNumbers.push({
    x, y, text, color, big,
    vy: -2.5,
    life: 1.0,
    maxLife: 1.0,
  });
}

export function updateDamageNumbers(dt) {
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const d = damageNumbers[i];
    d.y += d.vy * dt * 60;
    d.vy *= 0.96;
    d.life -= dt;
    if (d.life <= 0) damageNumbers.splice(i, 1);
  }
}

export function drawDamageNumbers(ctx) {
  for (const d of damageNumbers) {
    const a = clamp(d.life / d.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = d.color;
    setf(ctx, d.big ? "bold 22px 'Courier New', monospace" : "bold 15px 'Courier New', monospace");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(d.text, d.x, d.y);
  }
  ctx.globalAlpha = 1;
}

export function clearDamageNumbers() {
  damageNumbers = [];
}

// ---------- 星空 ----------
let stars = [];

export function initStars() {
  stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.5 + Math.random() * 1.7,
      sp: 0.4 + Math.random() * 2.2,
      tw: Math.random() * TAU,
    });
  }
}

export function updateStars(dt) {
  for (const s of stars) {
    s.y += s.sp * dt * 60;
    if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
  }
}

export function drawStars(ctx, frame) {
  for (const s of stars) {
    const a = 0.45 + 0.4 * Math.sin(frame * 0.04 + s.tw);
    ctx.fillStyle = `rgba(200,220,255,${a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
}

// ---------- 菜单 ----------
let btnStartRect = null;
let btnRestartRect = null;
let btnPauseResumeRect = null;
let btnPauseQuitRect = null;
let btnPauseRect = null;
let skillCards = [];
let difficultyRects = {};

export function hitTestButton(mx, my, rect) {
  return rect && mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
}

export function getPauseButton() { return btnPauseRect; }
export function getStartButton() { return btnStartRect; }
export function getRestartButton() { return btnRestartRect; }
export function getPauseResumeButton() { return btnPauseResumeRect; }
export function getPauseQuitButton() { return btnPauseQuitRect; }
export function getSkillCards() { return skillCards; }
export function getDifficultyRects() { return difficultyRects; }

export function drawMenu(ctx, best, difficultyKey, presets) {
  ctx.fillStyle = "rgba(5,7,15,.72)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#5ee6ff";
  setf(ctx, "bold 56px 'Courier New', monospace");
  ctx.fillText("飞机大战", W / 2, H * 0.16);

  ctx.fillStyle = "rgba(255,255,255,.75)";
  setf(ctx, "15px 'sans-serif'");
  ctx.fillText("方向键 / A D 移动（左右）　·　自动射击", W / 2, H * 0.27);
  ctx.fillText("连续击毁敌机获得连击加分", W / 2, H * 0.30);

  // 道具图例
  setf(ctx, "13px 'sans-serif'");
  ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText("道具：P火力升级 ♥生命+1 S护盾 B全屏炸弹", W / 2, H * 0.34);
  ctx.fillText("⚡急速射击 »引擎加速 ❄冰冻全场", W / 2, H * 0.37);
  ctx.fillText("M磁铁吸引 ×双倍分数", W / 2, H * 0.40);

  // 新子弹系统说明
  ctx.fillStyle = "rgba(136,221,255,.9)";
  setf(ctx, "bold 13px 'sans-serif'");
  ctx.fillText("子弹有射程限制 · 命中后消失", W / 2, H * 0.43);
  ctx.fillText("升级可获得：爆炸弹 / 分裂弹 / 穿透弹 / 连射 / 散射", W / 2, H * 0.46);

  ctx.fillStyle = "rgba(138,212,255,.85)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("击落敌机获得经验，升级回复生命并三选一技能", W / 2, H * 0.49);

  if (best > 0) {
    ctx.fillStyle = "#ffd166";
    setf(ctx, "bold 16px 'Courier New', monospace");
    ctx.fillText("最高分  " + best, W / 2, H * 0.53);
  }

  // ---- 难度选择 ----
  const keys = Object.keys(presets);
  const dw = 80, dh = 32, gap = 8;
  const totalW = keys.length * dw + (keys.length - 1) * gap;
  const startX = W / 2 - totalW / 2;
  const dy = H * 0.56;
  difficultyRects = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = presets[k];
    const x = startX + i * (dw + gap);
    const selected = k === difficultyKey;
    // 背景
    ctx.fillStyle = selected ? p.color : "rgba(20,28,48,.85)";
    ctx.strokeStyle = p.color;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    roundRect(ctx, x, dy, dw, dh, 10);
    ctx.fill(); ctx.stroke();
    // 文字
    ctx.fillStyle = selected ? "#05070f" : p.color;
    setf(ctx, "bold 15px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.name, x + dw / 2, dy + dh / 2 + 1);
    difficultyRects[k] = { x, y: dy, w: dw, h: dh };
  }
  // 难度说明
  const cur = presets[difficultyKey];
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  setf(ctx, "12px 'sans-serif'");
  ctx.fillText(cur.desc, W / 2, dy + dh + 12);

  // 开始按钮
  const bx = W / 2 - 80, by = H * 0.70, bw = 160, bh = 52;
  ctx.fillStyle = "rgba(76,201,240,.15)";
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#4cc9f0";
  setf(ctx, "bold 24px 'Courier New', monospace");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("开始游戏", W / 2, by + bh / 2);
  btnStartRect = { x: bx, y: by, w: bw, h: bh };
}

export function drawGameOver(ctx, score, best, isNewBest = false) {
  ctx.fillStyle = "rgba(5,7,15,.78)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 52px 'sans-serif'");
  ctx.fillText("游戏结束", W / 2, H * 0.32);

  ctx.fillStyle = "#fff";
  setf(ctx, "bold 26px 'Courier New', monospace");
  ctx.fillText("得分  " + score, W / 2, H * 0.42);
  ctx.fillStyle = isNewBest ? "#ffd166" : "rgba(255,255,255,.55)";
  setf(ctx, "16px 'Courier New', monospace");
  ctx.fillText(isNewBest ? "★ 新纪录！" : "最高分  " + best, W / 2, H * 0.48);

  // 星尘奖励
  const stardust = Math.floor(score / 100);
  if (stardust > 0) {
    ctx.fillStyle = "#d0a6ff";
    setf(ctx, "16px 'sans-serif'");
    ctx.fillText("获得 " + stardust + " 星尘", W / 2, H * 0.53);
  }

  // 重开按钮
  const bx = W / 2 - 100, by = H * 0.58, bw = 200, bh = 54;
  ctx.fillStyle = "rgba(255,107,107,.15)";
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 24px 'Courier New', monospace");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("重新开始", W / 2, by + bh / 2);
  btnRestartRect = { x: bx, y: by, w: bw, h: bh };
}

export function drawLevelUp(ctx, choices, playerSkills) {
  if (!choices || choices.length === 0) return;
  ctx.fillStyle = "rgba(5,7,15,.82)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#8ad4ff";
  setf(ctx, "bold 36px 'sans-serif'");
  ctx.fillText("升 级 ！", W / 2, H * 0.16);
  setf(ctx, "16px 'sans-serif'");
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillText("生命 +1 · 选择一个技能强化", W / 2, H * 0.22);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("按 1 / 2 / 3 或点击选择", W / 2, H * 0.27);

  const cardW = 280, cardH = 88, gap = 18;
  const startY = H * 0.34;
  skillCards = [];
  for (let i = 0; i < choices.length; i++) {
    const s = choices[i];
    const cy = startY + i * (cardH + gap);
    const cx = W / 2;
    ctx.fillStyle = "rgba(20,28,48,.92)";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    roundRect(ctx, cx - cardW / 2, cy, cardW, cardH, 12);
    ctx.fill(); ctx.stroke();
    // 序号
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(cx - cardW / 2 + 26, cy + cardH / 2, 17, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#05070f";
    setf(ctx, "bold 18px 'Courier New', monospace");
    ctx.fillText(String(i + 1), cx - cardW / 2 + 26, cy + cardH / 2 + 6);
    // 技能名
    ctx.textAlign = "left";
    ctx.fillStyle = s.color;
    setf(ctx, "bold 19px 'sans-serif'");
    const cur = playerSkills[s.id] || 0;
    ctx.fillText(s.name + (cur > 0 ? "  " + cur + "级" : ""), cx - cardW / 2 + 54, cy + 28);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    setf(ctx, "14px 'sans-serif'");
    ctx.fillText(s.desc, cx - cardW / 2 + 54, cy + 58);
    ctx.textAlign = "center";
    skillCards.push({ id: s.id, x: cx - cardW / 2, y: cy, w: cardW, h: cardH });
  }
}

// 游戏内右上角暂停按钮
export function drawPauseButton(ctx) {
  const bx = W - 52, by = 14, bw = 38, bh = 38;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(5,7,15,.35)";
  ctx.strokeStyle = "rgba(255,255,255,.5)";
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 9);
  ctx.fill(); ctx.stroke();
  // 播放图标 ⏸（两道竖条）
  ctx.fillStyle = "#fff";
  ctx.fillRect(bx + 13, by + 11, 4.5, 16);
  ctx.fillRect(bx + 22, by + 11, 4.5, 16);
  ctx.restore();
  btnPauseRect = { x: bx, y: by, w: bw, h: bh };
}

export function drawPause(ctx, player) {
  ctx.fillStyle = "rgba(5,7,15,.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd166";
  setf(ctx, "bold 48px 'Courier New', monospace");
  ctx.fillText("暂停", W / 2, H * 0.12);

  // 战绩属性面板
  if (player) {
    const px = W / 2, py = H * 0.24;
    const lineH = 22;
    ctx.textAlign = "center";
    setf(ctx, "bold 14px 'sans-serif'");

    // 计算实际属性
    const frMul = player.fireRateMul || 1;
    const baseFireRate = (0.16 - player.power * 0.012) * (1 - 0.08 * (player.skills.rate || 0)) * frMul;
    const rapidFireRate = baseFireRate * 0.5;
    const dps = Math.round((1 + (player.skills.dmg || 0)) / baseFireRate * 10) / 10;
    const moveSpd = Math.round(player.speed * (1 + 0.12 * (player.skills.move || 0)) * 10) / 10;
    const rangeM = Math.round((250 + (player.skills.range || 0) * 150 + ((player.level || 1) - 1) * 25) / 25);

    const stats = [
      ["♥ 生命", player._maxLivesUpdate ? (player.baseHp + (player.skills.maxhp || 0)) : player.baseHp, "#ff6b9d"],
      ["⚔ 攻击", 1 + (player.skills.dmg || 0), "#ffd166"],
      ["🔥 射速", (baseFireRate * 1000).toFixed(0) + "ms", "#ffe066"],
      ["🚀 移速", moveSpd, "#9be8ff"],
      ["📏 射程", rangeM + "m", "#88ddff"],
      ["🎯 暴击", ((player.skills.crit || 0) * 12) + "%", "#ff8fa3"],
    ];

    let sy = py;
    for (const [label, value, color] of stats) {
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillText(label, px - 70, sy);
      ctx.fillStyle = color;
      ctx.fillText(String(value), px + 70, sy);
      sy += lineH;
    }

    // 已学技能
    sy += 6;
    ctx.fillStyle = "rgba(255,255,255,.4)";
    setf(ctx, "12px 'sans-serif'");
    ctx.fillText("已学技能", px, sy);
    sy += 18;

    const skillNames = {
      dmg:"火力", rate:"射速", range:"射程", move:"机动", maxhp:"生命",
      shield:"护盾", crit:"暴击", dual:"侧翼", explosion:"爆炸", volley:"连射",
      scatter:"散射", split:"分裂", penetrate:"穿透", guard:"护体",
      lifesteal:"吸取", xpboost:"经验", magnet:"磁力", score:"金币",
      bulletSpeed:"弹速", orbital:"天基",
    };
    const learned = [];
    for (const [id, lv] of Object.entries(player.skills)) {
      if (lv > 0 && skillNames[id]) learned.push(skillNames[id] + lv + "级");
    }
    if (learned.length > 0) {
      ctx.fillStyle = "#5ee6ff";
      setf(ctx, "13px 'sans-serif'");
      // 分两列显示
      const colW = 100;
      const cols = Math.ceil(learned.length / 5);
      for (let c = 0; c < cols; c++) {
        const slice = learned.slice(c * 5, c * 5 + 5);
        for (let i = 0; i < slice.length; i++) {
          ctx.fillText(slice[i], px - colW * (cols - 1) / 2 + c * colW, sy + i * 18);
        }
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,.3)";
      ctx.fillText("暂无", px, sy);
    }
  }

  // 继续按钮
  const bx = W / 2 - 100, by = H * 0.78, bw = 200, bh = 46;
  ctx.fillStyle = "rgba(76,201,240,.15)";
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 2;
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#4cc9f0";
  setf(ctx, "bold 22px 'Courier New', monospace");
  ctx.fillText("继续游戏", W / 2, by + bh / 2);
  btnPauseResumeRect = { x: bx, y: by, w: bw, h: bh };

  // 返回菜单按钮
  const bx2 = W / 2 - 100, by2 = H * 0.88, bw2 = 200, bh2 = 46;
  ctx.fillStyle = "rgba(255,107,107,.15)";
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2;
  roundRect(ctx, bx2, by2, bw2, bh2, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ff6b6b";
  setf(ctx, "bold 22px 'Courier New', monospace");
  ctx.fillText("返回菜单", W / 2, by2 + bh2 / 2);
  btnPauseQuitRect = { x: bx2, y: by2, w: bw2, h: bh2 };
}

export function drawToast(ctx, toast) {
  if (!toast || toast.t <= 0) return;
  const a = clamp(toast.t / 1.2, 0, 1);
  ctx.globalAlpha = a;
  ctx.fillStyle = toast.color;
  setf(ctx, "bold 30px 'sans-serif'");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowBlur = 18;
  ctx.shadowColor = toast.color;
  ctx.fillText(toast.text, W / 2, H * 0.38);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
