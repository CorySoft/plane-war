/* ===========================================================
 * enemy-render-overlay.test.mjs — 敌机绘制层的「应不变」几何
 * 用记录式 ctx 跟踪变换矩阵，验证：
 *  1) 血条/护盾环/炮线不受 ±0.15rad 整机摇摆影响（保持水平/垂直）；
 *  2) 血条仍在机体下方、炮线仍从机体下缘向下指；
 *  3) 程序化 fallback 的机鼻仍朝下（最深顶点位于机体中轴）。
 * 与 enemy-orientation.test.mjs（角度表）互补：那边锁配置，这边锁绘制结果。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { clearEnemies, spawnEnemy, drawEnemies, enemies } from "../js/enemy.js";

const DIFF = { hpScale: 1, speedScale: 0, spawnScale: 0, enemyFireScale: 1, fireCdScale: 99 };

/** 记录式 2D ctx：维护变换矩阵并收集 fill/stroke/fillRect 的最终绘制参数 */
function makeMatrixCtx() {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const fills = [];
  const strokes = [];
  const rects = [];
  let path = [];

  const mul = (n) => {
    const [a, b, c, d, e, f] = m;
    const [na, nb, nc, nd, ne, nf] = n;
    m = [
      a * na + c * nb, b * na + d * nb,
      a * nc + c * nd, b * nc + d * nd,
      a * ne + c * nf + e, b * ne + d * nf + f,
    ];
  };

  const ctx = {
    lineWidth: 1,
    _fillStyle: "",
    _strokeStyle: "",
    save() { stack.push(m.slice()); },
    restore() { if (stack.length) m = stack.pop(); },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); mul([c, s, -s, c, 0, 0]); },
    scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
    beginPath() { path = []; },
    moveTo(x, y) { path.push({ x, y }); },
    lineTo(x, y) { path.push({ x, y }); },
    arc(x, y, r) { path.push({ x, y, r }); },
    closePath() {},
    fill() { fills.push({ points: path.slice(), m: m.slice(), style: this._fillStyle }); },
    stroke() { strokes.push({ points: path.slice(), m: m.slice(), style: this._strokeStyle }); },
    fillRect(x, y, w, h) { rects.push({ x, y, w, h, m: m.slice(), style: this._fillStyle }); },
    fillText() {},
    measureText: () => ({ width: 0 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    canvas: { width: 480, height: 720 },
  };
  Object.defineProperty(ctx, "fillStyle", { get() { return this._fillStyle; }, set(v) { this._fillStyle = v; } });
  Object.defineProperty(ctx, "strokeStyle", { get() { return this._strokeStyle; }, set(v) { this._strokeStyle = v; } });
  return { ctx, fills, strokes, rects };
}

const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const angleOf = (m) => Math.atan2(m[1], m[0]);
const deg = (rad) => rad * 180 / Math.PI;

/** 生成一架敌机并返回该对象（enemy.js 的 enemies 是模块级可读数组） */
function spawnOne(type, extra = {}) {
  clearEnemies();
  spawnEnemy(1, DIFF, 1, 240, 300, { type });
  const e = enemies[enemies.length - 1];
  Object.assign(e, { t: 0, maxHp: 1, hp: 1, laserTimer: 0, shieldHp: 0 }, extra);
  return e;
}

describe("敌机绘制层：世界向元素不随摇摆旋转", () => {
  it("血条在 t=0 与 t=π/4（摇摆 8.6°）时都保持水平，且仍在机体下方", () => {
    for (const t of [0, Math.PI / 4]) {
      const e = spawnOne("big", { t, maxHp: 100, hp: 80 });
      const rec = makeMatrixCtx();
      drawEnemies(rec.ctx, 0);

      const bgBar = rec.rects.find(r => r.style === "rgba(0,0,0,.5)");
      assert.ok(bgBar, "应绘制血条底板");
      const tl = apply(bgBar.m, bgBar.x, bgBar.y);
      const tr = apply(bgBar.m, bgBar.x + bgBar.w, bgBar.y);
      const tilt = deg(Math.atan2(tr[1] - tl[1], tr[0] - tl[0]));
      assert.ok(Math.abs(tilt) < 0.01, `t=${t.toFixed(3)} 时血条应水平，实测倾角 ${tilt.toFixed(2)}°`);
      const cx = (tl[0] + tr[0]) / 2;
      const cy = (tl[1] + tr[1]) / 2;
      assert.ok(Math.abs(cx - 240) < 0.01, `血条应居中，实测 x=${cx.toFixed(2)}`);
      assert.ok(Math.abs(cy - (300 + e.r + 6)) < 0.01, `血条应在机体下方（上沿 r+6），实测 y=${cy.toFixed(2)}`);
    }
  });

  it("laser 蓄力炮线在摇摆相位下仍垂直向下、且从机体下缘起算", () => {
    const e = spawnOne("laser", { t: Math.PI / 4, laserTimer: 0.35 });
    const rec = makeMatrixCtx();
    drawEnemies(rec.ctx, 0);

    const beam = rec.strokes.find(s => String(s.style).startsWith("rgba(255,68,68"));
    assert.ok(beam, "应绘制 laser 蓄力炮线");
    assert.equal(beam.points.length, 2, "炮线应为一条线段");
    const p0 = apply(beam.m, beam.points[0].x, beam.points[0].y);
    const p1 = apply(beam.m, beam.points[1].x, beam.points[1].y);
    assert.ok(Math.abs(p0[0] - 240) < 0.01 && Math.abs(p1[0] - 240) < 0.01, "炮线应保持居中垂直");
    assert.ok(p1[1] > p0[1], "炮线必须朝下（y 递增）");
    assert.ok(p0[1] > 300, "炮线起点应在敌机中心下方");
  });

  it("护盾环在摇摆相位下不被旋转（弧起点方位稳定）", () => {
    const e = spawnOne("shield", { t: Math.PI / 4, shieldHp: 2 });
    const rec = makeMatrixCtx();
    drawEnemies(rec.ctx, 0);

    const ring = rec.strokes.find(s => String(s.style).startsWith("rgba(100,200,255"));
    assert.ok(ring, "应绘制护盾环");
    assert.ok(Math.abs(angleOf(ring.m)) < 1e-9, `护盾环不应带旋转，实测 ${deg(angleOf(ring.m)).toFixed(2)}°`);
    assert.ok(Math.abs(ring.points[0].r - (e.r + 6)) < 1e-9, "护盾环半径应为 r+6");
  });

  it("程序化 fallback 的机鼻朝下（最深顶点落在中轴）", () => {
    const e = spawnOne("small");
    const rec = makeMatrixCtx();
    drawEnemies(rec.ctx, 0);

    const body = rec.fills.find(f => f.style === e.color && f.points.length === 5);
    assert.ok(body, "应绘制 5 点机体多边形");
    const pts = body.points.map(p => apply(body.m, p.x, p.y));
    const deepest = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
    assert.ok(Math.abs(deepest[0] - 240) < 0.01, `机鼻应落在中轴，实测 x=${deepest[0].toFixed(2)}`);
    assert.ok(Math.abs(deepest[1] - (300 + e.r)) < 0.01, `机鼻应在机体最下方，实测 y=${deepest[1].toFixed(2)}`);

    // 眼睛（白色眼白）应落在中心下方（玩家一侧）
    const eyes = rec.fills.filter(f => f.style === "#fff");
    assert.ok(eyes.length >= 2, "应绘制两只眼白");
    const eyeCy = eyes.slice(0, 2).map(f => apply(f.m, f.points[0].x, f.points[0].y)[1]);
    assert.ok(eyeCy.every(y => y > 300), `眼睛应朝玩家一侧，实测 y=${eyeCy.map(v => v.toFixed(1)).join(",")}`);
  });
});