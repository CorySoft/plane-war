/* ===========================================================
 * _dom.mjs — 浏览器环境最小模拟（供 boot 冒烟测试使用）
 * 只提供 game.js 初始化路径真正依赖的 DOM/Canvas API，
 * 目的是在 Node 下真实 import 一遍入口模块，捕获启动期异常。
 * =========================================================== */

import "./_env.mjs";

const noop = () => undefined;

/** 最小 CanvasRenderingContext2D 模拟：未知属性返回 noop，可读写状态字段 */
export function makeCanvasCtx() {
  const target = {
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    canvas: { width: 480, height: 720 },
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === "symbol") return undefined;
      t[p] = noop;
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function makeEl(id = "") {
  const el = {
    id,
    style: {},
    width: 480,
    height: 720,
    textContent: "",
    value: "",
    parentNode: null,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop,
    removeEventListener: noop,
    getContext: () => makeCanvasCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
    setPointerCapture: noop,
    releasePointerCapture: noop,
    focus: noop,
    blur: noop,
    appendChild: noop,
    removeChild: noop,
  };
  return el;
}

/** 安装 document / rAF 模拟；返回 { els } 便于断言 */
export function installDom() {
  const els = new Map();
  const get = (id) => {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  };
  globalThis.document = {
    getElementById: get,
    querySelector: () => makeEl("q"),
    querySelectorAll: () => [],
    createElement: () => makeEl("c"),
    addEventListener: noop,
    removeEventListener: noop,
    body: makeEl("body"),
    documentElement: makeEl("html"),
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = noop;
  return { els };
}
