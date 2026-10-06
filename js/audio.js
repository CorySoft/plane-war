/* ===========================================================
 * audio.js — Web Audio 合成音效（可替换为微信 InnerAudioContext）
 * =========================================================== */

let audioCtx = null;
let sfxMuted = false;
let musicMuted = false;

export function setSfxMuted(muted) {
  sfxMuted = !!muted;
}

export function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

function beep(freq, dur, type = "square", vol = 0.12, slideTo = null) {
  if (sfxMuted || !audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}

export const sfx = {
  // UI 点击音（菜单/机库确认等）：缺失会让点击处理直接抛 TypeError
  click()    { beep(760, .04, "square", .05, 520); },
  shoot()    { beep(880, .06, "square", .05, 440); },
  hit()      { beep(220, .12, "sawtooth", .10, 110); },
  boom()     { beep(140, .5, "sawtooth", .18, 30); },
  power()    { beep(520, .15, "triangle", .12, 1040); },
  pickup()   { beep(660, .1, "triangle", .1, 990); setTimeout(() => beep(990, .12, "triangle", .08, 1320), 60); },
  over()     { beep(392, .2, "triangle", .12); setTimeout(() => beep(311, .2, "triangle", .12), 180); setTimeout(() => beep(233, .4, "triangle", .12), 360); },
  explosion(){ beep(100, .3, "sawtooth", .15, 30); beep(60, .5, "square", .08, 20); },
  scatter()  { beep(1200, .05, "square", .04, 600); },
  penetrate(){ beep(600, .08, "sawtooth", .06, 300); },
};

// ---------- 背景音乐（简化的循环铺底） ----------
let musicNodes = [];   // 已调度但未播完的音乐节点（stopMusic 立即静音用）
let musicTimer = null;
const MUSIC_BASS = [55, 55, 65.4, 55, 73.4, 55, 65.4, 49];
const MUSIC_ARP = [220, 277.2, 329.6, 440];

function playbackNote(freq, t, dur, vol, type = "triangle") {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(audioCtx.destination);
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
  let stepIndex = 0;
  let next = audioCtx.currentTime + 0.05;
  musicTimer = setInterval(() => {
    if (!audioCtx || audioCtx.state !== "running") return;
    const t = audioCtx.currentTime + 0.05;
    // 低音铺底（每8步一个循环）
    const bass = MUSIC_BASS[stepIndex % MUSIC_BASS.length];
    playbackNote(bass, t, step * 1.6, 0.06, "sawtooth");
    // 中音琶音（每4步一个循环，隔一发声）
    if (stepIndex % 2 === 0) {
      const arp = MUSIC_ARP[(stepIndex / 2) % MUSIC_ARP.length];
      playbackNote(arp, t, step * 1.2, 0.03, "triangle");
    }
    stepIndex++;
  }, step * 1000);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  // 已调度但未播完的音符立即停止（否则停止音乐会漏出最长 ~0.56s 的余音）
  for (const osc of musicNodes) {
    try { osc.stop(0); } catch (_) {}
  }
  musicNodes = [];
}

export function setMusicMuted(muted) {
  musicMuted = !!muted;
  if (musicMuted) stopMusic();
}
