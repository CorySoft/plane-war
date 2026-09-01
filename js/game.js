/* ===========================================================
 * game.js — 主游戏循环 + 状态机 + 碰撞检测
 * =========================================================== */

import { W, H, STATE, BULLET as BCFG, TAU, DIFFICULTY_PRESETS, ENEMY_LEVEL, computeViewport, setViewport } from "./config.js";
import { clamp, rand, hypot, setf } from "./utils.js";
import { sfx, startMusic, stopMusic, initAudio } from "./audio.js";
import { initInput, bindTouchButtons, getStick, isStickActive } from "./input.js";
import { spawnParticles, updateParticles, drawParticles, clearParticles } from "./particles.js";
import { triggerShake, updateCamera, applyCamera, resetCamera, slowmo } from "./camera.js";
import {
  bullets, fireBullet, spawnEnemyBullet, spawnSplitBullet,
  updateBullets, drawBullets, clearBullets, hasPlayerMainBullet, maxMainBulletTraveled, markMainBulletsTriggered
} from "./bullet.js";
import {
  enemies, spawnEnemy, updateEnemies, getEnemyShooters,
  drawEnemies, clearEnemies, spawnSplitChildren
} from "./enemy.js";
import { spawnPowerup, updatePowerups, drawPowerups, clearPowerups } from "./powerup.js";
import { generateSkillChoices, applySkill, getMaxLives } from "./skill.js";
import { createPlayer, updatePlayer, getShootPattern, drawPlayer, getOrbitBullets, removeOrbitBullet } from "./player.js";
import {
  getDifficultyLevel, getSpawnRate, updateWaves, resetWaves,
  spawnBoss, getCurrentBossPhase, BOSS_TYPES
} from "./wave.js";
import { drawHUD } from "./hud.js";
import {
  drawMenu, drawGameOver, drawLevelUp, drawPause, drawPauseButton, drawToast,
  drawStars, updateStars, initStars,
  spawnDamageNumber, updateDamageNumbers, drawDamageNumbers, clearDamageNumbers,
  hitTestButton, getStartButton, getRestartButton,
  getPauseResumeButton, getPauseQuitButton, getPauseButton, getSkillCards, getDifficultyRects,
} from "./ui.js";
import {
  loadMeta, earnStardust, getBest, getTalentEffects, addKill, getSelectedAircraftConfig
} from "./meta.js";

// ---------- 画布初始化 ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 注意：state 必须在 resize() 调用之前声明（避免 TDZ 引用错误）
let state = STATE.MENU;
let lastLogicW = W, lastLogicH = H;

function resize() {
  // 自适应逻辑分辨率：竖屏按高度锁 720、宽度随窗口比例缩窄（零黑边零裁切），
  // 横屏保持 480×720 等比适配（两侧留黑）。canvas 像素尺寸随之更新。
  // 游戏进行中若窗口比例变化会改变逻辑坐标，为安全起见仅在非 PLAYING 时重设分辨率。
  const { w, h, scale } = computeViewport();
  canvas.style.width = (w * scale) + "px";
  canvas.style.height = (h * scale) + "px";
  if (state !== STATE.PLAYING && (w !== lastLogicW || h !== lastLogicH)) {
    lastLogicW = w; lastLogicH = h;
    setViewport(w, h);
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener("resize", resize);
resize();

// ---------- 游戏变量 ----------
let score = 0;
let lives = 3;
let maxLives = 3;
let level = 1;
let enemyLevel = 1;
let pLevel = 1;
let xp = 0;
let xpNeed = 60;
let combo = 0;
let comboTime = 0;
let frame = 0;
let player = null;
let skillChoices = null;
let stardustEarned = 0;
let isNewBest = false;        // 本局是否刷新最高分（earnStardust 更新前判定）
let talentFxCache = null;    // 本局天赋效果缓存（一局内不变，避免 addXp 每次重算）
let fxRings = [];           // 爆炸弹圆弧波纹（临时光效，随时间扩散消散）
let deathTimer = 0;         // 死亡慢动作倒计时
let deathFlash = 0;         // 死亡白屏闪烁
let lastTime = performance.now();
let now = 0;
let toast = null;
let difficultyKey = "normal";
let difficulty = DIFFICULTY_PRESETS.normal;
let showTutorial = true;   // 新手教程提示
let tutorialTimer = 0;     // 教程剩余显示时间
let musicStarted = false;

// ---------- 初始化（失败也尽量让 loading 走掉，靠兜底显示菜单） ----------
try {
  initInput(canvas);
  bindTouchButtons(
    document.getElementById("btnLeft"),
    document.getElementById("btnRight")
  );
  loadMeta();
  initStars();
  resetCamera();
} catch (e) {
  console.error("[plane_war] 初始化异常:", e.message, e.stack);
}

// 通知主页面：模块加载完成，隐藏 loading（无论是否异常）
try { if (typeof window !== "undefined" && window.__doneLoading) window.__doneLoading(); } catch (_) {}

// 标记游戏模块启动成功（非 ESM 兜底脚本靠这个判断是否需要显示 fallback）
try { if (typeof window !== "undefined") window.__gameReady = true; } catch (_) {}

try { loop(); } catch (e) {
  console.error("[plane_war] loop 启动异常:", e.message, e.stack);
}

// ---------- 主循环 ----------
function loop() {
  const rawDt = 1 / 60;
  // 死亡慢动作：逐渐减速
  if (deathTimer > 0) {
    deathTimer -= rawDt;
    // 死亡慢动作已通过 updateCamera(dt, combo, deathTarget) 处理
    deathFlash = Math.max(0, deathFlash - rawDt * 2);
  }
  const dt = rawDt * (state === STATE.PLAYING ? slowmo : 1);
  now = performance.now() / 1000;

  // 容错：单帧异常不打断 requestAnimationFrame 链（避免画面卡死）
  try {
    // 星空始终动画（含菜单/结束画面）
    updateStars(dt);

    if (state === STATE.PLAYING) {
      update(dt);
      frame++;
      // 死亡动画结束，切换到 GAME OVER
      if (deathTimer <= 0 && lives <= 0) {
        state = STATE.OVER;
        isNewBest = score > getBest();
        stardustEarned = earnStardust(score);
        stopMusic();
        musicStarted = false;
        // 慢动作已通过 updateCamera(dt, combo, 0) 自动恢复
        deathFlash = 0;
      }
    } else if (state === STATE.LEVELUP || state === STATE.TUTORIAL) {
      // 升级界面/教程界面暂停游戏逻辑（星空与初始画面仍静态呈现）
      frame++;
    }

    draw();
  } catch (err) {
    console.error("[game] frame error:", err);
  }
  requestAnimationFrame(loop);
}

// ---------- 更新 ----------
function update(dt) {
  updateCamera(dt, combo, deathTimer > 0 ? Math.max(0.1, deathTimer / 2.0) : 0);
  updateDamageNumbers(dt);
  if (player) {
    updateParticles(dt);
    updateBullets(dt);
    updateEnemies(dt, level, player.x, player.y, player.h);

    // 死亡动画期间跳过玩家输入/射击
    if (deathTimer > 0 && lives <= 0) {
      // 仅更新圆弧爆炸波纹
      for (let i = fxRings.length - 1; i >= 0; i--) {
        const r = fxRings[i];
        r.life -= dt;
        if (r.life <= 0) fxRings.splice(i, 1);
      }
      return;
    }

    // 连击计时
    if (comboTime > 0) {
      comboTime -= dt;
      if (comboTime <= 0) combo = 0;
    }

    // 玩家移动 + 自动射击（距离/销毁触发：上一发主弹飞超 10m 或已销毁即可再射）
    const shouldFire = updatePlayer(dt, player, BCFG.refireDist, maxMainBulletTraveled());
    if (shouldFire) {
      // 先把当前所有尚未触发的主弹标记为「已触发」：每颗主弹只允许触发一次下一波射击，
      // 避免同一波多颗子弹依次越过 10m 时反复触发造成误连射。新发的子弹 traveled=0 仍可触发下一波。
      markMainBulletsTriggered();
      const patterns = getShootPattern(player);
      for (const p of patterns) {
        fireBullet(p.angle, p.dmg, player, p.x, p.y, p.spd, p.isExplosion);
      }
      sfx.shoot();
    }

    // 圆弧爆炸波纹更新（收缩生命，越短越淡）
    for (let i = fxRings.length - 1; i >= 0; i--) {
      const r = fxRings[i];
      r.life -= dt;
      if (r.life <= 0) fxRings.splice(i, 1);
    }

    // 处理玩家事件标记
    if (player._addLife) {
      lives = Math.min(maxLives, lives + 1);
      player._addLife = false;
    }
    if (player._bomb) {
      bombAll();
      player._bomb = false;
    }
    if (player._freeze) {
      freezeAll();
      player._freeze = false;
    }
    if (player._heal) {
      maxLives = getMaxLives(player.baseHp, player.skills.maxhp || 0);
      lives = Math.min(maxLives, lives + player._heal);
      player._heal = 0;
    }
    if (player._toast) {
      toast = player._toast;
      player._toast = null;
    }

    // 道具掉落
    const magnetActive = player.buffs.magnet > 0 || (player.skills.magnet || 0) > 0;
    updatePowerups(dt, player, magnetActive);

    // 难度
    const newLevel = getDifficultyLevel(score);
    if (newLevel > level) {
      level = newLevel;
      sfx.power();
    }

    // 敌方等级（每3000分升1级）
    const newEnemyLevel = 1 + Math.floor(score / ENEMY_LEVEL.scorePerLevel);
    if (newEnemyLevel > enemyLevel) {
      enemyLevel = newEnemyLevel;
      sfx.power();
    }

    // 波次事件
    const waveEvent = updateWaves(dt, level, now, difficulty);
    if (waveEvent === "boss") {
      const bossTypes = Object.keys(BOSS_TYPES);
      const bossType = bossTypes[Math.floor(Math.random() * bossTypes.length)];
      spawnBoss(bossType);
    }

    // 生成敌人
    const spawnRate = getSpawnRate(level, difficulty.spawnScale);
    if (Math.random() < spawnRate * dt) spawnEnemy(level, difficulty, enemyLevel);

    // 敌机开火
    const shooters = getEnemyShooters(player.x, player.y);
    for (const e of shooters) {
      if (e.type === "boss") {
        bossFire(e);
      } else {
        spawnEnemyBullet(e, player.x, player.y, difficulty.enemyFireScale);
      }
    }

    // Boss AI
    for (const e of enemies) {
      if (e.isBoss) updateBossAI(e, dt);
    }

    // toast衰减
    if (toast) {
      toast.t -= dt;
      if (toast.t <= 0) toast = null;
    }

    // 碰撞检测
    checkCollisions();
  }
}

// ---------- 碰撞检测 ----------
function checkCollisions() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // 玩家 vs 敌机（冰冻中的敌机冻结不动、不造成伤害，但仍可被击毁）
    if (e.frozen <= 0 && player.invincible <= 0) {
      const dist = hypot(player.x, player.y, e.x, e.y);
      if (dist < e.r + player.radius) {
        if (player.shield > 0) {
          player.shield--;
          spawnParticles(e.x, e.y, "#66e0ff", 16, 5);
          sfx.hit();
          removeEnemy(i);
          continue;
        } else {
          hitPlayer();
          removeEnemy(i);
          spawnParticles(e.x, e.y, e.color, 16, 5);
          sfx.boom();
          continue;
        }
      }
    }

    // 子弹 vs 敌机
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (!b.friendly) continue;
      const dist = hypot(b.x, b.y, e.x, e.y);
      if (dist < e.r + b.r) {
        // 处理伤害
        dealDamageToEnemy(e, b, i, j);
        break;
      }
    }
  }

  // 护体弹 vs 敌机（击中后消失，一段时间后重生）
  const orbit = getOrbitBullets(player);
  if (orbit.length > 0) {
    outer: for (let oi = orbit.length - 1; oi >= 0; oi--) {
      const ob = orbit[oi];
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.frozen > 0) continue;
        const dist = hypot(ob.x, ob.y, e.x, e.y);
        if (dist < e.r + 10) {
          orbitHitEnemy(e, ob, i);
          removeOrbitBullet(player, ob);
          continue outer;
        }
      }
    }
  }

  // 敌方子弹 vs 玩家
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (b.friendly) continue;
    if (player.invincible > 0) continue;
    const dist = hypot(player.x, player.y, b.x, b.y);
    if (dist < 20) {
      bullets.splice(i, 1);
      if (player.shield > 0) {
        player.shield--;
        spawnParticles(b.x, b.y, "#66e0ff", 10, 4);
        sfx.hit();
      } else {
        hitPlayer();
      }
    }
  }
}

function dealDamageToEnemy(e, b, enemyIdx, bulletIdx) {
  // 爆炸标记：在护盾检查之前记录，确保死亡触发时保留最强一次
  if (b.behavior === "explosion") {
    const strength = b.dmg * b.explosionRadius;
    if (!e._deathExplosion || strength > e._deathExplosion.strength) {
      e._deathExplosion = { dmg: b.dmg, radius: b.explosionRadius, strength };
    }
  }

  // 护盾敌机
  if (e.shieldHp > 0) {
    e.shieldHp--;
    spawnParticles(b.x, b.y, "#44aaff", 6, 3);
    spawnDamageNumber(b.x, b.y, "护盾", "#44aaff");
    if (!b.isScatter && b.behavior !== "penetrate") {
      bullets.splice(bulletIdx, 1);
    } else if (b.behavior === "penetrate" && b.pierceCount < b.maxPierce) {
      b.pierceCount++;
    } else {
      bullets.splice(bulletIdx, 1);
    }
    return;
  }

  e.hp -= b.dmg;
  e.hitFlash = 1;
  spawnDamageNumber(e.x, e.y, b.isCrit ? b.dmg + "!" : "" + b.dmg, b.isCrit ? "#ff8fa3" : "#fff", b.isCrit);

  // 非穿透、非爆炸的行为（split 等）：只在命中时触发
  if (b.behavior !== "penetrate" && b.behavior !== "explosion") {
    handleBulletBehavior(b, e, bulletIdx);
  }

  // 非穿透、非爆炸的行为（split 等）：只在命中时触发
  // 爆炸不再在命中时触发 AOE（改到死亡时统一处理）
  if (b.behavior !== "penetrate" && b.behavior !== "explosion") {
    handleBulletBehavior(b, e, bulletIdx);
  }

  // 击毁
  if (e.hp <= 0) {
    addScore(e.score);
    addXp(e.xp);
    combo++;
    comboTime = 2.5;
    const comboBonus = combo >= 10;
    if (comboBonus) addScore(500);
    spawnDamageNumber(e.x, e.y - e.r, "+" + Math.round(e.score * (difficulty.scoreScale ?? 1)), comboBonus ? "#ff8fa3" : "#ffd166", comboBonus);
    spawnParticles(e.x, e.y, e.color, 8, 4);
    spawnPowerup(e.x, e.y, level);
    sfx.boom();
    addKill();

    // 分裂敌机
    if (e.splitChildren > 0) {
      spawnSplitChildren(e);
    }

    // Boss 击败奖励
    if (e.isBoss) {
      addScore(3000);
      triggerShake(1.5);
      // Boss掉落多个道具
      for (let k = 0; k < 3; k++) spawnPowerup(e.x + rand(-30, 30), e.y + rand(-20, 20), level);
    }

    // 敌机死亡爆炸（玩家爆炸弹行为）：爆炸范围/伤害按敌机实力缩放
    if (e._deathExplosion) {
      doEnemyDeathExplosion(e, e._deathExplosion);
    }

    removeEnemy(enemyIdx);

    // 击毁后：穿透弹保持伤害、大小与 穿透 继续飞行；其余行为消失
    if (b.behavior === "penetrate" && b.pierceCount < b.maxPierce) {
      b.pierceCount++;
      const idx = bullets.indexOf(b);
      if (idx === -1) { /* already removed elsewhere */ }
    } else if (!b.isScatter && b.behavior !== "penetrate") {
      const idx = bullets.indexOf(b);
      if (idx !== -1) bullets.splice(idx, 1);
    }
  }
}

/** 护体弹命中敌机：造成伤害并处理击毁 */
function orbitHitEnemy(e, ob, enemyIdx) {
  // 护盾敌机：抵消护盾，不消失(由调用方决定)
  if (e.shieldHp > 0) {
    e.shieldHp--;
    spawnParticles(ob.x, ob.y, "#44aaff", 6, 3);
    spawnDamageNumber(ob.x, ob.y, "护盾", "#44aaff");
    return;
  }

  e.hp -= ob.dmg;
  e.hitFlash = 1;
  spawnDamageNumber(e.x, e.y, "" + ob.dmg, "#7bf1a8");

  if (e.hp <= 0) {
    addScore(e.score);
    addXp(e.xp);
    combo++;
    comboTime = 2.5;
    const comboBonus = combo >= 10;
    if (comboBonus) addScore(500);
    spawnDamageNumber(e.x, e.y - e.r, "+" + Math.round(e.score * (difficulty.scoreScale ?? 1)), comboBonus ? "#ff8fa3" : "#ffd166", comboBonus);
    spawnParticles(e.x, e.y, e.color, 8, 4);
    spawnPowerup(e.x, e.y, level);
    sfx.boom();
    addKill();
    if (e.splitChildren > 0) spawnSplitChildren(e);
    if (e.isBoss) {
      addScore(3000);
      triggerShake(1.5);
      for (let k = 0; k < 3; k++) spawnPowerup(e.x + rand(-30, 30), e.y + rand(-20, 20), level);
    }
    // 护体弹击毁：若敌机此前被爆炸弹命中过，同样触发死亡爆炸
    if (e._deathExplosion) {
      doEnemyDeathExplosion(e, e._deathExplosion);
    }
    removeEnemy(enemyIdx);
  } else {
    spawnParticles(ob.x, ob.y, e.color, 6, 3);
    sfx.hit();
  }
}

function handleBulletBehavior(b, e, bulletIdx) {
  switch (b.behavior) {
    // explosion 行为由敌机死亡时统一处理（doEnemyDeathExplosion），命中时不触发
    case "split": {
      if (!b.isScatter) {
        const cnt = b.splitCount || 1;
        for (let k = 0; k < cnt; k++) {
          const angle = (k / cnt) * Math.PI - Math.PI / 2;
          const sdmg = Math.max(1, Math.round(b.dmg * BCFG.splitDmgRatio));
          spawnSplitBullet(b.x, b.y, angle, sdmg, "#a0ffd0", b.r);
        }
        sfx.scatter();
      }
      bullets.splice(bulletIdx, 1);
      break;
    }
    case "penetrate": {
      if (b.pierceCount < b.maxPierce) {
        b.pierceCount++;
        // 穿透弹保持伤害与大小不变，仅限制穿透次数
        sfx.penetrate();
        spawnParticles(b.x, b.y, "#aa66ff", 3, 2);
      } else {
        bullets.splice(bulletIdx, 1);
      }
      break;
    }
    default: {
      bullets.splice(bulletIdx, 1);
    }
  }
}

/**
 * 敌机死亡爆炸（玩家爆炸弹触发）
 * 爆炸范围/伤害按敌机实力（体型/血量/Boss）缩放：
 * 越强横的敌机爆炸越大越猛，形成连锁清场爽感。
 * @param {object} e     死亡的敌机
 * @param {object} info  { dmg, radius } 由命中子弹记下的基础爆炸参数
 */
/**
 * 敌机死亡爆炸（玩家爆炸弹触发）
 * 爆炸范围/伤害按敌机实力（体型/血量/Boss）缩放，并带有限制的连锁反应。
 * @param {object} e      死亡的敌机
 * @param {object} info   { dmg, radius } 由命中子弹记下的基础爆炸参数
 * @param {number} depth  当前连锁递归深度（0 = 首发爆炸）
 */
function doEnemyDeathExplosion(e, info, depth = 0) {
  // 实力缩放：敌机体型与最大血量共同决定爆炸倍率
  // 基准敌机(small, r=16, maxHp=1) → scale≈1；Boss → 显著放大
  const sizeFactor = clamp(e.r / 16, 0.8, 4);
  const hpFactor = clamp(Math.sqrt(e.maxHp), 1, 6);
  const bossFactor = e.isBoss ? 2.5 : 1;
  const scale = sizeFactor * hpFactor * bossFactor;

  // 半径硬上限，避免单次爆炸覆盖过大区域造成后续连锁失控
  const r = clamp(info.radius * (0.6 + 0.4 * scale), 50, BCFG.explosionMaxRadius);
  const aoeDmg = Math.max(1, Math.round(info.dmg * BCFG.explosionDmgRatio * (0.5 + 0.5 * scale)));

  const isChain = depth > 0;                     // 是否为连锁爆炸
  const isDeepChain = depth >= BCFG.explosionMaxChainDepth;  // 超过连锁深度上限
  // 深度衰减：连锁越深粒子/波纹越少（第 2 层 50%，第 3 层 20%，第 4 层+ 不再生成粒子/波纹）
  const depthVisualFactor = Math.pow(0.5, depth);

  // AOE 伤害周围敌机（连带可能引发连锁爆炸）
  const chainVictims = [];
  for (const other of enemies) {
    if (other === e) continue;
    const d = hypot(other.x, other.y, e.x, e.y);
    if (d < r) {
      other.hp -= aoeDmg;
      other.hitFlash = 1;
      spawnDamageNumber(other.x, other.y, "" + aoeDmg, "#ff6633");
      spawnParticles(other.x, other.y, "#ff6633", Math.max(1, Math.round(4 * depthVisualFactor)), 3);
      if (other.hp <= 0) chainVictims.push(other);
    }
  }

  // 圆弧爆炸波纹：连锁层数越多波纹越少（深度≥3 时不再生成波纹）
  const ringCount = isDeepChain ? 1 : 3;
  for (let k = 0; k < ringCount; k++) {
    if (fxRings.length >= BCFG.fxRingsCap) break;
    fxRings.push({
      x: e.x, y: e.y,
      r0: r * 0.3,
      rMax: r * (1.1 + k * 0.35),
      life: 0.5 + k * 0.08,
      maxLife: 0.5 + k * 0.08,
      color: "#ff6633",
    });
  }

  // 中心粒子：上限锁死，深度衰减
  const centerParticles = Math.max(0, Math.min(BCFG.explosionParticlesPerHit, Math.floor((18 + Math.floor(scale * 4)) * depthVisualFactor)));
  spawnParticles(e.x, e.y, "#ff6633", centerParticles, 5 + scale);
  sfx.explosion();
  spawnDamageNumber(e.x, e.y, "AOE " + aoeDmg, "#ff6633", true);

  // Boss 死亡爆炸震屏更猛（只首发/Boss 触发，避免连锁 Boss 叠震屏）
  if (e.isBoss && !isDeepChain) triggerShake(1.5);

  // 处理连锁死亡的敌机
  for (const v of chainVictims) {
    addScore(v.score);
    addXp(v.xp);
    combo++;
    comboTime = 2.5;
    // 连锁层数越多粒子越少，超过上限直接跳过
    const vParts = Math.max(0, Math.min(BCFG.explosionParticlesPerHit, Math.floor(20 * depthVisualFactor)));
    spawnParticles(v.x, v.y, v.color, vParts, 5);
    // 只有首发爆炸掉落道具，连锁不再掉落（防止连锁清场满屏道具）
    if (!isChain) spawnPowerup(v.x, v.y, level);
    addKill();
    if (v.splitChildren > 0) spawnSplitChildren(v);
    if (v.isBoss && !isDeepChain) {
      addScore(3000);
      triggerShake(1.5);
      for (let k = 0; k < 3; k++) spawnPowerup(v.x + rand(-30, 30), v.y + rand(-20, 20), level);
    }
    // 连锁深度的敌机继续触发下一级连锁（深度上限之外只算伤害不再递归）
    if (v._deathExplosion && !isDeepChain) {
      doEnemyDeathExplosion(v, v._deathExplosion, depth + 1);
    }
    const idx = enemies.indexOf(v);
    if (idx !== -1) removeEnemy(idx);
  }
}

function removeEnemy(idx) {
  const e = enemies[idx];
  if (e && e.isBoss) {
    // Boss击毁特效
    for (let k = 0; k < 5; k++) {
      spawnParticles(e.x + rand(-40, 40), e.y + rand(-40, 40), e.color, 15, 7);
    }
    triggerShake(1.5);
  }
  enemies.splice(idx, 1);
}

// ---------- Boss AI ----------
function updateBossAI(e, dt) {
  const phase = getCurrentBossPhase(e);
  // 缓慢移动到屏幕中上部
  if (e.y < H * 0.15) {
    e.y += e.vy * dt * 60;
  } else {
    e.x += Math.sin(e.t * 0.5) * 1.2;
    e.x = clamp(e.x, e.r + 20, W - e.r - 20);
  }
  e.t += dt;
}

function bossFire(e) {
  const phase = getCurrentBossPhase(e);
  if (!phase) return;

  switch (phase.pattern) {
    case "spread": {
      for (let i = -2; i <= 2; i++) {
        const angle = i * 0.3;
        bullets.push({
          x: e.x, y: e.y + e.r * 0.5,
          vx: Math.sin(angle) * 3, vy: 3.5,
          r: 6, friendly: false, color: "#ff4488",
          traveled: 0, maxRange: 500, life: 5,
        });
      }
      break;
    }
    case "homing": {
      spawnEnemyBullet(e, player.x, player.y, difficulty.enemyFireScale);
      break;
    }
    case "burst": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        bullets.push({
          x: e.x, y: e.y,
          vx: Math.cos(a) * 3, vy: Math.sin(a) * 3,
          r: 5, friendly: false, color: "#aa44ff",
          traveled: 0, maxRange: 400, life: 4,
        });
      }
      break;
    }
    case "laser": {
      // 简化激光：快速直线弹
      for (let i = -1; i <= 1; i++) {
        bullets.push({
          x: e.x + i * 15, y: e.y + e.r,
          vx: 0, vy: 7,
          r: 4, friendly: false, color: "#ff2222",
          traveled: 0, maxRange: 600, life: 3,
        });
      }
      break;
    }
    default: {
      spawnEnemyBullet(e, player.x, player.y, difficulty.enemyFireScale);
    }
  }
}

// ---------- 游戏逻辑 ----------
function addScore(n) {
  let v = n;
  if (player.buffs.double > 0) v *= 2;
  v *= (1 + 0.10 * (player.skills.score || 0));
  v *= (difficulty.scoreScale ?? 1);
  score += Math.round(v);
}

function addXp(n) {
  let v = n;
  if (player.skills.xpboost) v *= (1 + 0.15 * player.skills.xpboost);
  v *= (1 + (talentFxCache.xpGain || 0));
  xp += Math.round(v);
  while (xp >= xpNeed) {
    xp -= xpNeed;
    pLevel++;
    player.level = pLevel;
    xpNeed = Math.round(60 * Math.pow(1.4, pLevel - 1));
    doLevelUp();
    if (state !== STATE.PLAYING) break;
  }
}

function doLevelUp() {
  lives = Math.min(maxLives, lives + 1);
  sfx.power();
  skillChoices = generateSkillChoices(player.skills);
  if (skillChoices.length === 0) {
    lives = Math.min(maxLives, lives + 1);
    player.shield = Math.min(player.maxShield, player.shield + 1);
    return;
  }
  state = STATE.LEVELUP;
}

function chooseSkill(skillId) {
  if (!skillChoices) return;
  const skill = skillChoices.find(s => s.id === skillId);
  if (!skill) return;
  const t = applySkill(skill, player);
  if (t) toast = t;
  skillChoices = null;
  state = STATE.PLAYING;
}

function hitPlayer() {
  lives--;
  player.invincible = player.invincibleTime || 2.2;
  triggerShake(1);
  combo = 0;
  player.shield = 0;
  for (const k of Object.keys(player.buffs)) player.buffs[k] = 0;
  spawnParticles(player.x, player.y, "#4cc9f0", 20, 6);
  if (lives <= 0) {
    // 死亡慢动作 + 爆炸特效
    deathTimer = 2.0;        // 2秒死亡动画
    deathFlash = 1.0;        // 全屏白闪
    triggerShake(3);         // 强烈震动
    // 多层爆炸粒子
    spawnParticles(player.x, player.y, "#ff6b6b", 30, 8);   // 红色火花
    spawnParticles(player.x, player.y, "#ffd166", 25, 6);   // 黄色碎片
    spawnParticles(player.x, player.y, "#fff", 15, 10);      // 白色闪光
    spawnParticles(player.x, player.y, "#4cc9f0", 20, 5);   // 蓝色残片
    sfx.over();
  } else {
    sfx.boom();
    clearBullets(true); // 保留友方子弹
  }
}

function freezeAll() {
  const freezeline = player.y - player.h / 2; // 我方子弹发射线
  for (const e of enemies) {
    // 刨除与我方同一水平线及以下的敌机：子弹朝上打不到它们，
    // 若冻结就会卡在原地一直挂在那，无法击毁。
    if (e.y >= freezeline) continue;
    e.frozen = 8;
  }
}

function bombAll() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    addScore(e.score);
    addXp(e.xp);
    spawnParticles(e.x, e.y, e.color, 14, 5);
    enemies.splice(i, 1);
  }
  clearBullets(true);
  triggerShake(1);
}

function resetGame() {
  score = 0; lives = 3; level = 1; enemyLevel = 1; combo = 0; comboTime = 0;
  pLevel = 1; xp = 0; xpNeed = 60;
  stardustEarned = 0;
  isNewBest = false;

  const talentFx = getTalentEffects();
  talentFxCache = talentFx;            // 缓存，addXp 直接复用，避免每次击杀重算
  const aircraftCfg = getSelectedAircraftConfig();
  player = createPlayer(aircraftCfg, talentFx);
  maxLives = getMaxLives(player.baseHp, player.skills.maxhp || 0);
  lives = maxLives;

  // 休闲模式：射程直接满级（fireBullet 按 player.skills.range 实时取，
  // 设为满级后每发子弹自动获最大射程；同时因 cur>=max 自动退出升级池）
  if (difficultyKey === "easy") {
    player.skills.range = 5;              // SKILLS.range.max
  }

  // 难度档位开局技能（如休闲模式天基武器）
  if (difficulty.startSkills) {
    for (const [id, lv] of Object.entries(difficulty.startSkills)) {
      player.skills[id] = (player.skills[id] || 0) + lv;
    }
  }

  clearBullets(); clearEnemies(); clearParticles(); clearPowerups(); clearDamageNumbers();
  fxRings = [];
  resetCamera();
  resetWaves();
  skillChoices = null;
  frame = 0;
  toast = null;

  if (showTutorial) {
    // 先进入教程界面，等玩家点击后再正式开始
    state = STATE.TUTORIAL;
    tutorialTimer = 1;
  } else {
    state = STATE.PLAYING;
    startMusic();
    musicStarted = true;
    tutorialTimer = 0;
  }

  initStars();
}

/** 绘制爆炸弹圆弧波纹（多层扩散圆环，随生命线性消散） */
function drawExplosionRings(ctx) {
  for (const r of fxRings) {
    const t = r.life / r.maxLife;            // 1→0
    const radius = r.r0 + (r.rMax - r.r0) * (1 - t);
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2.5 * t + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, TAU);
    ctx.stroke();
    // 内圈淡填充
    ctx.globalAlpha = t * 0.15;
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** 教程界面点击/按键后正式开始游戏 */
function startPlaying() {
  state = STATE.PLAYING;
  tutorialTimer = 0;
  startMusic();
  musicStarted = true;
}

// ---------- 绘制 ----------
function draw() {
  ctx.save();
  if (state === STATE.PLAYING || state === STATE.LEVELUP || state === STATE.OVER || state === STATE.PAUSED || state === STATE.TUTORIAL) {
    applyCamera(ctx);
  }

  // 背景
  ctx.fillStyle = "#05070f";
  ctx.fillRect(-10, -10, W + 20, H + 20);
  const bg = ctx.createRadialGradient(W / 2, H * 0.3, 60, W / 2, H / 2, H);
  bg.addColorStop(0, "rgba(30,50,90,.5)");
  bg.addColorStop(1, "rgba(5,7,15,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, frame);
  drawPowerups(ctx);
  drawBullets(ctx);
  drawEnemies(ctx, frame);
  // 死亡动画期间玩家闪烁
  if (deathTimer > 0 && player) {
    if (Math.floor(deathTimer * 10) % 2 === 0) drawPlayer(ctx, player, frame);
  } else if (state !== STATE.OVER && player) {
    drawPlayer(ctx, player, frame);
  }
  drawParticles(ctx);
  drawExplosionRings(ctx);
  drawDamageNumbers(ctx);

  // 死亡白屏闪烁
  if (deathFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${deathFlash * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Toast
  if (toast && toast.t > 0) drawToast(ctx, toast);

  ctx.restore();

  // 虚拟摇杆（UI 层，不受震动影响）
  if ((state === STATE.PLAYING) && isStickActive()) {
    const s = getStick();
    ctx.globalAlpha = 0.85;
    // 底座
    ctx.strokeStyle = "rgba(255,255,255,.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.baseX, s.baseY, 36, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.beginPath();
    ctx.arc(s.baseX, s.baseY, 36, 0, TAU);
    ctx.fill();
    // 中心十字
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.baseX - 12, s.baseY); ctx.lineTo(s.baseX + 12, s.baseY);
    ctx.moveTo(s.baseX, s.baseY - 12); ctx.lineTo(s.baseX, s.baseY + 12);
    ctx.stroke();
    // 摇杆头
    ctx.fillStyle = "rgba(94,230,255,.75)";
    ctx.beginPath();
    ctx.arc(s.baseX + s.dx, s.baseY + s.dy, 20, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#5ee6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.baseX + s.dx, s.baseY + s.dy, 20, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // HUD（不受震动影响）
  if (state === STATE.PLAYING || state === STATE.OVER) {
    if (player) drawHUD(ctx, {
      score, best: getBest(), level, enemyLevel, pLevel, xp, xpNeed,
      lives, maxLives, combo, player, frame,
    });
    if (state === STATE.PLAYING) drawPauseButton(ctx);
  }

  // 教程界面（点击任意处后游戏才正式开始）
  if (state === STATE.TUTORIAL) {
    const a = 0.15 + 0.55 * clamp(tutorialTimer, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(5,7,15,.6)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ffd166";
    setf(ctx, "bold 26px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("左 / 右 移动躲避敌机", W / 2, H * 0.36);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    setf(ctx, "16px 'sans-serif'");
    ctx.fillText("射击为自动 · 子弹命中后消失", W / 2, H * 0.42);
    ctx.fillText("击落敌机积经验，升级可选择技能", W / 2, H * 0.46);

    // 点击开始提示（呼吸闪烁）
    if (Math.sin(frame * 0.08) > -0.3) {
      ctx.fillStyle = "#5ee6ff";
      setf(ctx, "bold 22px 'sans-serif'");
      ctx.fillText("点击任意处开始", W / 2, H * 0.78);
    }
  }

  if (state === STATE.MENU) drawMenu(ctx, getBest(), difficultyKey, DIFFICULTY_PRESETS);
  else if (state === STATE.OVER) drawGameOver(ctx, score, getBest(), isNewBest);
  else if (state === STATE.LEVELUP) drawLevelUp(ctx, skillChoices, player?.skills || {});
  else if (state === STATE.PAUSED) drawPause(ctx, player);
}

// ---------- 输入事件 ----------
window.addEventListener("keydown", e => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (state === STATE.PLAYING) { state = STATE.PAUSED; return; }
    if (state === STATE.PAUSED) { state = STATE.PLAYING; return; }
  }
  if (e.code === "Space" || e.code === "Enter") {
    if (state === STATE.MENU) resetGame();
    else if (state === STATE.OVER) resetGame();
    else if (state === STATE.TUTORIAL) startPlaying();
  }
  if (state === STATE.LEVELUP) {
    const idx = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
    if (idx >= 0 && skillChoices && idx < skillChoices.length) {
      chooseSkill(skillChoices[idx].id);
    }
  }
});

canvas.addEventListener("pointerdown", e => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width * W;
  const my = (e.clientY - rect.top) / rect.height * H;

  if (state === STATE.TUTORIAL) { startPlaying(); return; }

  if (state === STATE.PLAYING && hitTestButton(mx, my, getPauseButton())) {
    state = STATE.PAUSED;
    return;
  }

  if (state === STATE.MENU) {
    // 难度选择
    for (const [k, rect] of Object.entries(getDifficultyRects())) {
      if (hitTestButton(mx, my, rect)) {
        difficultyKey = k;
        difficulty = DIFFICULTY_PRESETS[k];
        return;
      }
    }
    if (hitTestButton(mx, my, getStartButton())) { resetGame(); return; }
  }
  if (state === STATE.OVER && hitTestButton(mx, my, getRestartButton())) { resetGame(); return; }
  if (state === STATE.PAUSED) {
    if (hitTestButton(mx, my, getPauseResumeButton())) { state = STATE.PLAYING; return; }
    if (hitTestButton(mx, my, getPauseQuitButton())) {
      state = STATE.MENU;
      stopMusic();
      musicStarted = false;
      return;
    }
  }
  if (state === STATE.LEVELUP) {
    for (const card of getSkillCards()) {
      if (hitTestButton(mx, my, card)) { chooseSkill(card.id); return; }
    }
  }
});

// 导出给外部（调试用）
window.__game = {
  resetGame, freezeAll, bombAll,
  state: () => state, getPlayer: () => player,
  getScore: () => score, getEnemyLevel: () => enemyLevel,
  getMaxLives: () => maxLives, getLives: () => lives,
  get enemies() { return enemies; },
  get bullets() { return bullets; },
  spawnEnemy, fireBullet, getShootPattern,
  setDifficulty: (key) => { difficultyKey = key; difficulty = DIFFICULTY_PRESETS[key]; },
};
