/* ===========================================================
 * input.js — 键盘 + 触摸输入
 *
 * 移动控制（触摸）：手指按下（点击）或拖动（滑动）时记录一个目标 X，
 * 战机每帧按自身速度朝目标 X 移动，到达后停住。点击与滑动共用同一套逻辑——
 * 点击相当于「把目标设到落点」，滑动相当于「目标跟着手指」，抬手后战机继续
 * 按速度走到最后落点自然停住。不再区分简单/普通模式的触摸行为。
 * 左右虚拟按钮已移除，桌面端仍可用方向键 / WASD。
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

// 触摸跟随目标：战机水平移动到该逻辑 X（y 锁定在底部，仅水平跟随）
let touchTarget = { active: false, x: 0 };
let touchId = null;

// 供 updatePlayer 读取当前触摸目标
export function getTouchTarget() { return { active: touchTarget.active, x: touchTarget.x }; }
// 战机到达目标后清空（避免到达后键盘被持续压制）
export function clearTouchTarget() { touchTarget.active = false; }

// 仅保留难度标志位：触摸控制已统一为「跟随落点」，普通/简单模式不再区分
export let easyMode = false;

/** 切换难度：重置触摸残留状态（普通/简单共用跟随逻辑） */
export function setDifficulty(key) {
  easyMode = (key === "easy");
  touchId = null;
  touchTarget.active = false;
}

// 屏幕像素 -> 逻辑坐标
function toLogic(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * W,
    y: (e.clientY - rect.top) / rect.height * H,
  };
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
  touchId = null;
  touchTarget.active = false;
}

// ---------- 触摸：跟随落点 ----------
function onPointerDown(e) {
  initAudio();
  if (e.pointerType !== "touch") return;
  // 单指接管：已有手指控制时忽略第二根手指（否则目标在两根手指间跳变）
  if (touchId !== null) return;
  try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  const p = toLogic(e, e.target);
  touchId = e.pointerId;
  touchTarget.active = true;
  touchTarget.x = p.x;
}
function onPointerMove(e) {
  if (e.pointerType !== "touch" || e.pointerId !== touchId) return;
  const p = toLogic(e, e.target);
  touchTarget.active = true;
  touchTarget.x = p.x;
}
function onPointerUp(e) {
  if (e.pointerType !== "touch" || e.pointerId !== touchId) return;
  touchId = null;
  // 保留目标：战机继续按速度移动到最后落点（点击/滑动抬手后自然停住）
}

export function initInput(canvas) {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // 失焦/切后台：清空按键与触摸状态，避免“卡键”让战机顶墙不停
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
