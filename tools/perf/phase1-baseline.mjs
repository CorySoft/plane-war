/* ===========================================================
 * phase1-baseline.mjs — Phase 1 六技能的带 seed 运行期基线
 *
 * 五组数字（每组同一 LCG 种子，可复现）：
 *   ① 同屏友方子弹峰值（homing 开 / 关）+ 按来源分解（主弹 / 分裂碎片 / 探针弹）
 *   ② 单次升级事件被放大成几次升级 + 新星环数（含「同批怪被清掉但不触发 nova」对照组）
 *   ③ 60 秒存活的升级次数与最终得分（Phase-1 满级构筑 vs 基线构筑）
 *   ④ homing 的 traveled（弧长）与直线位移分离量 —— 只报数，不判定；带探针身份校验
 *   ⑤ nova 主导度：环/分钟 + 单环伤害 ÷ 主弹 DPS 的占比（R2 仪器）
 *
 * 用法：node tools/perf/phase1-baseline.mjs [组号]     SEED=… 可换种子
 *   例：node tools/perf/phase1-baseline.mjs 2
 *   ③ 的 seed 分布：SWEEP=12 node tools/perf/phase1-baseline.mjs sweep
 *     （sweep = 3s 分布 + 3w 长窗撞墙探针；WALL=9000 可改长窗秒数）
 *   ④ 的 seed 分布：SWEEP=6 node tools/perf/phase1-baseline.mjs 4
 *     （逐 seed 跑；身份校验不过的 seed **整条丢弃、不取平均**）
 *   ⑤：node tools/perf/phase1-baseline.mjs 5
 *
 * **续命读数的可信范围（2026-11-12 起）**：`12aec58` 把 `getReviveStats()` 的 `revives`
 * 拆成 `secondWindRevives` / `paidRevives`（`js/game.js:2194`），本文件在那之前读的 `rv.revives`
 * 从此恒为 `undefined` → **`ef132ed` 及更早的「续命次数_api」读数一律不可信，必须重测**。
 * 现在三个口径各占一个字段、彼此不许换算：`复活次数_逐帧下界`（帧采样，看不见 `hitPlayer`
 * 内部续命）、`技能复活次数_api`（只 `secondWind` 加，`js/game.js:1297`）、
 * `付费复活次数_api`（只 `doRevive` 加，`js/game.js:1351`）。
 * 只读，不改代码。
 *
 * **regen 读数的可信范围（同一批修复）**：`js/game.js:463` 的回血闸是
 * `skills.regen>0 && lives>0 && lives<maxLives && deathTimer<=0 && invincible<=0`，
 * 而本文件的 `lock()` 旧版只有「无敌开/关」两态、关的时候**每帧把 invincible 钉成 0** ——
 * 于是 ③ 的「1 秒累计」在无敌帧闸门落地后读 0（量具自己把被测机制关掉了，不是回血变慢）。
 * 现在 `lock(..., null)` = 完全不碰 invincible，③ 多出两格：`机制点验.regen_受击节奏`
 * 与 `机制点验.regen_存活窗_R1`。**7.3 的两臂仍走 inv=false**，与这两格不同源，不许并排比。
 * =========================================================== */

import { makeCtx } from "../../test/_env.mjs";

const SEED = Number(process.env.SEED || 20261108);
let seedState = SEED >>> 0;
/** LCG：可重播种（SWEEP 模式要在同一进程里换种子重复跑，重播种比多进程更省启动成本） */
function reseed(s) { seedState = (s >>> 0) || 1; }
Math.random = () => { seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0; return seedState / 4294967296; };
const ONLY = process.argv[2] || "all";
// ③ 是「组间差异 < seed 内方差」的那一组：单跑 3 seed 不支持任何数值结论，
// SWEEP=N 用 N 个可复现 seed 取分布。无 seed 不出数值判决。
const SWEEP = Number(process.env.SWEEP || 1);
const WALL_FRAMES = Number(process.env.WALL || 9000);
const sweepSeeds = (n) => Array.from({ length: n }, (_, i) => (SEED + i * 7919) >>> 0);

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
// calcPlayerBaseDmg 只在 ⑤ 的「公式对照」一行用；nova 伤害字段名已在 `21cecd8` 定为
// novaDmgMulBase / novaDmgMulPerLevel（`js/config.js:122-123`，旧名 novaBaseDmg/novaDmgPerLevel 已不存在），
// 但 ⑤ 的主读数仍是**实测扣血**而非公式：字段再被改名时公式行降级为「不适用」，
// 不会因为别人的重命名而静默产出 NaN。
const playerMod = await import("../../js/player.js");

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
/**
 * 每帧把构筑钉回目标值（LEVELUP 里玩家可能选了别的技能，不锁就会被漂移）。
 * inv 三态，别只看成「无敌开/关」：
 *  - true  → 每帧强制 p.invincible = 999（隔离用：受击相关机制一律不触发）
 *  - false → 每帧强制 0（旧「存活窗」用法。注意它会把引擎自己的 2.2s 受击无敌帧**抹掉**，
 *            于是 regen 的无敌帧抵扣在这类窗里恒为 0，测不到 R1 要的东西）
 *  - null  → 完全不碰，交给引擎自己结算（R1 的受击节奏窗必须用它）
 */
function lock(p, skills, inv = true) {
  if (inv !== null) p.invincible = inv ? 999 : 0;
  for (const [k, v] of Object.entries(skills)) p.skills[k] = v;
}
const friendlyCount = () => game().bullets.reduce((n, b) => n + (b && b.friendly ? 1 : 0), 0);
const alive = () => game().enemies.reduce((n, e) => n + (e && e.hp > 0 ? 1 : 0), 0);
/** 视觉环数（新星 + 爆炸共用一个缓冲）。观测口缺失时返回 -1，让上层把它读成「测不到」而不是 0 */
const fxRingCount = () => (typeof game().getFxCounts === "function" ? game().getFxCounts().rings : -1);

/**
 * R4 仪器：同帧友方弹**按来源**普查（只看 `game().bullets`，不写任何字段）。
 * 分类依据全部是实码里已有的写点，不靠猜测：
 *  - 分裂碎片 = `isScatter === true`：唯一写点 `js/bullet.js:201`（`spawnSplitBullet`），
 *    `fireBullet` 一律写 false（`js/bullet.js:172`）、`freeBullet` 回池复位 false（`js/bullet.js:82`）
 *    → 池复用不会串类，这是本分类成立的前提。
 *  - 探针弹 = 带 `_qprobe` 的那发（本量具自有字段，生产码不认识）。
 *  - 主弹 = 其余 friendly 弹（含暴击弹、天基加速弹、连射弹）。**卫星弹不在此列**：
 *    `getOrbitBullets` 挂在 player 上、不进 `bullets`（`js/player.js:256`），所以不计入同屏弹道。
 * 「主弹在飞」假设（主持人提出：maxRange 800px ÷ 180px/s ≈ 4.4s > 2.5s 窗）的**可证伪读数**
 * 是 residualBreakdown 里的 `还需秒`：它是逐弹实算的，不是拿常量推的。
 */
function friendlyCensus() {
  let main = 0, frag = 0, probe = 0;
  for (const b of game().bullets) {
    if (!b || !b.friendly) continue;
    if (b._qprobe !== undefined) probe++;
    else if (b.isScatter) frag++;
    else main++;
  }
  return { total: main + frag + probe, main, frag, probe };
}

/**
 * 残留友方弹逐弹分解：按来源给出「还需飞多久」的分布。
 * 两个约束各算一次再取小，因为 `js/bullet.js:392` 的死亡条件是「射程耗尽 **或** 出屏」，
 * 只算射程会把「马上要出屏」的弹读成「还要飞 4 秒」：
 *   还需秒_射程 = (maxRange - traveled) / 速度
 *   还需秒_出屏 = 到屏幕边界（±30px，同 :392）的距离 / 速度
 * 「在飞」假设（主持人提出：800px ÷ 180px·s⁻¹ ≈ 4.4s > 2.5s 静场窗）的可证伪读数就是
 * 这里的 `还需秒_max`：若它明显小于静场窗长，假设被否证，残弹另有来源。
 *
 * 再射闸门状态要读对：`b._refire` 是「这一发已经触发过下一波」的一次性标记
 * （`js/bullet.js:626-629` markMainBulletsTriggered），**不是**「还在闸门里」。
 * 「还在闸门里」= 主弹 且 !_refire 且 traveled < refireGateDistance(当前射速)。
 */
function residualBreakdown(fireRate) {
  const gate = cfg.refireGateDistance(fireRate ?? cfg.calcFireRate(game().getPlayer()));
  const W = canvas.width, H = canvas.height, M = 30;   // 出屏余量与 js/bullet.js:392 一致
  const buckets = { 主弹: [], 分裂碎片: [], 探针弹: [] };
  for (const b of game().bullets) {
    if (!b || !b.friendly) continue;
    const spd = Math.hypot(b.vx || 0, b.vy || 0) * 60;          // px/秒（vx/vy 是 px/帧）
    const restRange = Math.max(0, (b.maxRange || 0) - (b.traveled || 0));
    const dEdge = (b.vy || 0) < 0 ? b.y + M : (b.vy || 0) > 0 ? H - b.y + M : Math.max(b.x + M, W - b.x + M);
    const restEdge = spd > 0 ? Math.max(0, dEdge) : Infinity;
    const sRange = spd > 0 ? +(restRange / spd).toFixed(2) : null;
    const sEdge = spd > 0 ? +(restEdge / spd).toFixed(2) : null;
    const key = b._qprobe !== undefined ? "探针弹" : (b.isScatter ? "分裂碎片" : "主弹");
    buckets[key].push({
      余程px: Math.round(restRange), 距屏边px: Math.round(dEdge),
      已飞px: Math.round(b.traveled || 0), 射程px: Math.round(b.maxRange || 0),
      速度px每秒: Math.round(spd),
      还需秒: sRange === null ? null : +Math.min(sRange, sEdge ?? Infinity).toFixed(2),
      受限于: sRange === null ? "无速度" : (sEdge < sRange ? "出屏" : "射程"),
      仍在再射闸门中: !b.isScatter && !b._refire && (b.traveled || 0) < gate,
      已触发过再射: b._refire === true,
    });
  }
  const out = { 闸门px: +gate.toFixed(1) };
  for (const [k, rows] of Object.entries(buckets)) {
    const secs = rows.map((r) => r.还需秒).filter((v) => typeof v === "number");
    out[k] = {
      n: rows.length,
      还需秒_min: secs.length ? Math.min(...secs) : null,
      还需秒_max: secs.length ? Math.max(...secs) : null,
      受限于出屏的发数: rows.filter((r) => r.受限于 === "出屏").length,
      受限于射程的发数: rows.filter((r) => r.受限于 === "射程").length,
      在再射闸门中的发数: rows.filter((r) => r.仍在再射闸门中).length,
      // 「主弹在飞」假设的算术前提是 maxRange ≈ 800px；这里直接给出这批弹的实际射程取值，
      // 假设对不对由这一格裁定，不靠引用常量表（射程随 range 技能成长，见 calcRangePx）
      射程px_取值: [...new Set(rows.map((r) => r.射程px))].sort((a, b) => a - b),
      已飞px_取值: [...new Set(rows.map((r) => r.已飞px))].sort((a, b) => a - b),
      // 逐弹表只在小样本时给全：满屏 119 发时它会把输出撑到几十 KB，
      // 而上面的 取值/发数/还需秒 已经足够证伪「主弹在飞」假设
      逐弹: rows.length <= 24 ? rows : `省略（n=${rows.length} > 24；取值见上面各栏）`,
    };
  }
  return out;
}

/**
 * 探针身份标记（7.5「量具自检规范」的落地）。`_qprobe` 是本量具自有字段，生产码不读它；
 * 同时置 `_synthetic = true`，借用 `js/bullet.js:74` 的既有语义「合成弹不回池」——
 * `freeBullet()` 先读 `synthetic`（:74）再把 `_synthetic` 复位（:87），最后 `if (!synthetic && ...) pool.push(b)`，
 * 于是探针离场后**不可能被 `allocBullet()`（`js/bullet.js:20-21`，只 pop 不新建）借去当别人的弹**，
 * 对象身份因此是稳定句柄。代价：每次离场留 1 个对象在池外（④ 一轮 ≤6 个），不改生产行为。
 *
 * 两种「不在列表里」必须分开：
 *  - 离场（命中 / 出屏 / 射程耗尽）是**正常终态**，样本到此为止；
 *  - `_qprobe` 与我写进去的 tag 不符 = 对象被换了 = **污染**，该 seed 整条丢弃，
 *    **不取平均、不把该格填 null**（填 null 会让下一轮把「没测到」读成「测到 0」）。
 */
let probeSeq = 0;
function markProbe(b) {
  if (!b) return null;
  const tag = `p${++probeSeq}`;
  b._synthetic = true;
  b._qprobe = tag;
  return { ref: b, tag, live: true, polluted: false };
}
/** 每帧调用：只把「tag 不符」判为污染；「不在活弹列表」是正常离场，不判污染 */
function probeCheck(probe) {
  if (!probe || probe.polluted) return;
  if (probe.ref._qprobe !== probe.tag) { probe.polluted = true; probe.live = false; return; }
  probe.live = game().bullets.includes(probe.ref);
}
function probeOk(probe) { return !!probe && !probe.polluted && probe.live; }

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
    // R4：峰值不只看总数，还要看「是谁把同屏顶上去的」。
    // 两类读数并存、不许互相代替：
    //   峰值分解_峰值帧 = 峰值那一帧的按来源计数（三者之和 ≡ peakFriendly，可直接对账）
    //   峰值分解_分类峰值 = 每一类各自的历史峰值（**相加会 ≥ peakFriendly**，用来看「谁有能力顶满」）
    let peakMain = 0, peakFrag = 0, peakProbe = 0, atPeak = null;
    const r = play(300, p, { homing: hv }, () => {
      const c = friendlyCensus();
      const n = c.total;                                   // 同帧直读：game().bullets 里 friendly 的全部
      peakMain = Math.max(peakMain, c.main);
      peakFrag = Math.max(peakFrag, c.frag);
      peakProbe = Math.max(peakProbe, c.probe);
      if (n > peak) { peak = n; atPeak = { ...c }; }
      if (n >= BULLET.screenCap) atCap++;
      frames++;
    });
    levelUps = r.levelUps;
    out.push({ arm: `homing=${hv}`, framesPlayed: frames, 中断状态: r.breakState, peakFriendly: peak, saturatedFrames: atCap,
      峰值分解_峰值帧: atPeak, 峰值分解_分类峰值: { 主弹: peakMain, 分裂碎片: peakFrag, 探针弹: peakProbe },
      旁路发数_峰值帧: atPeak ? atPeak.frag + atPeak.probe : null,
      窗末残留分解: residualBreakdown(),
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
      本体分_击杀: kills * cfg.ENEMY_TYPES.small.score,        // small 本体分（js/config.js:204）
      连击分_击杀: kills >= 10 ? Math.max(0, kills - 9) * cfg.COMBO.bonus : 0,  // combo>=10 每杀 +500，js/game.js:741-743
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
const ARMS3 = [["基线构筑（Phase-1 六技能全 0）", {}], ["Phase-1 满级构筑", MAXED]];

/** 单臂跑 frames 帧的存活测量。inv=false：这一组要测的就是「60 秒存活」，锁无敌会关掉三条靠掉血的机制 */
function runArm3(name, skills, frames, inv = false) {
  const p = reset(skills);
  const scoreAt = game().getScore();
  const lvlAt = p.level;
  // 锁了无敌，regen / overload / secondWind 三条依赖掉血的机制永远不会触发，
  // 测出来的数字再漂亮也与被测量项无关。
  let deaths = 0, revives = 0, prevLives = game().getLives(), peak = 0, minHpRatio = 1;
  // R2 环频计数。`fxRings.length` 不能直接当累计计数器用：它同时收爆炸环（js/game.js:970-971）、
  // 每环只活 0.45s（:1229）、还有 48 的封顶（js/config.js:108 + js/game.js:1228 的 if）——
  // 「长度增量」既会漏（同帧一环到期、一环新增）也会串（爆炸环混进来了）。
  // 所以主读数走**等级上升沿帧数**：闸门每帧只放一个 emitNova（js/game.js:1210-1211 的
  // levelledThisFrame 在 update() 开头复位 js/game.js:322），且 p.level 只在 addXp 里涨
  // （doLevelUp 不动等级，js/game.js:1242-1255）→「本帧等级涨过」与「本帧放出过一环」一一对应。
  // 视觉增量与触顶帧只作对照/证伪：两者显著背离就说明上面那条不变量塌了，此时不报环频。
  let prevLevel = game().getPlayer().level, ringEdgeFrames = 0, levelRiseCells = 0;
  let prevRings = fxRingCount(), ringVisualAdds = 0, ringCapFrames = 0;
  let invFrames = 0, maxedFrames = 0;
  const r = play(frames, p, skills, () => {
    const l = game().getLives();
    if (l < prevLives) deaths++;
    // 只认 0→1：升级也会 +1 命（doLevelUp），用「任意增加」会把升级数记成复活数
    if (prevLives === 0 && l > 0) revives++;
    prevLives = l;
    peak = Math.max(peak, friendlyCount());
    if (p.invincible > 0) invFrames++;
    if (l >= game().getMaxLives()) maxedFrames++;
    const ratio = p.hpRatio ?? 1;
    if (ratio < minHpRatio) minHpRatio = ratio;
    const lv = p.level;
    if (lv > prevLevel) { ringEdgeFrames++; levelRiseCells += lv - prevLevel; }
    prevLevel = lv;
    const rc = fxRingCount();
    if (rc > prevRings) ringVisualAdds += rc - prevRings;
    if (rc >= BULLET.fxRingsCap) ringCapFrames++;
    prevRings = rc;
  }, inv);
  const g = game().getPlayer();
  // 逐帧只看得见 lives 的变化：secondWind 的续命发生在 hitPlayer 内部（命 1→1），
  // lives 根本不落地再回来 —— 所以逐帧计数是「下界」，真值走只读观测口 getReviveStats（js/game.js:2194）。
  // 反过来，逐帧那条 0→1 也可能把 doLevelUp 的升级送命误记成复活。两个口径都留着，别混用。
  const rv = typeof game().getReviveStats === "function" ? game().getReviveStats() : {};
  // 三个口径，各说各话，不许混用：
  //   复活次数_逐帧下界   —— lives 从 0 回正的现象计数。看不见 secondWind（命 1→1 不落地），
  //                        却可能把 doLevelUp 的升级送命记进来，所以是「下界 + 有污染」。
  //   技能复活次数_api     —— secondWindRevives，只数 js/game.js:1297 那条路径。
  //   付费复活次数_api     —— paidRevives，只数 doRevive（js/game.js:1351），与技能无关。
  // 原「续命次数_api: rv.revives」读的是 12aec58 之前的合并字段，拆分后恒为 undefined（→ null），
  // 那是量具断点，不是「续命 0 次」。ef132ed 及更早的同名读数一律不可信，需重测。
  return {
    arm: name, framesPlayed: r.frames, seconds: +(r.frames / 60).toFixed(1), 满窗: r.frames >= frames,
    breakState: r.breakState, 阵亡次数: deaths,
    复活次数_逐帧下界: revives,
    技能复活次数_api: numOrNull(rv.secondWindRevives), 付费复活次数_api: numOrNull(rv.paidRevives),
    续命已用标记: typeof rv.reviveUsed === "boolean" ? rv.reviveUsed : null,
    续命次数_api: "已废弃（12aec58 拆分为 技能/付费 两计数）",
    livesEnd: game().getLives(), 最低hpRatio: +minHpRatio.toFixed(3),
    maxLivesEnd: game().getMaxLives(),
    无敌帧数: invFrames, 无敌帧占比: +(invFrames / Math.max(r.frames, 1)).toFixed(3),
    满命帧数: maxedFrames,
    再生累计末值: +(g._regenAccum ?? 0).toFixed(4),
    // 存活窗里「回血给了几条命」测不出来：`lives = min(maxLives, lives + 1)` 是五类来源、六个写入点 ——
    // 道具 _addLife(js/game.js:437)、_heal(:446)、再生(:468)、吸血 lifestealOnKill(:1184)、
    // 升级送命 doLevelUp(:1246/:1250)。它们在 lives 这一个整数上完全分不开。
    // 所以 R1 的**速率**读数只能走 ③ 的 regen_受击节奏 臂（那边每帧把 _regenAccum 抽干，不经过 lives）；
    // 本臂只报两道闸的占用帧数（无敌帧 / 满命帧），不许拿去当回血速率。
    回血命数_本窗不可归因: "lives+1 是五类来源六个写入点（js/game.js:437,446,468,1184,1246,1250），存活窗内分不开",
    等级增量: g.level - lvlAt, levelUpsHandled: r.levelUps,
    得分增量: game().getScore() - scoreAt,
    enemyLevelEnd: game().getEnemyLevel(),
    peakFriendly: peak,
    // R2 环频：主读数 = 等级上升沿帧数（见上方不变量），对照 = 视觉正增量和
    新星环数_等级上升沿帧: ringEdgeFrames,
    等级上升沿总格数: levelRiseCells,
    环数_视觉正增量和: ringVisualAdds,
    环缓冲触顶帧: ringCapFrames,
    // 分钟 = 3600 帧：环数 × 3600 / 实际帧数（写成 ÷秒数是每秒读数，会把占比整体压低 60 倍）
    环每分钟: +(ringEdgeFrames * 3600 / Math.max(r.frames, 1)).toFixed(2),
    环频口径告警: ringVisualAdds > ringEdgeFrames
      ? "视觉增量 > 上升沿帧数：爆炸环混入（js/game.js:970-971）或同帧多来源，只作对照不作环频"
      : (ringCapFrames > 0 ? "触顶过 48：视觉计数会少报，主读数仍取上升沿" : "ok"),
  };
}

function group3() {
  const out = [];
  for (const [name, skills] of ARMS3) out.push(runArm3(name, skills, 3600));
  const spot = {};
  // regen：**必须 inv=false**。lock() 默认把 p.invincible 钉成 999，而回血累计被
  // `player.invincible <= 0` 这道闸挡死（js/game.js:463）→ 带无敌跑出来的「1 秒累计」恒为 0。
  // 那不是回血变了，是量具自己把被测机制关掉了：7.6 留档的 0.2505 / 每命 4.00s 出自
  // REGEN_RATE=0.05 且闸门未落地时的窗口，之后这一格读 0，属于量具断点（本轮已修）。
  {
    const p = reset({ regen: 5 });
    setLivesForTest(1);
    play(30, p, { regen: 5 }, null, false);              // 热机：hpRatio 等状态先落定
    p._regenAccum = 0; p.invincible = 0;
    let invF = 0;
    const r60 = play(60, p, { regen: 5 }, () => { if (p.invincible > 0) invF++; }, false);
    // 用 _regenAccum 而不是 lives：这 1 秒里若刚好升级，lives 也会被 doLevelUp +1，
    // 升级送命与再生回命在 lives 这一个读数上分不开（js/game.js:461-468 vs doLevelUp:1246/1250）
    spot.regen = {
      "1秒累计": +(p._regenAccum ?? 0).toFixed(4),
      理论值: +(cfg.REGEN_RATE * 5).toFixed(4),
      每命耗时秒: +(1 / (cfg.REGEN_RATE * 5)).toFixed(2),
      maxLives: game().getMaxLives(), 命: game().getLives(),
      无敌帧数: invF, framesPlayed: r60.frames,
      自检: invF === 0 && (p._regenAccum ?? 0) > 0 ? "ok(无伤窗，累计在走)"
        : (invF > 0 ? "被无敌帧干扰：无伤窗不成立，本行读数不可用" : "累计为 0：闸门或字段名变了"),
    };
  }
  // regen 受击节奏（R1 要的读数）：主持人要的是「受击节奏下的实测速率」，不是无伤窗理论值。
  // 关键是把两道闸**分开量化**，否则扣血去向会被记到错误的闸门上：
  //   闸门（js/game.js:463）= regen>0 && 0<lives<maxLives && deathTimer<=0 && invincible<=0
  //   「满命」会把累计掐在 0（上一版读到 0.43/1.5、却只见 1 帧无敌，就是这个原因被记到了无敌帧头上）；
  //   「无敌帧」才是本轮要量的那一项。
  // 所以这一臂用 inv=null（不碰 invincible，让 hitPlayer 的 2.2s 真无敌存在）
  // **+ 每帧把命钉在 maxLives-1**（满命闸恒开）→ 实测缺口只可能来自无敌帧。
  {
    const p = reset({ regen: 5 });
    const N = 600; let invF = 0, hits = 0, maxedF = 0;
    play(30, p, { regen: 5 }, null, null);
    const gain = { accum: 0 };
    p._regenAccum = 0;
    const rr = play(N, p, { regen: 5 }, (f) => {
      // 先收当帧增量，再把命钉回 maxLives-1：让 lives<maxLives 恒成立，满命闸不参与本臂
      gain.accum += p._regenAccum || 0;
      p._regenAccum = 0;
      if (p.invincible > 0) invF++;
      if (game().getLives() >= game().getMaxLives()) maxedF++;
      setLivesForTest(Math.max(1, game().getMaxLives() - 1));
      if (f % 240 === 0) { p.invincible = 0; hitPlayer(); hits++; }   // 每 4 秒一次确定性命中
    }, null);
    const secs = rr.frames / 60;
    const want = cfg.REGEN_RATE * 5 * secs;
    const wantNoInv = cfg.REGEN_RATE * 5 * (rr.frames - invF) / 60;
    spot.regen_受击节奏 = {
      窗秒: +secs.toFixed(2), 注入命中: hits, 无敌帧数: invF, 满命帧数: maxedF,
      实测累计: +gain.accum.toFixed(4),
      理论累计_无闸: +want.toFixed(4), 理论累计_只扣无敌帧: +wantNoInv.toFixed(4),
      实测每秒: +(gain.accum / Math.max(secs, 1e-9)).toFixed(4),
      无敌帧吃掉的份额: want > 0 ? +(1 - gain.accum / want).toFixed(3) : null,
      与只扣无敌帧的差: +(gain.accum - wantNoInv).toFixed(4),
      每命耗时秒_受击节奏: gain.accum > 0 ? +(secs / gain.accum).toFixed(2) : null,
      中断状态: rr.breakState,
      读数纪律: "本臂把满命闸钉成恒开（每帧 lives=maxLives-1），所以缺口只归无敌帧；"
        + "「与只扣无敌帧的差」若 |·|>0.02，说明还有第三个闸门（deathTimer / 漏怪 / 量具）在吃，"
        + "此时不许把缺口全记给无敌帧。每命耗时受击节奏 ≠ 无伤窗的 6.67s，两者不许混用",
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
  // chain：一发命中后弹射几跳、伤害怎么衰减（chainRange=170，js/config.js:116）
  // chain 的「逐跳伤害梯度」不在这里测：fxChains 是全局缓冲、敌机对象又走对象池，
  // 集成环境里无法把「我打的那一发」和关卡自身火力分开（试过静音+排空残弹仍不可信）。
  // 该性质由确定性单测覆盖：test/skills-phase1.test.mjs:176「连锁闪电：命中后向邻近敌机弹射并生成视觉线段」。
  spot.chain = "本量具不测（无法隔离同屏自身弹幕）；见 test/skills-phase1.test.mjs:176";
  // R1：真实受击节奏下的回血/存活读数。放在最后跑，避免改动前面各 spot 的随机数消耗顺序。
  // inv=null = 不碰 p.invincible（见 lock 的三态注释）：这一格要的正是「引擎自己的 2.2s 无敌帧
  // 吃掉了多少回血」，把无敌帧钉成 0 或钉成 999 都测不到它。
  {
    const w = runArm3("满级构筑 · 引擎无敌帧窗（R1 口径）", MAXED, 1200, null);
    spot.regen_存活窗_R1 = {
      窗秒: w.seconds, 无敌帧数: w.无敌帧数, 无敌帧占比: w.无敌帧占比,
      满命帧数: w.满命帧数,
      再生累计末值: w.再生累计末值, maxLivesEnd: w.maxLivesEnd, 命: w.livesEnd,
      阵亡次数: w.阵亡次数, 等级增量: w.等级增量, 中断状态: w.breakState,
      口径: "与 7.3 的两臂**不同源**：那两臂每帧把 invincible 钉成 0（无敌帧被量具抹掉），"
        + "本臂让引擎自己结算 → 只可与本臂自己的推算值比，不许并进 7.3 表",
    };
  }
  return { arms: out, 机制点验: spot, 说明: "存活组不锁无敌（锁了就测不到依赖掉血的三条机制）；无输入写轮，玩家不躲避" };
}

/* ───────────── ③-b seed 扫描：组间差 vs seed 内方差 ───────────── */
function stats(arr) {
  // 分布只在「有限数值」上算：null/undefined 若混进 sort((a,b)=>a-b) 会被当成 0，
  // 于是「读不到」伪装成「读到 0」—— 量具断点正是这样把 min 拉低的。
  const s = arr.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  const dropped = arr.length - s.length;
  const median = !s.length ? null
    : s.length % 2 ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const r2 = (v) => +v.toFixed(1);
  return { n: s.length, 缺失读数: dropped || undefined,
    min: s.length ? r2(s[0]) : null, median: median === null ? null : r2(median),
    max: s.length ? r2(s[s.length - 1]) : null,
    mean: s.length ? r2(s.reduce((a, b) => a + b, 0) / s.length) : null };
}

/** 观测口缺字段时返回 null（而不是 0，也不是 undefined 被 JSON 吞掉） */
function numOrNull(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }

/**
 * 同一构筑在同一 seed 上是确定性的，跨 seed 才显出方差。
 * 「满级组比基线组多 X 级」这类结论只有在 seed 内方差不覆盖组间差时才成立 ——
 * 所以这里报的是分布（min/median/max/mean），不是单点。
 */
function sweep3(frames = 3600, seeds = sweepSeeds(SWEEP)) {
  const rows = [];
  for (const sd of seeds) {
    reseed(sd);                    // 每个 seed 独立重播种：上一 seed 消耗了多少随机数不影响本 seed 的形状
    for (const [name, skills] of ARMS3) rows.push({ seed: sd, ...runArm3(name, skills, frames) });
  }
  const 分布 = ARMS3.map(([name]) => {
    const rs = rows.filter((r) => r.arm === name);
    const num = (k) => stats(rs.map((r) => r[k]));
    const st = {};
    for (const r of rs) { const key = r.breakState ?? "满窗"; st[key] = (st[key] || 0) + 1; }
    return {
      arm: name,
      存活满窗: `${rs.filter((r) => r.满窗).length}/${rs.length}`,
      等级增量: num("等级增量"), 得分增量: num("得分增量"),
      新星环数_等级上升沿帧: num("新星环数_等级上升沿帧"), 环每分钟: num("环每分钟"),
      阵亡次数: num("阵亡次数"),
      复活次数_逐帧下界: num("复活次数_逐帧下界"),
      技能复活次数_api: num("技能复活次数_api"), 付费复活次数_api: num("付费复活次数_api"),
      最低hpRatio: num("最低hpRatio"), peakFriendly: num("peakFriendly"),
      结束原因: st,
    };
  });
  return { frames, windowSeconds: +(frames / 60).toFixed(1), seeds, 逐seed: rows, 分布 };
}

/** 撞墙探针：满级构筑在长窗口里第几秒/第几级撞墙（60 秒窗内看不出墙在哪） */
function wallProbe(seeds = sweepSeeds(Math.max(3, Math.min(SWEEP, 5)))) {
  const rows = [];
  for (const sd of seeds) {
    reseed(sd);
    rows.push({ seed: sd, ...runArm3("Phase-1 满级构筑（长窗）", MAXED, WALL_FRAMES) });
  }
  const 到达长窗 = rows.filter((r) => r.满窗).length;
  return {
    windowSeconds: +(WALL_FRAMES / 60).toFixed(1), seeds,
    满级构筑到长窗: `${到达长窗}/${rows.length}`,
    等级增量: stats(rows.map((r) => r.等级增量)),
    得分增量: stats(rows.map((r) => r.得分增量)),
    阵亡次数: stats(rows.map((r) => r.阵亡次数)),
    逐seed: rows,
  };
}

/* ───────────── ④ homing 弧长 vs 直线位移（只报数） ───────────── */
function group4() {
  const out = [];
  // 三种靶位：斜靶（22° 偏轴）、近靶（要绕 ~130°， pursuit 曲线最费弧长）、以及直线基准
  for (const tgt of [{ name: "斜靶", x: 80, y: 200 }, { name: "直角靶", x: 40, y: 480 }, { name: "反打靶", x: 360, y: 680 }]) {
  for (const hv of [0, 5]) {
    const p = reset({ homing: hv });
    // 顺序很重要：先静场排空，再放靶机。
    // 上一版先放靶机再静场 150 帧，靶机在排空期被关卡清理掉，探针只能追着刷怪弹道笔直上行，
    // 读出 1.001 的比值 —— 那是「没拐弯」的比值，不是「拐弯但不膨胀」的比值。
    // 静场：把玩家与所有敌机的开火按住（fireCd 每帧钉回 999），等开场残弹飞出屏幕。
    // 不静场会踩对象池的坑：探针弹一走 removeBullet → freeBullet，下一发谁开火就把它
    // 从 pool 里 pop 走当自己的弹用（js/bullet.js:20 allocBullet 不新建），
    // traveled 当场归零、角度换成别的弹 —— 第一版斜靶 homing=0 读到的 4.017 就是这么来的
    // （靠「homing=0 必须 弧长≡位移」这条自检才发现，那次的比值不可信）。
    const hush = () => {
      p.fireCd = 999;
      for (const e of game().enemies) if (e && e.hp > 0) { e.fireCd = 999; e.vx = 0; e.vy = 0; }
    };
    play(150, p, { homing: hv }, hush);
    const residual = friendlyCount();
    // 正面回答「静场 150 帧后残留 N 发友方弹是什么弹」：按来源分类 + 逐弹还程实算。
    // 主持人的假设（主弹在飞：maxRange 800px ÷ 180px·s⁻¹ ≈ 4.4s > 2.5s 静场窗）只是假设，
    // 这里的 还需秒 / 在再射闸门中 两栏是用来证实或否证它的，不预设结论。
    const residualDetail = residualBreakdown();
    const beforeUid = new Set(game().enemies.filter((e) => e && e.hp > 0).map((e) => e.uid));
    game().spawnEnemy(1, { hpScale: 1 }, 1, tgt.x, tgt.y, { type: "mid" });
    // spawnEnemy 没有返回值，敌机对象又走对象池（事后再读 target.x/hp 可能已是另一架机）
    // —— 用 uid 差集把新生成的那架锁定，和 ② 同一招
    const fresh = game().enemies.filter((e) => e && e.hp > 0 && !beforeUid.has(e.uid));
    const t0 = fresh.length ? [Math.round(fresh[fresh.length - 1].x), Math.round(fresh[fresh.length - 1].y)] : [tgt.x, tgt.y];
    const e0 = game().enemies.filter((e) => e && e.hp > 0).length;
    hush();
    const x0 = p.x, y0 = p.y;
    // 注意角度约定：vx = sin(angle)、vy = -cos(angle)（js/bullet.js:148-149），
    // 所以 0 才是正上方；-π/2 是水平向左 —— 第一版误用 -π/2，测成了横着飞的弹
    const b = game().fireBullet(0, 1, p, x0, y0, undefined, undefined, hv > 0);
    if (!b) { out.push({ arm: `${tgt.name} homing=${hv}`, error: "fireBullet 返回空", 臂合格: false }); continue; }
    const maxRange0 = b.maxRange;
    const probe = markProbe(b);
    const seen = { traveled: 0, disp: 0, lastX: b.x, lastY: b.y, frames: 0, hitOrGone: null, reused: false, polluted: false };
    let prevTraveled = 0;
    for (let f = 0; f < 240; f++) {
      if (game().state() === STATE.LEVELUP) { dispatch("keydown", { code: "Digit1", preventDefault: noop, repeat: false }); continue; }
      if (game().state() !== STATE.PLAYING) break;
      // 必须在推进帧「之前」采样：子弹一旦走 removeBullet → freeBullet，
      // traveled 会被重置为 0（js/bullet.js:76），事后再读必然得到 0 —— 第一版就是这么错的
      // 身份校验（7.5 规范第 ① 条的硬约束版）：_qprobe 被换 = 这个对象已不是我那一发 → 污染，整条 seed 丢弃。
      probeCheck(probe);
      if (probe.polluted) { seen.polluted = true; break; }
      if (!probe.live) { seen.hitOrGone = seen.traveled >= maxRange0 - 2 ? "射程耗尽" : "命中/被清屏"; break; }
      // 兜底自检（身份字段之外的第二条腿）：弧长单调不减、maxRange 不变。任一被打破同样判污染。
      if (b.maxRange !== maxRange0 || b.traveled < prevTraveled - 0.01) { seen.reused = true; break; }
      prevTraveled = b.traveled;
      seen.traveled = Math.max(seen.traveled, b.traveled);
      seen.disp = Math.hypot(b.x - x0, b.y - y0);
      seen.lastX = b.x; seen.lastY = b.y;
      seen.frames = f;
      hush();
      step();
    }
    const 身份不合格 = seen.polluted || seen.reused;
    out.push({
      arm: `${tgt.name} homing=${hv}`,
      traveled_弧长: +seen.traveled.toFixed(1),
      直线位移: +seen.disp.toFixed(1),
      // 复用命中时比值作废，报 null 而不是把一个来路不明的数写进基线
      分离比_弧长除位移: (!身份不合格 && seen.disp > 1) ? +(seen.traveled / seen.disp).toFixed(3) : null,
      存活帧: seen.frames, 终点: [Math.round(seen.lastX), Math.round(seen.lastY)],
      结束原因: seen.polluted ? "探针身份被覆盖（整条 seed 丢弃）"
        : seen.reused ? "弧长/maxRange 不自洽（整条 seed 丢弃）" : seen.hitOrGone,
      // 身份校验：硬约束。不合格时 sweep4 会丢掉**整个 seed 的全部臂**，不做逐格取平均
      身份校验: seen.polluted ? "污染(_qprobe 与本量具 tag 不符)"
        : seen.reused ? "污染(弧长或 maxRange 不自洽)" : "ok",
      臂合格: !身份不合格,
      发射时残余友方弹: residual, 发射时同屏敌机: e0, maxRange: Math.round(maxRange0),
      静场窗秒: +(150 / 60).toFixed(2), 静场后残留分解: residualDetail,
      // 靶机核对：homing=5 若打到的不是我给定的靶位，比值就失去口径意义
      靶机发射时位置: t0,
      终点与靶机偏差: t0 ? Math.round(Math.hypot(seen.lastX - t0[0], seen.lastY - t0[1])) : null,
      拐弯确认: hv === 0 ? "不适用(直线基准)"
        : (Math.abs(seen.lastX - x0) > 8 ? `横向偏移 ${Math.round(seen.lastX - x0)}px` : "未见拐弯：比值不可信"),
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
    全部臂合格: out.every((a) => a.臂合格 !== false),
    arms: out,
  };
}

/** ④ 的残留分解摘要：把「静场窗后还剩几发、是什么弹、还要飞多久」压成一行，供 sweep4 汇总 */
function residualSummary(row) {
  const d = row.静场后残留分解 || {};
  const main = d.主弹 || {}, frag = d.分裂碎片 || {}, probe = d.探针弹 || {};
  return {
    arm: row.arm, 静场窗秒: row.静场窗秒,
    残留合计: (main.n || 0) + (frag.n || 0) + (probe.n || 0),
    主弹: main.n || 0, 分裂碎片: frag.n || 0, 探针弹: probe.n || 0,
    还需秒_max: main.还需秒_max ?? null,
    射程px_取值: main.射程px_取值 ?? [],
    受限于射程: main.受限于射程的发数 || 0, 受限于出屏: main.受限于出屏的发数 || 0,
    仍在再射闸门中: main.在再射闸门中的发数 || 0,
  };
}

/**
 * ④ 的多 seed 版（R4 的「整条丢弃」规则）。
 * 纪律：**身份不过 = 这个 seed 的六格全弃**，不逐格取平均、也不把不合格格填 null 后继续算。
 * 原因是「填 null 只丢一格」会让 min/median/max 仍然包含这个 seed 里其余来路不明的数；
 * 而污染是对象池级别的事件，同一 seed 内没有任何一格可以继续被信任。
 * 只有 `采用seed数 ≥ 2` 时才出分布；否则只报单点并标「样本不足，不做数值判决」。
 */
function sweep4(seeds = sweepSeeds(SWEEP)) {
  const kept = [], dropped = [];
  for (const sd of seeds) {
    reseed(sd);
    const g = group4();
    const bad = g.arms.filter((a) => a.臂合格 === false);
    if (bad.length) dropped.push({ seed: sd, 不合格臂: bad.map((a) => `${a.arm}: ${a.身份校验}`) });
    else kept.push({ seed: sd, arms: g.arms });
  }
  const names = kept.length ? kept[0].arms.map((a) => a.arm) : [];
  const 比值分布 = names.map((arm) => {
    const vals = kept.map((k) => k.arms.find((a) => a.arm === arm)?.分离比_弧长除位移).filter((v) => typeof v === "number");
    return { arm, 样本: `${vals.length}/${kept.length}`, 比值: stats(vals) };
  });
  return {
    seeds, 采用seed数: kept.length, 丢弃seed数: dropped.length,
    丢弃原因: dropped,
    静场后残留分解: kept.length ? kept.flatMap((k) => k.arms.map(residualSummary)) : [],
    残留合计分布: kept.length ? stats(kept.flatMap((k) => k.arms.map((a) => residualSummary(a).残留合计))) : null,
    比值分布,
    采用seed逐格: kept,
    纪律: "身份校验不过的 seed 整条丢弃；分布只在采用 seed 上算，无 seed 不出数值判决",
  };
}

/* ───────────── ⑤ nova 主导度：环/分钟 × 单环伤害 ÷ 主弹 DPS（R2 仪器） ───────────── */

/** 一发新星环的实际伤害：布一圈打不死的靶，addXp 逼出**恰好一环**，读逐靶扣血 */
function novaRingHitProbe(novaLvl, targetN = 12) {
  const p = reset({ nova: novaLvl });
  game().setLevel(1);
  const radius = BULLET.novaBaseRadius + BULLET.novaRadiusPerLevel * (novaLvl - 1);
  const hush = () => {
    p.fireCd = 999;
    for (const e of game().enemies) if (e && e.hp > 0) { e.fireCd = 999; e.vx = 0; e.vy = 0; }
  };
  // 先静场一帧再布靶：关卡在排空期会清掉早放的靶（④ 同一坑），也会让主弹先打出一轮伤害
  play(20, p, { nova: novaLvl }, hush);
  const beforeUid = new Set(game().enemies.filter((e) => e && e.hp > 0).map((e) => e.uid));
  for (let i = 0; i < targetN; i++) {
    const ang = (i / targetN) * Math.PI * 2;
    const d = radius * 0.5;
    const x = Math.min(canvas.width - 24, Math.max(24, p.x + Math.cos(ang) * d));
    const y = Math.min(canvas.height - 24, Math.max(60, p.y + Math.sin(ang) * d));
    game().spawnEnemy(1, { hpScale: 1 }, 1, x, y, { type: "mid" });
  }
  const targets = game().enemies.filter((e) => e && e.hp > 0 && !beforeUid.has(e.uid));
  if (!targets.length) return { novaLvl, error: "靶机生成失败", 臂合格: false };
  for (const e of targets) { e.hp = 1e6; e.maxHp = 1e6; }   // 打死会把「伤害」截断成 hp，测不到真实单环伤害
  hush();
  // 几何自检：全部靶必须在半径内，否则「命中目标数」测的是布靶几何而不是机制
  const dists = targets.map((e) => Math.hypot(e.x - p.x, e.y - p.y));
  const inRadius = dists.filter((dd) => dd < radius).length;
  const hp0 = targets.map((e) => e.hp);
  const rings0 = fxRingCount(), lvl0 = p.level;
  // 走到这里刚结束一次 update()，levelledThisFrame 已在本帧开头复位（js/game.js:322）→
  // 这一次 addXp 跨阈值必然过闸门、必然调用一次 emitNova
  addXp(XP_BASE);
  const dmgPerTarget = targets.map((e, i) => hp0[i] - e.hp);
  const hit = dmgPerTarget.filter((v) => v > 0).length;
  const 每目标 = dmgPerTarget.filter((v) => v > 0);
  const mulBase = BULLET.novaDmgMulBase, mulPer = BULLET.novaDmgMulPerLevel;
  const formula = Number.isFinite(mulBase) && Number.isFinite(mulPer) && typeof playerMod.calcPlayerBaseDmg === "function"
    ? Math.round(playerMod.calcPlayerBaseDmg(p) * (mulBase + mulPer * (novaLvl - 1)))
    : null;
  return {
    arm: `nova=${novaLvl} · 单环`, novaLvl, radiusPx: Math.round(radius),
    布靶数: targets.length, 半径内靶数: inRadius, 受环伤害的目标数: hit,
    单环伤害_每目标: 每目标.length ? Math.min(...每目标) : null,
    单环伤害_max: 每目标.length ? Math.max(...每目标) : null,
    单环总伤害_布靶口径: 每目标.reduce((a, b) => a + b, 0),
    等级增量: p.level - lvl0, 视觉环增量: fxRingCount() - rings0,
    公式对照值: formula,
    臂合格: inRadius === targets.length && fxRingCount() - rings0 === 1 && p.level - lvl0 === 1 && 每目标.length > 0,
    自检说明: inRadius !== targets.length ? "布靶有靶在半径外：命中数不可信"
      : (fxRingCount() - rings0 !== 1 ? "视觉环增量≠1：闸门或环缓冲口径变了"
        : (p.level - lvl0 !== 1 ? "等级增量≠1：本次 addXp 跨了多级，单环计数口径变了" : "ok")),
  };
}

/**
 * 主弹 DPS（容量口径）：每波伤害 × 波/秒。
 * 只算 getShootPattern 的 dmg 之和 ÷ calcFireRate，不含 miss / 过杀 / 弹道未命中，
 * 因此它是**火力上限**，nova 占比拿它当分母会**低估** nova 的相对份额 —— 方向必须写清。
 */
function mainGunDps() {
  const p = reset(MAXED);
  game().setLevel(1);
  const pat = game().getShootPattern(p) || [];
  const perWave = pat.reduce((s, b) => s + (b.dmg || 0), 0);
  const interval = cfg.calcFireRate(p);
  return {
    每波发数: pat.length, 每波伤害: Math.round(perWave),
    射击间隔秒: +interval.toFixed(3), 波每秒: +(1 / interval).toFixed(2),
    主弹DPS_容量口径: Math.round(perWave / interval),
    口径: "全部命中、无过杀、无 miss → 火力上限；nova 伤害 ÷ 此值 = 占比的**下界**",
    baseDmg_实测入口: typeof playerMod.calcPlayerBaseDmg === "function" ? playerMod.calcPlayerBaseDmg(p) : null,
  };
}

function group5() {
  const probes = [1, 2, 3].map((lvl) => novaRingHitProbe(lvl));
  const dps = mainGunDps();
  // 环频走 ③ 的同一条 60 秒满级窗（runArm3 已带上升沿计数），构筑与 7.3 表一致，可直接并排读
  reseed(SEED);
  const win = runArm3("Phase-1 满级构筑（⑤ 环频窗）", MAXED, 3600);
  const lvlPerRing = win.新星环数_等级上升沿帧 ? +(win.等级上升沿总格数 / win.新星环数_等级上升沿帧).toFixed(2) : null;
  const ring3 = probes.find((x) => x.novaLvl === 3) || {};
  const perRingTarget = ring3.单环伤害_每目标 ?? null;
  const perRingAoe = ring3.单环总伤害_布靶口径 ?? null;
  const ringPerMin = win.环每分钟 ?? null;
  const dpsPerMin = dps.主弹DPS_容量口径 * 60;
  const share = (a) => (a && ringPerMin != null && dpsPerMin ? +((a * ringPerMin) / dpsPerMin * 100).toFixed(1) : null);
  return {
    待测项: "nova 会不会变成主导伤害引擎。需要「环/分钟」与「单环伤害 ÷ 主弹 DPS」两个读数同时成立才能裁定，缺一个都不许下结论。",
    单环伤害: probes,
    主弹DPS: dps,
    环频窗: {
      窗秒: win.seconds, 新星环数_等级上升沿帧: win.新星环数_等级上升沿帧,
      等级上升沿总格数: win.等级上升沿总格数, 环每分钟: win.环每分钟,
      环数每等级: lvlPerRing, 视觉环增量和: win.环数_视觉正增量和, 触顶帧: win.环缓冲触顶帧,
      口径告警: win.环频口径告警,
      上界对照: "7.3 的等级增量 median 13/60s 只是**上界**；本节给的是实测上升沿帧数",
    },
    占比_单目标口径pct: share(perRingTarget),
    占比_布靶AoE口径pct: share(perRingAoe),
    计算: `环/分钟(${ringPerMin}) × 单环伤害 ÷ 主弹每分钟伤害(${dpsPerMin})；单目标 ${perRingTarget} / 布靶12只合计 ${perRingAoe}`,
    纪律: "占比随玩家等级一起涨（单环伤害与主弹伤害同源 calcPlayerBaseDmg），所以这里给的是**同一构筑同一窗**的比值，不跨窗换算；"
      + "单环伤害用 1e6 hp 靶以免被死亡截断；分母是容量口径 → 真实占比只会更高，不会更低",
  };
}

const groups = {
  "1": ["① 同屏友方子弹峰值 + 来源分解", group1],
  "2": ["② nova 自催化环", group2],
  "3": ["③ 60 秒存活", group3],
  // SWEEP>1 时 ④ 走 sweep4：身份不过的 seed 整条丢弃（不逐格取平均）
  "4": [`④ homing 弧长分离${SWEEP > 1 ? `（${SWEEP} seeds，不合格 seed 整条丢弃）` : ""}`, () => (SWEEP > 1 ? sweep4() : group4())],
  "5": ["⑤ nova 主导度：环/分钟 + 单环伤害 ÷ 主弹 DPS", group5],
};
if (SWEEP > 1) { groups["3s"] = [`③-b ${SWEEP} seeds 存活分布`, () => sweep3()]; groups["3w"] = ["③-c 撞墙长窗探针", () => wallProbe()]; }
const wanted = ONLY === "all"
  ? (SWEEP > 1 ? ["1", "2", "3", "4", "5", "3s", "3w"] : ["1", "2", "3", "4", "5"])
  : ONLY === "sweep" ? ["3s", "3w"] : [ONLY];
const result = { tool: "phase1-baseline", seed: SEED, sweep: SWEEP, nova: { max: SKILLS.find(s => s.id === "nova")?.max, radius: BULLET.novaBaseRadius, perLevel: BULLET.novaRadiusPerLevel, dmgMulBase: BULLET.novaDmgMulBase ?? null, dmgMulPerLevel: BULLET.novaDmgMulPerLevel ?? null } };
for (const k of wanted) {
  const [title, fn] = groups[k];
  try { result[title] = fn(); } catch (e) { result[title] = { error: e.message, stack: e.stack?.split("\n")[1]?.trim() }; }
}
result.errors = errors.slice(0, 3);
if (errors.length) console.error = realErr;
console.log(JSON.stringify(result, null, 2));
