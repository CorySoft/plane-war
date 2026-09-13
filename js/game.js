/* ===========================================================
 * game.js — 主游戏循环 + 状态机 + 碰撞检测
 * =========================================================== */

import { W, H, STATE, BULLET as BCFG, TAU, DIFFICULTY_PRESETS, ENEMY_LEVEL, POWERUP_DROP, META, computeViewport, setViewport } from "./config.js";
import { clamp, rand, hypot, setf } from "./utils.js";
import { glowText } from "./theme.js";
import { sfx, startMusic, stopMusic, initAudio, setSfxMuted, setMusicMuted } from "./audio.js";
import { initInput, bindTouchButtons, getStick, isStickActive, setDifficulty as setPlayerDifficulty, isEasyMode, getEasyTouch } from "./input.js";
import { spawnParticles, updateParticles, drawParticles, clearParticles } from "./particles.js";
import { triggerShake, updateCamera, applyCamera, resetCamera, slowmo } from "./camera.js";
import {
  bullets, fireBullet, spawnEnemyBullet, spawnSplitBullet, spawnLaserVolley,
  spawnHostileBullet, applyPierceOrRemove, removeBullet,
  updateBullets, drawBullets, clearBullets, hasPlayerMainBullet, maxMainBulletTraveled, markMainBulletsTriggered
} from "./bullet.js";
import {
  enemies, spawnEnemy, updateEnemies, getEnemyShooters,
  drawEnemies, clearEnemies, spawnSplitChildren, removeEnemyEx
} from "./enemy.js";
import { spawnPowerup, updatePowerups, drawPowerups, clearPowerups, updateGachaAnim, drawGachaAnim, getGachaAnim, clearGachaAnim, setGachaAnim } from "./powerup.js";
import { generateSkillChoices, applySkill, getMaxLives } from "./skill.js";
import { createPlayer, updatePlayer, getShootPattern, drawPlayer, getOrbitBullets, removeOrbitBullet } from "./player.js";
import {
  getDifficultyLevel, getSpawnRate, updateWaves, resetWaves,
  spawnBoss, getCurrentBossPhase, BOSS_TYPES, spawnSwarm
} from "./wave.js";
import { drawHUD } from "./hud.js";
import {
  drawMenu, drawGameOver, drawLevelUp, drawPause, drawPauseButton, drawToast, drawRevive,
  drawDetailCard, setDetailCard, getDetailCard,
  getDetailCloseRect, getCodexCardRects, getPowerupCardRects, getAchieveCardRects,
  powerupDescFull, drawSkillAnim,
  drawStars, updateStars, initStars,
  spawnDamageNumber, updateDamageNumbers, drawDamageNumbers, clearDamageNumbers,
  hitTestButton, getStartButton, getRestartButton, getGameOverMenuButton,
  getPauseResumeButton, getPauseQuitButton, getPauseButton, getSkillCards, getDifficultyRects,
  getCodexButton, getCodexBackButton, getPowerupCodexButton, getPowerupCodexBackButton, getAchieveButton, getAchieveBackButton, getQuestClaimButtons,
  getShopButton, getShopBackButton, getShopBuyButtons,
  getReviveYesButton, getReviveNoButton, setMenuPage, getMenuPage,
  getHangarButton, getHangarBackButton, getHangarCards,
  getTalentButton, getTalentBackButton, getTalentCards,
  getSettingsButton, getSettingsBackButton, getSettingToggles,
  getClearCacheButton, drawClearCacheConfirm, getClearYesButton, getClearNoButton, getShowClearCache, setShowClearCache,
} from "./ui.js";

// Debug mode
const DEBUG_MODE = true;
import {
  loadMeta, earnStardust, getBest, getTalentEffects, getShopEffects, purchaseShopItem, addKill, getSelectedAircraftConfig,
  discoverSkill, getDiscoveredSkills, spendStardust, getStardust,
  checkAchievements, getQuestView, claimQuest, addBossKill,
  getSettings, toggleSetting, unlockAircraft, setSelectedAircraft, purchaseTalent,
} from "./meta.js";

// ---------- 画布初始化 ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 注意：state 必须在 resize() 调用之前声明（避免 TDZ 引用错误）
let state = STATE.MENU;
let lastLogicW = -1, lastLogicH = -1;
let DPR = 1;    // devicePixelRatio，用于提高 canvas 像素密度（小字号不再发虚）

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
    // 按 devicePixelRatio 提升 backing store 像素密度，避免浏览器插值拉伸导致小字号发虚。
    // 坐标/字号仍用逻辑像素（draw 里用 ctx.scale(dpr, dpr) 还原），输入归一化也不受影响。
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    DPR = dpr;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    // 重置任何残留的 transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
window.addEventListener("resize", resize);
resize();
initStars();   // 启动即铺好星野，主菜单背后不是死黑

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
let shopFxCache = null;      // 本局商店加成缓存
let fxRings = [];           // 爆炸弹圆弧波纹（临时光效，随时间扩散消散）
let fxBlasts = [];          // 爆炸瞬间填充闪（即时膨胀到真实伤害半径，让反馈同步）
let deathTimer = 0;         // 死亡慢动作倒计时
let deathFlash = 0;         // 死亡白屏闪烁
let startBest = 0;          // 本局开局时的最高分基准
let newBestFx = 0;          // 新突破特效计时（>0 时播放）
let newBestOnce = false;    // 本局是否已触发过新突破特效
let lastTime = performance.now();
let now = 0;
let toast = null;
let difficultyKey = "normal";
let difficulty = DIFFICULTY_PRESETS.normal;
let showTutorial = true;   // 新手教程提示
let tutorialTimer = 0;     // 教程剩余显示时间
let musicStarted = false;
let reviveUsed = false;    // 本局是否已用过复活（每局限 1 次）

// ---------- 初始化（失败也尽量让 loading 走掉，靠兜底显示菜单） ----------
try {
  initInput(canvas);
  bindTouchButtons(
    document.getElementById("btnLeft"),
    document.getElementById("btnRight")
  );
  loadMeta();
  applyAudioSettings();
  initStars();
  resetCamera();
} catch (e) {
  console.error("[plane_war] 初始化异常:", e.message, e.stack);
}

// 通知主页面：模块加载完成，隐藏 loading（无论是否异常）
try { if (typeof window !== "undefined" && window.__doneLoading) window.__doneLoading(); } catch (_) {}

// 标记游戏模块启动成功（非 ESM 兜底脚本靠这个判断是否需要显示 fallback）
try {
  if (typeof window !== "undefined") window.__gameReady = true;
  var fb = window.document.getElementById('fallback');
  if (fb) fb.style.display = 'none';
  var el = window.document.getElementById('loader');
  if (el && el.parentNode) el.parentNode.removeChild(el);
} catch (_) {}

// 左右控制按钮仅在游戏进行中显示
let touchShown = false;
function syncTouchUI() {
  const show = state === STATE.PLAYING;
  if (show === touchShown) return;
  const ui = document.querySelector(".touch-ui");
  if (ui) ui.classList.toggle("show", show);
  touchShown = show;
}

try { loop(); } catch (e) {
  console.error("[plane_war] loop 启动异常:", e.message, e.stack);
}

// ---------- 主循环 ----------

function loop() {
  // 用真实帧间隔驱动游戏逻辑，避免高刷新率(120/144Hz)时游戏整体变快；
  // 上限 0.05s 防止卡顿/切后台后瞬移。
  const tNow = performance.now();
  const rawDt = Math.min(Math.max((tNow - lastTime) / 1000, 0), 0.05);
  lastTime = tNow;
  // 死亡慢动作：逐渐减速
  if (deathTimer > 0) {
    deathTimer -= rawDt;
    // 死亡慢动作已通过 updateCamera(dt, combo, deathTarget) 处理
    deathFlash = Math.max(0, deathFlash - rawDt * 2);
  }
  const dt = rawDt * (state === STATE.PLAYING ? slowmo : 1);
  now = tNow / 1000;

  // 容错：单帧异常不打断 requestAnimationFrame 链（避免画面卡死）
  try {
    // 星空始终动画（含菜单/结束画面）
    updateStars(dt);

    if (state === STATE.PLAYING) {
      update(dt);
      frame++;
      if (newBestFx > 0) newBestFx -= dt;
      // 道具拾取触发抽奖动画：自动暂停游戏，等待用户点击继续
      // （若同帧已进入升级选择，退出抽奖时按 skillChoices 恢复，避免丢失三选一）
      if (getGachaAnim()) state = STATE.GACHA;
      // 死亡动画结束：星尘充足且本局未复活过 → 进入复活选择；否则结算
      if (deathTimer <= 0 && lives <= 0) {
        if (!reviveUsed && getStardust() >= META.reviveCost) {
          state = STATE.REVIVE;
          deathFlash = 0;
        } else {
          gameOver();
        }
      }
    } else if (state === STATE.LEVELUP || state === STATE.TUTORIAL) {
      // 升级界面/教程界面暂停游戏逻辑（星空与初始画面仍静态呈现）
      frame++;
    }

    // GACHA 状态：游戏暂停，仅更新抽奖动画
    if (state === STATE.GACHA) {
      updateGachaAnim(dt);
      frame++;
    }

    // toast衰减（全局，不依赖 state）
    if (toast) {
      toast.t -= dt;
      if (toast.t <= 0) toast = null;
    }

    draw();
    syncTouchUI();
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

    // 疯狂追击：全屏追踪弹转向最近敌机
    if (player.buffs.madHunt > 0 && enemies.length > 0) {
      for (const b of bullets) {
        if (!b) continue;
        if (!b.friendly || !b.homing) continue;
        let best = null, bd = Infinity;
        for (const e of enemies) {
          const d = hypot(e.x - b.x, e.y - b.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) continue;
        const cur = Math.atan2(b.vy, b.vx);
        const target = Math.atan2(best.y - b.y, best.x - b.x);
        let da = target - cur;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const sp = Math.hypot(b.vx, b.vy);
        const na = cur + da * Math.min(1, 10 * dt);
        b.vx = Math.cos(na) * sp;
        b.vy = Math.sin(na) * sp;
      }
    }
    updateEnemies(dt, level, player.x, player.y, player.h);

    // 死亡动画期间跳过玩家输入/射击
    if (deathTimer > 0 && lives <= 0) {
      // 仅更新圆弧爆炸波纹与爆炸填充闪
      for (let i = fxRings.length - 1; i >= 0; i--) {
        const r = fxRings[i];
        r.life -= dt;
        if (r.life <= 0) fxRings.splice(i, 1);
      }
      for (let i = fxBlasts.length - 1; i >= 0; i--) {
        const b = fxBlasts[i];
        b.life -= dt;
        if (b.life <= 0) fxBlasts.splice(i, 1);
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

    // 简单模式：仅拖动时跟随手指，不拖动时左右按钮/键盘正常生效
    if (isEasyMode()) {
      const t = getEasyTouch();
      if (t.active) player.x = clamp(t.x, 20, W - 20);
    }
    if (shouldFire) {
      // 先把当前所有尚未触发的主弹标记为「已触发」：每颗主弹只允许触发一次下一波射击，
      // 避免同一波多颗子弹依次越过 10m 时反复触发造成误连射。新发的子弹 traveled=0 仍可触发下一波。
      markMainBulletsTriggered();
      const patterns = getShootPattern(player);
      for (const p of patterns) {
        fireBullet(p.angle, p.dmg, player, p.x, p.y, p.spd, p.isExplosion, p.homing);
      }
      sfx.shoot();
    }

    // 圆弧爆炸波纹更新（收缩生命，越短越淡）
    for (let i = fxRings.length - 1; i >= 0; i--) {
      const r = fxRings[i];
      r.life -= dt;
      if (r.life <= 0) fxRings.splice(i, 1);
    }

    // 爆炸瞬间填充闪更新
    for (let i = fxBlasts.length - 1; i >= 0; i--) {
      const b = fxBlasts[i];
      b.life -= dt;
      if (b.life <= 0) fxBlasts.splice(i, 1);
    }

    // 处理玩家事件标记
    if (player._addLife) {
      lives = Math.min(maxLives, lives + 1);
      player._addLife = false;
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
    if (player._xp) {
      addXp(player._xp);
      player._xp = 0;
    }

    // 道具掉落
    const magnetActive = player.buffs.magnet > 0 || (player.skills.magnet || 0) > 0;
    updatePowerups(dt, player, magnetActive);

    // 抽奖动画更新
    updateGachaAnim(dt);

    // 难度
    const newLevel = getDifficultyLevel(score);
    if (newLevel > level) {
      level = newLevel;
      sfx.power();
    }

    // 敌方等级（每8000分升1级，上限30）
    const newEnemyLevel = Math.min(ENEMY_LEVEL.maxLevel, 1 + Math.floor(score / ENEMY_LEVEL.scorePerLevel));
    if (newEnemyLevel > enemyLevel) {
      enemyLevel = newEnemyLevel;
      sfx.power();
    }

    // 波次事件
    const waveEvent = updateWaves(dt, level, now, difficulty);
    if (waveEvent === "boss") {
      const bossTypes = Object.keys(BOSS_TYPES);
      const bossType = bossTypes[Math.floor(Math.random() * bossTypes.length)];
      spawnBoss(bossType, level);
      toast = { text: "Boss 来袭！", color: "#ff6b6b", t: 2.5 };
      sfx.boom();
      triggerShake(1.2);
    } else if (waveEvent === "bossWarn") {
      toast = { text: "⚠ Boss 即将来袭！", color: "#ff8fa3", t: 2.5 };
      sfx.power();
    } else if (waveEvent === "swarmWarn") {
      toast = { text: "⚠ 大波敌机正在赶来！", color: "#ff8fa3", t: 3 };
      sfx.power();
    } else if (waveEvent === "swarm") {
      spawnSwarm(level, difficulty, enemyLevel);
      toast = { text: "虫群来袭！", color: "#ff6b6b", t: 2 };
      sfx.boom();
    }

    // 生成敌人
    const spawnRate = getSpawnRate(level, difficulty.spawnScale);
    if (Math.random() < spawnRate * dt) spawnEnemy(level, difficulty, enemyLevel);

    // 敌机开火
    const shooters = getEnemyShooters(player.x, player.y, dt, difficulty.fireCdScale);
    for (const e of shooters) {
      if (e.type === "boss") {
        bossFire(e);
      } else if (e.type === "laser" || e._laserShot) {
        e._laserShot = false;
        spawnLaserVolley(e, player.x, player.y, difficulty.enemyFireScale);
      } else {
        spawnEnemyBullet(e, player.x, player.y, difficulty.enemyFireScale);
      }
    }

    // Boss AI
    for (const e of enemies) {
      if (e.isBoss) updateBossAI(e, dt, level, difficulty);
    }

    // 碰撞检测
    checkCollisions();
  }
}

// ---------- 碰撞检测 ----------
function checkCollisions() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e) continue;

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
      if (!b) continue;
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
      if (!ob) continue;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e) continue;
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
    if (!b) continue;
    if (b.friendly) continue;
    if (player.invincible > 0) continue;
    const dist = hypot(player.x, player.y, b.x, b.y);
    if (dist < 20) {
      removeBullet(b);
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
  // 击退：按子弹飞行方向把敌机推开
  if (b.knockback > 0) {
    applyKnockback(e, b);
  }

  if (e.shieldHp > 0) {
    e.shieldHp--;
    spawnParticles(b.x, b.y, "#44aaff", 6, 3);
    spawnDamageNumber(b.x, b.y, "护盾", "#44aaff");
    applyPierceOrRemove(b);
    return;
  }

  e.hp -= b.dmg;
  e.hitFlash = 1;
  spawnDamageNumber(e.x, e.y, b.isCrit ? b.dmg + "!" : "" + b.dmg, b.isCrit ? "#ff8fa3" : "#fff", b.isCrit);

  // 分裂行为：命中时触发碎片（穿透弹也可叠加分裂）
  if (b.behaviors.has("split") && !b.isScatter) {
    const cnt = b.splitCount || 1;
    for (let k = 0; k < cnt; k++) {
      const angle = (k / cnt) * Math.PI - Math.PI / 2;
      const sdmg = Math.max(1, Math.round(b.dmg * BCFG.splitDmgRatio));
      spawnSplitBullet(b.x, b.y, angle, sdmg, "#a0ffd0", b.r);
    }
    sfx.scatter();
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
    spawnPowerup(e.x, e.y, level, getDropBonus());
    sfx.boom();
    addKill();
    lifestealOnKill();

    // 分裂敌机
    if (e.splitChildren > 0) {
      spawnSplitChildren(e);
    }

    // Boss 击败奖励
    if (e.isBoss) {
      addScore(3000);
      triggerShake(1.5);
      addBossKill();
      // Boss掉落多个道具（技能/随机技能）
      for (let k = 0; k < 3; k++) spawnPowerup(e.x + rand(-30, 30), e.y + rand(-20, 20), level, getDropBonus(), true);
    }

    // 只有真正击杀的子弹是爆炸弹时才触发死亡爆炸
    if (b.behaviors.has("explosion")) {
      doEnemyDeathExplosion(e, {
        dmg: b.dmg,
        radius: b.explosionRadius,
        expDmgRatio: b.expDmgRatio,
      });
    }

    removeEnemy(enemyIdx);
    applyPierceOrRemove(b);
  } else {
    applyPierceOrRemove(b);
  }
}

/** 击退敌机：沿方向推，且短暂减速 */
function applyKnockback(e, src) {
  if (e.isBoss) return;
  const len = Math.hypot(src.vx, src.vy) || 1;
  e.kx = (src.vx / len) * Math.min(12, (src.knockback || 3) * 1.0);
  e.ky = (src.vy / len) * Math.min(12, (src.knockback || 3) * 1.0);
  e.kbTimer = 0.15;
}

/** 护体弹命中敌机：造成伤害并处理击毁 */
function orbitHitEnemy(e, ob, enemyIdx) {
  // 护体弹自动拥有击退（只要护体技能≥1 级）
  const guardLvl = player.skills.guard || 0;
  const kbBuff = (player.buffs?.knockback || 0) > 0;
  const kb = (guardLvl > 0 || kbBuff) ? ob.dmg * (BCFG.knockbackPerLevel + (kbBuff ? 0.3 : 0)) : 0;
  if (kb > 0 && !e.isBoss) {
    const dist = Math.hypot(e.x - ob.x, e.y - ob.y) || 1;
    const dirX = (e.x - ob.x) / dist;
    const dirY = (e.y - ob.y) / dist;
    e.kx = dirX * Math.min(9, kb * 0.6);
    e.ky = dirY * Math.min(9, kb * 0.6);
    e.kbTimer = 0.12;
  }

  // 护盾敌机
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
    spawnPowerup(e.x, e.y, level, getDropBonus());
    sfx.boom();
    addKill();
    lifestealOnKill();
    if (e.splitChildren > 0) spawnSplitChildren(e);
    if (e.isBoss) {
      addScore(3000);
      triggerShake(1.5);
      addBossKill();
      for (let k = 0; k < 3; k++) spawnPowerup(e.x + rand(-30, 30), e.y + rand(-20, 20), level, getDropBonus(), true);
    }

    removeEnemy(enemyIdx);
  } else {
    spawnParticles(ob.x, ob.y, e.color, 6, 3);
    sfx.hit();
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
  const expDmgRatio = info.expDmgRatio || BCFG.explosionBaseDmgRatio;
  const shopBonus = shopFxCache?.expDmgBonus || 0;
  const aoeDmg = Math.max(1, Math.round(info.dmg * (expDmgRatio + shopBonus) * (0.5 + 0.5 * scale)));

  const isChain = depth > 0;                     // 是否为连锁爆炸
  const isDeepChain = depth >= BCFG.explosionMaxChainDepth;  // 超过连锁深度上限
  // 深度衰减：连锁越深粒子/波纹越少（第 2 层 50%，第 3 层 20%，第 4 层+ 不再生成粒子/波纹）
  const depthVisualFactor = Math.pow(0.5, depth);

  // 爆炸瞬间填充闪：0→真实伤害半径在 0.15s 内膨胀完毕，让视觉与伤害同步
  fxBlasts.push({ x: e.x, y: e.y, rMax: r, life: 0.15, maxLife: 0.15, color: "#ff6633" });

  // AOE 伤害周围敌机（连带可能引发连锁爆炸）
  const chainVictims = [];
  for (const other of enemies) {
    if (other === e) continue;
    const d = hypot(other.x, other.y, e.x, e.y);
    if (d < r) {
      if (other.shieldHp > 0) {
        other.shieldHp = Math.max(0, other.shieldHp - 1);
        spawnDamageNumber(other.x, other.y, "护盾", "#44aaff");
        spawnParticles(other.x, other.y, "#44aaff", Math.max(1, Math.round(4 * depthVisualFactor)), 3);
        continue;
      }
      other.hp -= aoeDmg;
      other.hitFlash = 1;
      spawnDamageNumber(other.x, other.y, "" + aoeDmg, "#ff6633");
      spawnParticles(other.x, other.y, "#ff6633", Math.max(1, Math.round(4 * depthVisualFactor)), 3);
      // 标记被爆炸AOE命中的敌机，允许触发连锁
      if (!other._deathExplosion) other._deathExplosion = info;
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
    if (!isChain) spawnPowerup(v.x, v.y, level, getDropBonus());
    addKill();
    lifestealOnKill();
    if (v.splitChildren > 0) spawnSplitChildren(v);
    if (v.isBoss && !isDeepChain) {
      addScore(3000);
      triggerShake(1.5);
      addBossKill();
      for (let k = 0; k < 3; k++) spawnPowerup(v.x + rand(-30, 30), v.y + rand(-20, 20), level, getDropBonus());
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
  removeEnemyEx(idx);
}

// ---------- Boss AI ----------
function updateBossAI(e, dt, level, diff) {
  const phase = getCurrentBossPhase(e);

  // 相位切换：应用相位专属属性（如堡垒的护盾发生器），并刷新技能计时
  if (phase.hpPct !== e._phaseHpPct) {
    e._phaseHpPct = phase.hpPct;
    e.shieldHp = phase.shieldGens || 0;
    e.spawnTimer = phase.spawnInterval || 0;
    e.teleportTimer = phase.teleportInterval || 999;
    if (e.shieldHp > 0) {
      spawnParticles(e.x, e.y, "#44aaff", 24, 6);
      sfx.hit();
    }
  }

  // 缓慢移动到屏幕中上部
  if (e.y < H * 0.15) {
    e.y += e.vy * dt * 60;
  } else {
    // 幻影：按相位间隔传送
    if (phase.teleportInterval) {
      e.teleportTimer -= dt;
      if (e.teleportTimer <= 0) {
        e.x = rand(20 + e.r, Math.max(20 + e.r, W - e.r - 20));
        e.y = H * 0.15 + rand(0, 40);
        e.teleportTimer = phase.teleportInterval;
        spawnParticles(e.x, e.y, "#aa44ff", 24, 6);
        spawnParticles(e.x, e.y, "#aa44ff", 24, 6);
        sfx.power();
      }
    } else {
      e.x += Math.sin(e.t * 0.5) * 1.2;
      e.x = clamp(e.x, e.r + 20, W - e.r - 20);
    }

    // Boss 持续召唤小怪（无 spawnInterval 相位也自动召唤）
    if (!phase.spawnInterval) {
      e._infSpawnTimer = (e._infSpawnTimer || 0) + dt;
      if (e._infSpawnTimer >= 3.5) {
        e._infSpawnTimer = 0;
        const elvl = e.enemyLevel || enemyLevel;
        spawnEnemy(level, diff, elvl, e.x - rand(30, 70), e.y + 30);
        spawnEnemy(level, diff, elvl, e.x + rand(30, 70), e.y + 30);
      }
    }

    // 母舰：按相位间隔派遣护航小兵
    if (phase.spawnInterval) {
      e.spawnTimer -= dt;
      if (e.spawnTimer <= 0) {
        e.spawnTimer = phase.spawnInterval;
        const elvl = e.enemyLevel || enemyLevel;
        spawnEnemy(level, diff, elvl, e.x - rand(30, 70), e.y + 30);
        spawnEnemy(level, diff, elvl, e.x + rand(30, 70), e.y + 30);
        spawnEnemy(level, diff, elvl, e.x + rand(-120, 120), e.y + 30);
        sfx.power();
      }
    }
  }
  e.t += dt;
}

function bossFire(e) {
  const phase = getCurrentBossPhase(e);
  if (!phase) return;
  const scale = difficulty.enemyFireScale || 1;

  switch (phase.pattern) {
    case "spread": {
      for (let i = -2; i <= 2; i++) {
        const angle = i * 0.3;
        spawnHostileBullet(e.x, e.y + e.r * 0.5, Math.sin(angle) * 3 * scale, 3.5 * scale, {
          r: 6, color: "#ff4488", maxRange: 500, life: 5,
        });
      }
      break;
    }
    case "homing": {
      spawnEnemyBullet(e, player.x, player.y, scale);
      break;
    }
    case "burst": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        spawnHostileBullet(e.x, e.y, Math.cos(a) * 3 * scale, Math.sin(a) * 3 * scale, {
          r: 5, color: "#aa44ff", maxRange: 400, life: 4,
        });
      }
      break;
    }
    case "laser": {
      spawnLaserVolley(e, player.x, player.y, scale);
      break;
    }
    default: {
      spawnEnemyBullet(e, player.x, player.y, scale);
    }
  }
}

// ---------- 游戏逻辑 ----------
function addScore(n) {
  let v = n;
  if (player.buffs.double > 0) v *= 2;
  v *= (1 + 0.10 * (player.skills.score || 0));
  v *= (1 + (shopFxCache?.scoreBonus || 0));
  v *= (difficulty.scoreScale ?? 1);
  score += Math.round(v);
  // 第一次超过本局开局基准：触发“新突破”特效
  if (!newBestOnce && startBest > 0 && score > startBest) {
    newBestOnce = true;
    newBestFx = 2.4;
    sfx.power();
  }
  // 成就结算（分数/连击里程碑在得分瞬间即可判定）
  showAchievementToast(checkAchievements({ runScore: score, runLevel: pLevel, runCombo: combo }));
}

// 能量吸取：每级 15% 概率在击杀时回复 1 生命（不超过最大生命）
function lifestealOnKill() {
  const lv = player.skills.lifesteal || 0;
  if (lv <= 0) return;
  if (Math.random() < lv * 0.15) {
    lives = Math.min(maxLives, lives + 1);
    spawnDamageNumber(player.x, player.y - 30, "+♥", "#ff6b9d", false);
  }
}

// 当前附带掉落率加成（爆率技能 + 幸运爆率 buff + 天赋，概率加算）
function getDropBonus() {
  let b = 0;
  b += (player.skills.drop || 0) * POWERUP_DROP.skillPerLevel;
  if (player.buffs.drop > 0) b += POWERUP_DROP.buffBonus;
  b += (talentFxCache?.dropRate || 0);
  b += (shopFxCache?.dropRate || 0);
  return b;
}

function addXp(n) {
  let v = n;
  if (player.skills.xpboost) v *= (1 + 0.15 * player.skills.xpboost);
  v *= (1 + (talentFxCache.xpGain || 0) + (shopFxCache?.xpGain || 0));
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
  // 被击中火力等级下降一级（最低保留 1 级），鼓励重新吃火力道具
  player.power = Math.max(1, player.power - 1);
  player.powerTime = 0;
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

/** 成就达成提示（新达成一批时弹 toast + 音效） */
function showAchievementToast(list) {
  if (!list || !list.length) return;
  toast = { text: "成就达成  " + list.map(a => a.name).join("、"), color: "#7CFC00", t: 2.6 };
  sfx.power();
}

/** 正常结算（未复活/放弃复活）：结算星尘、最高分与成就 */
function gameOver() {
  state = STATE.OVER;
  isNewBest = score > getBest();
  stardustEarned = earnStardust(score);
  stopMusic();
  musicStarted = false;
  deathFlash = 0;
  showAchievementToast(checkAchievements({ runScore: score, runLevel: pLevel, runCombo: combo }));
}

/** 付费复活：花 50 星尘原地续命（每局限 1 次） */
function doRevive() {
  if (!spendStardust(META.reviveCost)) { gameOver(); return; }
  reviveUsed = true;
  lives = 1;
  player.x = W / 2;
  player.y = H - player.h / 2 - 40;
  player.invincible = player.invincibleTime || 2.2;
  combo = 0; comboTime = 0;
  deathTimer = 0; deathFlash = 0;
  clearBullets(true);      // 清掉敌方子弹，保留友方
  showAchievementToast(checkAchievements({ runScore: score, runLevel: pLevel, runCombo: combo, reviveUsed: true }));
  toast = { text: "复活成功！", color: "#ffd166", t: 1.8 };
  sfx.power();
  state = STATE.PLAYING;
  startMusic();
  musicStarted = true;
}

function applyAudioSettings() {
  const s = getSettings();
  setSfxMuted(!!s.sfxMuted);
  setMusicMuted(!!s.musicMuted);
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

function resetGame() {
  score = 0; lives = 3; level = 1; enemyLevel = 1; combo = 0; comboTime = 0;
  pLevel = 1; xp = 0; xpNeed = 60;
  stardustEarned = 0;
  isNewBest = false;
  startBest = getBest();
  newBestOnce = false;
  newBestFx = 0;
  reviveUsed = false;

  const talentFx = getTalentEffects();
  const shopFx = getShopEffects();
  talentFxCache = talentFx;
  shopFxCache = shopFx;            // 缓存，addXp 直接复用，避免每次击杀重算
  const aircraftCfg = getSelectedAircraftConfig();
  player = createPlayer(aircraftCfg, talentFx, shopFx);
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

  // 开局授予/自带技能一并点亮图鉴（飞机起始技能、难度开局技能、休闲满射程）
  for (const id of Object.keys(aircraftCfg.startSkills || {})) discoverSkill(id);
  for (const id of Object.keys(difficulty.startSkills || {})) discoverSkill(id);
  if (difficultyKey === "easy") discoverSkill("range");

  clearBullets(); clearEnemies(); clearParticles(); clearPowerups(); clearDamageNumbers();
  fxRings = [];
  fxBlasts = [];
  resetCamera();
  resetWaves();
  skillChoices = null;
  frame = 0;
  toast = null;

  const skipTutorial = !showTutorial || !!getSettings().skipTutorial;
  if (skipTutorial) {
    state = STATE.PLAYING;
    startMusic();
    musicStarted = true;
    tutorialTimer = 0;
  } else {
    state = STATE.TUTORIAL;
    tutorialTimer = 1;
  }

  initStars();
}

/** 绘制爆炸弹圆弧波纹（多层扩散圆环，随生命线性消散） */
function drawExplosionRings(ctx) {
  for (const r of fxRings) {
    const t = r.life / r.maxLife;
    const radius = r.r0 + (r.rMax - r.r0) * (1 - t);
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2.5 * t + 0.5;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = t * 0.15;
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** 绘制爆炸瞬间填充闪（快速膨胀到真实伤害半径，视觉与伤害同步） */
function drawBlastFlashes(ctx) {
  for (const b of fxBlasts) {
    const t = b.life / b.maxLife;
    const radius = b.rMax * (1 - t);
    ctx.save();
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
    grad.addColorStop(0, `rgba(255,255,200,${0.6 * t})`);
    grad.addColorStop(0.4, `rgba(255,140,50,${0.5 * t})`);
    grad.addColorStop(1, `rgba(255,80,20,${0.1 * t})`);
    ctx.globalAlpha = t;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,180,50,${0.9 * t})`;
    ctx.lineWidth = 3 * t + 1;
    ctx.stroke();
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
// 深空背景的固定渐变（基色/地平线/暗角）只依赖 W/H，缓存复用，避免每帧重建 3 个渐变对象
let spaceBgCache = { key: "", base: null, hz: null, vg: null };

/** 深空背景：基色渐变 + 漂移星云 + 底部地平线微光 + 暗角 */
function paintSpace(ctx, frame = 0) {
  const t = frame * 0.0012;
  const cacheKey = W + "x" + H;
  if (spaceBgCache.key !== cacheKey) {
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#070b1f");
    base.addColorStop(0.55, "#0b1235");
    base.addColorStop(1, "#060a19");
    const hz = ctx.createLinearGradient(0, H * 0.8, 0, H);
    hz.addColorStop(0, "rgba(70,150,255,0)");
    hz.addColorStop(0.6, "rgba(110,90,255,.08)");
    hz.addColorStop(1, "rgba(150,60,200,.14)");
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,5,.55)");
    spaceBgCache = { key: cacheKey, base, hz, vg };
  }

  ctx.fillStyle = spaceBgCache.base;
  ctx.fillRect(-10, -10, W + 20, H + 20);

  // 星云随 frame 缓慢漂移，位置每帧变化，渐变保持即时创建
  const nebula = (x, y, r, c0) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c0);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  nebula(W * 0.22 + Math.sin(t) * 22, H * 0.22, H * 0.45, "rgba(52,96,210,.20)");
  nebula(W * 0.85 + Math.cos(t * 0.8) * 26, H * 0.6, H * 0.52, "rgba(150,84,226,.14)");
  nebula(W * 0.55 + Math.sin(t * 1.4) * 18, H * 0.05, H * 0.3, "rgba(44,205,255,.12)");
  nebula(W * 0.9 - Math.sin(t * 1.1) * 20, H * 0.9, H * 0.35, "rgba(255,120,190,.08)");

  // 底部地平线微光，弱化滚动感
  ctx.fillStyle = spaceBgCache.hz;
  ctx.fillRect(-10, H * 0.8, W + 20, H * 0.2);

  // 四周暗角，聚焦中央
  ctx.fillStyle = spaceBgCache.vg;
  ctx.fillRect(-10, -10, W + 20, H + 20);
}

function draw() {
  ctx.save();
  // 按 devicePixelRatio 缩放坐标系：backing store 是 W*DPR × H*DPR，
  // 用 ctx.scale 后逻辑坐标/字号保持 W×H 不变，画面更锐利不发虚。
  // scale 先于 translate，保证 applyCamera 的震动偏移在逻辑像素上不变。
  ctx.scale(DPR, DPR);
  // 深空背景（任何状态共用，先于相机变换，画面不随震动偏移）
  paintSpace(ctx, frame);
  drawStars(ctx, frame);

  if (state === STATE.PLAYING || state === STATE.LEVELUP || state === STATE.OVER || state === STATE.PAUSED || state === STATE.TUTORIAL) {
    applyCamera(ctx);
    drawPowerups(ctx);
    drawBullets(ctx);
    drawEnemies(ctx, frame);
    // 玩家（死亡动画期间不绘制，战机即刻消失，只留爆炸特效）
    if (player && state !== STATE.OVER && !(deathTimer > 0)) {
      drawPlayer(ctx, player, frame);
    }
    drawParticles(ctx);
    drawExplosionRings(ctx);
    drawBlastFlashes(ctx);
    drawDamageNumbers(ctx);

    // 死亡白屏闪烁
    if (deathFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${deathFlash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  ctx.restore();

  // restore 后震动 transform 已撤销，但 DPR 缩放也需要继续作用于 UI 层（摇杆/HUD/菜单）。
  // 重新建立基准 transform：仅 DPR 缩放，无震动偏移。
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

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

  if (player && state !== STATE.MENU && state !== STATE.REVIVE) {
    drawHUD(ctx, {
      score, best: getBest(), level, enemyLevel, pLevel, xp, xpNeed,
      lives, maxLives, combo, player, frame,
    });
    if (state === STATE.PLAYING) drawPauseButton(ctx);
  }

  // 新突破特效（弹出 + 缩放 + 发光）
  if (state === STATE.PLAYING && newBestFx > 0) {
    const p = clamp(1 - newBestFx / 2.4, 0, 1);       // 进度 0→1
    const scale = 1 + 0.5 * Math.exp(-6 * p);           // 弹性缩放
    const a = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;        // 末尾淡出
    ctx.save();
    ctx.translate(W / 2, H * 0.28);
    ctx.scale(scale, scale);
    ctx.globalAlpha = a * 0.95;
    ctx.shadowColor = "#ffd166";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "#ffd166";
    setf(ctx, "bold 54px 'sans-serif'");
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("新纪录！", 0, 0);
    ctx.globalAlpha = a;
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#fff8e0";
    setf(ctx, "bold 22px 'sans-serif'");
    ctx.fillText("突破最高分 " + startBest, 0, 40);
    ctx.restore();
  }

  // 教程界面（点击任意处后游戏才正式开始）
  if (state === STATE.TUTORIAL) {
    const a = 0.5 + 0.3 * clamp(tutorialTimer, 0, 1);
    ctx.globalAlpha = Math.min(0.78, a);
    const dg = ctx.createRadialGradient(W / 2, H * 0.36, 40, W / 2, H * 0.42, H * 0.9);
    dg.addColorStop(0, "rgba(8,12,28,.92)");
    dg.addColorStop(1, "rgba(4,6,14,.72)");
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    glowText(ctx, {
      text: "左 / 右 移动躲避敌机", x: W / 2, y: H * 0.36,
      size: 26, weight: "bold", color: "#ffd166", blur: 22, fontFamily: "'sans-serif'",
    });
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    setf(ctx, "16px 'sans-serif'");
    ctx.fillText("射击为自动 · 子弹命中后消失", W / 2, H * 0.42);
    ctx.fillText("击落敌机积经验，升级可选择技能", W / 2, H * 0.46);

    // 点击开始提示（呼吸闪烁）
    if (Math.sin(frame * 0.08) > -0.3) {
      glowText(ctx, {
        text: "点击任意处开始", x: W / 2, y: H * 0.78,
        size: 22, weight: "bold", color: "#5ee6ff", blur: 18, fontFamily: "'sans-serif'",
      });
    }
  }

  if (state === STATE.MENU) drawMenu(ctx, getBest(), difficultyKey, DIFFICULTY_PRESETS, getDiscoveredSkills());
  else if (state === STATE.OVER) drawGameOver(ctx, score, getBest(), isNewBest);
  else if (state === STATE.REVIVE) drawRevive(ctx, getStardust(), META.reviveCost);
  else if (state === STATE.LEVELUP) drawLevelUp(ctx, skillChoices, player?.skills || {});
  else if (state === STATE.PAUSED) drawPause(ctx, player);

  drawSkillAnim(ctx);
  drawGachaAnim(ctx);

  drawClearCacheConfirm(ctx);

  // Toast：UI 层最后渲染，确保显示在最前面
  if (toast && toast.t > 0) drawToast(ctx, toast);

  drawDetailCard(ctx);

  // 帧末重置 transform 到 identity，避免下一帧 ctx.save() 保存的是已缩放状态
  // 再 ctx.scale(DPR) 累乘成 DPR²（DPR=2 会变 4 倍放大）。下帧开头 save→scale 重新建立。
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- 输入事件 ----------
window.addEventListener("keydown", e => {
  if (e.code === "Escape" || e.code === "KeyP") {
    if (state === STATE.PLAYING) { state = STATE.PAUSED; return; }
    if (state === STATE.PAUSED) { state = STATE.PLAYING; return; }
  }
  if (e.code === "Space" || e.code === "Enter") {
    if (state === STATE.MENU) {
      if (getMenuPage() !== "main") { setMenuPage("main"); return; }
      resetGame();
    }
    else if (state === STATE.OVER) resetGame();
    else if (state === STATE.REVIVE) doRevive();
    else if (state === STATE.TUTORIAL) startPlaying();
  }
  if (state === STATE.REVIVE && (e.code === "Escape" || e.code === "KeyQ" || e.code === "KeyN")) {
    gameOver();
    return;
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

  // 详情卡片打开时：点击任意位置关闭
  if (getDetailCard()) {
    setDetailCard(null);
    return;
  }

  // GACHA 抽奖完成：点击任意处继续游戏（若升级选择待处理则先回到升级界面）
  if (state === STATE.GACHA) {
    state = skillChoices ? STATE.LEVELUP : STATE.PLAYING;
    clearGachaAnim();
    return;
  }

  if (state === STATE.TUTORIAL) { startPlaying(); return; }

  if (state === STATE.PLAYING && hitTestButton(mx, my, getPauseButton())) {
    state = STATE.PAUSED;
    return;
  }

  // 简单模式 PLAYING 态：手指直接控制战机 X（input.js 已接管；此处不做重复处理）

  if (state === STATE.MENU) {
    // 技能图鉴子页面：返回 / 点击卡片查看详情
    if (getMenuPage() === "codex") {
      if (hitTestButton(mx, my, getCodexBackButton())) { setMenuPage("main"); return; }
      for (const c of getCodexCardRects()) {
        if (hitTestButton(mx, my, c.x) && c.got) {
          const curLv = (player?.skills?.[c.skill.id]) || 0;
          setDetailCard({ type: "skill", data: {
            name: c.skill.name, desc: c.skill.desc, color: c.skill.color,
            icon: "✦", curLv, max: c.skill.max, got: c.got,
            fullDesc: c.skill.fullDesc || c.skill.desc,
          } });
          return;
        }
      }
      return;
    }
    // 道具图鉴子页面：返回 / 点击卡片查看详情
    if (getMenuPage() === "powerupCodex") {
      if (hitTestButton(mx, my, getPowerupCodexBackButton())) { setMenuPage("main"); return; }
      for (const c of getPowerupCardRects()) {
        if (hitTestButton(mx, my, c.x) && c.got) {
          setDetailCard({ type: "powerup", data: {
            name: c.def.name, desc: powerupDescFull(c.key), color: c.def.color,
            icon: c.def.icon, got: c.got, rarity: 3, weight: "-",
            fullDesc: powerupDescFull(c.key),
          } });
          return;
        }
      }
      return;
    }
    // 系统商城子页面：返回 / 购买
    if (getMenuPage() === "shop") {
      if (hitTestButton(mx, my, getShopBackButton())) { setMenuPage("main"); return; }
      for (const btn of getShopBuyButtons()) {
        if (hitTestButton(mx, my, btn)) {
          const ok = purchaseShopItem(btn.id);
          if (ok) { toast = { text: "购买成功！", color: "#d0a6ff", t: 1.5 }; sfx.power(); }
          else { toast = { text: "星尘不足", color: "#ff6b6b", t: 1.5 }; }
          return;
        }
      }
      return;
    }
    // 成就·每日任务子页面：返回 / 领取任务奖励 / 点击成就卡片查看详情
    if (getMenuPage() === "achieve") {
      if (hitTestButton(mx, my, getAchieveBackButton())) { setMenuPage("main"); return; }
      const claims = getQuestClaimButtons();
      const items = getQuestView().items;
      for (let i = 0; i < claims.length && i < items.length; i++) {
        if (hitTestButton(mx, my, claims[i])) {
          const reward = claimQuest(items[i].def.id);
          if (reward > 0) {
            toast = { text: "任务完成  +" + reward + " 星尘", color: "#7CFC00", t: 3 };
            sfx.power();
          }
          return;
        }
      }
      // 点击成就卡片
      for (const c of getAchieveCardRects()) {
        if (hitTestButton(mx, my, c.x) && c.achieved) {
          setDetailCard({ type: "achievement", data: {
            name: c.def.name, desc: c.def.desc, color: c.def.color,
            icon: c.achieved ? "★" : "☆", achieved: c.achieved, reward: c.def.reward,
            fullDesc: c.def.desc,
          } });
          return;
        }
      }
      return;
    }
    const page = getMenuPage();
    if (page === "hangar") {
      if (hitTestButton(mx, my, getHangarBackButton())) { setMenuPage("main"); return; }
      for (const card of getHangarCards()) {
        if (!hitTestButton(mx, my, card)) continue;
        if (card.unlocked) {
          setSelectedAircraft(card.id);
          toast = { text: "已选择战机", color: "#66e0ff", t: 1.4 };
        } else if (unlockAircraft(card.id)) {
          toast = { text: "解锁成功", color: "#7CFC00", t: 1.6 };
          sfx.power();
        } else {
          toast = { text: "星尘不足", color: "#ff8fa3", t: 1.4 };
        }
        return;
      }
      return;
    }
    if (page === "talent") {
      if (hitTestButton(mx, my, getTalentBackButton())) { setMenuPage("main"); return; }
      for (const card of getTalentCards()) {
        if (!hitTestButton(mx, my, card)) continue;
        if (card.bought) {
          toast = { text: "已解锁", color: "#c8a6ff", t: 1.2 };
        } else if (card.locked) {
          toast = { text: "需要前置天赋", color: "#ff8fa3", t: 1.4 };
        } else if (purchaseTalent(card.id)) {
          toast = { text: "天赋已解锁", color: "#7CFC00", t: 1.6 };
          sfx.power();
        } else {
          toast = { text: "星尘不足", color: "#ff8fa3", t: 1.4 };
        }
        return;
      }
      return;
    }
    if (page === "settings") {
      if (hitTestButton(mx, my, getSettingsBackButton())) { setMenuPage("main"); return; }
      for (const row of getSettingToggles()) {
        if (hitTestButton(mx, my, row)) {
          toggleSetting(row.key);
          applyAudioSettings();
          return;
        }
      }
      return;
    }
    if (hitTestButton(mx, my, getHangarButton())) { setMenuPage("hangar"); return; }
    if (hitTestButton(mx, my, getTalentButton())) { setMenuPage("talent"); return; }
    if (hitTestButton(mx, my, getCodexButton())) { setMenuPage("codex"); return; }
    // 进入道具图鉴
    if (hitTestButton(mx, my, getPowerupCodexButton())) { setMenuPage("powerupCodex"); return; }
    // 进入系统商城
    if (hitTestButton(mx, my, getShopButton())) { setMenuPage("shop"); return; }
    // 进入成就·每日任务
    if (hitTestButton(mx, my, getAchieveButton())) { setMenuPage("achieve"); return; }
    if (hitTestButton(mx, my, getSettingsButton())) { setMenuPage("settings"); return; }
    // 清除缓存按钮（调试模式）
    if (hitTestButton(mx, my, getClearCacheButton())) {
      if (DEBUG_MODE) { setShowClearCache(true); return; }
    }
    // 难度选择
    for (const [k, rect] of Object.entries(getDifficultyRects())) {
      if (hitTestButton(mx, my, rect)) {
        difficultyKey = k;
        difficulty = DIFFICULTY_PRESETS[k];
        setPlayerDifficulty(k);   // 通知 player/input：切换难度（simple 关闭摇杆）
        return;
      }
    }
    if (hitTestButton(mx, my, getStartButton())) { resetGame(); return; }
  }

  // 清除缓存确认框
  if (getShowClearCache()) {
    if (hitTestButton(mx, my, getClearYesButton())) {
      localStorage.removeItem('planeWarMeta');
      setShowClearCache(false);
      sfx.boom();
      // 重新加载页面以重置内存数据
      setTimeout(() => location.reload(), 300);
    } else if (hitTestButton(mx, my, getClearNoButton())) {
      setShowClearCache(false);
    }
    return;
  }
  if (state === STATE.REVIVE) {
    if (hitTestButton(mx, my, getReviveYesButton())) { doRevive(); return; }
    if (hitTestButton(mx, my, getReviveNoButton())) { gameOver(); return; }
  }
  if (state === STATE.OVER && hitTestButton(mx, my, getRestartButton())) { resetGame(); return; }
  if (state === STATE.OVER && hitTestButton(mx, my, getGameOverMenuButton())) {
    state = STATE.MENU;
    setMenuPage("main");
    stopMusic();
    musicStarted = false;
    return;
  }
  if (state === STATE.PAUSED) {
    if (hitTestButton(mx, my, getPauseResumeButton())) { state = STATE.PLAYING; return; }
    if (hitTestButton(mx, my, getPauseQuitButton())) {
      gameOver();
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
  resetGame, freezeAll,
  state: () => state, getPlayer: () => player,
  getScore: () => score, getEnemyLevel: () => enemyLevel,
  getMaxLives: () => maxLives, getLives: () => lives,
  getMenuPage: getMenuPage, setMenuPage,
  get enemies() { return enemies; },
  get bullets() { return bullets; },
  spawnEnemy, fireBullet, getShootPattern,
  setScore: (v) => { score = v; },
  setLevel: (v) => { level = v; },
  setDifficulty: (key) => { difficultyKey = key; difficulty = DIFFICULTY_PRESETS[key]; setPlayerDifficulty(key); },
  setGachaAnim,
  getGachaAnim,
};
