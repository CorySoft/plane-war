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
