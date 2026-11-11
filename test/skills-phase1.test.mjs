import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { STATE } from "../js/config.js";
import { createPlayer } from "../js/player.js";
import { calcFireRate, SKILLS, skillMax, BULLET, XP_BASE } from "../js/config.js";
import { META } from "../js/config.js";
import { getSettings } from "../js/meta.js";
import { createSyntheticBullet, applyPierceOrRemove, fireBullet } from "../js/bullet.js";

const noop = () => {};

// ---- 浏览器环境 mock（必须在 import game.js 之前完成）----
let rafCb = null;
let fakeNow = 0;

const ctx2d = makeCtx();
const canvas = {
  width: 480,
  height: 720,
  style: {},
  addEventListener: noop,
  removeEventListener: noop,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
};

const makeEl = () => ({
  style: {},
  classList: { toggle: noop, add: noop, remove: noop },
  addEventListener: noop,
  removeEventListener: noop,
  appendChild: noop,
  parentNode: null,
});

const touchUi = makeEl();

globalThis.document = {
  getElementById: (id) => (id === "game" ? canvas : makeEl()),
  querySelector: (sel) => (sel === ".touch-ui" ? touchUi : null),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: noop,
  removeEventListener: noop,
  body: makeEl(),
};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;

globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = noop;
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.window.cancelAnimationFrame = noop;

globalThis.performance = { now: () => (fakeNow += 16.7) };
globalThis.window.performance = globalThis.performance;

const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

const { addXp, hitPlayer, setLivesForTest, chooseSkill } = await import("../js/game.js");

const game = () => globalThis.window.__game;
// 跳过教程：resetGame 后直接进入 PLAYING，模拟逻辑才会推进
getSettings().skipTutorial = true;
const step = (n) => { for (let i = 0; i < n && typeof rafCb === "function"; i++) rafCb(); };

describe("阶段1 新技能：配置与数值", () => {
  it("SKILLS 含 6 个新机制技能且上限正确", () => {
    const ids = SKILLS.map(s => s.id);
    for (const id of ["homing", "nova", "regen", "overload", "secondWind", "chain"]) {
      assert.ok(ids.includes(id), `缺少技能 ${id}`);
    }
    assert.equal(skillMax("homing"), 5);
    assert.equal(skillMax("nova"), 3);
    assert.equal(skillMax("regen"), 5);
    assert.equal(skillMax("overload"), 5);
    assert.equal(skillMax("secondWind"), 1);
    assert.equal(skillMax("chain"), 5);
  });

  it("过载核心：残血时射速更快（calcFireRate 返回更小间隔）", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.skills.overload = 5;
    p.hpRatio = 1;            // 满血
    const full = calcFireRate(p);
    p.hpRatio = 0;            // 濒死
    const low = calcFireRate(p);
    assert.ok(low < full, `残血射速应更快：full=${full} low=${low}`);
  });

  it("过载核心：满血时射速不受影响", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.skills.overload = 5;
    p.hpRatio = 1;
    const withSkill = calcFireRate(p);
    p.skills.overload = 0;
    const without = calcFireRate(p);
    assert.ok(Math.abs(withSkill - without) < 1e-9);
  });

  it("追踪弹：getShootPattern 标记所有子弹 homing", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.skills.homing = 3;
    const patterns = game().getShootPattern(p);
    assert.ok(patterns.length > 0);
    assert.ok(patterns.every(b => b.homing === true), "所有子弹应带 homing=true");
  });

  it("BULLET 含连锁/新星配置项", () => {
    assert.ok(BULLET.chainRange > 0);
    assert.ok(BULLET.novaBaseRadius > 0);
    assert.ok(BULLET.novaDmgPerLevel > 0);
  });
});

describe("阶段1 新技能：玩法效果", () => {
  it("新星爆发：升级时释放新星环并清掉范围内敌机", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.nova = 1;
    const px = p.x, py = p.y;
    // 在玩家脚下生成 1 只低血敌机（必在半径内）
    const e = game().spawnEnemy(1, null, 1, px, py, { type: "small" });
    assert.equal(game().enemies.length, 1);
    addXp(1000);   // 触发升级 → emitNova
    // 范围内敌机被新星击杀，且至少生成一道圆弧波纹
    assert.equal(game().enemies.length, 0, "范围内敌机应被新星清除");
    assert.ok(game().getFxCounts().rings > 0, "应生成新星环特效");
  });

  it("绝境逢生：本局首次致死自动复活一次", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.secondWind = 1;
    setLivesForTest(1);
    hitPlayer();     // 致死一击
    assert.equal(game().getLives(), 1, "应复活为 1 命");
    assert.equal(p.secondWindUsed, true, "应标记已使用绝境逢生");
    assert.equal(game().state(), STATE.PLAYING, "复活后仍在游戏中（非结算）");
    // 第二次致死不再复活：进入死亡动画后推进至结算
    setLivesForTest(1);
    hitPlayer();
    assert.equal(game().state(), STATE.PLAYING, "第二次死亡应进入死亡动画");
    for (let i = 0; i < 200 && game().state() === STATE.PLAYING; i++) rafCb();
    assert.equal(game().state(), STATE.OVER, "第二次死亡应正常结算");
  });

  it("生命再生：残血时随时间回复生命", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.regen = 5;
    p.invincible = 9999;   // 隔离敌方干扰
    setLivesForTest(1);
    const maxLives = game().getMaxLives();
    assert.ok(maxLives > 1, "测试用例需有回复空间");
    // 逐帧推进，遇到升级选择自动选第一项继续，保证模拟不暂停、再生持续累积
    for (let i = 0; i < 600; i++) {
      rafCb();
      if (game().state() === STATE.LEVELUP) {
        const choices = game().getSkillChoices();
        if (choices && choices.length) chooseSkill(choices[0].id);
      }
    }
    assert.equal(game().getLives(), maxLives, "应回满生命");
  });

  it("连锁闪电：命中后向邻近敌机弹射并生成视觉线段", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.chain = 5;
    p.invincible = 9999;
    const px = p.x, py = p.y;
    // 两只高血敌机：一只正上方（先被击中），一只在旁（接收连锁）
    const b = game().spawnEnemy(1, null, 1, px + 40, py - 60, { type: "big" });
    game().spawnEnemy(1, null, 1, px, py - 60, { type: "big" });
    const bHp0 = b.hp;
    let sawChain = false;
    // 逐帧观察：连锁闪电线段时间极短，必须在步进过程中捕获
    for (let i = 0; i < 120; i++) {
      rafCb();
      if (game().state() === STATE.LEVELUP) {
        const choices = game().getSkillChoices();
        if (choices && choices.length) chooseSkill(choices[0].id);
      }
      if (game().getFxChains().length > 0) sawChain = true;
      if (sawChain && b.hp < bHp0) break;
    }
    assert.ok(sawChain, "应产生连锁闪电线段");
    assert.ok(b.hp < bHp0, "邻近敌机应受到连锁伤害");
  });
});

describe("阶段1 新技能：回归护栏", () => {
  it("nova 自催化环已被切断：一次升级只放 1 道新星、只发 1 次 doLevelUp", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.nova = 1;
    p.invincible = 9999;
    setLivesForTest(1);
    const px = p.x, py = p.y;
    // 40 只低血敌机围绕玩家 70px（新星 1 级半径 120 → 全部命中）
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      game().spawnEnemy(1, null, 1, px + Math.cos(ang) * 70, py + Math.sin(ang) * 70, { type: "small" });
    }
    const rings0 = game().getFxCounts().rings;
    const level0 = p.level;
    addXp(XP_BASE);
    const ringDelta = game().getFxCounts().rings - rings0;
    assert.equal(ringDelta, 1, `一次升级只应放 1 道新星环（防自催化环），实测 ${ringDelta}`);
    assert.equal(game().getLives(), 2, "只应发一次 doLevelUp 的命，而不是 2~3 次");
    assert.ok(p.level > level0, "击杀经验仍应正常累积（升级不回退）");
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});

describe("阶段1 新技能：池与观测口护栏", () => {
  it("合成子弹不回真实子弹的池（防 _chainSource 静默残留）", () => {
    game().resetGame();
    const p = game().getPlayer();
    const synth = createSyntheticBullet(1, { chainSource: true });
    // 生产路径：dealDamageToEnemy 末尾就是 applyPierceOrRemove(b)
    applyPierceOrRemove(synth);
    const live = fireBullet(0, 1, p, 240, 500);
    assert.notEqual(live, synth, "合成弹被回池：下一发真实弹复用了同一个对象");
    assert.notEqual(live._chainSource, true, "真实弹出厂即带 _chainSource → 永远不触发连锁");
  });

  it("续命观测口（只读）：secondWind 触发后 revives=1 且 reviveUsed=true", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.secondWind = 1;
    setLivesForTest(1);
    hitPlayer();
    assert.deepEqual(game().getReviveStats(), { reviveUsed: true, revives: 1 });
  });
});
