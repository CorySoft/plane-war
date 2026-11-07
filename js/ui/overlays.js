import { W, H, TAU, skillLevelColor, META, calcFireRate, calcRangePx, calcCritChance } from "../config.js";
import { clamp, roundRect, setf } from "../utils.js";
import { glowText, softPanel, lineBtn, hexToRgba, C, pulse } from "../theme.js";
import { uiState } from "./state.js";
import { uiTime } from "./common.js";

export function getPauseButton() { return uiState.btnPauseRect; }
export function getRestartButton() { return uiState.btnRestartRect; }
export function getGameOverMenuButton() { return uiState.btnGameOverMenuRect; }
export function getPauseResumeButton() { return uiState.btnPauseResumeRect; }
export function getPauseQuitButton() { return uiState.btnPauseQuitRect; }
export function getSkillCards() { return uiState.skillCards; }
export function getReviveYesButton() { return uiState.btnReviveYesRect; }
export function getReviveNoButton() { return uiState.btnReviveNoRect; }

export function drawGameOver(ctx, score, best, isNewBest = false, campaignComplete = false) {
  const now = uiTime();
  // 聚焦暗角
  ctx.fillStyle = "rgba(14,6,12,.92)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,70,70,.08)";
  ctx.fillRect(0, H * 0.4, W, H * 0.6);

  glowText(ctx, {
    text: campaignComplete ? "战 役 完 成" : "游 戏 结 束",
    x: W / 2, y: H * 0.30, size: 50, weight: "bold",
    color: campaignComplete ? C.gold : C.pinkDark,
    blur: 26 + 12 * pulse(now, 3.2),
    align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });

  // 成绩玻璃面板
  const py = H * 0.40, ph = 112, pw = Math.min(304, W - 56), px = W / 2 - pw / 2;
  softPanel(ctx, px, py, pw, ph, 16, {
    mid: "rgba(24,16,36,.5)",
    border: isNewBest ? "rgba(255,209,102,.65)" : "rgba(255,255,255,.18)",
    glow: isNewBest ? 16 : 4,
  });

  ctx.textAlign = "center"; ctx.textBaseline = "top";
  glowText(ctx, {
    text: "得分  " + score, x: W / 2, y: py + 16, size: 28, weight: "bold",
    color: C.white, blur: 12, align: "center", baseline: "top", fontFamily: "'Courier New', monospace",
  });
  if (isNewBest) {
    glowText(ctx, {
      text: "★ 新纪录！", x: W / 2, y: py + 56, size: 18, weight: "bold",
      color: C.gold, blur: 16 + 8 * pulse(now, 4), align: "center", baseline: "top", fontFamily: "'sans-serif'",
    });
  } else {
    ctx.fillStyle = "rgba(255,255,255,.6)";
    setf(ctx, "16px 'Courier New', monospace");
    ctx.fillText("最高分  " + best, W / 2, py + 56);
  }

  // 星尘奖励
  const stardust = Math.floor(score / META.stardustPerScore);
  if (stardust > 0) {
    glowText(ctx, {
      text: "获得 " + stardust + " 星尘 ✦", x: W / 2, y: py + 86, size: 15, weight: "bold",
      color: C.lilacDark, blur: 9, align: "center", baseline: "top", fontFamily: "'sans-serif'",
    });
  }

  // 两个按钮：统一宽度/高度，间距固定 22px（旧版间距仅 3.6px 且高度 54/50 不一致，视觉很挤）
  const bw = Math.min(216, W - 64);
  const bh = 52;
  const btnGap = 22;
  const bx = W / 2 - bw / 2;
  const by = H * 0.575;

  // 重新开始
  lineBtn(ctx, bx, by, bw, bh, C.red, "重新开始", {
    size: 24, weight: "bold", glow: 16 + 8 * pulse(now, 3), r: 14,
    fontFamily: "'Courier New', monospace", textColor: C.white,
  });
  uiState.btnRestartRect = { x: bx, y: by, w: bw, h: bh };

  // 返回主菜单
  const my2 = by + bh + btnGap;
  ctx.fillStyle = hexToRgba(C.cyan, 0.12);
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 2;
  roundRect(ctx, bx, my2, bw, bh, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.cyan;
  setf(ctx, "bold 22px 'Courier New', monospace");
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("返回主菜单", W / 2, my2 + bh / 2);
  uiState.btnGameOverMenuRect = { x: bx, y: my2, w: bw, h: bh };
}

export function drawLevelUp(ctx, choices, playerSkills) {
  if (!choices || choices.length === 0) return;
  ctx.save();
  const now = uiTime();
  ctx.fillStyle = "rgba(6,9,22,.8)";
  ctx.fillRect(0, 0, W, H);

  glowText(ctx, {
    text: "升 级 ！", x: W / 2, y: H * 0.145, size: 40, weight: "bold",
    color: C.cyanSoft, blur: 26 + 10 * pulse(now, 3.4), align: "center", baseline: "top", fontFamily: "'sans-serif'",
  });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255,255,255,.82)";
  setf(ctx, "16px 'sans-serif'");
  ctx.fillText("生命 +1 · 选择一个技能强化", W / 2, H * 0.215);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("按 1 / 2 / 3 或点击选择", W / 2, H * 0.26);

  const cardW = 280, cardH = 88, gap = 18;
  const startY = H * 0.34;
  uiState.skillCards = [];
  for (let i = 0; i < choices.length; i++) {
    const s = choices[i];
    const cy = startY + i * (cardH + gap);
    const cx = W / 2;
    // 按当前等级取不同主题色：1级暗白 / 2-4功能组色 / 5+金
    const cur = playerSkills[s.id] || 0;
    const themeColor = skillLevelColor(cur) ?? s.color;
    // 1级暗白：文字为白色(rgba)，底色必须是深色才能看清（hexToRgba 对非十六进制原样返回）
    const isLv1White = themeColor[0] !== "#";
    ctx.save();
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 12;
    roundRect(ctx, cx - cardW / 2, cy, cardW, cardH, 14);
    ctx.fillStyle = isLv1White ? "rgba(20,26,46,.96)" : hexToRgba(themeColor, 0.2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isLv1White ? "rgba(255,255,255,.55)" : hexToRgba(themeColor, 0.9);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - cardW / 2 + 18, cy + 2); ctx.lineTo(cx + cardW / 2 - 18, cy + 2); ctx.stroke();
    ctx.restore();
    // 序号
    const ncx = cx - cardW / 2 + 26;
    const ncy = cy + cardH / 2;
    ctx.save();
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(ncx, ncy, 17, 0, TAU);
    ctx.fillStyle = isLv1White ? "rgba(255,255,255,.85)" : hexToRgba(themeColor, 0.85);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#05070f";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    setf(ctx, "bold 18px 'Courier New', monospace");
    // 用字形实际边界精确垂直居中（textBaseline=middle 基于字体行盒，数字会偏高）
    const numStr = String(i + 1);
    const tm = ctx.measureText(numStr);
    const aHeight = (tm.actualBoundingBoxAscent != null && tm.actualBoundingBoxDescent != null)
      ? (tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent) / 2
      : 0;
    ctx.fillText(numStr, ncx, ncy + aHeight);
    // 技能名（颜色随等级：1级暗白 / 2-4组色 / 5+金）
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = themeColor;
    setf(ctx, "bold 19px 'sans-serif'");
    ctx.fillText(s.name + (cur > 0 ? "  " + cur + "→" + (cur + 1) + "级" : "  新"), cx - cardW / 2 + 54, cy + 28);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    setf(ctx, "14px 'sans-serif'");
    ctx.fillText(s.desc, cx - cardW / 2 + 54, cy + 58);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    uiState.skillCards.push({ id: s.id, x: cx - cardW / 2, y: cy, w: cardW, h: cardH });
  }
  ctx.restore();
}

export function drawPauseButton(ctx) {
  const bx = W / 2 - 19, by = 14, bw = 38, bh = 38;
  ctx.save();
  ctx.globalAlpha = 0.92;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fillStyle = "rgba(14,22,44,.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.6)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // 播放图标 ⏸（两道竖条）
  ctx.shadowColor = C.white;
  ctx.shadowBlur = 6;
  ctx.fillStyle = C.white;
  ctx.fillRect(bx + 13, by + 11, 4.5, 16);
  ctx.fillRect(bx + 22, by + 11, 4.5, 16);
  ctx.restore();
  uiState.btnPauseRect = { x: bx, y: by, w: bw, h: bh };
}

export function drawPause(ctx, player) {
  const now = uiTime();
  ctx.fillStyle = "rgba(8,11,26,.8)";
  ctx.fillRect(0, 0, W, H);

  glowText(ctx, {
    text: "暂 停", x: W / 2, y: H * 0.09, size: 48, weight: "bold",
    color: C.gold, blur: 28 + 10 * pulse(now, 3), align: "center", baseline: "top",
    fontFamily: "'Courier New', monospace",
  });

  // 战绩属性面板
  if (player) {
    const px = W / 2, py = H * 0.24;
    const lineH = 22;
    // 属性区域玻璃底板（衬托在战局画面上）
    softPanel(ctx, 16, H * 0.20, W - 32, H * 0.51, 18, {
      mid: "rgba(14,18,36,.48)", border: "rgba(255,209,102,.2)", glow: 2,
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setf(ctx, "bold 14px 'sans-serif'");

    // 实际属性：全部走 config.js 的共享公式函数。
    // 旧实现在这里另抄了一份射速公式 (0.16 - power*0.012)，
    // 与 player.js 的真值 (0.56 - (power-1)*0.04) 差 3.8 倍，面板显示 148ms 实为 560ms。
    const baseFireRate = calcFireRate(player);
    const rangeM = Math.round(calcRangePx(player) / 25);
    const moveSpd = Math.round(player.speed * (1 + 0.12 * (player.skills.move || 0)) * 10) / 10;
    const critPct = Math.round(calcCritChance(player) * 100);
    // 单发主弹伤害：与 player.js getShootPattern 中主弹的算法保持一致
    const shotDmg = Math.round((1 + (player.skills.dmg || 0) + (player.talentDmg || 0)) * (player.baseDmgMul || 1));
    const dps = Math.round(shotDmg / baseFireRate * 10) / 10;

    const stats = [
      ["♥ 生命", player.baseHp + (player.skills.maxhp || 0), C.pink],
      ["⚔ 攻击", shotDmg, C.gold],
      ["🔥 射速", (baseFireRate * 1000).toFixed(0) + "ms", C.gold],
      ["🚀 移速", moveSpd, C.cyanSoft],
      ["📏 射程", rangeM + "m", C.cyanSoft],
      ["🎯 暴击", critPct + "%", C.pinkSoft],
      // 多通道/散射/连射会再放大实际输出，这里只算主弹道，作为一个可横向比对的基准
      ["💥 DPS", dps, C.gold],
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
      shield:"护盾", crit:"暴击", dual:"侧翼", sideBullets:"护法", explosion:"爆炸", expChance:"爆破", expDmg:"爆裂", expRange:"扩域", volley:"连射",
      scatter:"散射", split:"分裂", splitDist:"分距", penetrate:"穿透", guard:"护体",
      lifesteal:"吸取", xpboost:"经验", magnet:"磁力", score:"金币",
      bulletSpeed:"弹速", orbital:"天基", drop:"爆率", critdmg:"致命", knockback:"击退",
    };
    const learned = [];
    for (const [id, lv] of Object.entries(player.skills)) {
      if (lv > 0 && skillNames[id]) learned.push(skillNames[id] + lv + "级");
    }
    if (learned.length > 0) {
      ctx.fillStyle = C.cyan;
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
  lineBtn(ctx, bx, by, bw, bh, C.cyan, "继续游戏", {
    size: 22, weight: "bold", glow: 15, r: 13,
    fontFamily: "'Courier New', monospace", textColor: C.bgDark,
  });
  uiState.btnPauseResumeRect = { x: bx, y: by, w: bw, h: bh };

  // 返回菜单按钮
  const bx2 = W / 2 - 100, by2 = H * 0.88, bw2 = 200, bh2 = 46;
  lineBtn(ctx, bx2, by2, bw2, bh2, C.red, "返回菜单", {
    size: 22, weight: "bold", glow: 12, r: 13,
    fontFamily: "'Courier New', monospace", textColor: C.white,
  });
  uiState.btnPauseQuitRect = { x: bx2, y: by2, w: bw2, h: bh2 };
}

export function drawToast(ctx, toast, yFrac = 0.38) {
  if (!toast || toast.t <= 0) return;
  const a = clamp(toast.t / 1.2, 0, 1);
  const size = 30;
  const cy = H * yFrac;
  ctx.save();
  ctx.globalAlpha = a;
  setf(ctx, "bold " + size + "px 'sans-serif'");
  const mw = ctx.measureText ? (ctx.measureText(toast.text).width || toast.text.length * size) : toast.text.length * size;
  const w = mw + 56, h = 54;
  const x = W / 2 - w / 2, y = cy - h / 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = hexToRgba(toast.color, 0.22);
  ctx.fill();
  ctx.shadowColor = toast.color;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = hexToRgba(toast.color, 0.8);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  glowText(ctx, {
    text: toast.text, x: W / 2, y: cy, size, weight: "bold",
    color: toast.color, blur: 14, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });
  ctx.restore();
}

export function drawRevive(ctx, stardust, cost) {
  const now = uiTime();
  ctx.fillStyle = "rgba(20,16,8,.84)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  glowText(ctx, {
    text: "再战一次？", x: W / 2, y: H * 0.28, size: 40, weight: "bold",
    color: C.gold, blur: 26 + 10 * pulse(now, 3), align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });

  ctx.fillStyle = "rgba(255,255,255,.9)";
  setf(ctx, "17px 'sans-serif'");
  ctx.fillText("死亡后消耗 " + cost + " 星尘原地复活 1 次", W / 2, H * 0.37);
  ctx.fillStyle = "rgba(255,255,255,.62)";
  setf(ctx, "14px 'sans-serif'");
  ctx.fillText("复活后拥有 1 条命 · 短暂无敌 · 仅限本局 1 次", W / 2, H * 0.42);

  glowText(ctx, {
    text: "当前星尘  ✦ " + stardust, x: W / 2, y: H * 0.5, size: 20, weight: "bold",
    color: C.lilacSoft, blur: 12, align: "center", baseline: "middle", fontFamily: "'sans-serif'",
  });

  // 复活按钮
  const bw = 150, bh = 54, by = H * 0.60;
  const bx1 = W / 2 - 160;
  lineBtn(ctx, bx1, by, bw, bh, C.gold, "复活  -" + cost, {
    size: 20, weight: "bold", glow: 18 + 8 * pulse(now, 3.4), r: 14,
    fontFamily: "'Courier New', monospace", textColor: "#4a3000",
  });
  uiState.btnReviveYesRect = { x: bx1, y: by, w: bw, h: bh };

  // 放弃按钮
  const bx2 = W / 2 + 10;
  lineBtn(ctx, bx2, by, bw, bh, C.red, "放弃", {
    size: 20, weight: "bold", glow: 10, r: 14,
    fontFamily: "'Courier New', monospace", textColor: C.white,
  });
  uiState.btnReviveNoRect = { x: bx2, y: by, w: bw, h: bh };

  ctx.fillStyle = "rgba(255,255,255,.4)";
  setf(ctx, "13px 'sans-serif'");
  ctx.fillText("星尘可在每局结算时获得，也可通过成就与每日任务获取", W / 2, H * 0.72);
}
