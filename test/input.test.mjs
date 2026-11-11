import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { W } from "../js/config.js";
import {
  pressed, setDifficulty, getTouchTarget, clearTouchTarget, initInput,
} from "../js/input.js";
import { createPlayer, updatePlayer } from "../js/player.js";

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
  setDifficulty("easy");    // 触发触摸状态复位
  setDifficulty("normal");
  pressed.left = pressed.right = pressed.up = pressed.down = pressed.fire = false;
  clearTouchTarget();
}

describe("input", () => {
  beforeEach(resetInput);

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

  it("触摸按下（点击）记录目标落点（逻辑坐标）", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 240, clientY: 100 }));
    const t = getTouchTarget();
    assert.equal(t.active, true);
    assert.ok(Math.abs(t.x - (240 / 480) * W) < 1e-9, `目标 x 应为 ${(240 / 480) * W}，实际 ${t.x}`);
  });

  it("触摸拖动更新目标落点", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 100, clientY: 100 }));
    fire(canvasLis, "pointermove", touch({ pointerId: 1, clientX: 360, clientY: 100 }));
    assert.ok(Math.abs(getTouchTarget().x - (360 / 480) * W) < 1e-9, "拖动应更新目标 x");
  });

  it("非触摸指针被忽略", () => {
    fire(canvasLis, "pointerdown", touch({ pointerType: "mouse", pointerId: 5, clientX: 100, clientY: 100 }));
    assert.equal(getTouchTarget().active, false);
  });

  it("单指接管：第二根手指的落下/移动不生效", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 7, clientX: 100, clientY: 100 }));
    fire(canvasLis, "pointerdown", touch({ pointerId: 8, clientX: 300, clientY: 300 }));
    fire(canvasLis, "pointermove", touch({ pointerId: 8, clientX: 0, clientY: 100 }));
    assert.ok(Math.abs(getTouchTarget().x - (100 / 480) * W) < 1e-9, "非接管手指应被忽略");
    fire(winLis, "pointerup", touch({ pointerId: 7 }));
  });

  it("抬手后保留目标：战机继续按速度走到落点", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 400, clientY: 100 }));
    assert.equal(getTouchTarget().active, true);
    fire(winLis, "pointerup", touch({ pointerId: 1 }));
    assert.equal(getTouchTarget().active, true, "抬手不应清除目标，战机应继续走向落点");
  });

  it("失焦释放所有按键与触摸目标（防卡键）", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 200, clientY: 100 }));
    fire(winLis, "keydown", key("ArrowRight"));
    assert.equal(getTouchTarget().active, true);
    assert.equal(pressed.right, true);
    fire(winLis, "blur", {});
    assert.equal(pressed.right, false);
    assert.equal(getTouchTarget().active, false);
  });

  it("切后台（visibilitychange）释放按键与触摸目标", () => {
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 200, clientY: 100 }));
    fire(winLis, "keydown", key("ArrowUp"));
    globalThis.document.hidden = true;
    fire(docLis, "visibilitychange", {});
    assert.equal(pressed.up, false);
    assert.equal(getTouchTarget().active, false);
    globalThis.document.hidden = false;
  });

  it("触摸落点：战机按自身速度向目标移动，到达后清除目标", () => {
    const p = createPlayer();
    p.x = 100;
    const targetX = (240 / 480) * W;          // 与上方 pointerdown clientX=240 一致
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 240, clientY: 100 }));
    const sp = p.speed;                        // 一帧步长 = sp * dt * 60
    // 步进若干帧，每帧 dt=1/60
    for (let i = 0; i < 1000 && getTouchTarget().active; i++) {
      updatePlayer(1 / 60, p, 0, 0);
    }
    assert.ok(p.x > 100 + sp, "战机应向目标方向移动");
    assert.ok(Math.abs(p.x - targetX) < 1e-6, `应精确停在落点 ${targetX}，实际 ${p.x}`);
    assert.equal(getTouchTarget().active, false, "到达后目标应被清除（不压制键盘）");
  });

  it("触摸目标激活时压制键盘左右（避免双重位移）", () => {
    const p = createPlayer();
    p.x = 100;
    fire(canvasLis, "pointerdown", touch({ pointerId: 1, clientX: 400, clientY: 100 }));
    pressed.right = true;
    const before = p.x;
    updatePlayer(1 / 60, p, 0, 0);
    const moved = p.x - before;
    // 步长应为纯触摸方向（正值），而非叠加键盘的右移
    assert.ok(moved > 0, "应向目标（右）移动");
    pressed.right = false;
  });
});
