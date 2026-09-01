/* ===========================================================
 * meta.js — 元进度系统（星尘货币 / 飞机解锁 / 天赋树）
 * =========================================================== */

import { META } from "./config.js";

const STORAGE_KEY = "planeWarMeta";

let metaData = {
  stardust: 0,
  best: 0,
  unlockedAircraft: ["falcon"],
  purchasedTalents: [],
  totalRuns: 0,
  totalKills: 0,
  selectedAircraft: "falcon",
};

export function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(metaData, JSON.parse(raw));
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
  if (score > metaData.best) metaData.best = score;
  metaData.totalRuns++;
  saveMeta();
  return amount;
}

export function getStardust() { return metaData.stardust; }
export function getBest() { return metaData.best; }

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
  saveMeta();
}
export function getStats() {
  return {
    stardust: metaData.stardust,
    best: metaData.best,
    totalRuns: metaData.totalRuns,
    totalKills: metaData.totalKills,
    aircraftCount: metaData.unlockedAircraft.length,
    talentCount: metaData.purchasedTalents.length,
  };
}
