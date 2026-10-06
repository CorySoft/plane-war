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

// 供绘制与逻辑读取当前摇杆状态
export function getStick() { return stick; }

// 供 updatePlayer 移动：返回归一化水平方向（-1 左 ~ 1 右）
export function getStickDir() {
  // 简单模式下强制摇杆失效（无延迟、无跟随目标，直接瞬移）
  if (easyMode || !stick.active) return 0;
  // 乘上推动强度：STICK_MAX_DX 注释即“满速所需偏移”，1px 抖动不应直接满速
  return stick.nx * stick.intensity;
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
// 焦点在输入控件（反馈输入框/可编辑区）时，方向键、空格、WASD 都属于文本编辑，
// 不能拦截也不能映射成游戏按键（否则反馈框打不出空格、方向键无法移动光标）
function isEditableTarget(e) {
  const t = e.target;
  if (!t || typeof t !== "object" || !t.tagName) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable === true;
}
function onKeyDown(e) {
  initAudio();
  if (isEditableTarget(e)) return;
  const k = keyMap[e.code];
  if (k) { pressed[k] = true; if (k === "fire") e.preventDefault(); }
}
function onKeyUp(e) {
  if (isEditableTarget(e)) return;
  const k = keyMap[e.code];
  if (k) pressed[k] = false;
}
// 失焦兜底：按键/触摸按住时切标签页，keyup/pointerup 不再派发，回来后会“卡键”
function releaseAllInput() {
  pressed.left = pressed.right = pressed.up = pressed.down = pressed.fire = false;
  easyTouchActive = false;
  resetStick();
}

// ---------- 虚拟摇杆 ----------
function onPointerDown(e) {
  initAudio();
  if (e.pointerType !== "touch") return;
  // 单指接管：已有手指控制摇杆时忽略第二根手指（否则底座被劫持、方向跳变）
  if (touchId !== null) return;
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

  // 失焦/切后台：清空按键与摇杆状态，避免“卡键”让战机顶墙不停
  window.addEventListener("blur", releaseAllInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAllInput();
  });

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // 防止方向键/空格滚动页面（输入控件聚焦时不拦截）
  window.addEventListener("keydown", e => {
    if (isEditableTarget(e)) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  }, { passive: false });
}

/** 左右虚拟按钮（补充控制，可作为摇杆之外的备用） */
export function bindTouchButtons(btnLeft, btnRight) {
  // 判空：DOM 缺失时不能抛 TypeError——调用方把本函数包在启动 try 里，
  // 抛错会连带跳过 loadMeta 等关键初始化
  if (!btnLeft || !btnRight) {
    console.warn("[input] 左右控制按钮缺失，跳过触摸按钮绑定");
    return;
  }
  function bind(btn, key) {
    const down = ev => { ev.preventDefault(); ev.stopPropagation(); initAudio(); pressed[key] = true; };
    const up = () => { pressed[key] = false; };
    btn.addEventListener("touchstart", down, { passive: false });
    btn.addEventListener("touchend", up);        // 逐按钮释放：双指按住左右键互不影响
    btn.addEventListener("touchcancel", up);     // 系统取消（来电/手势）不卡键
    btn.addEventListener("mousedown", down);
  }
  bind(btnLeft, "left");
  bind(btnRight, "right");
  // 鼠标可能在按钮外松开：全局兜底（鼠标单指，无多指互清问题）
  window.addEventListener("mouseup", () => { pressed.left = false; pressed.right = false; });
}
