/* ===========================================================
 * bossrush.js — Boss Rush 原型模式（灰度入口 ?bossrush=1）
 *
 * 纯逻辑模块：只管「第几轮 / 出哪型 Boss / 血量倍率 / 轮间间隔」，
 * 不依赖游戏内部状态，便于单测。game.js 仅在 URL 参数命中时调用；
 * 不带参数时该模块不参与任何执行路径（默认行为与 v0.5.2 一致）。
 *
 * 复用：spawnBoss + BOSS_TYPES 三型与 phase 系统、既有结算/复活状态机。
 * 不新增 Boss 类型、不新增美术资产、不改动 UI 菜单。
 * =========================================================== */

/** 车轮顺序：三型 Boss 循环出场（确定性顺序，便于测试与复现） */
export const BOSS_RUSH_ORDER = Object.freeze(["phantom", "fortress", "mothership"]);

/** 调参常量（原型阶段集中在此，后续调平衡只改这张表） */
export const BOSS_RUSH = Object.freeze({
  firstDelay: 1.2,      // 开局到第一只 Boss 的等待（秒）
  baseInterval: 1.0,    // 轮间基础等待（秒）
  intervalStep: 0.12,   // 每完成一轮，轮间等待递减（秒）
  minInterval: 0.2,     // 轮间等待下限，避免瞬间连出
  hpGrowth: 0.35,       // 每轮血量成长（+35%）
  maxHpScale: 12,       // 血量倍率上限，避免无限膨胀
});

/**
 * Boss Rush 的敌弹密度预算（复用 campaign 的 setHostileBulletBudget 闸门）。
 * 全局硬上限 140/140，这里收紧到 120/90：三型 Boss 的 spread/burst/laser
 * 叠加后仍留余量，避免车轮战后期同屏弹幕堆到掉帧。
 */
export const BOSS_RUSH_BUDGET = Object.freeze({
  maxHostileActive: 120,
  maxHostileBulletsPerSec: 90,
});

/**
 * 从查询串判断是否启用 Boss Rush。
 * 只认显式开关：`?bossrush=1` 或 `?bossrush=true`；其余（含缺省）一律关闭。
 */
export function isBossRushRequested(search = "") {
  const value = new URLSearchParams(search).get("bossrush");
  return value === "1" || value === "true";
}

/** 第 round 轮（1 起）出场的 Boss 类型 */
export function bossRushRoundType(round) {
  const n = Math.max(1, Math.floor(round) || 1);
  return BOSS_RUSH_ORDER[(n - 1) % BOSS_RUSH_ORDER.length];
}

/** 第 round 轮的血量倍率（≥1，带上限） */
export function bossRushHpScale(round) {
  const n = Math.max(1, round);
  return Math.min(BOSS_RUSH.maxHpScale, 1 + BOSS_RUSH.hpGrowth * (n - 1));
}

/** 完成第 completedRound 轮后，到下一轮召唤的等待（逐轮递减，带下限） */
export function bossRushRoundInterval(completedRound) {
  const n = Math.max(0, completedRound);
  return Math.max(BOSS_RUSH.minInterval, BOSS_RUSH.baseInterval - BOSS_RUSH.intervalStep * n);
}

/** 新建一局的车轮战状态（第 0 轮 = 尚未开始，先等 firstDelay 秒） */
export function createBossRushState() {
  return { round: 0, timer: BOSS_RUSH.firstDelay, awaitingBoss: false };
}

/**
 * 推进车轮战状态（每帧调用一次）。
 * @param {object} state  createBossRushState() 的产物
 * @param {number} dt     帧步进（秒）
 * @param {boolean} hasBoss 场上是否还有 Boss（由调用方扫描 enemies 得出）
 * @returns {null|{type:"spawn", round:number, bossType:string, hpScale:number}}
 */
export function stepBossRush(state, dt, hasBoss) {
  if (!state) return null;
  if (hasBoss) return null;              // Boss 还活着，车轮暂停
  if (state.awaitingBoss) {              // 上一只刚被击杀 → 进入轮间倒计时
    state.awaitingBoss = false;
    state.timer = bossRushRoundInterval(state.round);
  }
  state.timer -= dt;
  if (state.timer > 0) return null;
  state.round += 1;
  state.awaitingBoss = true;             // 直到调用方观察到 Boss 消失
  return {
    type: "spawn",
    round: state.round,
    bossType: bossRushRoundType(state.round),
    hpScale: bossRushHpScale(state.round),
  };
}

/** 按轮次倍率放大 Boss（spawnBoss 之后调用；倍率 ≤1 时原样返回） */
export function scaleBossForRound(boss, scale) {
  if (!boss || !(scale > 1)) return boss;
  boss.hp = Math.round(boss.hp * scale);
  boss.maxHp = boss.hp;
  boss.score = Math.round(boss.score * scale);
  boss.xp = Math.round(boss.xp * scale);
  return boss;
}