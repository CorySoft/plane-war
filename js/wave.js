/* ===========================================================
 * wave.js — 波次 / 难度管理 + Boss系统
 * =========================================================== */

import { W, H, DIFFICULTY } from "./config.js";
import { rand } from "./utils.js";
import { spawnEnemy, enemies, nextEnemyUid, getCurrentBossPhase } from "./enemy.js";

// 相位查询由 enemy.js 提供（原本两边各写了一份），这里再导出供 game.js 使用
export { getCurrentBossPhase };

export function getDifficultyLevel(score) {
  return Math.min(DIFFICULTY.maxLevel, 1 + Math.floor(score / DIFFICULTY.levelUpScore));
}

export function getSpawnRate(level, spawnScale = 1) {
  return Math.min(DIFFICULTY.spawnBase + level * DIFFICULTY.spawnPerLevel, DIFFICULTY.spawnCap) * spawnScale;
}

let eliteTimer = 0;
let bossWave = 0;
let swarmTimer = 0;
let swarmWarned = false;
let bossWarnPending = false;
let bossWarnTimer = 0;

// @param enemyLevel 当前敌方等级（精英波此前漏传 → 后期精英波全是 1 级白板）
export function updateWaves(dt, level, diff, enemyLevel = 1) {
  // 精英波计时
  eliteTimer += dt;
  if (eliteTimer >= DIFFICULTY.eliteWaveInterval && level >= 2) {
    eliteTimer = 0;
    const count = 2 + Math.min(level, 5);
    for (let i = 0; i < count; i++) spawnEnemy(level, diff, enemyLevel);
  }

  // Boss 预警（等级达标后先提示 2 秒）
  const expectedBossWave = Math.floor(level / DIFFICULTY.bossInterval);
  if (level >= DIFFICULTY.bossInterval && expectedBossWave > bossWave && !bossWarnPending) {
    bossWarnPending = true;
    bossWarnTimer = 0;
    return "bossWarn";
  }
  if (bossWarnPending) {
    bossWarnTimer += dt;
    if (bossWarnTimer >= 3.0) {   // 3s 预警（旧 2s 太短，玩家来不及走位）
      bossWarnPending = false;
      bossWave = expectedBossWave;
      return "boss";
    }
    return null;
  }

  // 虫群波（每 swarmInterval 秒，最低 swarmMinLevel 级）
  if (level >= DIFFICULTY.swarmMinLevel) {
    swarmTimer += dt;
    if (!swarmWarned && swarmTimer >= DIFFICULTY.swarmInterval - DIFFICULTY.swarmWarnTime) {
      swarmWarned = true;
      return "swarmWarn";
    }
    if (swarmTimer >= DIFFICULTY.swarmInterval) {
      swarmTimer = 0;
      swarmWarned = false;
      return "swarm";
    }
  }
  return null;
}

export function spawnSwarm(level, diff, enemyLevel) {
  const count = 8 + Math.min(level * 2, 16);
  for (let i = 0; i < count; i++) {
    spawnEnemy(level, diff, enemyLevel, rand(30, W - 30), -30 - i * 25);
  }
}

export function resetWaves() {
  eliteTimer = 0;
  bossWave = 0;
  swarmTimer = 0;
  swarmWarned = false;
  bossWarnPending = false;
  bossWarnTimer = 0;
}

// ---------- Boss 定义 ----------
export const BOSS_TYPES = {
  mothership: {
    name: "母舰", color: "#ff4488", r: 70, hp: 200,
    phases: [
      { hpPct: 1.0, spawnInterval: 3, fireInterval: 999, pattern: "spawn" },
      { hpPct: 0.5, spawnInterval: 999, fireInterval: 2, pattern: "spread" },
      { hpPct: 0.25, spawnInterval: 4, fireInterval: 1.5, pattern: "laser" },
    ],
  },
  fortress: {
    name: "堡垒", color: "#886644", r: 60, hp: 150,
    phases: [
      { hpPct: 1.0, shieldGens: 4, fireInterval: 4, pattern: "homing" },
      { hpPct: 0.5, shieldGens: 2, fireInterval: 3, pattern: "homing" },
      { hpPct: 0.25, shieldGens: 0, fireInterval: 1.5, pattern: "burst" },
    ],
  },
  phantom: {
    name: "幻影", color: "#aa44ff", r: 40, hp: 100,
    phases: [
      { hpPct: 1.0, fireInterval: 2, teleportInterval: 4, pattern: "burst" },
      { hpPct: 0.5, fireInterval: 1.5, teleportInterval: 2.5, pattern: "burst" },
      { hpPct: 0.25, fireInterval: 0.8, teleportInterval: 1.5, pattern: "burst" },
    ],
  },
};

export function spawnBoss(type, level = 1) {
  const cfg = BOSS_TYPES[type];
  // Boss 实力随难度等级成长（每超过基础召唤等级 5 级再 +15% 血量/奖励），
  // 让第 5、10 级召唤的 Boss 不断压迫感递增。
  const lvlScale = 1 + 0.15 * Math.max(0, level - DIFFICULTY.bossInterval);
  const hp = Math.round(cfg.hp * lvlScale);
  const firstPhase = cfg.phases[0];
  const e = {
    uid: nextEnemyUid(),
    type: "boss",
    bossType: type,
    name: cfg.name,
    r: cfg.r,
    hp,
    maxHp: hp,
    score: Math.round(2000 * lvlScale),
    xp: Math.round(100 * lvlScale),
    speed: 0.8,
    color: cfg.color,
    x: W / 2,
    y: -cfg.r - 10,
    vy: 0.8,
    vx: 0,
    fireCd: firstPhase?.fireInterval ?? 2,
    t: 0,
    hitFlash: 0,
    frozen: 0,
    shieldHp: firstPhase?.shieldGens || 0,
    splitChildren: 0,
    laserTimer: 0,
    isBoss: true,
    phaseIdx: 0,
    phases: cfg.phases,
    spawnTimer: firstPhase?.spawnInterval || 0,
    teleportTimer: firstPhase?.teleportInterval || 999,
    _phaseHpPct: firstPhase?.hpPct ?? 1,
  };
  enemies.push(e);
  return e;
}


