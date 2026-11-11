import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "./_env.mjs";
import { STATE } from "../js/config.js";
import { createPlayer, calcPlayerBaseDmg } from "../js/player.js";
import { calcFireRate, SKILLS, skillMax, BULLET, XP_BASE, REGEN_RATE, LIFESTEAL, PLAYER_BASE } from "../js/config.js";
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

  it("生命再生：残血时随时间回复生命（受击无敌帧之外）", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.regen = 5;
    setLivesForTest(1);
    const maxLives = game().getMaxLives();
    assert.ok(maxLives > 1, "测试用例需有回复空间");
    // 逐帧推进；清空敌机/敌弹以隔离干扰（不再用 invincible 隔离——新一轮规则下无敌帧内不回血）
    for (let i = 0; i < 1200; i++) {
      game().enemies.splice(0);
      game().bullets.splice(0);
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

  it("续命观测口（只读）：secondWind 只累加技能复活计数", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.secondWind = 1;
    setLivesForTest(1);
    hitPlayer();
    assert.deepEqual(game().getReviveStats(), { reviveUsed: true, secondWindRevives: 1, paidRevives: 0 });
  });
});

describe("阶段1 平衡护栏（本轮加固）", () => {
  it("生存轴不变量：regen+lifesteal 稳态回血 < 受击速率，且 regen 不支配 lifesteal", () => {
    // 全部用配置真值计算，不写死数字；改动任一常量而破坏不变量会直接红
    const regenSteady = REGEN_RATE * skillMax("regen");
    const lifestealSteady = 1 / LIFESTEAL.cooldown;
    const hitRate = 1 / PLAYER_BASE.invincibleTime;
    assert.ok(regenSteady + lifestealSteady < hitRate,
      `叠加回血 ${(regenSteady + lifestealSteady).toFixed(4)} 必须低于受击速率 ${hitRate.toFixed(4)}`);
    assert.ok(regenSteady < lifestealSteady,
      `regen 满级 ${regenSteady.toFixed(3)} 不应支配 lifesteal 稳态 ${lifestealSteady.toFixed(3)}`);
  });

  it("受击无敌帧内不累计再生（2.2s 不回血）", () => {
    game().resetGame();
    const p = game().getPlayer();
    p.skills.regen = 5;
    setLivesForTest(1);
    for (let i = 0; i < 180; i++) {
      game().enemies.splice(0);
      game().bullets.splice(0);
      p.invincible = 5;   // 持续处于无敌帧
      rafCb();
    }
    assert.equal(game().getLives(), 1, "无敌帧内不应回血");
    assert.ok(!(p._regenAccum > 0), `无敌帧内不应累计再生，实测 ${p._regenAccum}`);
  });

  it("新星伤害随主弹伤害缩放：无 dmg 技能 = 2/3/4，dmg +6 同比放大", () => {
    const dealOnce = (dmgLv, novaLv) => {
      game().resetGame();
      const p = game().getPlayer();
      p.skills.nova = novaLv;
      p.skills.dmg = dmgLv;
      const e = game().spawnEnemy(1, null, 1, p.x, p.y - 60, { type: "big" });
      e.maxHp = 1000; e.hp = 1000; e.vy = 0; e.fireCd = 999;
      const base = calcPlayerBaseDmg(p);
      const hp0 = e.hp;
      addXp(XP_BASE);            // 触发一次升级 → 一道新星
      return { dealt: hp0 - e.hp, expected: Math.round(base * (2 + novaLv - 1)) };
    };
    for (const lv of [1, 2, 3]) {
      const r = dealOnce(0, lv);
      assert.equal(r.dealt, r.expected, `nova lvl${lv} 应造成 ${r.expected} 伤害`);
    }
    assert.equal(dealOnce(0, 1).dealt, 2, "无 dmg 技能时 nova lvl1 应为 2");
    assert.equal(dealOnce(6, 1).dealt, 14, "dmg+6 时主弹伤害 7，nova lvl1 应同比放大到 14");
  });
});
