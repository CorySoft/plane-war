import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { POWERUP_DEFS, POWERUP_DROP, SKILLS, H } from "../js/config.js";
import { powerups, spawnPowerup, updatePowerups, applyPowerup, clearPowerups, getGachaAnim, clearGachaAnim } from "../js/powerup.js";
import { createPlayer } from "../js/player.js";
import { META } from "../js/config.js";
import { loadMeta, resetMeta, getStats } from "../js/meta.js";
import { particles, clearParticles } from "../js/particles.js";

function player() {
  return createPlayer(META.aircraft.falcon, {});
}

describe("powerup", () => {
  beforeEach(() => {
    clearPowerups();
    clearParticles();
    clearGachaAnim();
    resetStorage();
    resetMeta();
    loadMeta();
  });

  it("掉落率控制生成", () => {
    const orig = Math.random;
    Math.random = () => POWERUP_DROP.base + 0.01;
    spawnPowerup(100, 100, 1, 0);
    assert.equal(powerups.length, 0);
    Math.random = () => 0;
    spawnPowerup(100, 100, 1, 0);
    assert.equal(powerups.length, 1);
    assert.ok(POWERUP_DEFS[powerups[0].type]);
    Math.random = orig;
  });

  it("越界道具被移除", () => {
    powerups.push({ x: 100, y: H + 40, vy: 1.8, t: 0, type: "life" });
    updatePowerups(0.016, player(), false);
    assert.equal(powerups.length, 0);
  });

  it("磁铁吸引靠近玩家", () => {
    const p = player();
    p.x = 240; p.y = 620;
    p.buffs.magnet = 8;
    powerups.push({ x: 240, y: 500, vy: 0, t: 0, type: "life" });
    const x0 = powerups[0].x;
    const y0 = powerups[0].y;
    updatePowerups(0.016, p, true);
    assert.equal(powerups.length, 1);
    const d0 = Math.hypot(p.x - x0, p.y - y0);
    const d1 = Math.hypot(p.x - powerups[0].x, p.y - powerups[0].y);
    assert.ok(d1 < d0);
  });

  it("靠近即拾取并计入统计", () => {
    const p = player();
    p.x = 100; p.y = 100;
    powerups.push({ x: 100, y: 100, vy: 0, t: 0, type: "life" });
    updatePowerups(0.016, p, false);
    assert.equal(powerups.length, 0);
    assert.equal(p._addLife, true);
    assert.equal(getStats().totalPowerups, 1);
  });

  it("火力道具升到 4 级封顶", () => {
    const p = player();
    p.power = 4;
    applyPowerup({ type: "power", x: 0, y: 0 }, p);
    assert.equal(p.power, 4);
    p.power = 1;
    applyPowerup({ type: "power", x: 0, y: 0 }, p);
    assert.equal(p.power, 2);
    assert.equal(p.powerTime, 15);
  });

  it("各类 buff 道具设置计时", () => {
    const p = player();
    applyPowerup({ type: "rapid", x: 0, y: 0 }, p);
    applyPowerup({ type: "speed", x: 0, y: 0 }, p);
    applyPowerup({ type: "magnet", x: 0, y: 0 }, p);
    applyPowerup({ type: "double", x: 0, y: 0 }, p);
    applyPowerup({ type: "madHunt", x: 0, y: 0 }, p);
    applyPowerup({ type: "drop", x: 0, y: 0 }, p);
    applyPowerup({ type: "critboost", x: 0, y: 0 }, p);
    applyPowerup({ type: "freeze", x: 0, y: 0 }, p);
    applyPowerup({ type: "xppack", x: 0, y: 0 }, p);
    applyPowerup({ type: "shield", x: 0, y: 0 }, p);
    assert.equal(p.buffs.rapid, 8);
    assert.equal(p._freeze, true);
    assert.equal(p._xp, 50);
    assert.equal(p.shield, 1);
  });

  it("技能+1 道具至少升一级", () => {
    const p = player();
    applyPowerup({ type: "skillup", x: 0, y: 0 }, p);
    const total = Object.values(p.skills).reduce((a, b) => a + (b || 0), 0);
    assert.ok(total >= 1);
    assert.ok(p._toast);
  });

  it("技能全满时 skillup 给出提示", () => {
    const p = player();
    for (const s of SKILLS) p.skills[s.id] = s.max;
    applyPowerup({ type: "skillup", x: 0, y: 0 }, p);
    assert.equal(p._toast.text, "技能已全部满级");
    assert.equal(getGachaAnim(), null);
  });
});
