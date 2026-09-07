import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { clamp, rand, randInt, pick, hypot, lerp, weightedPick, shuffle, setf } from "../js/utils.js";

describe("utils", () => {
  it("clamp 限制上下界", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(99, 0, 10), 10);
    assert.equal(clamp(0, 0, 10), 0);
  });

  it("rand 落在区间内", () => {
    for (let i = 0; i < 40; i++) {
      const v = rand(2, 5);
      assert.ok(v >= 2 && v < 5);
    }
  });

  it("randInt 含两端", () => {
    const seen = new Set();
    for (let i = 0; i < 80; i++) seen.add(randInt(1, 3));
    assert.ok(seen.has(1) || seen.has(2) || seen.has(3));
    for (const v of seen) assert.ok(v >= 1 && v <= 3);
  });

  it("pick 从数组取值", () => {
    const arr = ["a", "b", "c"];
    for (let i = 0; i < 20; i++) assert.ok(arr.includes(pick(arr)));
  });

  it("hypot 计算距离", () => {
    assert.equal(hypot(0, 0, 3, 4), 5);
    assert.equal(hypot(1, 1, 1, 1), 0);
  });

  it("lerp 线性插值", () => {
    assert.equal(lerp(0, 10, 0), 0);
    assert.equal(lerp(0, 10, 1), 10);
    assert.equal(lerp(0, 10, 0.5), 5);
  });

  it("weightedPick 按权重选择", () => {
    const orig = Math.random;
    Math.random = () => 0.0;
    assert.equal(weightedPick([["a", 10], ["b", 90]]), "a");
    Math.random = () => 0.99;
    assert.equal(weightedPick([["a", 10], ["b", 90]]), "b");
    Math.random = orig;
  });

  it("weightedPick 空数组与零权重", () => {
    assert.equal(weightedPick([]), undefined);
    assert.equal(weightedPick([["x", 0], ["y", 0]]), "x");
  });

  it("shuffle 打乱但不丢元素", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src);
    assert.deepEqual(src, [1, 2, 3, 4, 5]);
    assert.deepEqual([...out].sort((a, b) => a - b), src);
  });

  it("setf 按逻辑宽度缩放字号", () => {
    const ctx = { font: "" };
    setf(ctx, "bold 22px sans-serif");
    assert.match(ctx.font, /bold \d+px sans-serif/);
    setf(ctx, "italic");
    assert.equal(ctx.font, "italic");
  });
});
