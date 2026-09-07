import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { triggerShake, updateCamera, resetCamera, applyCamera, shake, slowmo } from "../js/camera.js";

describe("camera", () => {
  beforeEach(() => resetCamera());

  it("震动取较大值并衰减", () => {
    triggerShake(1);
    triggerShake(0.4);
    assert.ok(shake >= 1);
    updateCamera(0.2, 0, 0);
    assert.ok(shake < 1);
  });

  it("连击提高慢动作强度但不低于 0.55", () => {
    resetCamera();
    for (let i = 0; i < 40; i++) updateCamera(0.05, 30, 0);
    assert.ok(slowmo >= 0.55);
    assert.ok(slowmo < 1);
  });

  it("死亡慢动作覆盖连击慢动作", () => {
    resetCamera();
    updateCamera(1, 0, 0.2);
    assert.ok(slowmo < 1);
  });

  it("resetCamera 恢复默认", () => {
    triggerShake(2);
    updateCamera(0.1, 20, 0);
    resetCamera();
    assert.equal(shake, 0);
    assert.equal(slowmo, 1);
  });

  it("applyCamera 在震动时平移画布", () => {
    const calls = [];
    const ctx = { translate: (x, y) => calls.push([x, y]) };
    triggerShake(1);
    applyCamera(ctx);
    assert.equal(calls.length, 1);
    resetCamera();
    applyCamera(ctx);
    assert.equal(calls.length, 1);
  });
});
