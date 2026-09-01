/* ===========================================================
 * wave.js — 波次 / 难度管理 + Boss系统
 * =========================================================== */

import { W, H, DIFFICULTY } from "./config.js";
import { rand } from "./utils.js";
import { spawnEnemy, enemies } from "./enemy.js";

export function getDifficultyLevel(score) {
  return Math.min(DIFFICULTY.maxLevel, 1 + Math.floor(score / DIFFICULTY.levelUpScore));
}

export function getSpawnRate(level, spawnScale = 1) {
  return Math.min(DIFFICULTY.spawnBase + level * DIFFICULTY.spawnPerLevel, DIFFICULTY.spawnCap) * spawnScale;
}

let eliteTimer = 0;
let bossWave = 0;

export function updateWaves(dt, level, now, diff) {
  // 精英波计时
  eliteTimer += dt;
  if (eliteTimer >= DIFFICULTY.eliteWaveInterval && level >= 2) {
    eliteTimer = 0;
    const count = 2 + Math.min(level, 5);
    for (let i = 0; i < count; i++) spawnEnemy(level, diff);
  }

  // Boss 波次（每5个难度等级）
  const expectedBossWave = Math.floor(level / DIFFICULTY.bossInterval);
  if (expectedBossWave > bossWave && level >= DIFFICULTY.bossInterval) {
    bossWave = expectedBossWave;
    return "boss";
  }
  return null;
}

export function resetWaves() {
  eliteTimer = 0;
  bossWave = 0;
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

export function spawnBoss(type) {
  const cfg = BOSS_TYPES[type];
  const e = {
    type: "boss",
    bossType: type,
    name: cfg.name,
    r: cfg.r,
    hp: cfg.hp,
    maxHp: cfg.hp,
    score: 2000,
    xp: 100,
    speed: 0.8,
    color: cfg.color,
    x: W / 2,
    y: -cfg.r - 10,
    vy: 0.8,
    vx: 0,
    fireCd: 2,
    t: 0,
    hitFlash: 0,
    frozen: 0,
    shieldHp: 0,
    splitChildren: 0,
    laserTimer: 0,
    isBoss: true,
    phaseIdx: 0,
    phases: cfg.phases,
    spawnTimer: 0,
    teleportTimer: cfg.phases[0]?.teleportInterval || 999,
  };
  enemies.push(e);
  return e;
}

export function getCurrentBossPhase(boss) {
  const pct = boss.hp / boss.maxHp;
  let phase = boss.phases[0];
  for (const p of boss.phases) {
    if (pct <= p.hpPct) phase = p;
  }
  return phase;
}
