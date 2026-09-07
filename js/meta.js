/* ===========================================================
 * meta.js — 元进度系统（星尘货币 / 飞机解锁 / 天赋树）
 * =========================================================== */

import { META, ACHIEVEMENTS, DAILY_QUESTS, SKILLS, SHOP_ITEMS, getShopItemCost, todayKey } from "./config.js";

const STORAGE_KEY = "planeWarMeta";

function defaultMeta() {
  return {
    stardust: 0,
    best: 0,
    unlockedAircraft: ["falcon"],
    purchasedTalents: [],
    totalRuns: 0,
    totalKills: 0,
    totalBosses: 0,
    totalPowerups: 0,
    totalStardustEarned: 0,
    selectedAircraft: "falcon",
    discoveredSkills: [],   // 技能图鉴：历史上习得过的技能 id
    discoveredPowerups: [], // 道具图鉴：历史上拾取过的道具 id
    shopLevels: {},         // 系统商城：各道具已购买等级 { id: level }
    achievements: [],       // 已达成成就 id（一次性）
    quests: null,           // { date, progress:{kills,score,runs,boss,powerups}, claimed:[] }
    settings: { sfxMuted: false, musicMuted: false, skipTutorial: false },
  };
}

let metaData = defaultMeta();

function sanitizeMeta(raw) {
  const next = defaultMeta();
  if (!raw || typeof raw !== "object") return next;
  Object.assign(next, raw);
  if (!Array.isArray(next.unlockedAircraft) || next.unlockedAircraft.length === 0) {
    next.unlockedAircraft = ["falcon"];
  }
  if (!next.unlockedAircraft.includes("falcon")) next.unlockedAircraft.unshift("falcon");
  if (!Array.isArray(next.purchasedTalents)) next.purchasedTalents = [];
  if (!Array.isArray(next.discoveredSkills)) next.discoveredSkills = [];
  if (!Array.isArray(next.discoveredPowerups)) next.discoveredPowerups = [];
  if (!next.shopLevels || typeof next.shopLevels !== "object" || Array.isArray(next.shopLevels)) next.shopLevels = {};
  if (!Array.isArray(next.achievements)) next.achievements = [];
  if (typeof next.stardust !== "number" || !Number.isFinite(next.stardust) || next.stardust < 0) next.stardust = 0;
  if (typeof next.best !== "number" || !Number.isFinite(next.best) || next.best < 0) next.best = 0;
  const s = next.settings && typeof next.settings === "object" ? next.settings : {};
  next.settings = {
    sfxMuted: !!s.sfxMuted,
    musicMuted: !!s.musicMuted,
    skipTutorial: !!s.skipTutorial,
  };
  return next;
}

export function getSettings() {
  if (!metaData.settings) metaData.settings = { sfxMuted: false, musicMuted: false, skipTutorial: false };
  return metaData.settings;
}

export function setSetting(key, value) {
  const s = getSettings();
  if (!(key in s)) return false;
  s[key] = !!value;
  saveMeta();
  return true;
}

export function toggleSetting(key) {
  const s = getSettings();
  if (!(key in s)) return false;
  s[key] = !s[key];
  saveMeta();
  return s[key];
}

export function resetMeta() {
  metaData = defaultMeta();
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  return metaData;
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) metaData = sanitizeMeta(JSON.parse(raw));
  } catch (e) {}
  return metaData;
}

export function saveMeta() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metaData));
  } catch (e) {}
}

export function earnStardust(score) {
  const amount = Math.floor(score / META.stardustPerScore);
  metaData.stardust += amount;
  metaData.totalStardustEarned += amount;
  if (score > metaData.best) metaData.best = score;
  metaData.totalRuns++;
  // 每日任务：本局次数与得分
  questEvent("runs", 1);
  questEvent("score", score);
  saveMeta();
  return amount;
}

/** 额外发放星尘（成就/任务奖励），不折算次数 */
export function bonusStardust(amount) {
  if (amount <= 0) return;
  metaData.stardust += amount;
  metaData.totalStardustEarned += amount;
  saveMeta();
}

/** 扣除星尘，余额不足返回 false */
export function spendStardust(amount) {
  if (amount <= 0) return true;
  if (metaData.stardust < amount) return false;
  metaData.stardust -= amount;
  saveMeta();
  return true;
}

export function getStardust() { return metaData.stardust; }
export function getBest() { return metaData.best; }

// ---------- 技能图鉴 ----------
/** 记录一个已习得技能（幂等，仅首次新增时保存） */
export function discoverSkill(id) {
  if (!metaData.discoveredSkills.includes(id)) {
    metaData.discoveredSkills.push(id);
    saveMeta();
    return true;
  }
  return false;
}
export function getDiscoveredSkills() { return metaData.discoveredSkills; }
export function getDiscoveredSkillCount() { return metaData.discoveredSkills.length; }

// ---------- 道具图鉴 ----------
export function discoverPowerup(id) {
  if (!metaData.discoveredPowerups.includes(id)) {
    metaData.discoveredPowerups.push(id);
    saveMeta();
    return true;
  }
  return false;
}
export function getDiscoveredPowerups() { return metaData.discoveredPowerups; }
export function getDiscoveredPowerupCount() { return metaData.discoveredPowerups.length; }

// ---------- 飞机解锁 ----------
export function isAircraftUnlocked(id) {
  return metaData.unlockedAircraft.includes(id);
}

export function unlockAircraft(id) {
  const cfg = META.aircraft[id];
  if (!cfg || metaData.stardust < cfg.cost || isAircraftUnlocked(id)) return false;
  metaData.stardust -= cfg.cost;
  metaData.unlockedAircraft.push(id);
  saveMeta();
  return true;
}

export function getUnlockedAircraftIds() { return metaData.unlockedAircraft; }

// ---------- 选中飞机 ----------
export function getSelectedAircraft() {
  return isAircraftUnlocked(metaData.selectedAircraft) ? metaData.selectedAircraft : "falcon";
}

export function setSelectedAircraft(id) {
  if (isAircraftUnlocked(id)) {
    metaData.selectedAircraft = id;
    saveMeta();
    return true;
  }
  return false;
}

/** 返回当前选中飞机的完整配置 */
export function getSelectedAircraftConfig() {
  const id = getSelectedAircraft();
  return { ...META.aircraft[id], id };
}

// ---------- 天赋树 ----------
export function isTalentPurchased(id) {
  return metaData.purchasedTalents.includes(id);
}

export function purchaseTalent(id) {
  const cfg = META.talents.find(t => t.id === id);
  if (!cfg) return false;
  if (isTalentPurchased(id)) return false;
  if (metaData.stardust < cfg.cost) return false;
  if (cfg.requires && !isTalentPurchased(cfg.requires)) return false;
  metaData.stardust -= cfg.cost;
  metaData.purchasedTalents.push(id);
  saveMeta();
  return true;
}

export function getTalentEffects() {
  const effects = {};
  for (const id of metaData.purchasedTalents) {
    const cfg = META.talents.find(t => t.id === id);
    if (!cfg) continue;
    for (const [k, v] of Object.entries(cfg.effect)) {
      if (typeof v === "number") {
        effects[k] = (effects[k] || 0) + v;
      } else {
        effects[k] = v;
      }
    }
  }
  return effects;
}

export function getPurchasedTalentIds() { return metaData.purchasedTalents; }

// ---------- 统计 ----------
export function addKill() {
  metaData.totalKills++;
  questEvent("kills", 1);
  saveMeta();
}

export function addBossKill() {
  metaData.totalBosses++;
  questEvent("boss", 1);
  saveMeta();
}

export function addPowerupCollected() {
  metaData.totalPowerups++;
  questEvent("powerups", 1);
  saveMeta();
}

export function getStats() {
  return {
    stardust: metaData.stardust,
    best: metaData.best,
    totalRuns: metaData.totalRuns,
    totalKills: metaData.totalKills,
    totalBosses: metaData.totalBosses,
    totalPowerups: metaData.totalPowerups,
    aircraftCount: metaData.unlockedAircraft.length,
    talentCount: metaData.purchasedTalents.length,
  };
}

// ---------- 每日任务 ----------
/** 确保今日任务数据存在（跨天自动重置） */
export function ensureQuests() {
  const today = todayKey();
  if (!metaData.quests || metaData.quests.date !== today) {
    metaData.quests = {
      date: today,
      progress: { kills: 0, score: 0, runs: 0, boss: 0, powerups: 0 },
      claimed: [],
    };
    saveMeta();
  }
  return metaData.quests;
}

/** 记录一次任务进度事件（type 对应 DAILY_QUESTS.type） */
export function questEvent(type, amount = 1) {
  ensureQuests();
  if (metaData.quests.progress[type] === undefined) return;
  metaData.quests.progress[type] += amount;
  saveMeta();
}

/** 图鉴/面板展示用：{ date, items:[{def, cur, target, claimed}] } */
export function getQuestView() {
  ensureQuests();
  const q = metaData.quests;
  return {
    date: q.date,
    items: DAILY_QUESTS.map(def => ({
      def,
      cur: q.progress[def.type] || 0,
      claimed: q.claimed.includes(def.id),
    })),
  };
}

/** 领取已完成的任务奖励；未达标/已领取返回 0 */
export function claimQuest(id) {
  ensureQuests();
  const q = metaData.quests;
  if (q.claimed.includes(id)) return 0;
  const def = DAILY_QUESTS.find(d => d.id === id);
  if (!def) return 0;
  if ((q.progress[def.type] || 0) < def.target) return 0;
  q.claimed.push(id);
  bonusStardust(def.reward);
  return def.reward;
}

// ---------- 成就 ----------
/** 检查并解锁新成就（run 传本局属性），返回本次新达成列表 [{id,name,reward}] */
export function checkAchievements(run = {}) {
  const view = {
    totalKills: metaData.totalKills,
    totalBosses: metaData.totalBosses,
    totalPowerups: metaData.totalPowerups,
    totalRuns: metaData.totalRuns,
    totalStardustEarned: metaData.totalStardustEarned,
    discoveredCount: metaData.discoveredSkills.length,
    runScore: run.runScore,
    runLevel: run.runLevel,
    runCombo: run.runCombo,
    reviveUsed: !!run.reviveUsed,
  };
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (metaData.achievements.includes(a.id)) continue;
    if (a.cond(view)) {
      metaData.achievements.push(a.id);
      bonusStardust(a.reward);
      newly.push({ id: a.id, name: a.name, reward: a.reward });
    }
  }
  return newly;
}

/** 面板展示用：成就定义 + 是否已达成 */
export function getAchievementView() {
  return ACHIEVEMENTS.map(def => ({
    def,
    achieved: metaData.achievements.includes(def.id),
  }));
}

// ---------- 系统商城 ----------
export function getShopLevels() { return metaData.shopLevels || {}; }
export function getShopLevel(id) { return metaData.shopLevels?.[id] || 0; }

export function purchaseShopItem(id) {
  const item = SHOP_ITEMS.find(s => s.id === id);
  if (!item) return false;
  const lv = getShopLevel(id);
  if (lv >= item.max) return false;
  const cost = getShopItemCost(item, lv);
  if (metaData.stardust < cost) return false;
  metaData.stardust -= cost;
  if (!metaData.shopLevels) metaData.shopLevels = {};
  metaData.shopLevels[id] = lv + 1;
  saveMeta();
  return true;
}

export function getShopEffects() {
  const levels = metaData.shopLevels || {};
  const merged = {};
  for (const item of SHOP_ITEMS) {
    const lv = levels[item.id] || 0;
    if (lv <= 0) continue;
    const fx = item.effect(lv);
    for (const [k, v] of Object.entries(fx)) {
      if (typeof v === "number" && typeof merged[k] === "number") {
        merged[k] += v;
      } else {
        merged[k] = v;
      }
    }
  }
  return merged;
}
