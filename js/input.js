/* ===========================================================
 * input.js — 键盘 + 虚拟摇杆触摸输入
 * =========================================================== */

import { initAudio } from "./audio.js";
import { W, H } from "./config.js";

const keyMap = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  Space: "fire",
};

export const pressed = { left: false, right: false, up: false, down: false, fire: false };

// 简单模式（休闲）关闭摇杆：手指点哪战机直接到哪
export let easyMode = false;
// 简单模式触摸跟随目标
export let easyTouchActive = false;
export let easyTouchX = 0;

// ---------- 虚拟摇杆状态 ----------
const STICK_RADIUS = 50;        // 摇杆最大偏移（像素）
const STICK_MAX_DX = 50;        // 满速所需偏移
let stick = {
  active: false,
  baseX: 0, baseY: 0,   // 摇杆底座位置（逻辑坐标）
  dx: 0, dy: 0,         // 摇杆头偏移（逻辑坐标，像素）
  nx: 0, ny: 0,         // 归一化方向（-1~1）
  intensity: 0,         // 0~1 推动强度
};
let touchId = null;

export const isTouchControl = () => stick.active;

// 供绘制与逻辑读取当前摇杆状态
export function getStick() { return stick; }

// 供 updatePlayer 移动：返回归一化水平方向（-1 左 ~ 1 右）
export function getStickDir() {
  // 简单模式下强制摇杆失效（无延迟、无跟随目标，直接瞬移）
  if (easyMode || !stick.active) return 0;
  return stick.nx;
}

// 简单模式下是否应忽略虚拟摇杆（用于绘制隐藏）
export function isEasyMode() { return easyMode; }

/** 简单模式触摸跟随：返回 {active, x}，x 为逻辑坐标 */
export function getEasyTouch() { return { active: easyTouchActive, x: easyTouchX }; }

/** 切换难度：simple=true 时关闭摇杆、重置残留状态 */
export function setDifficulty(key) {
  easyMode = (key === "easy");
  if (easyMode) {
    stick.active = false;
    touchId = null;
    stick.dx = 0; stick.dy = 0;
    stick.nx = 0; stick.ny = 0;
    stick.intensity = 0;
    easyTouchActive = false;
  }
}

/** 是否遥杆激活（用于绘制摇杆） */
export function isStickActive() { return stick.active; }

// 屏幕像素 -> 逻辑坐标
function toLogic(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * W,
    y: (e.clientY - rect.top) / rect.height * H,
  };
}

function updateStick(cur) {
  const dx = cur.x - stick.baseX;
  const dy = cur.y - stick.baseY;
  const dist = Math.hypot(dx, dy);
  const len = Math.min(dist, STICK_RADIUS);
  const nx = dist > 0 ? dx / dist : 0;
  const ny = dist > 0 ? dy / dist : 0;
  stick.dx = nx * len;
  stick.dy = ny * len;
  stick.nx = nx;
  stick.ny = ny;
  // 水平推动幅度
  stick.intensity = Math.min(1, dist / STICK_MAX_DX);
}

// ---------- 键盘 ----------
function onKeyDown(e) {
  initAudio();
  const k = keyMap[e.code];
  if (k) { pressed[k] = true; if (k === "fire") e.preventDefault(); }
}
function onKeyUp(e) {
  const k = keyMap[e.code];
  if (k) pressed[k] = false;
}

// ---------- 虚拟摇杆 ----------
function onPointerDown(e) {
  initAudio();
  if (e.pointerType !== "touch") return;
  try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  const p = toLogic(e, e.target);
  touchId = e.pointerId;

  if (easyMode) {
    // 简单模式：仅拖动时跟随手指，点击不闪现
    return;
  }

  stick.active = true;
  stick.baseX = p.x;
  stick.baseY = p.y;
  stick.dx = 0; stick.dy = 0;
  stick.nx = 0; stick.ny = 0;
  stick.intensity = 0;
}
function onPointerMove(e) {
  if (e.pointerType !== "touch" || e.pointerId !== touchId) return;
  if (easyMode) {
    easyTouchActive = true;
    easyTouchX = toLogic(e, e.target).x;
    return;
  }
  if (!stick.active) return;
  const p = toLogic(e, e.target);
  updateStick(p);
}
function onPointerUp(e) {
  if (e.pointerType !== "touch" || e.pointerId !== touchId) return;
  if (easyMode) {
    easyTouchActive = false;
    touchId = null;
    return;
  }
  resetStick();
}
function resetStick() {
  stick.active = false;
  touchId = null;
  stick.dx = 0; stick.dy = 0;
  stick.nx = 0; stick.ny = 0;
  stick.intensity = 0;
}

export function initInput(canvas) {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // 防止方向键/空格滚动页面
  window.addEventListener("keydown", e => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  }, { passive: false });
}

/** 左右虚拟按钮（补充控制，可作为摇杆之外的备用） */
export function bindTouchButtons(btnLeft, btnRight) {
  function bind(btn, on) {
    const f = ev => { ev.preventDefault(); ev.stopPropagation(); initAudio(); on(); };
    btn.addEventListener("touchstart", f, { passive: false });
    btn.addEventListener("mousedown", f);
  }
  bind(btnLeft, () => { pressed.left = true; });
  bind(btnRight, () => { pressed.right = true; });
  window.addEventListener("touchend", () => { pressed.left = false; pressed.right = false; });
  window.addEventListener("mouseup", () => { pressed.left = false; pressed.right = false; });
}
