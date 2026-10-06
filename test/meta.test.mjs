import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { META, ACHIEVEMENTS, DAILY_QUESTS, SKILLS, todayKey } from "../js/config.js";
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
    const score = 2 * META.stardustPerScore + 123;
    const got = earnStardust(score);
    assert.equal(got, 2);
    assert.equal(getStardust(), 2);
    assert.equal(getBest(), score);
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

  it("非法飞机 id 被清洗回 falcon（防 speed=undefined→坐标 NaN）", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({
      unlockedAircraft: ["falcon", "bogus_plane"],
      selectedAircraft: "bogus_plane",
    }));
    const data = loadMeta();
    assert.deepEqual(data.unlockedAircraft, ["falcon"]);
    assert.equal(data.selectedAircraft, "falcon");
    const cfg = getSelectedAircraftConfig();
    assert.equal(cfg.id, "falcon");
    assert.equal(typeof cfg.speed, "number");
  });

  it("未解锁的选中飞机回退 falcon", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({ selectedAircraft: "blaze" }));
    const data = loadMeta();
    assert.equal(data.selectedAircraft, "falcon");
  });

  it("商城等级损坏值被钳制（防 NaN 生命=无敌）", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({
      shopLevels: { startHp: "abc", baseDmg: 999, score: 2.5, no_such_item: 5 },
    }));
    const data = loadMeta();
    assert.equal(data.shopLevels.startHp, undefined);     // 非整数丢弃
    assert.equal(data.shopLevels.baseDmg, 5);             // 超上限钳到 max
    assert.equal(data.shopLevels.score, undefined);       // 浮点丢弃
    assert.equal(data.shopLevels.no_such_item, undefined);// 未知键丢弃
  });

  it("每日任务损坏进度数值化（防字符串比较白嫖领取）", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({
      quests: { date: todayKey(), progress: { kills: "abc", score: 5000, runs: -3 }, claimed: [123] },
    }));
    const data = loadMeta();
    assert.equal(data.quests.progress.kills, 0);
    assert.equal(data.quests.progress.score, 5000);
    assert.equal(data.quests.progress.runs, 0);
    assert.deepEqual(data.quests.claimed, []);
    // "abc" < 50 曾为 false（NaN 比较）→ 直接领走奖励；数值化后未达标不可领
    assert.equal(claimQuest("q_kills"), 0);
  });

  it("解析失败的存档备份到 .bak 并降级默认档", () => {
    const broken = '{"stardust": 999, 损坏';
    localStorage.setItem("planeWarMeta", broken);
    const data = loadMeta();
    assert.equal(data.stardust, 0);
    assert.equal(localStorage.getItem("planeWarMeta.bak"), broken, "损坏原始数据必须备份");
  });
});
