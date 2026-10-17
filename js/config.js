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
export const STATE = { MENU: 0, PLAYING: 1, OVER: 2, LEVELUP: 3, PAUSED: 4, TUTORIAL: 5, REVIVE: 6, GACHA: 7 };

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
  baseSpeed: 3,          // 玩家主弹初速；已较初版再减半，配合更慢射速让前期更吃力（敌弹速度独立，不受影响）
  baseRange: 250,          // 起始射程(像素)
  rangePerLevel: 50,       // 射程延伸技能：每级射程+2m（1m=25px）
  levelRangePerLevel: 2.5,   // 升级加成：玩家每升1级射程+0.1m（线性，避免指数放大）
  rangeCapMargin: 80,      // 射程硬上限 = 屏幕高度 + 80，防止溢出屏外
  refireDist: 250,      // 再次发射所需子弹飞行距离（10m，1m=25px）：子弹飞超此距离或销毁即可再射
  // 每波子弹总量上限：按通道对称裁剪，保持弹道美观。
  // 注：射击模型改为「按间隔驱动」后同屏波数约为此前的 4 倍，
  // 因此单波上限由 24 下调到 16，避免后期一屏上百发失去队形感。
  waveCap: 16,
  screenCap: 140,       // 同屏友方子弹硬上限：超过则本轮不发射（性能与画面密度兜底）
  baseRadius: 4,
  critRadius: 5.5,
  baseDmg: 1,
  critChance: 0.12,
  critMulti: 1.5,
  // 击退：每级 30% 伤害转成击退力（像素），护体弹自动拥有击退
  knockbackPerLevel: 0.30,
  // 分裂弹（命中后分裂）
  splitDmgRatio: 0.30,     // 分裂弹碎片伤害比例（满级6片，降权防爆量）
  splitCountPerLevel: 1,   // 每级 +1 个碎片：1级 = 2 片，2级 = 3 片 …… 满级 6 片
  splitSpeed: 6,
  // 分裂弹·距离技能「分裂距离」：碎片射程（飞行距离）随等级增长
  splitFragBaseRange: 25,      // 碎片基础射程 = 1m（1m=25px）：未学「分裂距离」时碎片近距爆散
  splitFragRangePerLevel: 60,  // 每级碎片射程 +60px，满级 +300px
  // 连射 / 散射（发射时多发子弹）
  volleyAngleGap: 0.04,    // 连射子弹之间的等间距偏转角（弧度）：收窄成束，不占横向宽度
  scatterSpread: 0.06,     // 散射每发子弹的扩散角：每级 ± 等距对称展开（略收窄，让散射优先于连射入队）
  explosionBaseRadius: 40,
  explosionRadiusPerLevel: 12,  // 每级 +12px 半径
  // 爆炸几率基础值（explosion 技能解锁后），expChance 技能每级再加
  explosionBaseChance: 0.10,
  explosionChancePerLevel: 0.10,
  // 爆炸伤害基础值（explosion 技能解锁后），expDmg 技能每级再加
  explosionBaseDmgRatio: 0.45,
  explosionDmgRatioPerLevel: 0.15,
  // 性能极限
  explosionMaxRadius: 250,
  explosionMaxChainDepth: 2,
  explosionParticlesPerHit: 8,
  fxRingsCap: 48,
  // 爆炸闪光数量上限：每个闪光每帧都要新建一次径向渐变，
  // 旧实现只对 fxRings 封顶、漏了这个，连锁清屏时一帧几十个渐变直接砸帧率
  fxBlastsCap: 24,
  // 天基武器（子弹出膛后加速）
  orbitalAccel: 0.035,          // 每帧加速度基数
  orbitalAccelPerLevel: 0.015,  // 每级额外加速度
  orbitalMaxSpeed: 22,          // 速度上限
};

// ---------- 敌方等级 ----------
export const ENEMY_LEVEL = {
  scorePerLevel: 6000,    // 每6000分敌方升1级（原 8000 太慢，中期几乎感觉不到成长）
  hpPerLevel: 0.10,       // 每级HP +10%
  fireCdPerLevel: -0.03,  // 每级开火间隔 -3%（越快）
  rewardPerLevel: 0.10,   // 每级得分/经验 +10%
  maxLevel: 99,           // 敌方等级硬上限（不再卡在 30 级停涨）
  softCapLevel: 30,       // 超过此等级后成长减半，避免后期数值爆炸
  softCapFactor: 0.5,     // 软上限后每级只按 50% 计入成长
};

/**
 * 敌方等级 → 成长系数（等价于旧版的 elvl-1）。
 * 30 级以内线性成长；之后每级只按 softCapFactor 计入，
 * 保证「等级一直涨」但难度曲线不失控。
 */
export function enemyLevelScale(elvl) {
  const lv = Math.max(1, Math.floor(elvl || 1));
  const linear = Math.min(lv, ENEMY_LEVEL.softCapLevel) - 1;
  const over = Math.max(0, lv - ENEMY_LEVEL.softCapLevel);
  return linear + over * ENEMY_LEVEL.softCapFactor;
}

/**
 * 射击波间隔距离：与射击间隔联动，使射速提升真正生效。
 * 旧实现固定 250px，导致射速技能/急速道具被飞行距离闸门抵消。
 * @param {number} fireRate 当前射击间隔(秒)
 */
export function refireGateDistance(fireRate) {
  const px = BULLET.baseSpeed * 60 * Math.max(0.02, fireRate);
  // 下限 36 → 20：旧下限会把「急速射击」(间隔 55ms) 的波频硬压到 200ms 一波，
  // 8 秒爆发直接少掉 2/3。同屏子弹数量的最终闸门是 BULLET.screenCap，这里不必再卡一道。
  return Math.min(BULLET.refireDist, Math.max(20, px));
}

/**
 * 当前玩家射击间隔(秒) —— 射击节奏的唯一真源。
 * player.js 的开火逻辑、ui.js 的暂停面板/HUD 展示都读它。
 * 旧实现在 ui.js 里另抄了一份 (0.16 - power*0.012)，与真值差 3.8 倍。
 * 基础间隔 0.56 是两度放慢的结果（0.16 → 0.28 → 0.56），起步约 2 发/秒，前期偏吃力。
 */
export function calcFireRate(player) {
  const frMul = player.fireRateMul || 1;
  if (player.buffs.rapid > 0) return 0.055 * frMul;
  if (player.buffs.madHunt > 0) return 0.045 * frMul;
  const power = Math.max(1, player.power || 1);
  return (0.56 - (power - 1) * 0.04) * (1 - 0.08 * (player.skills.rate || 0)) * frMul;
}

/** 子弹射程(像素)：fireBullet、HUD、暂停面板共用，避免三处各写一份常量而漂移 */
export function calcRangePx(player) {
  const rangeLvl = player.skills.range || 0;
  const levelBonus = ((player.level || 1) - 1) * BULLET.levelRangePerLevel;
  return Math.min(
    BULLET.baseRange + rangeLvl * BULLET.rangePerLevel + levelBonus,
    H + BULLET.rangeCapMargin
  );
}

/** 当前暴击率(0~1)：HUD/暂停面板共用，避免把 0.12 抄成 12 再乘 100 */
export function calcCritChance(player) {
  return BULLET.critChance * (player.skills.crit || 0) + (player.talentCrit || 0);
}

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
  life:   { icon: "L", color: "#7CFC00", name: "生命+1" },
  shield: { icon: "S", color: "#66e0ff", name: "护盾+1" },
  madHunt: { icon: "F", color: "#fca311", name: "疯狂追击" },
  rapid:  { icon: "R", color: "#ffe066", name: "急速射击" },
  speed:  { icon: "V", color: "#9be8ff", name: "引擎加速" },
  freeze: { icon: "Z", color: "#8ad4ff", name: "冰冻全场" },
  magnet: { icon: "M", color: "#d0a6ff", name: "磁铁吸引" },
  double: { icon: "X", color: "#ffa8d9", name: "双倍分数" },
  xppack: { icon: "E", color: "#8ad4ff", name: "经验包" },
  skillup:     { icon: "+", color: "#fca311", name: "技能+1",     unique: true },
  drop: { icon: "D", color: "#ffd93b", name: "幸运爆率" },
  critboost: { icon: "C", color: "#ff8fa3", name: "致命暴击" },
  knockback: { icon: "K", color: "#5ee6ff", name: "子弹击退" },
  randomSkill: { icon: "?", color: "#d0a6ff", name: "技能随机获取", unique: true },
};

// ---------- 道具掉落率 ----------
export const POWERUP_DROP = {
  base: 0.18,            // 击杀基础掉落率（原 0.15，配合更高的敌机密度略上调）
  skillPerLevel: 0.05,   // 爆率技能每级 +5%
  buffBonus: 0.10,        // 幸运爆率 buff 期间额外 +10%
};

// 道具权重分早期/后期两套（随难度等级切换）：
// 早期(level 1)：加血拔高，急速/火力/加速/双倍等影响平衡的道具压低
// 后期(level>=2)：加血仍略高于默认，平衡道具整体下调，磁铁上调保证后期可用
// 经验包：前后期都常见；技能+1：后期稍高但保持稀有
export const POWERUP_WEIGHTS_EARLY = [
  ["power", 16], ["rapid", 7], ["shield", 14], ["life", 30],
  ["speed", 5], ["double", 5], ["freeze", 6], ["magnet", 12], ["madHunt", 3],
  ["xppack", 12], ["skillup", 4], ["drop", 7], ["critboost", 5], ["knockback", 6],
];
export const POWERUP_WEIGHTS_LATE = [
  ["power", 20], ["rapid", 9], ["shield", 14], ["life", 16],
  ["speed", 6], ["double", 6], ["freeze", 7], ["magnet", 11], ["madHunt", 4],
  ["xppack", 10], ["skillup", 6], ["drop", 6], ["critboost", 7], ["knockback", 6],
];

// ---------- 系统商城：星尘兑换永久加成（500起，每级翻倍） ----------
export const SHOP_ITEMS = [
  { id: "baseDmg",    name: "基础火力",   icon: "⚔", desc: "基础伤害 +1",           baseCost: 150, max: 5, effect: (n) => ({ baseDmg: n }) },
  { id: "baseFire",   name: "基础射速",   icon: "⚡", desc: "射击间隔 -4%",         baseCost: 150, max: 5, effect: (n) => ({ fireRateMul: 1 - 0.04 * n }) },
  { id: "startHp",    name: "起始生命",   icon: "♥", desc: "开局生命 +1",          baseCost: 150, max: 3, effect: (n) => ({ startHp: n }) },
  { id: "startShield",name: "起始护盾",   icon: "S", desc: "开局护盾 +1",          baseCost: 150, max: 2, effect: (n) => ({ maxShield: n }) },
  { id: "explosion",  name: "爆炸伤害",   icon: "✴", desc: "爆炸AOE伤害 +10%",    baseCost: 150, max: 4, effect: (n) => ({ expDmgBonus: 0.10 * n }) },
  { id: "xpGain",     name: "经验获取",   icon: "X", desc: "获得经验 +10%",         baseCost: 150, max: 5, effect: (n) => ({ xpGain: 0.10 * n }) },
  { id: "score",      name: "金币加成",   icon: "¥", desc: "得分 +5%",            baseCost: 150, max: 5, effect: (n) => ({ scoreBonus: 0.05 * n }) },
  { id: "dropRate",   name: "道具掉落",   icon: "☘", desc: "掉落率 +5%",           baseCost: 150, max: 4, effect: (n) => ({ dropRate: 0.05 * n }) },
  { id: "invTime",    name: "无敌时间",   icon: "✦", desc: "受伤无敌时间 +0.2s",   baseCost: 150, max: 3, effect: (n) => ({ invTime: 0.2 * n }) },
];

// 每级成本按 1.6 倍递增（原 2 倍：满级单件要 15500 星尘，配合旧的星尘产出几乎不可能点满）
export function getShopItemCost(item, owned) {
  return Math.round(item.baseCost * Math.pow(1.6, owned));
}

// ---------- 技能 ----------
export const SKILLS = [
  { id: "dmg",       name: "火力强化",   desc: "伤害+1",         fullDesc: "每级子弹基础伤害 +1，满级 +10",               color: "#5ee6ff", max: 10 },
  { id: "rate",      name: "射速提升",   desc: "间隔-8%",        fullDesc: "每级射击间隔缩短 8%，满级 -48%",              color: "#5ee6ff", max: 6 },
  { id: "range",     name: "射程延伸",   desc: "射程+2m",        fullDesc: "每级子弹射程 +2m，满级 +20m",                 color: "#5ee6ff", max: 10 },
  { id: "move",      name: "机动强化",   desc: "移速+12%",       fullDesc: "每级移动速度 +12%，满级 +72%",                color: "#5ee6ff", max: 6 },
  { id: "maxhp",     name: "生命强化",   desc: "最大生命+1",     fullDesc: "每级最大生命 +1 并立即回复 1 点",             color: "#7CFC00", max: 4 },
  { id: "shield",    name: "护盾强化",   desc: "获得1层护盾",    fullDesc: "获得 1 层护盾，可抵消 1 次伤害",              color: "#7CFC00", max: 4 },
  { id: "crit",      name: "精准打击",   desc: "12%暴击",        fullDesc: "每级 12% 概率触发暴击，满级 72%",            color: "#ff8fa3", max: 6 },
  { id: "critdmg",   name: "致命暴击",   desc: "暴击伤害+0.5",   fullDesc: "每级暴击伤害倍率 +0.5，满级 +3",             color: "#ff8fa3", max: 6 },
  { id: "dual",      name: "侧翼炮",     desc: "+2发侧翼子弹",   fullDesc: "增加 2 发侧翼子弹，满级 8 发",                color: "#5ee6ff", max: 4 },
  { id: "sideBullets", name: "左右护法", desc: "左右缓慢发射", fullDesc: "从机身两侧缓慢向左、右水平发射副炮，每级 +20% 伤害，满级左右各 5 发", color: "#5ee6ff", max: 5 },
  { id: "explosion", name: "爆炸弹",     desc: "解锁爆炸弹",     fullDesc: "子弹命中时有概率产生范围爆炸，是爆炸系技能的基础",         color: "#ff8a55", max: 1 },
  { id: "expChance", name: "爆破掌握",   desc: "爆炸几率+10%",  fullDesc: "每级爆炸触发几率 +10%，满级 +60%",                    color: "#ff8a55", max: 6, requires: "explosion" },
  { id: "expDmg",    name: "爆裂强化",   desc: "爆炸伤害+18%",  fullDesc: "每级爆炸 AOE 伤害 +18%，满级 +108%",                   color: "#ff8a55", max: 6, requires: "explosion" },
  { id: "expRange",  name: "冲击扩域",   desc: "爆炸范围+12px", fullDesc: "每级爆炸半径 +12px，满级 +72px",                       color: "#ff8a55", max: 6, requires: "explosion" },
  { id: "volley",    name: "连射",       desc: "多射1发",        fullDesc: "每轮多射出一发连射子弹，收束于主弹道侧，满级 6 发", color: "#5ee6ff", max: 6 },
  { id: "scatter",   name: "散射",       desc: "多发1发",        fullDesc: "每次升级增加一发散射，左右交替展开，满级 6 发",      color: "#5ee6ff", max: 6 },
  { id: "split",     name: "分裂弹",     desc: "命中后分裂",     fullDesc: "命中后碎裂出弹片并继续沿原方向飞行：1级 2 片，每级 +1，满级 6 片", color: "#ff8a55", max: 5 },
  { id: "splitDist", name: "分裂距离",   desc: "碎片射程+60",    fullDesc: "分裂碎片飞行距离每级 +60，满级碎片飞得更远",    color: "#ff8a55", max: 5, requires: "split" },
  { id: "penetrate", name: "穿透弹",     desc: "穿透+1敌",       fullDesc: "子弹可穿透额外 +1 个敌人，满级穿透 6 个",      color: "#5ee6ff", max: 6 },
  { id: "guard",     name: "护体弹",     desc: "环绕子弹击退",   fullDesc: "环绕子弹自动击退敌机，每级上限 +1（1级2颗、满级6颗），间隔随等级缩短", color: "#7CFC00", max: 5 },
  { id: "lifesteal", name: "能量吸取",   desc: "15%击杀回血",    fullDesc: "每级 15% 概率击毁敌机回复 1 生命",            color: "#7CFC00", max: 4 },
  { id: "xpboost",   name: "经验增幅",   desc: "经验+15%",       fullDesc: "每级获得经验 +15%，满级 +90%",                color: "#c8a6ff", max: 6 },
  { id: "magnet",    name: "磁力核心",   desc: "永久吸道具",     fullDesc: "永久自动吸引附近道具",                        color: "#c8a6ff", max: 1 },
  { id: "score",     name: "幸运金币",   desc: "得分+10%",       fullDesc: "每级得分 +10%，满级 +60%",                    color: "#c8a6ff", max: 6 },
  { id: "drop",      name: "爆率提升",   desc: "掉落+5%",        fullDesc: "每级道具掉落率 +5%，满级 +30%",               color: "#c8a6ff", max: 6 },
  { id: "knockback", name: "子弹击退",   desc: "击退+30%",       fullDesc: "子弹命中击退敌机，每级 +30% 击退力",          color: "#c8a6ff", max: 6 },
  { id: "bulletSpeed", name: "子弹加速", desc: "弹速+15%",      fullDesc: "每级子弹飞行速度 +15%，满级 +90%",            color: "#5ee6ff", max: 6 },
  { id: "orbital",   name: "天基武器",   desc: "加速递增",       fullDesc: "子弹射出后不断加速，威力递增",                color: "#5ee6ff", max: 5 },
];

/** 取技能满级上限（供难度档位/道具授予按真实上限钳制，避免写死数字后与 SKILLS 脱节） */
export function skillMax(id) {
  const s = SKILLS.find(x => x.id === id);
  return s ? s.max : 0;
}

// 技能等级 → 颜色档位（选择界面按当前等级着色）
// 1: 暗白(新技能/低级)  2-4: 功能组色(中级)  5+: 金(高级/大师)
export function skillLevelColor(lv) {
  if (lv >= 5) return "#ffd166";  // 金：高级/大师
  if (lv >= 2) return null;       // null = 用技能本身的功能组色
  return "rgba(255,255,255,.6)";  // 1级：暗白
}

// ---------- 难度 ----------
export const DIFFICULTY = {
  levelUpScore: 4500,       // 每多少分升一级
  maxLevel: 14,             // 原 10 级（5 万分）就封顶，后期只剩敌方等级在涨，压迫感断档
  eliteWaveInterval: 12,    // 精英波间隔(秒)
  spawnBase: 1.6,
  spawnPerLevel: 0.18,      // 原 0.12：满级也只到 2.8/s，提升幅度偏弱
  spawnCap: 4.0,
  speedScalePerLevel: 0.045, // 原 0.06：敌机下落太快会挤压闪避空间，手感变差
  bossInterval: 5,          // 每N个难度等级出Boss
  swarmInterval: 30,        // 虫群波间隔(秒)
  swarmWarnTime: 3,         // 虫群波提前预警时间(秒)
  swarmMinLevel: 2,        // 虫群波最低难度等级
  powerupCap: 30,           // 同屏道具上限：连锁清屏一帧掉几十个会糊屏幕 + 砸帧率
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
    scoreScale: 0.8,     // 得分加成（简单模式得分对应减少）
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

// ---------- 连击 / 经验 / 近战判定 ----------
export const COMBO = {
  window: 2.5,        // 连击窗口（秒）：窗口内继续击杀则连击延续
  bonus: 500,         // 每次击杀的连击加分
};
export const XP_BASE = 60;          // 1 级升 2 级所需经验
// 升级需求增长系数：原 1.4 时 20 级需近万点经验，后期几乎升不动
export const XP_GROWTH = 1.32;
export const PLAYER = {
  hitRadius: 20,      // 敌方子弹判定玩家半径（略宽于贴图便于弹幕贴身擦过）
};

// ---------- 元进度 ----------
export const META = {
  // 星尘产出：原「每 10000 分 = 1 星尘」意味着一局 2 万分只给 2 星尘，
  // 而商城/飞机/天赋动辄几百，元进度等于不存在。
  stardustPerScore: 400,     // 每400分=1星尘（一局 2 万分 ≈ 50 星尘）
  reviveCost: 40,           // 死亡后立即复活所需星尘（对局内 1 次）
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

// ---------- 成就（一次性，达成后发放星尘奖励） ----------
// cond 入参 s：{totalKills,totalBosses,totalPowerups,totalRuns,totalStardustEarned,
//              discoveredCount, runScore, runLevel, runCombo, reviveUsed}
export const ACHIEVEMENTS = [
  { id: "a_kills1",  name: "神枪手",     desc: "击落100架",     color: "#ff6b6b", reward: 100, cond: s => s.totalKills >= 100 },
  { id: "a_kills2",  name: "王牌飞行员", desc: "击落350架",     color: "#ffa94d", reward: 200, cond: s => s.totalKills >= 350 },
  { id: "a_kills3",  name: "空战之王",   desc: "击落1000架",    color: "#ffd166", reward: 400, cond: s => s.totalKills >= 1000 },
  { id: "a_score1",  name: "初破千分",   desc: "单局1000分",     color: "#74c0fc", reward: 100, cond: s => s.runScore >= 1000 },
  { id: "a_score2",  name: "分数破万",   desc: "单局万分",       color: "#66d9e8", reward: 300, cond: s => s.runScore >= 10000 },
  { id: "a_combo",   name: "连击大师",   desc: "连击30",         color: "#ff8787", reward: 150, cond: s => s.runCombo >= 30 },
  { id: "a_boss",    name: "Boss杀手",   desc: "击败10Boss",     color: "#d0bfff", reward: 250, cond: s => s.totalBosses >= 10 },
  { id: "a_level",   name: "少年军官",   desc: "单局10级",       color: "#8ad4ff", reward: 200, cond: s => s.runLevel >= 10 },
  { id: "a_skills",  name: "全技能大师", desc: "点亮全部技能",    color: "#ffd93b", reward: 500, cond: s => s.discoveredCount >= SKILLS.length },
  { id: "a_revive",  name: "凤凰涅槃",   desc: "复活续命",       color: "#ffa8d7", reward: 150, cond: s => s.reviveUsed },
  { id: "a_runs",    name: "老练飞行员", desc: "完成30局",       color: "#63e6be", reward: 200, cond: s => s.totalRuns >= 30 },
  { id: "a_stardust",name: "星尘富豪",   desc: "获得2000星尘",   color: "#d0a6ff", reward: 400, cond: s => s.totalStardustEarned >= 2000 },
];

// ---------- 每日任务（按自然日刷新，progress 字段与 questEvent 的 type 对应） ----------
export const DAILY_QUESTS = [
  { id: "q_kills",    name: "歼灭作战", desc: "今日击落 50 架敌机",  type: "kills",    target: 50,   reward: 5 },
  { id: "q_score",    name: "横扫千军", desc: "今日累计得分 5000",    type: "score",    target: 5000, reward: 5 },
  { id: "q_runs",     name: "愈战愈勇", desc: "今日完成 3 局",        type: "runs",     target: 3,    reward: 3 },
  { id: "q_boss",     name: "猎杀时刻", desc: "今日击落 2 个 Boss",  type: "boss",     target: 2,    reward: 4 },
  { id: "q_powerups", name: "补给达人", desc: "今日拾取 10 个道具",  type: "powerups", target: 10,   reward: 3 },
];

// 每日任务刷新用的本地存储 date 键（含时区感知性：按本地日期字符串）
export function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
