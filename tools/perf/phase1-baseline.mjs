/* ===========================================================
 * phase1-baseline.mjs — Phase 1 六技能的带 seed 运行期基线
 *
 * 四组数字（每组同一 LCG 种子，可复现）：
 *   ① 同屏友方子弹峰值（homing 开 / 关）
 *   ② 单次升级事件被放大成几次升级 + 新星环数（含「同批怪被清掉但不触发 nova」对照组）
 *   ③ 60 秒存活的升级次数与最终得分（Phase-1 满级构筑 vs 基线构筑）
 *   ④ homing 的 traveled（弧长）与直线位移分离量 —— 只报数，不判定
 *
 * 用法：node tools/perf/phase1-baseline.mjs [组号]     SEED=… 可换种子
 *   例：node tools/perf/phase1-baseline.mjs 2
 * 只读，不改代码。
 * =========================================================== */

import { makeCtx } from "../../test/_env.mjs";

const SEED = Number(process.env.SEED || 20261108);
{ let s = SEED >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const ONLY = process.argv[2] || "all";

const noop = () => {};
let rafCb = null, clockMs = 0;
/** 推进一帧：时钟只在这里前进，保证 dt = 16.7ms 且与帧数一一对应 */
function step() { clockMs += 16.7; rafCb(clockMs); }
const ctx2d = makeCtx();
const canvas = {
  width: 480, height: 720, style: {},
  addEventListener: noop, removeEventListener: noop,
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 720, width: 480, height: 720 }),
};
const listeners = new Map();
const addL = (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); };
const dispatch = (t, ev) => { for (const fn of listeners.get(t) || []) fn(ev); };
// canvas 与 window 的监听器分开：input.js 的 pointerup 注册在 window 上，混在一起会测错
const winListeners = new Map();
const addW = (t, fn) => { if (!winListeners.has(t)) winListeners.set(t, new Set()); winListeners.get(t).add(fn); };
const makeEl = () => ({ style: {}, classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, addEventListener: addL, removeEventListener: noop, appendChild: noop, parentNode: null });
globalThis.document = {
  getElementById: (id) => (id === "game" ? canvas : makeEl()),
  querySelector: () => makeEl(),
  createElement: () => { const el = makeEl(); el.getContext = () => makeCtx(); return el; },
  addEventListener: addL, removeEventListener: noop, body: makeEl(),
};
globalThis.window = globalThis.window || {};
globalThis.window.document = globalThis.document;
globalThis.location = { reload: noop };
globalThis.window.location = globalThis.location;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.cancelAnimationFrame = noop;
globalThis.window.cancelAnimationFrame = noop;
globalThis.window.addEventListener = (t, fn) => { addW(t, fn); addL(t, fn); };
globalThis.window.removeEventListener = noop;
globalThis.performance = { now: () => clockMs };   // 纯读数：只在 stepFrame() 里前进。
// 之前写成 now: () => (fakeNow += 16.7)：时钟在「被读取」时前进，一帧内读几次就走几格，
// 于是 dt 与帧数脱钩 —— 实测 regen 的「1 秒累计」得到 0.68 而理论 0.25，全部每秒量虚高
globalThis.window.performance = globalThis.performance;
globalThis.AudioContext = undefined;
globalThis.webkitAudioContext = undefined;

const errors = [];
const realErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); };

const cfg = await import("../../js/config.js");
const { BULLET, STATE, XP_BASE, SKILLS } = cfg;
const { getSettings } = await import("../../js/meta.js");
const { addXp, setLivesForTest, hitPlayer } = await import("../../js/game.js");

const game = () => globalThis.window.__game;
getSettings().skipTutorial = true;

/** Phase-1 的六个技能：每组只动这六个 + 明确锁住的常规技能 */
const PHASE1 = ["homing", "nova", "regen", "overload", "secondWind", "chain"];
const MAXED = { homing: 5, nova: 3, regen: 5, overload: 5, secondWind: 1, chain: 5 };

function reset(skills = {}) {
  game().resetGame();
  if (game().state() !== STATE.PLAYING) throw new Error("未进入 PLAYING，state=" + game().state());
  const p = game().getPlayer();
  for (const k of Object.keys(p.skills)) p.skills[k] = 0;
  // 常规构筑固定为一套「Phase-1 之前就能拿到」的配置，保证跨组只差被测量项
  Object.assign(p, { power: 4, baseDmgMul: 1, fireRateMul: 1, talentDmg: 0, talentCrit: 0 });
  p.skills.dmg = 6; p.skills.rate = 5; p.skills.range = 6; p.skills.scatter = 6; p.skills.volley = 6;
  for (const k of PHASE1) p.skills[k] = 0;
  for (const [k, v] of Object.entries(skills)) p.skills[k] = v;
  return p;
}
function lock(p, skills, inv = true) {
  p.invincible = inv ? 999 : 0;
  for (const [k, v] of Object.entries(skills)) p.skills[k] = v;
}
const friendlyCount = () => game().bullets.reduce((n, b) => n + (b && b.friendly ? 1 : 0), 0);
const alive = () => game().enemies.reduce((n, e) => n + (e && e.hp > 0 ? 1 : 0), 0);

/** 跑 n 帧；LEVELUP 按 1、GACHA 按空格，其它非 PLAYING 直接停 */
function play(n, p, skills = {}, onFrame, inv = true) {
  let levelUps = 0, frames = 0, breakState = null;
  for (let f = 0; f < n; f++) {
    lock(p, skills, inv);
    if (game().state() === STATE.LEVELUP) { levelUps++; dispatch("keydown", { code: "Digit1", preventDefault: noop, repeat: false }); continue; }
    if (game().state() === STATE.GACHA) { dispatch("keydown", { code: "Space", preventDefault: noop, repeat: false }); continue; }
    if (game().state() !== STATE.PLAYING) { breakState = game().state(); break; }
    step();
    frames = f + 1;
    if (onFrame) onFrame(f);
  }
  return { levelUps, frames, breakState };
}

/**
 * 在玩家正上方布 n 架 small：横向 ±25px、纵向 380~540（全部落在 nova lvl3 的 200px 半径内，
 * 也全部在玩家弹道上——横铺成扇形时常规弹道打不到两侧，两臂的「击杀数」就不等了。
 */
function ringEnemies(n, p) {
  for (let i = 0; i < n; i++) {
    const x = p.x + ((i % 5) - 2) * 12;
    const y = 540 - Math.floor(i / 5) * 20;
    game().spawnEnemy(1, { hpScale: 1 }, 1, x, y, { type: "small" });
  }
  freezeEnemies();
}
/**
 * 钉住敌机：不冻结的话对照组 40 架里只有 9 架真被击落、其余飞出屏幕（离场不计分不计经验），
 * 「击杀数」就会把离场算成击杀，两臂不可比。每帧调用，覆盖敌机自身的摆动/俯冲。
 */
function freezeEnemies() {
  for (const e of game().enemies) if (e && e.hp > 0) { e.vy = 0; e.vx = 0; }
}

/* ───────────── ① 同屏友方子弹峰值：homing 开 / 关 ───────────── */
function group1() {
  const out = [];
  for (const hv of [0, 5]) {
    const p = reset({ homing: hv });
    game().setScore(30000);                 // 难度 ≈ level 6，窗内有足够敌机供追踪弹转向
    let peak = 0, atCap = 0, frames = 0, levelUps = 0;
    const r = play(300, p, { homing: hv }, () => {
      const n = friendlyCount();
      peak = Math.max(peak, n);
      if (n >= BULLET.screenCap) atCap++;
      frames++;
    });
    levelUps = r.levelUps;
    out.push({ arm: `homing=${hv}`, framesPlayed: frames, 中断状态: r.breakState, peakFriendly: peak, saturatedFrames: atCap,
      screenCap: BULLET.screenCap, levelUps, interval: +cfg.calcFireRate(p).toFixed(3) });
  }
  return { screenCap: BULLET.screenCap, arms: out };
}

/* ───────────── ② nova 自催化环：一次升级事件放大成几次 ───────────── */
function group2() {
  const arms = [];
  const measure = (name, skills, opt = {}) => {
    const { clear = false, spawnRing = true, fixedFrames = 0, cap = 300 } = opt;
    const p = reset(skills);
    setLivesForTest(1);
    game().setLevel(1);
    if (spawnRing) ringEnemies(40, p);
    // 按 uid 锁定这 40 架：测量窗内关卡还会继续生成新敌，「存活数差」不等于击杀数
    const tracked = new Set(game().enemies.filter(e => e && e.hp > 0).map(e => e.uid));
    const trackedLeft = () => {
      const live = new Set(game().enemies.filter(e => e && e.hp > 0).map(e => e.uid));
      let n = 0;
      for (const u of tracked) if (live.has(u)) n++;
      return n;
    };
    const before = { lvl: p.level, rings: game().getFxCounts().rings, lives: game().getLives(), score: game().getScore() };
    addXp(XP_BASE);                            //  normally 恰好 +1 级
    const mid = { lvl: p.level, rings: game().getFxCounts().rings };
    let r = { frames: 0, levelUps: 0 };
    const target = clear ? cap : fixedFrames;
    while (r.frames < target) {
      if (clear && trackedLeft() === 0) break;        // 全清即停，使两臂击杀数可比
      const s = play(1, p, skills, freezeEnemies);
      r.frames += Math.max(1, s.frames); r.levelUps += s.levelUps;
      if (s.breakState) break;
    }
    const after = { lvl: game().getPlayer().level, rings: game().getFxCounts().rings, lives: game().getLives(), score: game().getScore() };
    const kills = tracked.size - trackedLeft();
    const dScore = after.score - before.score;
    const rec = {
      arm: name,
      锁定敌机: tracked.size,
      击杀数: kills,
      清场帧数: r.frames,
      升级增量_addXp内: mid.lvl - before.lvl,
      新星环增量_addXp内: mid.rings - before.rings,
      等级增量_全程: after.lvl - before.lvl,
      生命增量_全程: after.lives - before.lives,
      处理过的升级事件: r.levelUps,
      得分增量_全程: dScore,
      本体分_击杀: kills * cfg.ENEMY_TYPES.small.score,        // small 本体分（js/config.js:203）
      连击分_击杀: kills >= 10 ? Math.max(0, kills - 9) * cfg.COMBO.bonus : 0,  // combo>=10 每杀 +500，js/game.js:736-738
      每杀得分: kills ? +(dScore / kills).toFixed(1) : null,
    };
    arms.push(rec);
    return rec;
  };
  // 主组：nova=3，一次 addXp 让 nova 自己在 0 帧内清场
  const nova = measure("nova=3（技能自催化路径）", { nova: 3 });
  // 对照组：同一批 40 只怪、同样一次 addXp，但没有 nova —— 靠常规火力清掉
  const ctrl = measure("nova=0 对照组：同批怪由常规弹道清场", { nova: 0 }, { clear: true });
  // 背景扣除：同样帧数、同样的构筑，但不放锁定敌机 —— 这是「常规刷怪本身」给的分与经验
  const bg = measure("背景噪声：同帧数、无锁定敌机", { nova: 0 }, { spawnRing: false, fixedFrames: ctrl.清场帧数 });
  ctrl.得分增量_扣背景 = ctrl.得分增量_全程 - bg.得分增量_全程;
  ctrl.等级增量_扣背景 = ctrl.等级增量_全程 - bg.等级增量_全程;
  ctrl.每杀得分_扣背景 = ctrl.击杀数 ? +(ctrl.得分增量_扣背景 / ctrl.击杀数).toFixed(1) : null;
  nova.得分增量_扣背景 = nova.得分增量_全程;   // nova 用 0 帧，没有背景可扣
  // 下界参考（**不是对照组**：怪根本没死，得分增量必然 0，是主持人指出的伪反证形状）
  measure("nova=0 且不清场（下界参考，非对照）", { nova: 0 });
  return { xpBase: XP_BASE, note: "对照组 = 同批怪被清掉但不触发 nova，并扣掉同帧数的常规刷怪背景；末臂仅作下界", arms };
}

/* ───────────── ③ 60 秒存活：升级次数与得分 ───────────── */
function group3() {
  const out = [];
  for (const [name, skills] of [["基线构筑（Phase-1 六技能全 0）", {}], ["Phase-1 满级构筑", MAXED]]) {
    const p = reset(skills);
    const scoreAt = game().getScore();
    const lvlAt = p.level;
    // 不锁无敌：这一组要测的就是「60 秒存活」。锁了无敌，regen / overload / secondWind
    // 三条依赖掉血的机制永远不会触发，测出来的数字再漂亮也与被测量项无关。
    let deaths = 0, revives = 0, prevLives = game().getLives(), peak = 0, minHpRatio = 1;
    const r = play(3600, p, skills, () => {
      const l = game().getLives();
      if (l < prevLives) deaths++;
      // 只认 0→1：升级也会 +1 命（doLevelUp），用「任意增加」会把升级数记成复活数
      if (prevLives === 0 && l > 0) revives++;
      prevLives = l;
      peak = Math.max(peak, friendlyCount());
      const ratio = p.hpRatio ?? 1;
      if (ratio < minHpRatio) minHpRatio = ratio;
    }, false);
    const g = game().getPlayer();
    out.push({
      arm: name, framesPlayed: r.frames, seconds: +(r.frames / 60).toFixed(1),
      breakState: r.breakState, 阵亡次数: deaths, 复活次数: revives,
      livesEnd: game().getLives(), 最低hpRatio: +minHpRatio.toFixed(3),
      等级增量: g.level - lvlAt, levelUpsHandled: r.levelUps,
      得分增量: game().getScore() - scoreAt,
      enemyLevelEnd: game().getEnemyLevel(),
      peakFriendly: peak,
    });
  }
  const spot = {};
  // regen：无伤、无怪，只测回血速率（js/game.js:454-462，0.05/级/秒 → 满级 0.25 命/秒）
  {
    const p = reset({ regen: 5 });
    setLivesForTest(1);
    play(30, p, { regen: 5 });                 // 热机 + 让 hpRatio 等状态稳定
    p._regenAccum = 0;
    play(60, p, { regen: 5 });                 // 1 秒
    // 用 _regenAccum 而不是 lives：这 1 秒里若刚好升级，lives 也会被 doLevelUp +1，
    // 升级送命与再生回命在 lives 这一个读数上分不开（js/game.js:454-462 vs doLevelUp）
    spot.regen = {
      "1秒累计": +p._regenAccum.toFixed(4),
      理论值: +(cfg.REGEN_RATE * 5).toFixed(4),
      每命耗时秒: +(1 / (cfg.REGEN_RATE * 5)).toFixed(2),
      maxLives: game().getMaxLives(), 命: game().getLives(),
    };
  }
  // overload：直接调 calcFireRate，测可达射速增益（依赖 hpRatio，而 hpRatio = lives/maxLives）
  {
    const p = reset({});
    const base = cfg.calcFireRate(p);
    const row = (ov, ratio, maxL) => {
      p.skills.overload = ov; p.hpRatio = ratio;
      const v = cfg.calcFireRate(p);
      return { overload: ov, hpRatio: +ratio.toFixed(3), maxLives: maxL, 间隔: +v.toFixed(4), 射速倍率: +(base / v).toFixed(3) };
    };
    spot.overload = [row(0, 1 / 3, 3), row(5, 1 / 3, 3), row(5, 1 / 7, 7)];
    p.skills.overload = 0; p.hpRatio = 1;
  }
  // secondWind：一次确定性命中，看它是否真的把 0 命拉回 1 命
  {
    const p = reset({ secondWind: 1 });
    setLivesForTest(1);
    p.invincible = 0;
    hitPlayer();
    spot.secondWind = { 命: game().getLives(), 状态: game().state(), 应为: "命=1 且仍在 PLAYING" };
    const p2 = reset({});
    setLivesForTest(1);
    p2.invincible = 0;
    hitPlayer();
    spot.secondWind_对照 = { 命: game().getLives(), 状态: game().state() };
  }
  // chain：一发命中后弹射几跳、伤害怎么衰减（chainRange=170，js/config.js:114）
  // chain 的「逐跳伤害梯度」不在这里测：fxChains 是全局缓冲、敌机对象又走对象池，
  // 集成环境里无法把「我打的那一发」和关卡自身火力分开（试过静音+排空残弹仍不可信）。
  // 该性质由确定性单测覆盖：test/skills-phase1.test.mjs:168「连锁闪电：命中后向邻近敌机弹射并生成视觉线段」。
  spot.chain = "本量具不测（无法隔离同屏自身弹幕）；见 test/skills-phase1.test.mjs:168";
  return { arms: out, 机制点验: spot, 说明: "存活组不锁无敌（锁了就测不到依赖掉血的三条机制）；无输入写轮，玩家不躲避" };
}

/* ───────────── ④ homing 弧长 vs 直线位移（只报数） ───────────── */
function group4() {
  const out = [];
  // 两种靶位：斜 30° 偏轴（实战常见）与近乎直角（最坏情形 —— 弹先上行再横向追，弧长膨胀最多）
  for (const tgt of [{ name: "斜靶", x: 80, y: 200 }, { name: "直角靶", x: 40, y: 480 }]) {
  for (const hv of [0, 5]) {
    const p = reset({ homing: hv });
    game().spawnEnemy(1, { hpScale: 1 }, 1, tgt.x, tgt.y, { type: "mid" });
    const x0 = p.x, y0 = p.y;
    // 注意角度约定：vx = sin(angle)、vy = -cos(angle)（js/bullet.js:148-149），
    // 所以 0 才是正上方；-π/2 是水平向左 —— 第一版误用 -π/2，测成了横着飞的弹
    const b = game().fireBullet(0, 1, p, x0, y0, undefined, undefined, hv > 0);
    if (!b) { out.push({ arm: `homing=${hv}`, error: "fireBullet 返回空" }); continue; }
    const seen = { traveled: 0, disp: 0, lastX: b.x, lastY: b.y, frames: 0, hitOrGone: null };
    for (let f = 0; f < 240; f++) {
      if (game().state() === STATE.LEVELUP) { dispatch("keydown", { code: "Digit1", preventDefault: noop, repeat: false }); continue; }
      if (game().state() !== STATE.PLAYING) break;
      // 必须在推进帧「之前」采样：子弹一旦走 removeBullet → freeBullet，
      // traveled 会被重置为 0（js/bullet.js:76），事后再读必然得到 0 —— 第一版就是这么错的
      if (!game().bullets.includes(b)) { seen.hitOrGone = seen.traveled >= b.maxRange - 2 ? "射程耗尽" : "命中/被清屏"; break; }
      seen.traveled = Math.max(seen.traveled, b.traveled);
      seen.disp = Math.hypot(b.x - x0, b.y - y0);
      seen.lastX = b.x; seen.lastY = b.y;
      seen.frames = f;
      step();
    }
    out.push({
      arm: `${tgt.name} homing=${hv}`,
      traveled_弧长: +seen.traveled.toFixed(1),
      直线位移: +seen.disp.toFixed(1),
      分离比_弧长除位移: seen.disp > 1 ? +(seen.traveled / seen.disp).toFixed(3) : null,
      存活帧: seen.frames, 终点: [Math.round(seen.lastX), Math.round(seen.lastY)],
      结束原因: seen.hitOrGone,
      maxRange: Math.round(b.maxRange),
      // 自检：直线飞行（homing=0）时弧长必须等于位移，比值恒为 1。
      // 这一条不成立就说明度量口径本身错了 —— 第一版正是靠它暴露了角度约定用反
      口径自检: hv === 0
        ? (Math.abs(seen.traveled - seen.disp) < 0.5 ? "ok(弧长≡位移)" : "异常：直线弹的弧长≠位移，读数不可信")
        : "不适用",
    });
  }
  }
  return {
    待测项: "refireGateDistance 按 traveled（弧长）判定；homing 拐弯时弧长 > 直线位移，弹可能提前满足再射闸门或提前耗尽射程。此处只报数。",
    refireGateDistance: +cfg.refireGateDistance(0.3).toFixed(1),
    arms: out,
  };
}

const groups = { "1": ["① 同屏友方子弹峰值", group1], "2": ["② nova 自催化环", group2], "3": ["③ 60 秒存活", group3], "4": ["④ homing 弧长分离", group4] };
const wanted = ONLY === "all" ? ["1", "2", "3", "4"] : [ONLY];
const result = { tool: "phase1-baseline", seed: SEED, nova: { max: SKILLS.find(s => s.id === "nova")?.max, radius: BULLET.novaBaseRadius, perLevel: BULLET.novaRadiusPerLevel } };
for (const k of wanted) {
  const [title, fn] = groups[k];
  try { result[title] = fn(); } catch (e) { result[title] = { error: e.message, stack: e.stack?.split("\n")[1]?.trim() }; }
}
result.errors = errors.slice(0, 3);
if (errors.length) console.error = realErr;
console.log(JSON.stringify(result, null, 2));
