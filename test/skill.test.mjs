import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { SKILLS } from "../js/config.js";
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
});
