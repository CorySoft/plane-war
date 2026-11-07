import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { META, LIFESTEAL, lifestealChance, SKILLS } from "../js/config.js";
import { createPlayer, updatePlayer, tryLifesteal } from "../js/player.js";

const KILL_RATE_MAX = 3.8;              // 三场景确定性仿真实测最高击杀率（满配清屏）
const DAMAGE_CAP_PER_SEC = 1 / 2.2;     // hitPlayer 后 2.2s 无敌帧 → 承伤硬上限

function makeRng(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

function simulateHealing(level, seed) {
  const duration = 60;
  const killInterval = 1 / KILL_RATE_MAX;
  const player = createPlayer(META.aircraft.falcon, {});
  player.skills = { ...player.skills, lifesteal: level };
  const rng = makeRng(seed);
  let heals = 0;

  for (let kill = 0; kill < KILL_RATE_MAX * duration; kill++) {
    updatePlayer(killInterval, player, 0, 0);
    if (tryLifesteal(player, rng)) heals++;
  }
  return heals / duration;
}

describe("能量吸取（lifesteal）", () => {
  it("概率按等级线性，满级 24%（旧值 60%）", () => {
    assert.equal(lifestealChance(0), 0);
    assert.equal(lifestealChance(1), 0.06);
    assert.equal(lifestealChance(2), 0.12);
    assert.equal(lifestealChance(4), 0.24);
    assert.equal(lifestealChance(99), 0.24);
    assert.equal(lifestealChance(-3), 0);
    assert.equal(SKILLS.find(s => s.id === "lifesteal").max, 4);
  });

  it("触发后进入冷却，冷却期内不再回血", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.skills = { ...p.skills, lifesteal: 4 };
    assert.equal(p.lifestealCd, 0);
    assert.equal(tryLifesteal(p, () => 0), true);
    assert.equal(p.lifestealCd, LIFESTEAL.cooldown);
    assert.equal(tryLifesteal(p, () => 0), false, "冷却期内不得再次触发");
  });

  it("冷却随 updatePlayer 递减并恢复可触发", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.skills = { ...p.skills, lifesteal: 4 };
    tryLifesteal(p, () => 0);
    updatePlayer(LIFESTEAL.cooldown + 0.1, p, 0, 0);
    assert.ok(p.lifestealCd <= 0, `冷却应归零，实际 ${p.lifestealCd}`);
    assert.equal(tryLifesteal(p, () => 0), true);
  });

  it("概率未命中不进入冷却", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.skills = { ...p.skills, lifesteal: 1 };
    assert.equal(tryLifesteal(p, () => 0.99), false);
    assert.equal(p.lifestealCd, 0);
  });

  it("无技能时不判定、不消耗冷却", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    assert.equal(tryLifesteal(p, () => 0), false);
    assert.equal(p.lifestealCd, 0);
  });

  it("满配稳态回血 ≤ 同期承伤上限的 50%", () => {
    const heal = simulateHealing(4, 0x51f7ea1);
    const target = 0.5 * DAMAGE_CAP_PER_SEC;
    assert.ok(heal <= target, `回血 ${heal.toFixed(3)} HP/s 超过承伤 50% 上限 ${target.toFixed(3)}`);
    assert.ok(heal > 0, "削弱后仍应保留可用收益");
  });

  it("低等级收益递减但仍为正", () => {
    const l1 = simulateHealing(1, 0x51f7ea1);
    const maxLevel = simulateHealing(4, 0x51f7ea1);
    assert.ok(l1 > 0 && l1 < maxLevel);
  });
});