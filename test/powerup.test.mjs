import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage, installFakeImage, removeFakeImage, makeSpyCtx } from "./_env.mjs";
import { POWERUP_DEFS, POWERUP_DROP, SKILLS, H } from "../js/config.js";
import {
  powerups, spawnPowerup, updatePowerups, applyPowerup, clearPowerups,
  drawPowerups, setGachaAnim, drawGachaAnim, updateGachaAnim,
  getGachaAnim, clearGachaAnim, xpPackAmount, GACHA_SKILL_POOL_IDS,
} from "../js/powerup.js";
import { createPlayer } from "../js/player.js";
import { META } from "../js/config.js";
import { loadMeta, resetMeta, getStats } from "../js/meta.js";
import { particles, clearParticles } from "../js/particles.js";
import { preloadSkin, _resetSkinForTest } from "../js/assets.js";

function player() {
  return createPlayer(META.aircraft.falcon, {});
}

describe("powerup", () => {
  beforeEach(() => {
    clearPowerups();
    clearParticles();
    clearGachaAnim();
    resetStorage();
    resetMeta();
    loadMeta();
  });

  it("掉落率控制生成", () => {
    const orig = Math.random;
    Math.random = () => POWERUP_DROP.base + 0.01;
    spawnPowerup(100, 100, 1, 0);
    assert.equal(powerups.length, 0);
    Math.random = () => 0;
    spawnPowerup(100, 100, 1, 0);
    assert.equal(powerups.length, 1);
    assert.ok(POWERUP_DEFS[powerups[0].type]);
    Math.random = orig;
  });

  it("越界道具被移除", () => {
    powerups.push({ x: 100, y: H + 40, vy: 1.8, t: 0, type: "life" });
    updatePowerups(0.016, player(), false);
    assert.equal(powerups.length, 0);
  });

  it("磁铁吸引靠近玩家", () => {
    const p = player();
    p.x = 240; p.y = 620;
    p.buffs.magnet = 8;
    powerups.push({ x: 240, y: 500, vy: 0, t: 0, type: "life" });
    const x0 = powerups[0].x;
    const y0 = powerups[0].y;
    updatePowerups(0.016, p, true);
    assert.equal(powerups.length, 1);
    const d0 = Math.hypot(p.x - x0, p.y - y0);
    const d1 = Math.hypot(p.x - powerups[0].x, p.y - powerups[0].y);
    assert.ok(d1 < d0);
  });

  it("靠近即拾取并计入统计", () => {
    const p = player();
    p.x = 100; p.y = 100;
    powerups.push({ x: 100, y: 100, vy: 0, t: 0, type: "life" });
    updatePowerups(0.016, p, false);
    assert.equal(powerups.length, 0);
    assert.equal(p._addLife, true);
    assert.equal(getStats().totalPowerups, 1);
  });

  it("火力道具升到 4 级封顶", () => {
    const p = player();
    p.power = 4;
    applyPowerup({ type: "power", x: 0, y: 0 }, p);
    assert.equal(p.power, 4);
    p.power = 1;
    applyPowerup({ type: "power", x: 0, y: 0 }, p);
    assert.equal(p.power, 2);
    assert.equal(p.powerTime, 15);
  });

  it("各类 buff 道具设置计时", () => {
    const p = player();
    applyPowerup({ type: "rapid", x: 0, y: 0 }, p);
    applyPowerup({ type: "speed", x: 0, y: 0 }, p);
    applyPowerup({ type: "magnet", x: 0, y: 0 }, p);
    applyPowerup({ type: "double", x: 0, y: 0 }, p);
    applyPowerup({ type: "madHunt", x: 0, y: 0 }, p);
    applyPowerup({ type: "drop", x: 0, y: 0 }, p);
    applyPowerup({ type: "critboost", x: 0, y: 0 }, p);
    applyPowerup({ type: "freeze", x: 0, y: 0 }, p);
    applyPowerup({ type: "xppack", x: 0, y: 0 }, p);
    applyPowerup({ type: "shield", x: 0, y: 0 }, p);
    assert.equal(p.buffs.rapid, 8);
    assert.equal(p._freeze, true);
    assert.equal(p._xpPack, true, "经验包改为由 game.js 按当前升级需求折算");
    assert.equal(p.shield, 1);
  });

  it("经验包按升级需求折算，后期不会沦为废道具", () => {
    assert.equal(xpPackAmount(60), 50, "早期保底 50");
    assert.equal(xpPackAmount(200), 50, "max(50, 20%) 取大者");
    assert.equal(xpPackAmount(1000), 200, "后期按 20% 折算，仍然有意义");
    assert.equal(xpPackAmount(0), 50);
    assert.equal(xpPackAmount(undefined), 50);
  });

  it("技能+1 道具至少升一级", () => {
    const p = player();
    applyPowerup({ type: "skillup", x: 0, y: 0 }, p);
    const total = Object.values(p.skills).reduce((a, b) => a + (b || 0), 0);
    assert.ok(total >= 1);
    assert.ok(p._toast);
  });

  it("技能全满时 skillup 给出提示", () => {
    const p = player();
    for (const s of SKILLS) p.skills[s.id] = s.max;
    applyPowerup({ type: "skillup", x: 0, y: 0 }, p);
    assert.equal(p._toast.text, "技能已全部满级");
    assert.equal(getGachaAnim(), null);
  });

  it("randomSkill 不绕过前置技能（requires）", () => {
    const p = player();
    // 无要求技能各 1 级，前置技能清零
    for (const s of SKILLS) p.skills[s.id] = s.requires ? 0 : 1;
    for (const s of SKILLS) {
      for (const other of SKILLS) {
        if (other.requires === s.id) p.skills[s.id] = 0;
      }
    }
    for (let i = 0; i < 40; i++) {
      const before = { ...p.skills };
      applyPowerup({ type: "randomSkill", x: 0, y: 0 }, p);
      clearGachaAnim();
      for (const s of SKILLS) {
        if (s.requires && (p.skills[s.id] || 0) > (before[s.id] || 0)) {
          // 带 requires 的技能升级那一刻,其前置必须已经习得（可能是本回合随机授予的）
          assert.ok((p.skills[s.requires] || 0) > 0,
            "requires 技能不应在缺少前置时被授予：" + s.id + " 需要 " + s.requires);
        }
      }
    }
  });

  // ===========================================================
  // 换肤：掉落物图标 + 抽奖技能图标（Agnes 生成的贴图替换字母）
  // ===========================================================
  describe("图标贴图", () => {
    const hadImage = "Image" in globalThis;
    const savedImage = globalThis.Image;
    let created = [];

    beforeEach(() => {
      _resetSkinForTest();
      created = installFakeImage();
      preloadSkin();
      created.forEach((img) => img.succeed());
    });

    afterEach(() => {
      _resetSkinForTest();
      removeFakeImage(hadImage, savedImage);
    });

    it("掉落物画 powerup_<type> 贴图，不再画字母", () => {
      powerups.push({ x: 100, y: 100, vy: 0, t: 0, type: "power" });
      const { ctx, images, texts } = makeSpyCtx();
      drawPowerups(ctx);
      assert.equal(images.length, 1, "应画出一张掉落物图标");
      assert.ok(images[0].src.includes("/powerup_power.png"), images[0].src);
      assert.equal(texts.length, 0, "有贴图时不再画字母");
    });

    it("贴图不可用时掉落物回退字母（不抛错）", () => {
      powerups.push({ x: 100, y: 100, vy: 0, t: 0, type: "power" });
      _resetSkinForTest();   // 模拟未加载/加载失败
      const { ctx, images, texts } = makeSpyCtx();
      assert.doesNotThrow(() => drawPowerups(ctx));
      assert.equal(images.length, 0, "缺图不得调用 drawImage");
      assert.ok(texts.some((t) => t.t === POWERUP_DEFS.power.icon), "应回退到原字母");
    });

    it("每种道具都有掉落物图标贴图", () => {
      for (const key of Object.keys(POWERUP_DEFS)) {
        powerups.push({ x: 100, y: 100, vy: 0, t: 0, type: key });
      }
      const { ctx, images } = makeSpyCtx();
      drawPowerups(ctx);
      assert.equal(images.length, Object.keys(POWERUP_DEFS).length);
      for (const key of Object.keys(POWERUP_DEFS)) {
        assert.ok(images.some((m) => m.src.includes(`/powerup_${key}.png`)),
          `道具 ${key} 缺掉落物图标贴图`);
      }
    });

    it("抽奖池由真实技能 id 构成，且每个都有 skill_<id> 贴图", () => {
      assert.equal(GACHA_SKILL_POOL_IDS.length, 12, "池中应为 12 个技能");
      assert.equal(new Set(GACHA_SKILL_POOL_IDS).size, GACHA_SKILL_POOL_IDS.length, "不得有重复 id");
      for (const id of GACHA_SKILL_POOL_IDS) {
        assert.ok(SKILLS.some((s) => s.id === id), `池中技能 ${id} 不在 SKILLS 里`);
        assert.ok(created.some((i) => i.src.includes(`/skill_${id}.png`)), `${id} 缺技能图标贴图`);
      }
    });

    it("抽奖滚动：每行都带技能 id（保证能画贴图）", () => {
      const skill = SKILLS.find((s) => s.id === "dmg");
      setGachaAnim(skill, "new");
      const a = getGachaAnim();
      assert.equal(a.previewSkills.length, 29, "28 个滚动位 + 1 个中奖位");
      for (const s of a.previewSkills) {
        assert.equal(typeof s.id, "string", "滚动项必须携带技能 id");
        assert.ok(s.name && s.color, "滚动项必须有名称与颜色");
      }
    });

    it("抽奖滚动：画 skill_<id> 贴图，技能名仍正常绘制", () => {
      const skill = SKILLS.find((s) => s.id === "dmg");
      setGachaAnim(skill, "new");
      const { ctx, images, texts } = makeSpyCtx();
      drawGachaAnim(ctx);
      assert.ok(images.length > 0, "滚动行应画技能图标");
      assert.ok(images.every((m) => m.src.includes("/skill_")), "滚动行只应画技能贴图");
      assert.ok(texts.some((t) => t.t === skill.name), "技能名仍要画出来");
    });

    it("抽奖滚动：缺图时回退字母", () => {
      const skill = SKILLS.find((s) => s.id === "dmg");
      setGachaAnim(skill, "new");
      _resetSkinForTest();
      const { ctx, images, texts } = makeSpyCtx();
      assert.doesNotThrow(() => drawGachaAnim(ctx));
      assert.equal(images.length, 0, "缺图不得调用 drawImage");
      assert.ok(texts.some((t) => typeof t.t === "string" && t.t.length === 1),
        "应回退到各技能的单字母图标");
    });

    it("抽奖揭晓：画中奖技能贴图", () => {
      const skill = SKILLS.find((s) => s.id === "dmg");
      setGachaAnim(skill, "new");
      updateGachaAnim(5);   // rolling → reveal
      assert.equal(getGachaAnim().phase, "reveal");
      const { ctx, images, texts } = makeSpyCtx();
      drawGachaAnim(ctx);
      assert.ok(images.some((m) => m.src.includes("/skill_dmg.png")), "揭晓应画中奖技能图标");
      assert.ok(texts.some((t) => t.t === skill.name), "揭晓应画技能名");
      // 揭晓不再画滚动行的其它技能
      assert.ok(images.every((m) => m.src.includes("/skill_dmg.png")), "揭晓只画中奖技能");
    });
  });
});
