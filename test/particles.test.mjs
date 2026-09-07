import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { particles, spawnParticles, updateParticles, clearParticles } from "../js/particles.js";

describe("particles", () => {
  beforeEach(() => clearParticles());

  it("生成指定数量粒子", () => {
    spawnParticles(10, 20, "#fff", 8, 3);
    assert.equal(particles.length, 8);
    assert.ok(particles.every(p => p.life > 0 && p.color === "#fff"));
  });

  it("上限 400", () => {
    spawnParticles(0, 0, "#fff", 500, 2);
    assert.ok(particles.length <= 400);
  });

  it("生命耗尽后清除", () => {
    spawnParticles(0, 0, "#fff", 5, 2);
    for (const p of particles) p.life = 0.01;
    updateParticles(1);
    assert.equal(particles.length, 0);
  });

  it("重力下拉", () => {
    spawnParticles(0, 0, "#fff", 1, 0.1);
    const vy0 = particles[0].vy;
    updateParticles(0.1);
    assert.ok(particles[0].vy > vy0);
  });
});
