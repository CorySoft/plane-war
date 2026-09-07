import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import {
  W, H, fontScale, computeViewport, setViewport, STATE, SKILLS, ACHIEVEMENTS,
  DAILY_QUESTS, META, POWERUP_DEFS, POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE,
  DIFFICULTY_PRESETS, todayKey, ENEMY_TYPES,
} from "../js/config.js";

afterEach(() => {
  window.innerWidth = 480;
  window.innerHeight = 720;
  setViewport(480, 720);
});

describe("config", () => {
  it("状态机枚举互不重复", () => {
    const vals = Object.values(STATE);
    assert.equal(new Set(vals).size, vals.length);
  });

  it("技能 id 唯一且含满级上限", () => {
    const ids = SKILLS.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of SKILLS) {
      assert.ok(s.max >= 1);
      assert.ok(s.name && s.desc);
    }
  });

  it("成就与每日任务 id 唯一", () => {
    const aIds = ACHIEVEMENTS.map(a => a.id);
    assert.equal(new Set(aIds).size, aIds.length);
    const qIds = DAILY_QUESTS.map(q => q.id);
    assert.equal(new Set(qIds).size, qIds.length);
  });

  it("道具权重覆盖全部定义", () => {
    const types = Object.keys(POWERUP_DEFS);
    for (const list of [POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE]) {
      const ids = list.map(([id]) => id);
      assert.deepEqual([...ids].sort(), [...types].sort());
    }
  });

  it("敌机类型含血量与奖励", () => {
    for (const cfg of Object.values(ENEMY_TYPES)) {
      assert.ok(cfg.hp >= 1);
      assert.ok(cfg.score > 0);
      assert.ok(cfg.r > 0);
    }
  });

  it("难度档位字段齐全", () => {
    for (const key of ["easy", "normal", "hard"]) {
      const p = DIFFICULTY_PRESETS[key];
      assert.ok(p.hpScale > 0);
      assert.ok(p.spawnScale > 0);
      assert.ok(p.scoreScale > 0);
    }
  });

  it("飞机配置含起始机体", () => {
    assert.ok(META.aircraft.falcon);
    assert.equal(META.aircraft.falcon.cost, 0);
  });

  it("todayKey 为 YYYY-MM-DD", () => {
    assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it("computeViewport 横屏保持基准", () => {
    window.innerWidth = 1920;
    window.innerHeight = 1080;
    const v = computeViewport();
    assert.equal(v.w, 480);
    assert.equal(v.h, 720);
    assert.ok(v.scale > 0);
  });

  it("computeViewport 竖屏按比例缩窄", () => {
    window.innerWidth = 390;
    window.innerHeight = 844;
    const v = computeViewport();
    assert.equal(v.h, 720);
    assert.ok(v.w >= 320 && v.w <= 480);
  });

  it("fontScale 随逻辑宽度变化", () => {
    setViewport(480, 720);
    assert.equal(fontScale(), 1);
    setViewport(240, 720);
    assert.equal(fontScale(), 0.5);
    setViewport(480, 720);
    assert.equal(W, 480);
    assert.equal(H, 720);
  });
});
