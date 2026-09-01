/* ===========================================================
 * config.js — 全局常量 & 数值配置
 * =========================================================== */

// 逻辑分辨率（运行时按窗口比例自适应：竖屏变窄填满、零裁切零黑边）
export let W = 480;
export let H = 720;

const BASE_W = 480;   // 横屏/桌面基准
const BASE_H = 720;
const MIN_W = 320;    // 竖屏下逻辑宽度下限，避免过度压窄

// 字体缩放比例：逻辑宽度越窄，字体等比缩小，保证 CSS 缩放后视觉字号不变
export function fontScale() { return W / BASE_W; }

/**
 * 按窗口比例自适应逻辑分辨率：竖屏(宽<高)时高度锁 720、宽度按窗口比例
 * 缩窄以填满屏幕（零黑边零裁切）；横屏保持 480×720 基准。
 * 返回 {w,h,scale} 供 canvas 设置。
 */
export function computeViewport() {
  const iw = window.innerWidth, ih = window.innerHeight;
  if (iw < ih) {
    // 竖屏：高度锁 BASE_H，宽度按屏幕比例等比缩窄
    const w = Math.max(MIN_W, Math.round(BASE_H * iw / ih));
    return { w, h: BASE_H, scale: ih / BASE_H };
  }
  // 横屏：基准尺寸 + 等比缩放（保留两侧黑边不裁切）
  const s = Math.min(iw / BASE_W, ih / BASE_H);
  return { w: BASE_W, h: BASE_H, scale: s };
}

/** 应用新逻辑分辨率（由 resize 调用） */
export function setViewport(w, h) {
  W = w; H = h;
}
export const TAU = Math.PI * 2;

// 游戏状态
export const STATE = { MENU: 0, PLAYING: 1, OVER: 2, LEVELUP: 3, PAUSED: 4, TUTORIAL: 5 };

// ---------- 玩家 ----------
export const PLAYER_BASE = {
  speed: 6.2,
  radius: 18,       // 碰撞半径
  width: 44,
  height: 52,
  fireInterval: 0.16,   // 基础射击间隔(秒)
  invincibleTime: 2.2,
  maxShield: 3,
  startLives: 3,
};

// ---------- 子弹 ----------
export const BULLET = {
  baseSpeed: 6,
  baseRange: 250,       // 起始射程(像素)
  rangePerLevel: 150,   // 每级射程+6m（1m=25px）
  refireDist: 250,      // 再次发射所需子弹飞行距离（10m，1m=25px）：子弹飞超此距离或销毁即可再射
  baseRadius: 4,
  critRadius: 5.5,
  baseDmg: 1,
  critChance: 0.12,
  critMulti: 2.5,
  // 分裂弹（命中后分裂）
  splitDmgRatio: 0.35,     // 分裂弹碎片伤害比例
  splitCountPerLevel: 2,   // 每级分裂弹额外分裂数量（1级=2碎片）
  splitSpeed: 7,
  splitLife: 0.6,
  // 连射 / 散射（发射时多发子弹）
  volleySpacing: 14,       // 连射子弹前后间距
  scatterSpread: 0.09,     // 散射每发子弹的扩散角
  explosionDmgRatio: 0.55, // 爆炸AOE伤害比例
  explosionBaseRadius: 40,
  explosionRadiusPerLevel: 25,
  // 性能极限：防止连锁爆炸把帧率打爆
  explosionMaxRadius: 250,      // 爆炸半径硬上限
  explosionMaxChainDepth: 2,    // 连锁递归最大深度（第 3 层只伤不再爆）
  explosionParticlesPerHit: 8,  // 每次爆炸最多生成的粒子数
  fxRingsCap: 48,               // 同时存在的爆炸波纹上限（单帧超过即丢弃最旧的）
  // 天基武器（子弹出膛后加速）
  orbitalAccel: 0.035,          // 每帧加速度基数
  orbitalAccelPerLevel: 0.015,  // 每级额外加速度
  orbitalMaxSpeed: 22,          // 速度上限
  orbitalTrailRate: 3,          // 每N帧生成一个拖尾粒子
};

// ---------- 敌方等级 ----------
export const ENEMY_LEVEL = {
  scorePerLevel: 3000,    // 每3000分敌方升1级
  hpPerLevel: 0.15,       // 每级HP +15%
  fireCdPerLevel: -0.05,  // 每级开火间隔 -5%（越快）
  rewardPerLevel: 0.10,   // 每级得分/经验 +10%
};

// ---------- 敌机 ----------
export const ENEMY_TYPES = {
  small:  { r: 16, hp: 1,  score: 100, xp: 8,   speed: 2.4, color: "#ff6b6b", fireCd: [4, 6] },
  mid:    { r: 24, hp: 3,  score: 300, xp: 20,  speed: 1.6, color: "#ffa94d", fireCd: [3.2, 3.2] },
  big:    { r: 36, hp: 8,  score: 800, xp: 45,  speed: 1.0, color: "#d0bfff", fireCd: [2.2, 2.2] },
  laser:  { r: 22, hp: 4,  score: 400, xp: 25,  speed: 1.4, color: "#ff4444", fireCd: [2.5, 3.5] },
  shield: { r: 28, hp: 6,  score: 500, xp: 30,  speed: 1.2, color: "#44aaff", fireCd: [3, 4] },
  split:  { r: 20, hp: 3,  score: 250, xp: 15,  speed: 1.8, color: "#66dd66", fireCd: [3.5, 5] },
};

// ---------- 道具 ----------
export const POWERUP_DEFS = {
  power:  { icon: "P", color: "#ffd166", name: "火力升级" },
  life:   { icon: "♥", color: "#7CFC00", name: "生命+1" },
  shield: { icon: "S", color: "#66e0ff", name: "护盾+1" },
  bomb:   { icon: "B", color: "#ff6b6b", name: "全屏炸弹" },
  rapid:  { icon: "⚡", color: "#ffe066", name: "急速射击" },
  speed:  { icon: "»", color: "#9be8ff", name: "引擎加速" },
  freeze: { icon: "❄", color: "#8ad4ff", name: "冰冻全场" },
  magnet: { icon: "M", color: "#d0a6ff", name: "磁铁吸引" },
  double: { icon: "×", color: "#ffa8d9", name: "双倍分数" },
};

// 道具权重分早期/后期两套（随难度等级切换）：
// 早期(level 1)：加血拔高，急速/火力/加速/双倍等影响平衡的道具压低
// 后期(level>=2)：加血仍略高于默认，平衡道具整体下调，磁铁上调保证后期可用
export const POWERUP_WEIGHTS_EARLY = [
  ["power", 16], ["rapid", 7], ["shield", 14], ["life", 30],
  ["speed", 5], ["double", 5], ["freeze", 6], ["magnet", 12], ["bomb", 3],
];
export const POWERUP_WEIGHTS_LATE = [
  ["power", 20], ["rapid", 9], ["shield", 14], ["life", 16],
  ["speed", 6], ["double", 6], ["freeze", 7], ["magnet", 11], ["bomb", 4],
];

// ---------- 技能 ----------
export const SKILLS = [
  { id: "dmg",       name: "火力强化",   desc: "子弹伤害 +1",             color: "#ffd166", max: 5 },
  { id: "rate",      name: "射速提升",   desc: "射击间隔 -8%",            color: "#ffe066", max: 3 },
  { id: "range",     name: "射程延伸",   desc: "子弹射程 +6m",            color: "#88ddff", max: 5 },
  { id: "move",      name: "机动强化",   desc: "移动速度 +10%",           color: "#9be8ff", max: 3 },
  { id: "maxhp",     name: "生命强化",   desc: "最大生命 +1 并立即 +1",   color: "#7CFC00", max: 2 },
  { id: "shield",    name: "护盾强化",   desc: "获得 1 层护盾",           color: "#66e0ff", max: 2 },
  { id: "crit",      name: "精准打击",   desc: "12% 概率造成 2.5 倍伤害", color: "#ff8fa3", max: 3 },
  { id: "dual",      name: "侧翼炮",     desc: "增加 2 发侧翼子弹",       color: "#c8a6ff", max: 2 },
  { id: "explosion", name: "爆炸弹",     desc: "子弹命中产生范围爆炸",     color: "#ff6633", max: 3 },
  { id: "volley",    name: "连射",       desc: "每轮多射出一发连射子弹（一前一后）", color: "#ffe066", max: 4 },
  { id: "scatter",   name: "散射",       desc: "每次发射同时增加一发散射子弹", color: "#44ee88", max: 4 },
  { id: "split",     name: "分裂弹",     desc: "子弹命中后分裂，等级越高分裂越多", color: "#7bd67b", max: 3 },
  { id: "penetrate", name: "穿透弹",     desc: "子弹可穿透 +1 个敌人（伤害不衰减）", color: "#aa66ff", max: 3 },
  { id: "guard",     name: "护体弹",     desc: "特殊子弹围绕己方旋转，命中后消失", color: "#7bf1a8", max: 3 },
  { id: "lifesteal", name: "能量吸取",   desc: "击毁敌机 15% 回复生命",   color: "#ff6b9d", max: 2 },
  { id: "xpboost",   name: "经验增幅",   desc: "获得经验 +15%",           color: "#8ad4ff", max: 3 },
  { id: "magnet",    name: "磁力核心",   desc: "永久吸引道具",            color: "#d0a6ff", max: 1 },
  { id: "score",     name: "幸运金币",   desc: "得分 +10%",               color: "#f4c95d", max: 3 },
  { id: "bulletSpeed", name: "子弹加速", desc: "子弹飞行速度 +20%",       color: "#74c0fc", max: 3 },
  { id: "orbital",   name: "天基武器",   desc: "子弹射出后不断加速，威力递增", color: "#fca311", max: 3 },
];

// ---------- 难度 ----------
export const DIFFICULTY = {
  levelUpScore: 5000,       // 每多少分升一级
  maxLevel: 10,
  eliteWaveInterval: 12,    // 精英波间隔(秒)
  spawnBase: 1.6,
  spawnPerLevel: 0.12,
  spawnCap: 4.2,
  speedScalePerLevel: 0.06,
  bossInterval: 5,          // 每N个难度等级出Boss
};

// ---------- 难度档位 ----------
export const DIFFICULTY_PRESETS = {
  easy: {
    name: "简单",
    desc: "休闲玩法 · 更慢的敌机与更少的弹幕",
    color: "#7CFC00",
    hpScale: 0.8,        // 敌机血量
    speedScale: 0.8,     // 敌机速度
    spawnScale: 0.7,     // 生成率
    enemyFireScale: 0.6, // 敌方子弹速度
    fireCdScale: 1.4,    // 敌机开火间隔
    scoreScale: 1.2,     // 得分加成
    playerSpeedScale: 1.0,
    startSkills: { orbital: 1 },
  },
  normal: {
    name: "普通",
    desc: "标准体验 · 平衡的挑战",
    color: "#5ee6ff",
    hpScale: 1.0,
    speedScale: 1.0,
    spawnScale: 1.0,
    enemyFireScale: 1.0,
    fireCdScale: 1.0,
    scoreScale: 1.0,
    playerSpeedScale: 1.0,
  },
  hard: {
    name: "困难",
    desc: "硬核弹幕 · 更高的分数与奖励",
    color: "#ff6b6b",
    hpScale: 1.4,
    speedScale: 1.15,
    spawnScale: 1.3,
    enemyFireScale: 1.3,
    fireCdScale: 0.75,
    scoreScale: 1.5,
    playerSpeedScale: 1.0,
  },
};

// ---------- 元进度 ----------
export const META = {
  stardustPerScore: 100,    // 每100分=1星尘
  aircraft: {
    falcon:  { name: "战隼", desc: "均衡型", speed: 6.2, baseDmg: 1, fireRate: 1, startHp: 3, cost: 0 },
    blaze:   { name: "烈焰", desc: "高射速", speed: 5.8, baseDmg: 0.8, fireRate: 1.3, startHp: 2, cost: 500 },
    ironwall:{ name: "铁壁", desc: "高血量", speed: 4.5, baseDmg: 1.2, fireRate: 0.8, startHp: 5, cost: 500 },
    phantom: { name: "幻影", desc: "高机动", speed: 8.0, baseDmg: 0.9, fireRate: 1.1, startHp: 2, cost: 800 },
    thor:    { name: "雷神", desc: "爆炸弹", speed: 5.5, baseDmg: 0.7, fireRate: 1.0, startHp: 3, cost: 1000, startSkills: { explosion: 1 } },
    void_:   { name: "虚空", desc: "穿透弹", speed: 5.8, baseDmg: 1.0, fireRate: 1.0, startHp: 3, cost: 1200, startSkills: { penetrate: 1 } },
  },
  talents: [
    { id: "t_dmg1",   name: "攻击强化I",   desc: "基础伤害+1",           branch: "offense", cost: 100, effect: { baseDmg: 1 } },
    { id: "t_dmg2",   name: "攻击强化II",  desc: "基础伤害+1",           branch: "offense", cost: 200, effect: { baseDmg: 1 }, requires: "t_dmg1" },
    { id: "t_rate1",  name: "射速强化I",   desc: "射击间隔-10%",         branch: "offense", cost: 150, effect: { fireRateMul: 0.9 } },
    { id: "t_crit1",  name: "暴击强化I",   desc: "暴击率+5%",            branch: "offense", cost: 200, effect: { critAdd: 0.05 } },
    { id: "t_hp1",    name: "生命强化I",   desc: "最大生命+1",           branch: "defense", cost: 100, effect: { startHp: 1 } },
    { id: "t_hp2",    name: "生命强化II",  desc: "最大生命+1",           branch: "defense", cost: 200, effect: { startHp: 1 }, requires: "t_hp1" },
    { id: "t_shield1",name: "护盾强化I",   desc: "护盾上限+1",           branch: "defense", cost: 250, effect: { maxShield: 1 } },
    { id: "t_inv1",   name: "无敌延长I",   desc: "无敌时间+0.5s",        branch: "defense", cost: 150, effect: { invTime: 0.5 } },
    { id: "t_xp1",    name: "经验强化I",   desc: "经验获取+20%",         branch: "utility", cost: 100, effect: { xpGain: 0.2 } },
    { id: "t_drop1",  name: "掉落强化I",   desc: "道具掉落率+5%",        branch: "utility", cost: 150, effect: { dropRate: 0.05 } },
    { id: "t_start1", name: "起始强化I",   desc: "起始武器等级+1",       branch: "utility", cost: 300, effect: { startPower: 1 } },
    { id: "t_range1", name: "射程强化I",   desc: "起始射程+80",          branch: "utility", cost: 200, effect: { startRange: 80 } },
  ],
};
