/* ===========================================================
 * assets.test.mjs — 皮肤贴图加载器
 * 两条底线：① 环境无 Image（Node/加载失败）时所有绘制调用必须
 * 安全返回 false，让调用方回退程序化绘制，绝不抛错；
 * ② 清单必须覆盖全部战机/敌机/Boss/背景 id，否则换肤出现空洞。
 * =========================================================== */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { makeCtx, installFakeImage, removeFakeImage } from "./_env.mjs";
import { META, ENEMY_TYPES, POWERUP_DEFS } from "../js/config.js";
import { BOSS_TYPES } from "../js/wave.js";
import {
  SKIN_STYLE, preloadSkin, getSprite, hasSprite, skinProgress, skinManifestIds,
  drawSprite, drawSpriteNose, drawBackground, getSpriteTint, drawSpriteFlash,
  _resetSkinForTest,
} from "../js/assets.js";
import { GACHA_SKILL_POOL_IDS } from "../js/powerup.js";
import { createPlayer, drawPlayer } from "../js/player.js";

describe("assets", () => {
  const hadImage = "Image" in globalThis;
  const savedImage = globalThis.Image;
  let created = [];

  beforeEach(() => {
    _resetSkinForTest();
    created = installFakeImage();
  });

  afterEach(() => {
    _resetSkinForTest();
    removeFakeImage(hadImage, savedImage);
  });

  it("preloadSkin 幂等，只创建一套 Image", () => {
    preloadSkin();
    preloadSkin();
    assert.equal(created.length, skinManifestIds().length, "创建的 Image 数必须等于清单项数");
    assert.ok(created.every(i => i.src.startsWith(`assets/skin/${SKIN_STYLE}/`)),
      "贴图 URL 必须带风格目录（破缓存 + 可换肤）");
  });

  it("加载完成前 getSprite 返回 null（调用方回退程序化绘制）", () => {
    preloadSkin();
    assert.equal(getSprite("player_falcon"), null);
    assert.equal(hasSprite("player_falcon"), false);
    assert.deepEqual(skinProgress(), { ok: 0, total: skinManifestIds().length });
  });

  it("onload 后可用，onerror 后永久回退", () => {
    preloadSkin();
    const falcon = created.find(i => i.src.includes("player_falcon"));
    const blaze = created.find(i => i.src.includes("player_blaze"));
    falcon.succeed(300, 240);
    blaze.fail();
    assert.equal(getSprite("player_falcon").width, 300);
    assert.equal(getSprite("player_blaze"), null);
    assert.equal(skinProgress().ok, 1);
  });

  it("drawSprite 等比缩放居中且未就绪时返回 false 不抛错", () => {
    const ctx = makeCtx();
    assert.equal(drawSprite(ctx, "player_falcon", 10, 10, 100, 100), false);
    preloadSkin();
    created.find(i => i.src.includes("player_falcon")).succeed(200, 100);
    // box 100x100 → 缩放按宽 0.5 → 100x50，中心 (10,10) → x 从 -40 到 60
    let got = null;
    ctx.drawImage = (img, x, y, w, h) => { got = { x, y, w, h }; };
    assert.equal(drawSprite(ctx, "player_falcon", 10, 10, 100, 100), true);
    assert.deepEqual(got, { x: -40, y: -15, w: 100, h: 50 });
  });

  it("drawBackground cover 铺满且裁掉溢出", () => {
    const ctx = makeCtx();
    assert.equal(drawBackground(ctx, "bg_space", 480, 720), false);
    preloadSkin();
    created.find(i => i.src.includes("bg_space")).succeed(720, 1080);
    let got = null;
    ctx.drawImage = (img, x, y, w, h) => { got = { x, y, w, h }; };
    // 480/720 与 720/1080 同为 2:3 → scale=2/3，无溢出
    assert.equal(drawBackground(ctx, "bg_space", 480, 720), true);
    assert.deepEqual(got, { x: 0, y: 0, w: 480, h: 720 });
    // 宽盒子 → 按宽铺满，高度溢出居中裁切
    assert.equal(drawBackground(ctx, "bg_space", 1440, 720), true);
    assert.equal(got.w, 1440);
    assert.equal(got.h, 2160);
    assert.equal(got.y, (720 - 2160) / 2);
  });

  it("无 document 环境下白闪 API 安全返回 false", () => {
    const ctx = makeCtx();
    preloadSkin();
    created.find(i => i.src.includes("enemy_small")).succeed();
    assert.equal(getSpriteTint("enemy_small"), null, "Node 无 document → null");
    assert.equal(drawSpriteFlash(ctx, "enemy_small", 0, 0, 40, 40, 1), false);
  });

  it("无 Image 环境（Node 默认）下 preload/draw 全部安全", () => {
    delete globalThis.Image;
    _resetSkinForTest();
    assert.doesNotThrow(() => preloadSkin());
    const ctx = makeCtx();
    assert.equal(drawSprite(ctx, "player_falcon", 0, 0, 10, 10), false);
    assert.equal(drawBackground(ctx, "bg_space", 10, 10), false);
    assert.deepEqual(skinProgress(), { ok: 0, total: skinManifestIds().length });
  });

  it("清单覆盖全部战机 id（含 void_ 的尾下划线归一）", () => {
    preloadSkin();
    for (const id of Object.keys(META.aircraft)) {
      const spriteId = "player_" + id.replace(/_$/, "");
      const hit = created.some(i => i.src.includes(`/${spriteId}.png`));
      assert.ok(hit, `战机 ${id} 缺少贴图 ${spriteId}`);
    }
  });

  it("清单覆盖全部敌机与 Boss 类型", () => {
    preloadSkin();
    for (const t of Object.keys(ENEMY_TYPES)) {
      assert.ok(created.some(i => i.src.includes(`/enemy_${t}.png`)), `敌机 ${t} 缺贴图`);
    }
    for (const t of Object.keys(BOSS_TYPES)) {
      assert.ok(created.some(i => i.src.includes(`/boss_${t}.png`)), `Boss ${t} 缺贴图`);
    }
  });

  it("createPlayer 记录 aircraftId，缺配置回退 falcon", () => {
    assert.equal(createPlayer(META.aircraft.thor, {}).aircraftId, "thor");
    assert.equal(createPlayer(META.aircraft.void_, {}).aircraftId, "void_");
    assert.equal(createPlayer().aircraftId, "falcon");
    assert.equal(createPlayer({ speed: 1 }).aircraftId, "falcon");
  });

  it("drawPlayer 在贴图缺失时仍完成程序化绘制（不抛错）", () => {
    const ctx = makeCtx();
    const p = createPlayer(META.aircraft.falcon, {});
    assert.doesNotThrow(() => drawPlayer(ctx, p, 16));
  });

  // ---------- 换肤覆盖度：清单必须含全部道具/技能图标 ----------
  it("清单覆盖全部道具图标 id（掉落物/图鉴共用）", () => {
    preloadSkin();
    for (const key of Object.keys(POWERUP_DEFS)) {
      assert.ok(created.some(i => i.src.includes(`/powerup_${key}.png`)),
        `道具 ${key} 缺少图标贴图 powerup_${key}`);
    }
  });

  it("清单覆盖全部抽奖池技能图标 id", () => {
    preloadSkin();
    for (const id of GACHA_SKILL_POOL_IDS) {
      assert.ok(created.some(i => i.src.includes(`/skill_${id}.png`)),
        `抽奖池技能 ${id} 缺少图标贴图 skill_${id}`);
    }
  });

  it("清单按类别计数自洽（机体/敌机/Boss/背景/道具/技能）", () => {
    const ids = skinManifestIds();
    assert.equal(ids.filter(i => i.startsWith("player_")).length, Object.keys(META.aircraft).length);
    assert.equal(ids.filter(i => i.startsWith("enemy_")).length, Object.keys(ENEMY_TYPES).length);
    assert.equal(ids.filter(i => i.startsWith("boss_")).length, Object.keys(BOSS_TYPES).length);
    assert.equal(ids.filter(i => i.startsWith("bg_")).length, 2);
    assert.equal(ids.filter(i => i.startsWith("powerup_")).length, Object.keys(POWERUP_DEFS).length);
    assert.equal(ids.filter(i => i.startsWith("skill_")).length, GACHA_SKILL_POOL_IDS.length);
    assert.equal(ids.length, new Set(ids).size, "清单不得有重复 id");
  });

  // ---------- 机鼻锚定：枪口即子弹出膛线 ----------
  it("drawSpriteNose 缺图时返回 false 且不抛错", () => {
    const ctx = makeCtx();
    assert.equal(drawSpriteNose(ctx, "player_thor", 0, -26, 60, 80), false);
    assert.doesNotThrow(() => drawSpriteNose(ctx, "not_exists", 0, 0, 10, 10));
  });

  it("drawSpriteNose 机鼻落在 noseY、中轴落在 cx、受 contentH/maxW 双重约束", () => {
    preloadSkin();
    created.find(i => i.src.includes("player_thor")).succeed(320, 256);
    const ctx = makeCtx();
    let got = null;
    ctx.drawImage = (img, x, y, w, h) => { got = { x, y, w, h }; };
    assert.equal(drawSpriteNose(ctx, "player_thor", 0, -26, 60, 80), true);
    // Node 无 document → 量不到主体 bbox → 退化为整图；几何仍须精确
    const scale = Math.min(60 / 256, 80 / 320);
    assert.ok(Math.abs(got.y - -26) < 1e-9, `机鼻必须贴到 noseY，实际 ${got.y}`);
    assert.ok(Math.abs(got.x + got.w / 2) < 1e-9, `中轴必须贴到 cx=0，实际 ${got.x + got.w / 2}`);
    assert.ok(Math.abs(got.w - 320 * scale) < 1e-9 && Math.abs(got.h - 256 * scale) < 1e-9,
      "缩放必须取 contentH/bw 中的较小者");
    // contentH 起决定作用（60/256 < 80/320）
    assert.equal(got.h, 60);
    // maxW 起决定作用时应卡在 maxW
    assert.equal(drawSpriteNose(ctx, "player_thor", 0, -26, 60, 40), true);
    assert.ok(got.w <= 40 + 1e-9, `宽度不得超过 maxW，实际 ${got.w}`);
  });

  it("drawPlayer 走贴图分支：机鼻=-h/2、中轴=局部 x=0（与子弹出膛同线）", () => {
    preloadSkin();
    created.find(i => i.src.includes("player_falcon")).succeed(300, 240);
    const ctx = makeCtx();
    const p = createPlayer(META.aircraft.falcon, {});
    p.x = 120; p.y = 300; p.invincible = 0;
    let got = null;
    ctx.drawImage = (img, x, y, w, h) => { got = { img, x, y, w, h }; };
    drawPlayer(ctx, p, 8);
    assert.ok(got, "贴图就绪时必须走贴图分支");
    assert.ok(String(got.img.src).includes("player_falcon.png"), "应绘制 falcon 贴图");
    // ctx.translate(p.x, p.y) 之后，drawImage 收到的是机体局部坐标
    assert.ok(Math.abs(got.y - -p.h / 2) < 1e-9,
      `机鼻必须等于 -h/2（=子弹出膛线），实际 ${got.y}`);
    assert.ok(Math.abs(got.x + got.w / 2) < 1e-9,
      `机体中轴必须对齐局部 x=0，实际 ${got.x + got.w / 2}`);
  });
});
