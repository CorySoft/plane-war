import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import {
  pressed, setDifficulty, isEasyMode, getStickDir, getEasyTouch,
  isStickActive, getStick,
} from "../js/input.js";

describe("input", () => {
  beforeEach(() => {
    setDifficulty("normal");
    pressed.left = pressed.right = pressed.up = pressed.down = pressed.fire = false;
  });

  it("简单模式关闭摇杆", () => {
    setDifficulty("easy");
    assert.equal(isEasyMode(), true);
    assert.equal(getStickDir(), 0);
    assert.equal(isStickActive(), false);
    setDifficulty("hard");
    assert.equal(isEasyMode(), false);
  });

  it("getEasyTouch 返回当前跟随点", () => {
    const t = getEasyTouch();
    assert.equal(typeof t.active, "boolean");
    assert.equal(typeof t.x, "number");
  });

  it("getStick 暴露归一化字段", () => {
    const s = getStick();
    assert.equal(s.nx, 0);
    assert.equal(s.intensity, 0);
  });
});
