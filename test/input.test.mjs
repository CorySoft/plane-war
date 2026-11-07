import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import {
  pressed, setDifficulty, isEasyMode, getStickDir, getEasyTouch,
  isStickActive, getStick, initInput, bindTouchButtons,
} from "../js/input.js";

// ---- 事件捕获桩：initInput 会把处理器挂到 window/document/canvas 上 ----
const winLis = {};
const docLis = {};
const canvasLis = {};
function capture(target, store) {
  target.addEventListener = (type, fn) => { (store[type] ||= []).push(fn); };
  target.removeEventListener = () => {};
}
capture(globalThis.window, winLis);
capture(globalThis.document, docLis);

const canvas = {
  addEventListener: (type, fn) => { (canvasLis[type] ||= []).push(fn); },
  removeEventListener() {},
  setPointerCapture() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
};
initInput(canvas);

const noop = () => {};
function fire(store, type, ev = {}) {
  let out;
  for (const fn of (store[type] || [])) out = fn(ev);
  return out;
}
function touch(extra) {
  return { pointerType: "touch", preventDefault: noop, stopPropagation: noop, target: canvas, ...extra };
}
function key(code, extra) {
  return { code, target: {}, preventDefault: noop, ...extra };
}

function resetInput() {
  setDifficulty("easy");    // 触发摇杆/触摸状态复位
  setDifficulty("normal");
  pressed.left = pressed.right = pressed.up = pressed.down = pressed.fire = false;
}

describe("input", () => {
  beforeEach(resetInput);

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

  it("键盘方向键置位/复位", () => {
    fire(winLis, "keydown", key("ArrowLeft"));
    assert.equal(pressed.left, true);
    fire(winLis, "keyup", key("ArrowLeft"));
    assert.equal(pressed.left, false);
    fire(winLis, "keydown", key("KeyD"));   // 字母别名
    assert.equal(pressed.right, true);
    fire(winLis, "keyup", key("KeyD"));
    assert.equal(pressed.right, false);
  });

  it("空格触发射击并阻止默认滚动", () => {
    let prevented = false;
    fire(winLis, "keydown", key("Space", { preventDefault: () => { prevented = true; } }));
    assert.equal(pressed.fire, true);
    assert.equal(prevented, true);
  });

  it("输入控件聚焦时按键不映射为游戏操作", () => {
    fire(winLis, "keydown", key("ArrowLeft", { target: { tagName: "TEXTAREA" } }));
    assert.equal(pressed.left, false);
    fire(winLis, "keydown", key("Space", { target: { tagName: "INPUT", isContentEditable: false } }));
    assert.equal(pressed.fire, false);
  });

  it("触摸拖动激活摇杆并产生方向", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 100, clientY: 100 }));
    assert.equal(isStickActive(), true);
    fire(canvasLis, "pointermove", touch({ pointerId: 1, clientX: 160, clientY: 100 }));
    assert.ok(getStickDir() > 0, "向右拖动应产生正方向");
    assert.ok(getStick().intensity > 0);
    fire(winLis, "pointerup", touch({ pointerId: 1 }));
    assert.equal(isStickActive(), false);
  });

  it("非触摸指针被忽略", () => {
    fire(canvasLis, "pointerdown", touch({ pointerType: "mouse", pointerId: 5, clientX: 100, clientY: 100 }));
    assert.equal(isStickActive(), false);
  });

  it("单指接管：第二根手指的移动不生效", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 7, clientX: 100, clientY: 100 }));
    fire(canvasLis, "pointerdown", touch({ pointerId: 8, clientX: 300, clientY: 300 }));
    fire(canvasLis, "pointermove", touch({ pointerId: 8, clientX: 0, clientY: 100 }));
    assert.equal(getStick().dx, 0, "非接管手指的移动应被忽略");
    fire(winLis, "pointerup", touch({ pointerId: 7 }));
  });

  it("简单模式：点击不闪现，拖动跟随手指", () => {
    setDifficulty("easy");
    assert.equal(isStickActive(), false);
    fire(canvasLis, "pointerdown", touch({ pointerId: 9, clientX: 50, clientY: 50 }));
    assert.equal(getEasyTouch().active, false, "点击不闪现");
    fire(canvasLis, "pointermove", touch({ pointerId: 9, clientX: 300, clientY: 50 }));
    assert.equal(getEasyTouch().active, true);
    assert.ok(Math.abs(getEasyTouch().x - 300) < 1e-6);
    fire(winLis, "pointerup", touch({ pointerId: 9 }));
    assert.equal(getEasyTouch().active, false);
  });

  it("失焦释放所有按键（防卡键）", () => {
    fire(winLis, "keydown", key("ArrowRight"));
    assert.equal(pressed.right, true);
    fire(winLis, "blur", {});
    assert.equal(pressed.right, false);
  });

  it("切后台（visibilitychange）释放按键", () => {
    fire(winLis, "keydown", key("ArrowUp"));
    assert.equal(pressed.up, true);
    globalThis.document.hidden = true;
    fire(docLis, "visibilitychange", {});
    assert.equal(pressed.up, false);
    globalThis.document.hidden = false;
  });

  it("左右虚拟按钮：按下置位、抬起/取消复位、互不影响", () => {
    function makeBtn() {
      const lis = {};
      return {
        addEventListener(type, fn) { (lis[type] ||= []).push(fn); },
        fire(type, ev) { for (const fn of (lis[type] || [])) fn(ev || { preventDefault: noop, stopPropagation: noop }); },
      };
    }
    const bl = makeBtn();
    const br = makeBtn();
    bindTouchButtons(bl, br);
    bl.fire("touchstart", { preventDefault: noop, stopPropagation: noop });
    assert.equal(pressed.left, true);
    bl.fire("touchend");
    assert.equal(pressed.left, false);
    br.fire("touchstart", { preventDefault: noop, stopPropagation: noop });
    assert.equal(pressed.right, true);
    br.fire("touchcancel");
    assert.equal(pressed.right, false);
    // 全局 mouseup 兜底清空左右
    bl.fire("mousedown");
    br.fire("mousedown");
    fire(winLis, "mouseup", {});
    assert.equal(pressed.left, false);
    assert.equal(pressed.right, false);
  });

  it("按钮 DOM 缺失时 bindTouchButtons 安全返回", () => {
    assert.doesNotThrow(() => bindTouchButtons(null, null));
  });
});
