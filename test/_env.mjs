const store = new Map();

const localStorageMock = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(String(key), String(value));
  },
  removeItem(key) {
    store.delete(String(key));
  },
  clear() {
    store.clear();
  },
};

if (!globalThis.window) globalThis.window = globalThis;
globalThis.window.innerWidth = 480;
globalThis.window.innerHeight = 720;
globalThis.window.devicePixelRatio = 1;
globalThis.window.AudioContext = undefined;
globalThis.window.webkitAudioContext = undefined;
if (!globalThis.window.addEventListener) globalThis.window.addEventListener = () => {};
if (!globalThis.window.removeEventListener) globalThis.window.removeEventListener = () => {};
if (!globalThis.localStorage) globalThis.localStorage = localStorageMock;
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };

// 最小 document 桩：meta.js 注册 pagehide/visibilitychange 落盘监听、
// assets.js 的白闪/量测会探测它。刻意让 createElement().getContext() 返回 null，
// 用于覆盖「有 document 对象但没有可用 2D 画布」的环境（API 必须安全返回而不是抛错）。
// game.test.mjs 会在此之后用更完整的 mock 覆盖，因此这里只补缺省。
if (!globalThis.document) {
  const listeners = new Map();
  const makeEl = () => ({
    style: {},
    width: 0,
    height: 0,
    getContext: () => null,   // 无可用 2D 上下文
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.document = {
    hidden: false,
    createElement: () => makeEl(),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
  };
  globalThis.window.document = globalThis.document;
}

export function resetStorage() {
  store.clear();
}

export function makeCtx() {
  const gradient = { addColorStop() {} };
  const target = {
    measureText: () => ({ width: 0 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    canvas: { width: 480, height: 720 },
  };
  const noop = () => undefined;
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === "symbol") return undefined;
      if (!(p in t)) t[p] = noop;
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

export function stubRandom(sequence) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => {
    const v = sequence[Math.min(i, sequence.length - 1)];
    i++;
    return v;
  };
  return () => { Math.random = orig; };
}

/**
 * 装一个可控的假 Image（Node 无此构造器，皮肤加载器会整层回退）。
 * 返回按创建顺序排列的数组，用 `succeed()` / `fail()` 手动触发 onload/onerror。
 */
export function installFakeImage() {
  const created = [];
  class FakeImage {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
      this._src = "";
      created.push(this);
    }
    set src(v) { this._src = v; }
    get src() { return this._src; }
    succeed(w = 320, h = 256) {
      this.width = w;
      this.height = h;
      if (this.onload) this.onload();
    }
    fail() { if (this.onerror) this.onerror(); }
  }
  globalThis.Image = FakeImage;
  return created;
}

/** 卸载假 Image（还原 Node 默认的「无 Image」态） */
export function removeFakeImage(hadImage, savedImage) {
  if (hadImage) globalThis.Image = savedImage;
  else delete globalThis.Image;
}

/**
 * 画布调用探针：记录 drawImage / fillText 的调用参数，
 * 用于断言「画了哪张贴图」「文字落在哪个坐标」。
 */
export function makeSpyCtx() {
  const ctx = makeCtx();
  const images = [];
  const texts = [];
  ctx.drawImage = (img, x, y, w, h) => { images.push({ src: String(img && img.src), x, y, w, h }); };
  ctx.fillText = (t, x, y) => { texts.push({ t, x, y }); };
  return { ctx, images, texts };
}
