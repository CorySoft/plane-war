/* ===========================================================
 * assets.js — 皮肤贴图加载（Agnes AI 生成）
 *
 * 设计原则：
 * 1. 绝不阻塞启动——Image 异步加载，加载完成前各绘制点回退到原程序化绘制，
 *    加载失败也只是永久回退，不抛错、不重试、不影响游戏循环。
 * 2. Node（测试环境）无 Image 构造器，顶层守卫直接进入「全部回退」态。
 * 3. 目录带风格 id（neon/realistic/…）：换风格=换目录=换路径，天然破除
 *    Byethost 按路径缓存的旧图问题。
 * =========================================================== */

// 当前生效的皮肤风格（换肤只改这里；重新生成贴图时换目录名同样破缓存）
export const SKIN_STYLE = "neon";

// 贴图清单：id → 文件名。与 tools/gen_skin.py 的资产清单一一对应。
const MANIFEST = {
  // 我方战机
  player_falcon: "player_falcon.png",
  player_blaze: "player_blaze.png",
  player_ironwall: "player_ironwall.png",
  player_phantom: "player_phantom.png",
  player_thor: "player_thor.png",
  player_void: "player_void.png",
  // 敌机
  enemy_small: "enemy_small.png",
  enemy_mid: "enemy_mid.png",
  enemy_big: "enemy_big.png",
  enemy_laser: "enemy_laser.png",
  enemy_shield: "enemy_shield.png",
  enemy_split: "enemy_split.png",
  // Boss
  boss_mothership: "boss_mothership.png",
  boss_fortress: "boss_fortress.png",
  boss_phantom: "boss_phantom.png",
  // 背景
  bg_space: "bg_space.jpg",
  bg_menu: "bg_menu.jpg",
  // 道具图标（掉落物 / 图鉴详情 / 图鉴卡片）
  powerup_power: "powerup_power.png",
  powerup_life: "powerup_life.png",
  powerup_shield: "powerup_shield.png",
  powerup_madHunt: "powerup_madHunt.png",
  powerup_rapid: "powerup_rapid.png",
  powerup_speed: "powerup_speed.png",
  powerup_freeze: "powerup_freeze.png",
  powerup_magnet: "powerup_magnet.png",
  powerup_double: "powerup_double.png",
  powerup_xppack: "powerup_xppack.png",
  powerup_skillup: "powerup_skillup.png",
  powerup_drop: "powerup_drop.png",
  powerup_critboost: "powerup_critboost.png",
  powerup_knockback: "powerup_knockback.png",
  powerup_randomSkill: "powerup_randomSkill.png",
  // 技能图标（抽奖滚动 / 揭晓）
  skill_dmg: "skill_dmg.png",
  skill_rate: "skill_rate.png",
  skill_move: "skill_move.png",
  skill_lifesteal: "skill_lifesteal.png",
  skill_explosion: "skill_explosion.png",
  skill_knockback: "skill_knockback.png",
  skill_shield: "skill_shield.png",
  skill_crit: "skill_crit.png",
  skill_split: "skill_split.png",
  skill_penetrate: "skill_penetrate.png",
  skill_volley: "skill_volley.png",
  skill_scatter: "skill_scatter.png",
};

const BASE = `assets/skin/${SKIN_STYLE}/`;

// id → { img, state }；state: "loading" | "ok" | "fail"
const entries = new Map();
let started = false;

/** 触发全部贴图加载（幂等，可重复调用） */
export function preloadSkin() {
  if (started) return;
  started = true;
  if (typeof Image === "undefined") return; // Node 测试环境：保持全部回退
  for (const [id, file] of Object.entries(MANIFEST)) {
    const img = new Image();
    const rec = { img, state: "loading" };
    entries.set(id, rec);
    img.onload = () => { rec.state = "ok"; };
    // 失败即回退：置 fail 后 getSprite 恒返回 null
    img.onerror = () => { rec.state = "fail"; };
    img.src = BASE + file;
  }
}

/**
 * 取贴图。未加载完成 / 加载失败 / 环境无 Image 时返回 null，
 * 调用方据此回退到原有程序化绘制。
 * @returns {HTMLImageElement|null}
 */
export function getSprite(id) {
  const rec = entries.get(id);
  return rec && rec.state === "ok" ? rec.img : null;
}

/** 贴图是否已就绪（背景图等需要判断「要不要跳过程序化绘制」的场合） */
export function hasSprite(id) {
  return getSprite(id) !== null;
}

/** 已加载成功数量 / 总数（调试用） */
export function skinProgress() {
  let ok = 0;
  for (const rec of entries.values()) if (rec.state === "ok") ok++;
  return { ok, total: Object.keys(MANIFEST).length };
}

/** 清单全部 id（测试用于校验覆盖度） */
export function skinManifestIds() {
  return Object.keys(MANIFEST);
}

/**
 * 等比缩放居中绘制贴图到 (cx,cy) 处的 boxW×boxH 盒子内。
 * @returns {boolean} 是否绘制成功（false = 调用方应走回退绘制）
 */
export function drawSprite(ctx, id, cx, cy, boxW, boxH) {
  const img = getSprite(id);
  if (!img || !img.width || !img.height) return false;
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}

// 受击白闪用的白色剪影缓存：id → canvas（与贴图同尺寸，纯白 + 贴图 alpha）
const tintCache = new Map();

// 可见主体 bbox 缓存：id → {x0,y0,x1,y1}（alpha>60，与 tools/check_sprites.py 同基准）
const contentCache = new Map();

/**
 * 量取贴图可见主体 bbox（只量一次）。量不到（无 document / 画不出像素）返回 null，
 * 调用方退化为「整张图即主体」——贴图已由 tools/gen_skin.py 归中，误差可忽略。
 */
function measureContent(id, img) {
  if (contentCache.has(id)) return contentCache.get(id);
  let box = null;
  if (typeof document !== "undefined" && img.width && img.height) {
    try {
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const c2 = cv.getContext("2d", { willReadFrequently: true });
      if (c2) {
        c2.drawImage(img, 0, 0);
        const d = c2.getImageData(0, 0, cv.width, cv.height).data;
        let x0 = cv.width, x1 = -1, y0 = cv.height, y1 = -1;
        for (let y = 0; y < cv.height; y++) {
          const row = y * cv.width;
          for (let x = 0; x < cv.width; x++) {
            if (d[(row + x) * 4 + 3] > 60) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 >= x0) box = { x0, y0, x1, y1 };
      }
    } catch {
      box = null;              // 跨域/内存等异常：退化为整图，不抛错
    }
  }
  contentCache.set(id, box);
  return box;
}

/**
 * 按「可见主体」锚定绘制：主体中心 x 落到 cx，主体顶边（机鼻）落到 noseY，
 * 主体高度缩到 contentH，同时不超过 maxW。
 *
 * 用途：我方战机的子弹从 `player.y - h/2` 出膛（js/bullet.js），
 * 若按图片中心 contain 绘制，机鼻位置会随各机型留白不同而漂移，
 * 表现为子弹与机体中轴/枪口对不上。
 * @returns {boolean} false = 贴图不可用，调用方走回退绘制
 */
export function drawSpriteNose(ctx, id, cx, noseY, contentH, maxW) {
  const img = getSprite(id);
  if (!img || !img.width || !img.height) return false;
  const box = measureContent(id, img)
    || { x0: 0, y0: 0, x1: img.width - 1, y1: img.height - 1 };
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const scale = Math.min(contentH / bh, (maxW || contentH * 2) / bw);
  const dx = cx - ((box.x0 + box.x1 + 1) / 2) * scale;
  const dy = noseY - box.y0 * scale;
  ctx.drawImage(img, dx, dy, img.width * scale, img.height * scale);
  return true;
}

/**
 * 取贴图的纯白剪影（首次调用时从贴图烘焙，之后走缓存）。
 * Node / 无 document 环境返回 null，调用方跳过白闪即可。
 * @returns {HTMLCanvasElement|null}
 */
export function getSpriteTint(id) {
  const img = getSprite(id);
  if (!img || !img.width || typeof document === "undefined") return null;
  let c = tintCache.get(id);
  if (c) return c;
  const make = document.createElement("canvas");
  make.width = img.width;
  make.height = img.height;
  const mc = make.getContext("2d");
  if (!mc) return null;
  mc.drawImage(img, 0, 0);
  mc.globalCompositeOperation = "source-in";   // 只保留「贴图不透明处」
  mc.fillStyle = "#ffffff";
  mc.fillRect(0, 0, make.width, make.height);
  tintCache.set(id, make);
  return make;
}

/**
 * 用纯白剪影叠画一层（受击闪光）。几何与 drawSprite 完全一致。
 * @returns {boolean}
 */
export function drawSpriteFlash(ctx, id, cx, cy, boxW, boxH, alpha) {
  const tint = getSpriteTint(id);
  if (!tint || !tint.width) return false;
  const scale = Math.min(boxW / tint.width, boxH / tint.height);
  const w = tint.width * scale;
  const h = tint.height * scale;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(tint, cx - w / 2, cy - h / 2, w, h);
  ctx.globalAlpha = prev;
  return true;
}

/**
 * 铺满式绘制背景（cover）：等比放大到铺满 w×h，超出部分居中裁掉。
 * @returns {boolean}
 */
export function drawBackground(ctx, id, w, h) {
  const img = getSprite(id);
  if (!img || !img.width || !img.height) return false;
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}

/** 供测试重置启动标记（测试内部用，业务代码勿调） */
export function _resetSkinForTest() {
  started = false;
  entries.clear();
  tintCache.clear();
  contentCache.clear();
}
