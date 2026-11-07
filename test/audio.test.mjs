/* ===========================================================
 * audio.test.mjs — 音频模块运行时测试
 *
 * 背景：test/modules.test.mjs 只做「sfx.xxx 名字是否存在」的静态检查，
 * 从没真正跑过 audio.js。这里用可控的假 AudioContext + 可控时钟/计时器，
 * 覆盖：无音频环境降级、initAudio 幂等、节流窗口、BGM 调度与清理、静音。
 *
 * 每个用例用唯一查询串动态 import 一份全新模块（模块级状态隔离）。
 * =========================================================== */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";

let created;   // 本用例中构造出的假 AudioContext

function installFakeAudio() {
  created = [];
  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.destination = {};
      this.oscillators = [];
      this.gains = [];
      created.push(this);
    }
    resume() { this.state = "running"; return Promise.resolve(); }
    createGain() {
      const g = {
        gain: {
          value: 1,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
          cancelScheduledValues() {},
        },
        connect() {},
      };
      this.gains.push(g);
      return g;
    }
    createOscillator() {
      const osc = {
        type: "sine",
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}, start() {}, stop() {},
        onended: null,
      };
      this.oscillators.push(osc);
      return osc;
    }
  }
  globalThis.window.AudioContext = FakeAudioContext;
  return FakeAudioContext;
}

function removeFakeAudio() {
  delete globalThis.window.AudioContext;
}

async function freshAudio() {
  return import("../js/audio.js?t=" + Math.random().toString(36).slice(2) + Date.now());
}

describe("audio 运行时", () => {
  let origNow;
  beforeEach(() => { origNow = globalThis.performance.now; });
  afterEach(() => {
    globalThis.performance.now = origNow;
    removeFakeAudio();
  });

  it("无 AudioContext 时 initAudio 与 sfx 安全降级（不抛错）", async () => {
    const a = await freshAudio();
    assert.doesNotThrow(() => a.initAudio());
    assert.doesNotThrow(() => {
      a.sfx.shoot(); a.sfx.boom(); a.sfx.explosion();
      a.sfx.power(); a.sfx.pickup(); a.sfx.unlock(); a.sfx.deny();
      a.sfx.achievement(); a.sfx.newbest(); a.sfx.revive();
      a.sfx.warn(); a.sfx.bossSpawn(); a.sfx.bossPhase(); a.sfx.click(); a.sfx.over();
    });
    assert.doesNotThrow(() => a.startMusic());
    assert.doesNotThrow(() => a.stopMusic());
    assert.doesNotThrow(() => a.duckMusic(true));
  });

  it("initAudio 幂等：重复调用只创建一个上下文", async () => {
    installFakeAudio();
    const a = await freshAudio();
    a.initAudio();
    a.initAudio();
    a.initAudio();
    assert.equal(created.length, 1, "应复用同一 AudioContext");
  });

  it("shoot 节流：80ms 窗口内只发一次，窗口外再发", async () => {
    installFakeAudio();
    let clock = 1000;
    globalThis.performance.now = () => clock;
    const a = await freshAudio();
    a.initAudio();
    const ctx = created[0];
    const base = ctx.oscillators.length;

    a.sfx.shoot();
    assert.equal(ctx.oscillators.length, base + 1, "首次应发声");
    a.sfx.shoot();      // 同一时钟，窗口内
    assert.equal(ctx.oscillators.length, base + 1, "窗口内应被节流");
    clock += 100;
    a.sfx.shoot();
    assert.equal(ctx.oscillators.length, base + 2, "窗口外应再次发声");
  });

  it("boom 独立节流键：不受 shoot 影响", async () => {
    installFakeAudio();
    let clock = 5000;
    globalThis.performance.now = () => clock;
    const a = await freshAudio();
    a.initAudio();
    const ctx = created[0];
    const base = ctx.oscillators.length;
    a.sfx.shoot();
    a.sfx.boom();
    assert.equal(ctx.oscillators.length, base + 2, "不同音效各有独立节流键");
    a.sfx.boom();       // 窗口内
    assert.equal(ctx.oscillators.length, base + 2, "boom 窗口内应节流");
  });

  it("静音开关：sfxMuted 时不发声", async () => {
    installFakeAudio();
    const a = await freshAudio();
    a.initAudio();
    const ctx = created[0];
    const base = ctx.oscillators.length;
    a.setSfxMuted(true);
    a.sfx.power();
    a.sfx.deny();
    assert.equal(ctx.oscillators.length, base, "静音时不应创建振荡器");
    a.setSfxMuted(false);
    a.sfx.power();
    assert.equal(ctx.oscillators.length, base + 1, "取消静音后恢复发声");
  });

  it("startMusic 注册调度、stopMusic 清理、静音时不调度", async () => {
    installFakeAudio();
    const a = await freshAudio();
    a.initAudio();
    const intervals = new Set();
    const origSI = globalThis.setInterval;
    const origCI = globalThis.clearInterval;
    globalThis.setInterval = () => { const id = Symbol("iv"); intervals.add(id); return id; };
    globalThis.clearInterval = id => { intervals.delete(id); };
    try {
      a.startMusic();
      assert.equal(intervals.size, 1, "startMusic 应注册一个调度器");
      a.startMusic();     // 再次调用应先停旧的再注册新的
      assert.equal(intervals.size, 1, "重复 startMusic 不应泄漏调度器");
      a.stopMusic();
      assert.equal(intervals.size, 0, "stopMusic 应清理调度器");

      a.setMusicMuted(true);
      a.startMusic();
      assert.equal(intervals.size, 0, "静音时不应注册调度器");
      a.setMusicMuted(false);
    } finally {
      globalThis.setInterval = origSI;
      globalThis.clearInterval = origCI;
    }
  });

  it("setMusicIntensity 夹取到 0.5~1.4，duckMusic 不抛错", async () => {
    installFakeAudio();
    const a = await freshAudio();
    a.initAudio();
    assert.doesNotThrow(() => a.setMusicIntensity(-100));
    assert.doesNotThrow(() => a.setMusicIntensity(999));
    assert.doesNotThrow(() => { a.duckMusic(true); a.duckMusic(false); });
  });
});
