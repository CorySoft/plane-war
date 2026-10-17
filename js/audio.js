/* ===========================================================
 * audio.js — Web Audio 合成音效 + 背景音乐
 *
 * 设计要点：
 * 1) 音效全部用 Oscillator + Gain 合成，不依赖外部音频文件（Byethost 流量计费）
 * 2) shoot 是最高频的音效（满技能 ~10 发/秒），必须有节流，否则连续叠加成噪音
 * 3) BGM 用 bass + arp + melody 三层，combo 高时 arp 加强、低音不变，避免长时听感疲劳
 * 4) 暂停/结算时静音 BGM 但不停调度（resume 时无缝继续），减少 startMusic 的开销
 * =========================================================== */

let audioCtx = null;
let masterGain = null;       // 主增益（统一控制总音量 + 全局静音）
let musicGain = null;       // BGM 专属增益（暂停时压低、combo 高时提升 arp）
let sfxMuted = false;
let musicMuted = false;

export function setSfxMuted(muted) {
  sfxMuted = !!muted;
}

export function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx) {
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 1;
        masterGain.connect(audioCtx.destination);
        musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.5;
        musicGain.connect(masterGain);
      }
    } catch (e) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

/** 单个 beep：底层合成原子。musicMuted 不影响 sfx，sfxMuted 才影响 */
function beep(freq, dur, type = "square", vol = 0.12, slideTo = null, when = 0) {
  if (sfxMuted || !audioCtx || !masterGain) return;
  const t = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(t); osc.stop(t + dur + 0.02);
}

/**
 * 和弦：多个频率同时发声。用于成就/解锁等正向反馈，比单 beep 更有"分量"。
 */
function chord(freqs, dur, type = "triangle", vol = 0.08, when = 0) {
  for (const f of freqs) beep(f, dur, type, vol, null, when);
}

/** 节流：限制同一种音效在窗口内最多播放 N 次，避免高频叠加成噪音 */
function throttled(key, windowMs) {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  const last = throttled._last[key] || 0;
  if (now - last < windowMs) return false;
  throttled._last[key] = now;
  return true;
}
throttled._last = {};

export const sfx = {
  // ---- 玩家动作 ----
  // 射击：满技能后期每秒能打 10+ 发，必须有 80ms 节流，否则叠成连续噪音
  shoot() {
    if (!throttled("shoot", 80)) return;
    beep(880, .05, "square", .04, 440);
  },
  // 普通命中：短促"啵"
  hit()      { beep(220, .10, "sawtooth", .08, 110); },
  // 击毁敌机：低沉爆裂
  boom()     {
    if (!throttled("boom", 50)) return;   // 连锁清屏时一帧几十个 boom 也会糊成一片
    beep(140, .4, "sawtooth", .15, 30);
  },
  // 爆炸 AOE（区别于 boom：更厚重 + 短促泛音）
  explosion(){
    if (!throttled("explosion", 60)) return;
    beep(100, .3, "sawtooth", .15, 30);
    beep(60, .5, "square", .08, 20);
  },
  // 分裂弹触发：高频"嗒"
  scatter()  {
    if (!throttled("scatter", 80)) return;
    beep(1200, .04, "square", .04, 600);
  },
  // 穿透弹命中（保留专用以区分普通 hit）
  penetrate(){ beep(600, .07, "sawtooth", .05, 300); },

  // ---- 升级 / 道具 / 成就 ----
  // 升级 / 难度提升：上行短琶音
  power()    { beep(520, .12, "triangle", .10, 1040); },
  // 拾取普通道具：双音"叮"
  pickup()   {
    beep(660, .08, "triangle", .08, 990);
    setTimeout(() => beep(990, .10, "triangle", .06, 1320), 50);
  },
  // 解锁战机 / 天赋 / 商城购买：明亮大三和弦（C-E-G），有"获得感"
  unlock()   {
    chord([523.25, 659.25, 783.99], .35, "triangle", .07);
    setTimeout(() => beep(1046.5, .25, "triangle", .06, 1318.5), 120);
  },
  // 星尘不足 / 已解锁 / 前置未达成：低沉短"不"
  deny()     { beep(180, .15, "sawtooth", .08, 120); },
  // 成就达成：上行琶音 + 收尾高音
  achievement() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      setTimeout(() => beep(f, .15, "triangle", .09), i * 90)
    );
  },
  // 新纪录：四音 fanfare
  newbest()  {
    [659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      setTimeout(() => beep(f, .2, "triangle", .10), i * 110)
    );
  },
  // 复活：上行 + 高音延音
  revive()   {
    beep(440, .15, "triangle", .10, 660);
    setTimeout(() => beep(660, .15, "triangle", .10, 880), 130);
    setTimeout(() => beep(880, .25, "triangle", .10, 1320), 260);
  },

  // ---- Boss / 警告 ----
  // Boss 即将来袭 / 虫群预警：低音双击 + 长延音，比 power 更有压迫感
  warn()     {
    beep(180, .12, "square", .10);
    setTimeout(() => beep(180, .12, "square", .10), 160);
    setTimeout(() => beep(140, .5, "sawtooth", .10, 70), 320);
  },
  // Boss 来袭（已生成）：低沉鼓声
  bossSpawn(){
    beep(80, .8, "sawtooth", .18, 40);
    beep(160, .3, "square", .08, 60, 0);
  },
  // Boss 相位切换：金属击打
  bossPhase(){
    beep(420, .12, "square", .10, 200);
    setTimeout(() => beep(620, .10, "sawtooth", .07), 80);
  },

  // ---- UI 交互 ----
  // 通用点击（暂停/继续/难度选择/菜单分页/开关切换/取消）
  click()    { beep(760, .035, "square", .045, 520); },
  // 玩家死亡：三音下行
  over()     {
    beep(392, .2, "triangle", .12);
    setTimeout(() => beep(311, .2, "triangle", .12), 180);
    setTimeout(() => beep(233, .45, "triangle", .12, 180), 360);
  },
};

// ---------- 背景音乐 ----------
// 三层结构：
//   bass  —— 8 步循环低音铺底（不变）
//   arp   —— 4 步琶音（每两步发一声），combo 高时加强（音量 + 加发）
//   lead  —— 偶数循环叠加一条短旋律，避免长时听感单一
// 调度用 setInterval 推进 stepIndex，每个 step 在 audioCtx 时间轴上排音符。
let musicNodes = [];   // 已调度但未播完的音乐节点（stopMusic 立即静音用）
let musicTimer = null;
let musicStep = 0;
let musicIntensity = 1;   // 0.6~1.4，由 setMusicIntensity 调，combo 高时拉高

const MUSIC_BASS = [55, 55, 65.4, 55, 73.4, 55, 65.4, 49];
const MUSIC_ARP = [220, 277.2, 329.6, 440];
const MUSIC_LEAD = [0, 0, 0, 440, 0, 0, 523.25, 0, 0, 0, 0, 392, 0, 0, 329.6, 0]; // 16 步稀疏旋律

function playbackNote(freq, t, dur, vol, type = "triangle", target = musicGain) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(target || masterGain);
  musicNodes.push(osc);
  osc.onended = () => {
    const i = musicNodes.indexOf(osc);
    if (i !== -1) musicNodes.splice(i, 1);
  };
  osc.start(t); osc.stop(t + dur + 0.02);
}

/** 开始背景音乐（无音频上下文的浏览器自动静默） */
export function startMusic() {
  stopMusic();
  if (musicMuted) return;
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  const step = 0.35; // 每步时长
  let next = audioCtx.currentTime + 0.05;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!audioCtx || audioCtx.state !== "running") return;
    const t = audioCtx.currentTime + 0.05;

    // 低音铺底（每8步一个循环）
    const bass = MUSIC_BASS[musicStep % MUSIC_BASS.length];
    playbackNote(bass, t, step * 1.6, 0.06 * musicIntensity, "sawtooth");

    // 中音琶音（每4步一个循环，隔一发声；combo 高时每步都发）
    if (musicStep % 2 === 0 || musicIntensity > 1.15) {
      const arp = MUSIC_ARP[(musicStep >> 1) % MUSIC_ARP.length];
      playbackNote(arp, t, step * 1.2, 0.03 * musicIntensity, "triangle");
    }

    // 旋律：每 16 步一循环，稀疏铺点，让长时听感有变化
    const lead = MUSIC_LEAD[musicStep % MUSIC_LEAD.length];
    if (lead > 0) {
      playbackNote(lead, t, step * 1.4, 0.04 * musicIntensity, "sine");
    }

    musicStep = (musicStep + 1) & 0x3FFFFFF;   // 防 musicStep 累积成大数
  }, step * 1000);
}

/** 暂停背景音乐但保留调度状态（resume 时 startMusic 重新接上） */
export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  // 已调度但未播完的音符立即停止（否则停止音乐会漏出最长 ~0.56s 的余音）
  for (const osc of musicNodes) {
    try { osc.stop(0); } catch (_) {}
  }
  musicNodes = [];
}

/**
 * 调整 BGM 强度。combo 越高越激昂；暂停/结算时压低。
 * @param {number} v 0.5~1.4
 */
export function setMusicIntensity(v) {
  musicIntensity = Math.max(0.5, Math.min(1.4, v));
}

export function setMusicMuted(muted) {
  musicMuted = !!muted;
  if (musicMuted) stopMusic();
}

/** 暂停时把 BGM 整体压低（不停止，保留状态供 resume 无缝继续） */
export function duckMusic(on) {
  if (!audioCtx || !musicGain) return;
  try {
    const t = audioCtx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.linearRampToValueAtTime(on ? 0.12 : 0.5, t + 0.2);
  } catch (_) {}
}
