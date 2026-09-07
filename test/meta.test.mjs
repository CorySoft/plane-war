import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { META, ACHIEVEMENTS, DAILY_QUESTS, SKILLS } from "../js/config.js";
import {
  loadMeta, saveMeta, resetMeta, earnStardust, bonusStardust, spendStardust,
  getStardust, getBest, discoverSkill, getDiscoveredSkillCount,
  unlockAircraft, isAircraftUnlocked, setSelectedAircraft, getSelectedAircraft,
  getSelectedAircraftConfig, purchaseTalent, isTalentPurchased, getTalentEffects,
  addKill, addBossKill, addPowerupCollected, getStats,
  ensureQuests, questEvent, claimQuest, getQuestView,
  checkAchievements, getAchievementView,
  getSettings, setSetting, toggleSetting,
} from "../js/meta.js";

describe("meta", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
  });

  it("earnStardust 折算并刷新最高分", () => {
    const got = earnStardust(250);
    assert.equal(got, 2);
    assert.equal(getStardust(), 2);
    assert.equal(getBest(), 250);
    assert.equal(getStats().totalRuns, 1);
  });

  it("spendStardust 余额不足失败", () => {
    bonusStardust(30);
    assert.equal(spendStardust(50), false);
    assert.equal(getStardust(), 30);
    assert.equal(spendStardust(10), true);
    assert.equal(getStardust(), 20);
  });

  it("飞机解锁需花费且不可重复", () => {
    bonusStardust(500);
    assert.equal(unlockAircraft("blaze"), true);
    assert.equal(isAircraftUnlocked("blaze"), true);
    assert.equal(unlockAircraft("blaze"), false);
    assert.equal(setSelectedAircraft("blaze"), true);
    assert.equal(getSelectedAircraft(), "blaze");
    assert.equal(getSelectedAircraftConfig().id, "blaze");
  });

  it("天赋需前置且叠加效果", () => {
    bonusStardust(1000);
    assert.equal(purchaseTalent("t_dmg2"), false);
    assert.equal(purchaseTalent("t_dmg1"), true);
    assert.equal(purchaseTalent("t_dmg2"), true);
    assert.equal(isTalentPurchased("t_dmg2"), true);
    const fx = getTalentEffects();
    assert.equal(fx.baseDmg, 2);
  });

  it("技能图鉴幂等", () => {
    assert.equal(discoverSkill("dmg"), true);
    assert.equal(discoverSkill("dmg"), false);
    assert.equal(getDiscoveredSkillCount(), 1);
  });

  it("每日任务跨天重置并可领取", () => {
    ensureQuests();
    questEvent("kills", DAILY_QUESTS[0].target);
    const view = getQuestView();
    const item = view.items.find(i => i.def.id === "q_kills");
    assert.ok(item.cur >= item.def.target);
    const reward = claimQuest("q_kills");
    assert.equal(reward, DAILY_QUESTS[0].reward);
    assert.equal(claimQuest("q_kills"), 0);
  });

  it("成就一次性发放奖励", () => {
    for (let i = 0; i < 100; i++) addKill();
    const newly = checkAchievements({ runScore: 1000, runLevel: 1, runCombo: 1 });
    assert.ok(newly.some(a => a.id === "a_kills1"));
    const again = checkAchievements({ runScore: 1000 });
    assert.ok(!again.some(a => a.id === "a_kills1"));
    const view = getAchievementView();
    assert.equal(view.length, ACHIEVEMENTS.length);
  });

  it("统计击杀与 Boss", () => {
    addKill();
    addBossKill();
    addPowerupCollected();
    const s = getStats();
    assert.equal(s.totalKills, 1);
    assert.equal(s.totalBosses, 1);
    assert.equal(s.totalPowerups, 1);
  });

  it("损坏存档被清洗", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({ stardust: -9, unlockedAircraft: "x" }));
    const data = loadMeta();
    assert.equal(data.stardust, 0);
    assert.ok(data.unlockedAircraft.includes("falcon"));
  });

  it("全技能图鉴成就条件成立", () => {
    for (const s of SKILLS) discoverSkill(s.id);
    const newly = checkAchievements({});
    assert.ok(newly.some(a => a.id === "a_skills"));
  });

  it("设置读写、开关与持久化", () => {
    assert.equal(getSettings().sfxMuted, false);
    assert.equal(getSettings().skipTutorial, false);
    assert.equal(setSetting("sfxMuted", true), true);
    assert.equal(getSettings().sfxMuted, true);
    assert.equal(setSetting("no_such_key", true), false);
    assert.equal(toggleSetting("musicMuted"), true);
    assert.equal(toggleSetting("musicMuted"), false);
    const reloaded = loadMeta();
    assert.equal(reloaded.settings.sfxMuted, true);
    assert.equal(reloaded.settings.musicMuted, false);
    assert.equal(reloaded.settings.skipTutorial, false);
  });

  it("损坏存档的 settings 被清洗", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({ settings: { sfxMuted: 0, musicMuted: "x", skipTutorial: null } }));
    const data = loadMeta();
    assert.equal(data.settings.sfxMuted, false);
    assert.equal(typeof data.settings.musicMuted, "boolean");
    assert.equal(data.settings.skipTutorial, false);
  });

  it("缺失 settings 恢复默认", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({ stardust: 5 }));
    const data = loadMeta();
    assert.deepEqual(data.settings, { sfxMuted: false, musicMuted: false, skipTutorial: false });
  });
});
