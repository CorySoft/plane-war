/* ===========================================================
 * gradient-cache.test.mjs — 渐变对象缓存
 * 固定坐标/色标/画布变换的渐变必须复用同一对象，避免每帧 create*Gradient。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cachedLinearGradient, cachedRadialGradient } from "../js/utils.js";

function makeCtx() {
  const st = { created: 0 };
  const grad = () => ({
    stops: [],
    addColorStop(a, b) { this.stops.push([a, b]); },
  });
  return {
    get created() { return st.created; },
    createLinearGradient() { st.created++; return grad(); },
    createRadialGradient() { st.created++; return grad(); },
  };
}

describe("渐变缓存", () => {
  it("同一 ctx + 同一 key 复用对象，init 只执行一次", () => {
    const ctx = makeCtx();
    let inits = 0;
    const a = cachedLinearGradient(ctx, "flame", 0, 0, 0, 10, g => { inits++; g.addColorStop(0, "#ffd166"); });
    const b = cachedLinearGradient(ctx, "flame", 0, 0, 0, 10, g => { inits++; g.addColorStop(0, "#000"); });
    assert.equal(a, b, "同 key 必须返回同一渐变对象");
    assert.equal(inits, 1, "init 只应在首次创建时执行");
    assert.equal(ctx.created, 1, "只应创建一次渐变");
    assert.deepEqual(a.stops, [[0, "#ffd166"]], "后续调用不得覆盖已缓存色标");
  });

  it("不同 key 各自缓存", () => {
    const ctx = makeCtx();
    const a = cachedRadialGradient(ctx, "nebula:1", 0, 0, 0, 0, 0, 10);
    const b = cachedRadialGradient(ctx, "nebula:2", 0, 0, 0, 0, 0, 20);
    assert.notEqual(a, b);
    assert.equal(ctx.created, 2);
  });

  it("不同 ctx 隔离（同一 key 不跨上下文复用）", () => {
    const c1 = makeCtx();
    const c2 = makeCtx();
    const a = cachedRadialGradient(c1, "lowHp", 0, 0, 0, 0, 0, 10);
    const b = cachedRadialGradient(c2, "lowHp", 0, 0, 0, 0, 0, 10);
    assert.notEqual(a, b, "渐变对象绑定上下文，不得跨 ctx 共享");
    assert.equal(c1.created, 1);
    assert.equal(c2.created, 1);
  });

  it("每个上下文最多保留 128 个渐变，超限后淘汰最早项", () => {
    const ctx = makeCtx();
    const first = cachedRadialGradient(ctx, "g0", 0, 0, 0, 0, 0, 10);
    for (let i = 1; i < 128; i++) cachedRadialGradient(ctx, `g${i}`, 0, 0, 0, 0, 0, 10);
    assert.equal(ctx.created, 128);
    cachedRadialGradient(ctx, "g128", 0, 0, 0, 0, 0, 10);
    const recreated = cachedRadialGradient(ctx, "g0", 0, 0, 0, 0, 0, 10);
    assert.notEqual(first, recreated);
    assert.equal(ctx.created, 130);
  });
});