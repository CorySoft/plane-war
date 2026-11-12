/* ===========================================================
 * powerups-phase2.test.mjs — Phase 2 四道具端到端护栏
 * 覆盖：nuke 零收益 + Boss 免疫；invuln 免伤；shieldFull 满盾转无敌；
 *       bulletTime 只慢敌方侧（玩家侧不变 / 敌弹位移缩放 / 冰冻时长不延长）；权重覆盖。
 * 全部断言用配置真值，不写死时长以外的手工数字。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { STATE, POWERUP_DURATION, POWERUP_WEIGHTS_EARLY, POWERUP_WEIGHTS_LATE, BULLET } from "../js/config.js";
import { getSettings, getStats } from "../js/meta.js";
import { applyPowerup } from "../js/powerup.js";
import { fireBullet } from "../js/bullet.js";
import { spawnBoss } from "../js/wave.js";

const noop = () => {};
let rafCb = null;
let fakeNow = 0;

const ctx2d = makeCtx();
const canvas = {
  width: 480, height: 720, style: {},
  addEventListener: noop, removeEventListener: noop,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
};
const makeEl = () => ({
  style: {}, classList: { toggle: noop, add: noop, remove: noop },
  addEventListener: noop, removeEventListener: noop, appendChild: noop, parentNode: null,
});
const touchUi = makeEl();
globalThis.document = {
  getElementById: id => (id === "game" ? canvas : makeEl()),
  querySelector: sel => (sel === ".touch-ui" ? touchUi : null),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: noop, removeEventListener: noop, body: makeEl(),
};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;
globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = noop;
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = noop;
globalThis.performance = { now: () => (fakeNow += 16.7) };
globalThis.window.performance = globalThis.performance;
const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

const { hitPlayer, setLivesForTest } = await import("../js/game.js");
const game = () => globalThis.window.__game;
getSettings().skipTutorial = true;
const step = n => { for (let i = 0; i < n && typeof rafCb === "function"; i++) rafCb(); };

function makeHostileBullet(over = {}) {
  return {
    behaviors: new Set(), hitUids: new Set(), friendly: false,
    x: 240, y: 300, vx: 10, vy: 0, dmg: 1, r: 5, baseR: 5, color: "#ff8fa3",
    traveled: 0, maxRange: 0, pierceCount: 0, maxPierce: 0, splitCount: 0,
    explosionRadius: 0, expDmgRatio: 0, expChance: 0, isScatter: false, isCrit: false,
    _refire: false, life: 999, homing: 0, knockback: 0, nextSplitDist: 0, splitRange: 0,
    ...over,
  };
}

describe("Phase 2 道具：nuke", () => {
  it("全屏清场：清敌弹与普通敌机，Boss 免疫，且零分/零击杀/零等级收益", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.fireCd = 999;                       // 关掉自动射击，避免击杀污染读数
    const score0 = game().getScore();
    const kills0 = getStats().totalKills;
    const level0 = p.level;
    const normals = [];
    for (let i = 0; i < 12; i++) normals.push(game().spawnEnemy(1, null, 1, 100 + i * 10, 220, { type: "small" }));
    const boss = spawnBoss("phantom", 1);
    const bossHp = boss.hp;
    game().bullets.push(makeHostileBullet());

    applyPowerup({ type: "nuke", x: 0, y: 0 }, p);
    step(1);

    for (const e of normals) assert.ok(!game().enemies.includes(e), "普通敌机应被清场移除");
    assert.ok(game().enemies.includes(boss), "Boss 必须免疫 nuke");
    assert.equal(boss.hp, bossHp, "Boss 血量不应被 nuke 改变");
    assert.equal(game().bullets.filter(b => b && !b.friendly).length, 0, "敌弹应被清空");
    assert.equal(game().getScore(), score0, "nuke 不得给分（零连击/零本体分）");
    assert.equal(getStats().totalKills, kills0, "nuke 不得计击杀");
    assert.equal(p.level, level0, "nuke 不得给经验/升级");
    assert.ok(p.buffs.invuln >= 1, "nuke 应给 1 秒起手保护");
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});

describe("Phase 2 道具：invuln / shieldFull", () => {
  it("无敌力场期间：敌机与敌弹碰撞都不掉命、不消耗护盾、弹体不被消耗", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.fireCd = 999;
    p.buffs.invuln = POWERUP_DURATION.invuln;
    setLivesForTest(2);
    p.shield = 1;
    const enemy = game().spawnEnemy(1, null, 1, p.x, p.y, { type: "small" });
    enemy.vy = 0;
    const bullet = makeHostileBullet({ x: p.x, y: p.y - 6, vx: 0, vy: 0 });
    game().bullets.push(bullet);

    step(1);

    assert.equal(game().getLives(), 2, "无敌期间不应掉命");
    assert.equal(p.shield, 1, "无敌期间不应消耗护盾");
    assert.ok(game().enemies.includes(enemy), "无敌期间敌机不应因碰撞被移除");
    assert.ok(game().bullets.includes(bullet), "无敌期间敌弹不应被消耗");
  });

  it("护盾全满：未满时回满；已满时转 2 秒无敌", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.maxShield = 3;
    p.shield = 1;
    applyPowerup({ type: "shieldFull", x: 0, y: 0 }, p);
    assert.equal(p.shield, 3, "未满盾应直接回满");

    p.buffs.invuln = 0;
    applyPowerup({ type: "shieldFull", x: 0, y: 0 }, p);
    assert.equal(p.shield, 3, "满盾时护盾保持满");
    assert.equal(p.buffs.invuln, 2, "满盾拾取应转 2 秒无敌，避免空拾取");
  });
});

describe("Phase 2 道具：bulletTime 只慢敌方侧", () => {
  const measureFriendly = bt => {
    game().resetGame();
    const p = game().getPlayer();
    p.fireCd = 999;
    if (bt) p.buffs.bulletTime = POWERUP_DURATION.bulletTime;
    const b = fireBullet(0, 1, p, 240, 500, 10);
    step(5);
    return b.traveled;   // angle=0 为垂直向上，用弧长（traveled）衡量位移
  };
  const measureHostile = bt => {
    game().resetGame();
    const p = game().getPlayer();
    p.fireCd = 999;
    if (bt) p.buffs.bulletTime = POWERUP_DURATION.bulletTime;
    const b = makeHostileBullet();
    game().bullets.push(b);
    const x0 = b.x;
    step(5);
    return b.x - x0;
  };
  const measureFrozen = bt => {
    game().resetGame();
    const p = game().getPlayer();
    p.fireCd = 999;
    if (bt) p.buffs.bulletTime = POWERUP_DURATION.bulletTime;
    const e = game().spawnEnemy(1, null, 1, 240, 300, { type: "small" });
    e.frozen = 8;
    e.vy = 0;
    step(10);
    return e.frozen;
  };

  it("友方（玩家侧）子弹位移不受影响", () => {
    const base = measureFriendly(false);
    const slowed = measureFriendly(true);
    assert.ok(base > 0, "对照组位移应大于 0");
    const ratio = slowed / base;
    assert.ok(Math.abs(ratio - 1) < 0.05, `玩家侧应不受子弹时间影响，实测比值 ${ratio.toFixed(3)}`);
  });

  it("敌方子弹位移按 BULLET.bulletTimeScale 缩放", () => {
    const base = measureHostile(false);
    const slowed = measureHostile(true);
    assert.ok(base > 0, "对照组位移应大于 0");
    const ratio = slowed / base;
    assert.ok(Math.abs(ratio - BULLET.bulletTimeScale) < 0.05,
      `敌弹位移应缩放到 ${BULLET.bulletTimeScale}，实测 ${ratio.toFixed(3)}`);
  });

  it("冰冻时长用真实 dt，不被子弹时间延长", () => {
    const base = measureFrozen(false);
    const slowed = measureFrozen(true);
    assert.ok(Math.abs(base - slowed) < 0.05, `frozen 剩余应一致，实测 ${base.toFixed(3)} vs ${slowed.toFixed(3)}`);
  });
});

describe("Phase 2 道具：权重覆盖", () => {
  it("早晚权重表都覆盖 4 个新道具，且数值与规格一致", () => {
    const expect = { nuke: 3, invuln: 5, bulletTime: 4, shieldFull: 7 };
    for (const [name, list] of [["EARLY", POWERUP_WEIGHTS_EARLY], ["LATE", POWERUP_WEIGHTS_LATE]]) {
      const map = new Map(list);
      for (const [id, w] of Object.entries(expect)) {
        assert.equal(map.get(id), w, `${name} 权重表缺少/错写 ${id}`);
      }
    }
  });
});