import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, stubRandom } from "./_env.mjs";
import { STATE, POWERUP_DURATION } from "../js/config.js";
import { getSettings } from "../js/meta.js";
import { spawnBoss } from "../js/wave.js";
import { initInput, getTouchTarget } from "../js/input.js";

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

// 捕获运行时错误：loop 内 try/catch 会把错误写入 console.error
const errors = [];
console.error = (...args) => { errors.push(args.map(String).join(" ")); };

await import("../js/game.js");

const game = () => globalThis.window.__game;

describe("game 集成冒烟", () => {
  it("模块加载并暴露调试接口", () => {
    assert.equal(globalThis.window.__gameReady, true);
    assert.ok(game());
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("开始游戏并推进 180 帧无运行时错误", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    assert.equal(game().state(), STATE.PLAYING);
    for (let i = 0; i < 180 && typeof rafCb === "function"; i++) rafCb();
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("高难度触发 Boss 波次不崩溃", () => {
    game().setScore(60000);
    game().setLevel(9);
    for (let i = 0; i < 400 && typeof rafCb === "function"; i++) rafCb();
    assert.ok(Array.isArray(game().enemies));
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("母舰由空军召唤相位切入射击相位后重置开火计时", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    const boss = spawnBoss("mothership", 1);
    assert.equal(boss.fireCd, 999, "母舰第一相位为空军召唤（无枪），开火计时初始为 999");
    boss.hp = boss.maxHp * 0.49;   // 切到 spread 射击相位
    for (let i = 0; i < 30 && typeof rafCb === "function"; i++) rafCb();
    assert.ok(boss.fireCd <= 5, "相位切换后应重置开火计时（当前 " + boss.fireCd + "，未重置会停留 ~999）");
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  // ---------- 回归：爆炸闪光必须有上限 ----------
  // 旧实现只对 fxRings 封顶（48），漏了 fxBlasts；连锁清屏时一帧塞进几十个，
  // 每个都要逐帧 createRadialGradient，直接砸帧率。
  it("爆炸闪光数量有上限（连锁清屏不失控）", () => {
    // 爆炸触发、暴击、掉落都依赖 Math.random；固定成 0 让爆炸必定触发、必定不暴击，
    // 用例才能稳定走到封顶分支（否则偶发不满 24 个、测试闪烁）
    const restoreRandom = stubRandom([0]);
    try {
    getSettings().skipTutorial = true;
    game().resetGame();
    const p = game().getPlayer();
    p.skills.explosion = 1;   // 开启爆炸弹，使死亡爆炸递归成链
    p.skills.expChance = 6;
    p.skills.expDmg = 6;
    p.skills.expRange = 6;
    p.power = 4;
    // 在玩家前方堆 60 架小敌机（同屏上限），一发高伤爆炸弹把它们全部引爆
    for (let i = 0; i < 60; i++) {
      game().spawnEnemy(14, { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 }, 1, 220 + (i % 5) * 10, 300 + Math.floor(i / 5) * 12);
    }
    assert.ok(game().enemies.length > 0);
    game().fireBullet(0, 9999, p, p.x, p.y - p.h / 2, 20, true);
    // 闪光寿命只有 0.15s（约 9 帧），必须在循环里取峰值，
    // 跑完 60 帧再读只会读到 0，测不出有没有封顶
    let peakBlasts = 0, peakRings = 0;
    for (let i = 0; i < 60 && typeof rafCb === "function"; i++) {
      rafCb();
      const fx = game().getFxCounts();
      peakBlasts = Math.max(peakBlasts, fx.blasts);
      peakRings = Math.max(peakRings, fx.rings);
    }
    assert.ok(peakBlasts <= 24, "爆炸闪光不得超过 24（当前 " + peakBlasts + "）");
    assert.ok(peakRings <= 48, "爆炸波纹不得超过 48（当前 " + peakRings + "）");
    assert.ok(game().enemies.length === 0, "60 架敌机应被连锁清空");
    assert.equal(errors.length, 0, errors.join("\n"));
    } finally { restoreRandom(); }
  });

  it("难度档位持久化：切换难度后写入 settings", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    game().setDifficulty("hard");
    assert.equal(getSettings().difficulty, "hard", "选中的难度应写入存档");
    game().setDifficulty("normal");
    assert.equal(getSettings().difficulty, "normal");
  });

  // ---------- 回归：死亡后不再被重复结算 ----------
  // 旧实现里 hitPlayer 不判 lives<=0，死亡动画（2s）一结束还压在身上的敌机
  // 立刻再打中一次，deathTimer 重置回 2s，进入「死了却永不结算」的死循环，
  // lives 一路扣成负数。正常对局靠 2.2s 无敌帧掩盖（动画 2s < 无敌 2.2s），
  // 无敌时间被压缩时必现。
  it("死亡后 lives 不再下探，且恰好在一段死亡动画后进入结算", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    const p = game().getPlayer();
    p.invincibleTime = 0.001;   // 压掉无敌帧，复现旧 bug 的触发条件
    p.shield = 0;
    const DIFF = { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 };
    for (let i = 0; i < 6; i++) game().spawnEnemy(14, DIFF, 1, 225 + i * 6, 552);
    let minLives = Infinity;
    for (let f = 1; f <= 400; f++) {
      rafCb();
      minLives = Math.min(minLives, game().getLives());
      if (game().state() !== STATE.PLAYING) break;
    }
    assert.ok(minLives >= 0, "lives 不得变成负数（实测最低 " + minLives + "）");
    assert.notEqual(game().state(), STATE.PLAYING, "必须在一段死亡动画后离开 PLAYING");
    assert.ok(errors.length === 0, errors.join("\n"));
  });

  // ---------- 回归：连锁爆炸必须用「最近一次」爆炸参数 ----------
  // 旧实现是「先写先赢」：弱爆炸先把 _deathExplosion 写到幸存敌机上，
  // 之后强爆炸的 AOE 即使命中同一敌机也不刷新标记，连锁按弱参数算半径与伤害。
  it("AOE 命中后 _deathExplosion 刷新为最新（强）爆炸参数", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    const p = game().getPlayer();
    p.invincible = 9e9;
    p.fireCd = 999;
    p.skills.explosion = 0;   // 只让显式 isExplosion 的子弹带爆炸行为
    const DIFF = { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 };

    // 幸存者：预置一个很弱的爆炸标记（模拟被弱爆炸先 AOE 擦到）。
    // 位置要在爆炸半径（约 60）内、但不在子弹碰撞半径（r+b.r≈40）内，
    // 否则子弹先命中幸存者就被消耗掉，诱饵永远打不到。
    game().spawnEnemy(1, DIFF, 1, 238, 355, { type: "big" });
    const survivor = game().enemies[game().enemies.length - 1];
    survivor.vy = 0; survivor.vx = 0;
    survivor.maxHp = 1e9; survivor.hp = 1e9;   // 强爆炸也不死，便于读标记
    survivor._deathExplosion = { dmg: 10, radius: 40, expDmgRatio: 0.45 };

    // 诱饵：与幸存者重叠，用高伤爆炸弹击杀以触发真实 AOE 路径
    game().spawnEnemy(1, DIFF, 1, 241, 302, { type: "big" });
    const bait = game().enemies[game().enemies.length - 1];
    bait.vy = 0; bait.vx = 0;
    bait.maxHp = 1; bait.hp = 1;

    // 弹速取极小值，避免高速弹在一帧内穿透跳过碰撞
    game().fireBullet(0, 9999, p, bait.x, bait.y, 0.05, true);
    for (let f = 0; f < 6 && game().enemies.includes(bait); f++) rafCb();

    assert.ok(!game().enemies.includes(bait), "诱饵必须被爆炸弹击杀");
    assert.ok(survivor._deathExplosion, "幸存者应被 AOE 标记");
    assert.equal(survivor._deathExplosion.dmg, 9999, "标记必须刷新为最新（强）爆炸的伤害");
    assert.equal(survivor._deathExplosion.expDmgRatio, 0.45, "标记的伤害系数也应取最新爆炸（0 级 expDmg → 0.45）");
    assert.ok(survivor.hp < 1e9, "幸存者必须真的吃到 AOE 伤害（否则标记来源不成立）");
    assert.ok(errors.length === 0, errors.join("\n"));
  });

  // ---------- 回归：全场冻结时长必须读 POWERUP_DURATION 单源 ----------
  // 旧实现 game.js 里硬编码 e.frozen = 8，与 powerup/hud/codex 的时长表脱节。
  it("冻结道具按 POWERUP_DURATION.freeze 冻结全场敌机", () => {
    getSettings().skipTutorial = true;
    game().resetGame();
    const p = game().getPlayer();
    p.invincible = 9e9;
    p.fireCd = 999;
    const DIFF = { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 };
    // 放在玩家上方（发射线以上），否则会被 freezeAll 的「打不到就跳过」规则排除
    game().spawnEnemy(1, DIFF, 1, 240, 200, { type: "small" });
    const e = game().enemies[game().enemies.length - 1];
    e.vy = 0; e.vx = 0; e.fireCd = 999;
    p._freeze = true;
    rafCb();
    assert.ok(e.frozen > POWERUP_DURATION.freeze - 0.5 && e.frozen <= POWERUP_DURATION.freeze,
      `冻结时长应为表值 ${POWERUP_DURATION.freeze}（含单帧衰减），实测 ${e.frozen.toFixed(2)}`);
    assert.ok(errors.length === 0, errors.join("\n"));
  });
});

// ---------- 回归：跨状态触摸目标残留（Qoder 复现的缺陷）----------
// 菜单/暂停/结算等界面点屏会经 canvas pointerdown 记录一个触摸跟随目标，
// 若该目标在对局开局仍存活，战机会在玩家零触摸的情况下自行横移。修复后
// resetGame / enterPlaying 必须清空它。
describe("触摸跟随：跨状态不残留悬空移动指令", () => {
  // 自建可捕获的画布，接管 input.js 的指针监听（game.test 原 canvas 为 noop）
  const inLis = {};
  const inCanvas = {
    addEventListener: (t, fn) => { (inLis[t] ||= []).push(fn); },
    removeEventListener: noop,
    setPointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
  };
  initInput(inCanvas);
  function fireTouch(type, x) {
    for (const fn of (inLis[type] || [])) {
      fn({ pointerType: "touch", pointerId: 1, clientX: x, clientY: 100, preventDefault: noop, stopPropagation: noop, target: inCanvas });
    }
  }

  it("界面点屏留下的跟随目标，resetGame 后清零，开局战机不自行位移", () => {
    // 模拟在界面（菜单/暂停/结算等任意态）点屏留下一条悬空移动指令
    fireTouch("pointerdown", 100);
    assert.equal(getTouchTarget().active, true, "点屏应记录跟随目标");
    fireTouch("pointerup", 100);

    getSettings().skipTutorial = true;
    game().resetGame();   // 新局：必须清空悬空目标，否则开局战机被拖走
    assert.equal(getTouchTarget().active, false, "resetGame 必须清空触摸目标（修复跨状态残留）");
    assert.equal(game().state(), STATE.PLAYING);

    const x0 = game().getPlayer().x;
    for (let i = 0; i < 60 && typeof rafCb === "function"; i++) rafCb();
    const x1 = game().getPlayer().x;
    assert.equal(x1 - x0, 0, `开局无触摸时战机不应自行位移（x: ${x0}→${x1}）`);
    assert.equal(errors.length, 0, errors.join("\n"));
  });
});
