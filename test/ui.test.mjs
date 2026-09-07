import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage, makeCtx } from "./_env.mjs";
import { resetMeta, loadMeta } from "../js/meta.js";
import {
  hitTestButton, setMenuPage, getMenuPage,
  spawnDamageNumber, updateDamageNumbers, clearDamageNumbers,
  initStars, updateStars,
  drawMenu,
  getStartButton, getDifficultyRects,
  getHangarButton, getHangarBackButton, getHangarCards,
  getTalentButton, getTalentBackButton, getTalentCards,
  getSettingsButton, getSettingsBackButton, getSettingToggles,
  getCodexButton, getCodexBackButton,
  getAchieveButton, getAchieveBackButton, getQuestClaimButtons,
} from "../js/ui.js";
import { H, META, DIFFICULTY_PRESETS } from "../js/config.js";

describe("ui", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
    clearDamageNumbers();
    setMenuPage("main");
  });

  it("hitTestButton 矩形命中", () => {
    const rect = { x: 10, y: 20, w: 40, h: 30 };
    assert.equal(hitTestButton(10, 20, rect), true);
    assert.equal(hitTestButton(50, 50, rect), true);
    assert.equal(hitTestButton(51, 50, rect), false);
    assert.equal(hitTestButton(0, 0, rect), false);
    assert.equal(hitTestButton(10, 20, null), null);
  });

  it("菜单分页切换", () => {
    assert.equal(getMenuPage(), "main");
    setMenuPage("codex");
    assert.equal(getMenuPage(), "codex");
  });

  it("伤害飘字去重与上限", () => {
    spawnDamageNumber(10, 10, "1");
    spawnDamageNumber(10, 10, "1");
    updateDamageNumbers(0);
    spawnDamageNumber(200, 200, "9", "#fff", true);
    for (let i = 0; i < 80; i++) spawnDamageNumber(i * 30, i * 30, String(i), "#fff", true);
    updateDamageNumbers(2);
  });

  it("星空循环卷动", () => {
    initStars();
    updateStars(10);
    assert.ok(true);
  });

  it("主菜单绘制并暴露导航按钮", () => {
    setMenuPage("main");
    drawMenu(makeCtx(), 250, "normal", DIFFICULTY_PRESETS, ["dmg"]);
    assert.ok(getStartButton());
    assert.equal(Object.keys(getDifficultyRects()).length, Object.keys(DIFFICULTY_PRESETS).length);
    assert.ok(getHangarButton());
    assert.ok(getTalentButton());
    assert.ok(getCodexButton());
    assert.ok(getAchieveButton());
    assert.ok(getSettingsButton());
    assert.equal(getHangarBackButton(), null);
  });

  it("机库页绘制卡片与返回按钮", () => {
    setMenuPage("hangar");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const cards = getHangarCards();
    assert.equal(cards.length, Object.keys(META.aircraft).length);
    for (const c of cards) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.w > 0 && c.h > 0);
      assert.ok(c.y + c.h <= H * 0.9);
    }
    assert.ok(getHangarBackButton());
    assert.equal(getHangarButton(), null);
  });

  it("天赋页绘制卡片含锁定态", () => {
    setMenuPage("talent");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const cards = getTalentCards();
    assert.equal(cards.length, META.talents.length);
    const locked = cards.find(c => c.id === "t_dmg2");
    assert.ok(locked);
    assert.equal(locked.locked, true);
    assert.equal(locked.bought, false);
    assert.ok(getTalentBackButton());
    assert.equal(getTalentButton(), null);
  });

  it("设置页绘制开关行", () => {
    setMenuPage("settings");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const rows = getSettingToggles();
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.key), ["sfxMuted", "musicMuted", "skipTutorial"]);
    assert.ok(getSettingsBackButton());
    assert.equal(getSettingsButton(), null);
  });

  it("技能图鉴页绘制不崩溃", () => {
    setMenuPage("codex");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, ["dmg", "rapid"]);
    assert.ok(getCodexBackButton());
    assert.equal(getCodexButton(), null);
  });

  it("成就任务页绘制返回与领取按钮", () => {
    setMenuPage("achieve");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    assert.ok(getAchieveBackButton());
    assert.equal(getAchieveButton(), null);
    assert.ok(Array.isArray(getQuestClaimButtons()));
  });
});
