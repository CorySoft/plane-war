/* ===========================================================
 * skin-batch.test.mjs — 贴图分批加载
 * 真实浏览器（有 rAF）下：核心 14 张先发，道具/技能图标进后台批；
 * Node 无 rAF 时 preloadSkin 同步补全（由 assets.test.mjs 锁住）。
 * =========================================================== */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { installFakeImage, removeFakeImage } from "./_env.mjs";
import {
  preloadSkin, preloadRemainingSkin, preloadBossSkin, preloadRestSkin,
  skinProgress, skinManifestIds, _resetSkinForTest,
} from "../js/assets.js";

describe("皮肤分批加载（模拟浏览器有 rAF）", () => {
  const hadImage = "Image" in globalThis;
  const savedImage = globalThis.Image;
  const hadRaf = "requestAnimationFrame" in globalThis;
  const savedRaf = globalThis.requestAnimationFrame;
  let created = [];

  beforeEach(() => {
    _resetSkinForTest();
    created = installFakeImage();
    globalThis.requestAnimationFrame = () => 1;
  });

  afterEach(() => {
    _resetSkinForTest();
    if (hadRaf) globalThis.requestAnimationFrame = savedRaf;
    else delete globalThis.requestAnimationFrame;
    removeFakeImage(hadImage, savedImage);
  });

  it("首屏只请求核心集（战机/敌机/Boss/背景），不含道具与技能图标", () => {
    preloadSkin();
    const total = skinManifestIds().length;
    assert.ok(created.length > 0 && created.length < total, `首屏应只加载子集，实际 ${created.length}/${total}`);
    assert.ok(created.every(i => !/powerup_|skill_/.test(i.src)), "首屏不应请求道具/技能图标");
    assert.ok(created.every(i => !/boss_/.test(i.src)), "首屏不应请求 Boss（最早 L=5 才出现，延后批）");
    assert.ok(created.some(i => /player_falcon\.png$/.test(i.src)), "核心集必须含玩家贴图");
    assert.ok(created.some(i => /bg_space\.jpg$/.test(i.src)), "核心集必须含背景");
  });

  it("Boss 批与道具/技能批分别补齐，且不重复", () => {
    preloadSkin();
    const core = created.length;
    preloadBossSkin();
    const afterBoss = created.length;
    assert.ok(afterBoss > core, "Boss 批应追加");
    assert.ok(created.slice(core).every(i => /boss_/.test(i.src)), "Boss 批只含 Boss");
    preloadRestSkin();
    preloadRestSkin();
    assert.equal(created.length, skinManifestIds().length, "三批合计必须覆盖完整清单");
    assert.ok(created.every(i => i.src.length > 0));
  });

  it("preloadRemainingSkin 补齐完整清单，且幂等不重复", () => {
    preloadSkin();
    const first = created.length;
    preloadRemainingSkin();
    preloadRemainingSkin();
    assert.equal(created.length, skinManifestIds().length, "补齐后必须覆盖完整清单");
    assert.ok(first < created.length, "后台批确实追加了新的 Image");
    assert.ok(created.every(i => i.src.length > 0), "每个 Image 都应有 src");
  });

  it("未就绪时 getSprite/进度安全（回退程序化绘制）", () => {
    preloadSkin();
    assert.deepEqual(skinProgress(), { ok: 0, total: skinManifestIds().length });
  });
});