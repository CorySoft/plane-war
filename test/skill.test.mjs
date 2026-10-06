import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { SKILLS, skillLevelColor } from "../js/config.js";
import { getMaxLives, generateSkillChoices, applySkill } from "../js/skill.js";
import { createPlayer } from "../js/player.js";
import { META } from "../js/config.js";
import { loadMeta, resetMeta, getDiscoveredSkills } from "../js/meta.js";

describe("skill", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
  });

  it("最大生命 = 基础 + 技能", () => {
    assert.equal(getMaxLives(3, 0), 3);
    assert.equal(getMaxLives(3, 2), 5);
  });

  it("升级选项最多 3 个且不重复", () => {
    const choices = generateSkillChoices({});
    assert.equal(choices.length, 3);
    const ids = choices.map(s => s.id);
    assert.equal(new Set(ids).size, 3);
  });

  it("满级技能不再进入选项", () => {
    const skills = {};
    for (const s of SKILLS) skills[s.id] = s.max;
    assert.deepEqual(generateSkillChoices(skills), []);
  });

  it("优先给出尚未拥有的技能", () => {
    const owned = { dmg: 1, rate: 1, range: 1 };
    const choices = generateSkillChoices(owned);
    assert.ok(choices.every(s => (owned[s.id] || 0) === 0));
  });

  it("applySkill 升级并点亮图鉴", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    const skill = SKILLS.find(s => s.id === "dmg");
    const toast = applySkill(skill, p);
    assert.equal(p.skills.dmg, 1);
    assert.ok(toast.text.includes(skill.name));
    assert.ok(getDiscoveredSkills().includes("dmg"));
  });

  it("applySkill 拒绝绕过前置的技能（随机道具防绕过）", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    const splitDist = SKILLS.find(s => s.id === "splitDist");
    assert.ok(splitDist.requires === "split");
    // 未学 split 时授予被拒
    const t = applySkill(splitDist, p);
    assert.equal(p.skills.splitDist || 0, 0);
    assert.ok(t.text.includes("前置"));
    // 学到 split 后可授予
    p.skills.split = 1;
    const ok = applySkill(splitDist, p);
    assert.equal(p.skills.splitDist, 1);
    assert.ok(ok.text.includes(splitDist.name));
  });

  it("生命强化标记回血", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    applySkill(SKILLS.find(s => s.id === "maxhp"), p);
    assert.equal(p._heal, 1);
    assert.equal(p._maxLivesUpdate, true);
  });

  it("护盾强化不超过上限", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.shield = p.maxShield;
    applySkill(SKILLS.find(s => s.id === "shield"), p);
    assert.equal(p.shield, p.maxShield);
    p.shield = 0;
    applySkill(SKILLS.find(s => s.id === "shield"), p);
    assert.equal(p.shield, 1);
  });

  it("技能等级颜色分档", () => {
    assert.equal(skillLevelColor(1), "rgba(255,255,255,.6)");
    assert.equal(skillLevelColor(2), null);
    assert.equal(skillLevelColor(3), null);
    assert.equal(skillLevelColor(4), null);
    assert.equal(skillLevelColor(5), "#ffd166");
    assert.equal(skillLevelColor(6), "#ffd166");
    assert.equal(skillLevelColor(7), "#ffd166");
    assert.equal(skillLevelColor(10), "#ffd166");
  });

  it("关键玩法技能具备合理的多级上限", () => {
    const dmg = SKILLS.find(s => s.id === "dmg");
    assert.equal(dmg.max, 10);
    const rate = SKILLS.find(s => s.id === "rate");
    assert.equal(rate.max, 6);
  });
});
