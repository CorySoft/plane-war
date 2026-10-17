import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage, makeCtx, installFakeImage, removeFakeImage, makeSpyCtx } from "./_env.mjs";
import { resetMeta, loadMeta, discoverPowerup } from "../js/meta.js";
import {
  hitTestButton, setMenuPage, getMenuPage,
  spawnDamageNumber, updateDamageNumbers, clearDamageNumbers,
  initStars, updateStars,
  drawMenu,
  getStartButton, getDifficultyRects,
  getHangarButton, getHangarBackButton, getHangarCards,
  getTalentButton, getTalentBackButton, getTalentCards,
  getSettingsButton, getSettingsBackButton, getSettingToggles,
  getCodexButton, getCodexBackButton,
  getAchieveButton, getAchieveBackButton, getQuestClaimButtons,
  drawGameOver, getRestartButton, getGameOverMenuButton,
  getCodexCardRects, getPowerupCardRects, getCodexScroll, getCodexMaxScroll,
  getCodexViewport, setCodexScroll,
  setDetailCard, getDetailCard, drawDetailCard, drawToast,
  setTalentConfirm, getTalentConfirm, getTalentConfirmYesButton, getTalentConfirmNoButton, drawTalentConfirm,
} from "../js/ui.js";
import { H, META, POWERUP_DEFS, DIFFICULTY_PRESETS, setViewport } from "../js/config.js";
import { preloadSkin, _resetSkinForTest } from "../js/assets.js";

describe("ui", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
    clearDamageNumbers();
    setMenuPage("main");
  });

  it("hitTestButton 矩形命中", () => {
    const rect = { x: 10, y: 20, w: 40, h: 30 };
    assert.equal(hitTestButton(10, 20, rect), true);
    assert.equal(hitTestButton(50, 50, rect), true);
    assert.equal(hitTestButton(51, 50, rect), false);
    assert.equal(hitTestButton(0, 0, rect), false);
    assert.equal(hitTestButton(10, 20, null), null);
  });

  it("菜单分页切换", () => {
    assert.equal(getMenuPage(), "main");
    setMenuPage("codex");
    assert.equal(getMenuPage(), "codex");
  });

  it("伤害飘字去重与上限", () => {
    spawnDamageNumber(10, 10, "1");
    spawnDamageNumber(10, 10, "1");
    updateDamageNumbers(0);
    spawnDamageNumber(200, 200, "9", "#fff", true);
    for (let i = 0; i < 80; i++) spawnDamageNumber(i * 30, i * 30, String(i), "#fff", true);
    updateDamageNumbers(2);
  });

  it("星空循环卷动", () => {
    initStars();
    updateStars(10);
    assert.ok(true);
  });

  it("主菜单绘制并暴露导航按钮", () => {
    setMenuPage("main");
    drawMenu(makeCtx(), 250, "normal", DIFFICULTY_PRESETS, ["dmg"]);
    assert.ok(getStartButton());
    assert.equal(Object.keys(getDifficultyRects()).length, Object.keys(DIFFICULTY_PRESETS).length);
    assert.ok(getHangarButton());
    assert.ok(getTalentButton());
    assert.ok(getCodexButton());
    assert.ok(getAchieveButton());
    assert.ok(getSettingsButton());
    assert.equal(getHangarBackButton(), null);
  });

  it("机库页绘制卡片与返回按钮", () => {
    setMenuPage("hangar");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const cards = getHangarCards();
    assert.equal(cards.length, Object.keys(META.aircraft).length);
    for (const c of cards) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.w > 0 && c.h > 0);
      assert.ok(c.y + c.h <= H * 0.9);
    }
    assert.ok(getHangarBackButton());
    assert.equal(getHangarButton(), null);
  });

  it("天赋页绘制卡片含锁定态", () => {
    setMenuPage("talent");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const cards = getTalentCards();
    assert.equal(cards.length, META.talents.length);
    const locked = cards.find(c => c.id === "t_dmg2");
    assert.ok(locked);
    assert.equal(locked.locked, true);
    assert.equal(locked.bought, false);
    assert.ok(getTalentBackButton());
    assert.equal(getTalentButton(), null);
  });

  it("设置页绘制开关行", () => {
    setMenuPage("settings");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const rows = getSettingToggles();
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.key), ["sfxMuted", "musicMuted", "skipTutorial"]);
    assert.ok(getSettingsBackButton());
    assert.equal(getSettingsButton(), null);
  });

  it("技能图鉴页绘制不崩溃", () => {
    setMenuPage("codex");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, ["dmg", "rapid"]);
    assert.ok(getCodexBackButton());
    assert.equal(getCodexButton(), null);
  });

  // ---------- 回归：图鉴滚动与命中区 ----------
  it("图鉴可滚到底且最后一行完整可见", () => {
    // 窄屏（3 列）内容才会超出一屏，这正是需要滚动的场景
    setViewport(360, 720);
    try {
      setMenuPage("codex");
      drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
      const max = getCodexMaxScroll();
      const vp = getCodexViewport();
      assert.ok(max > 0, "窄屏下技能数量应超出一屏，才需要滚动");
      setCodexScroll(max);
      drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
      // setCodexScroll 会四舍五入到整数像素，故允许 1px 容差
      assert.ok(Math.abs(getCodexScroll() - max) <= 1, "滚动能钳制到最大滚动量");
      const rects = getCodexCardRects();
      assert.ok(rects.length > 0);
      const last = rects[rects.length - 1].rect;
      assert.ok(last.y + last.h <= vp.y + vp.h + 0.5, "滚到底后最后一行必须落在可视区内");
    } finally {
      setViewport(480, 720);
      setCodexScroll(0);
    }
  });

  it("图鉴卡片命中区被裁剪到可视区（滚动后不误触）", () => {
    setViewport(360, 720);
    try {
      setMenuPage("codex");
      drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
      const max = getCodexMaxScroll();
      assert.ok(max > 0);
      setCodexScroll(Math.round(max / 2));
      drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
      const vp = getCodexViewport();
      for (const c of getCodexCardRects()) {
        assert.ok(c.rect.y >= vp.y - 0.5, "命中区不得越过可视区顶部");
        assert.ok(c.rect.y + c.rect.h <= vp.y + vp.h + 0.5, "命中区不得越过可视区底部");
      }
    } finally {
      setViewport(480, 720);
      setCodexScroll(0);
    }
  });

  it("道具图鉴命中区同样裁剪到可视区", () => {
    setMenuPage("powerupCodex");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    const vp = getCodexViewport();
    for (const c of getPowerupCardRects()) {
      assert.ok(c.rect.y >= vp.y - 0.5);
      assert.ok(c.rect.y + c.rect.h <= vp.y + vp.h + 0.5);
    }
  });

  it("成就任务页绘制返回与领取按钮", () => {
    setMenuPage("achieve");
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, []);
    assert.ok(getAchieveBackButton());
    assert.equal(getAchieveButton(), null);
    assert.ok(Array.isArray(getQuestClaimButtons()));
  });

  // ---------- 回归：结束界面按钮不再挤在一起 ----------
  it("结束界面两个按钮不重叠且间距充足", () => {
    drawGameOver(makeCtx(), 12345, 20000, false);
    const restart = getRestartButton();
    const menu = getGameOverMenuButton();
    assert.ok(restart && menu, "两个按钮都应产出命中矩形");
    const gap = menu.y - (restart.y + restart.h);
    assert.ok(gap >= 12, `按钮间距过小：${gap}px`);
    assert.equal(restart.h, menu.h, "两个按钮高度应一致（旧版 54/50 不齐）");
    assert.equal(restart.w, menu.w, "两个按钮宽度应一致");
    assert.ok(restart.x === menu.x, "两个按钮应左对齐");
    // 命中矩形不互相包含，避免点一次触发两个逻辑
    assert.ok(!hitTestButton(restart.x + restart.w / 2, restart.y + restart.h / 2, menu));
    assert.ok(!hitTestButton(menu.x + menu.w / 2, menu.y + menu.h / 2, restart));
    assert.ok(menu.y + menu.h <= H, "按钮不得超出屏幕底部");
  });

  it("窄屏下结束按钮仍在屏内且不重叠", () => {
    setViewport(320, 720);
    try {
      drawGameOver(makeCtx(), 0, 0, false);
      const restart = getRestartButton();
      const menu = getGameOverMenuButton();
      assert.ok(restart.w <= 320 - 64 + 0.5, "按钮宽度应适配窄屏");
      assert.ok(menu.y - (restart.y + restart.h) >= 12);
      assert.ok(menu.y + menu.h <= 720);
    } finally {
      setViewport(480, 720);
    }
  });

  it("veil 面纱：alpha<=0 跳过，正值绘制半透明覆盖", async () => {
    const { veil } = await import("../js/theme.js");
    let calls = 0;
    const spy = { save() {}, restore() {}, fillRect() { calls++; }, fillStyle: null };
    veil(spy, 100, 100, 0);
    assert.equal(calls, 0);
    veil(spy, 100, 100, 0.5, "#070b1f");
    assert.equal(calls, 1);
    assert.match(spy.fillStyle, /^rgba\(7,11,31,0\.5\)$/);
    veil(spy, 100, 100, 2);
    assert.match(spy.fillStyle, /^rgba\(7,11,31,1\)$/);
  });

  it("页面切换触发过渡面纱，alpha 随时间衰减", async () => {
    const { getPageVeilAlpha } = await import("../js/ui.js");
    setMenuPage("codex");
    const a = getPageVeilAlpha();
    assert.ok(a > 0.9 && a <= 1, `fresh switch alpha=${a}`);
    drawMenu(makeCtx(), 0, "normal", DIFFICULTY_PRESETS, ["dmg"]);
    assert.ok(getCodexBackButton());
    const b = getPageVeilAlpha();
    assert.ok(b >= 0 && b <= a, `decay alpha=${b}`);
  });

  // ===========================================================
  // 换肤：道具 / 技能图标的贴图绘制（Agnes 生成的图标替换字母）
  // ===========================================================
  describe("图标贴图 UI", () => {
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
      setDetailCard(null);
      setMenuPage("main");
    });

    it("道具图鉴：每张已发现卡片画出对应 powerup_<key> 贴图", () => {
      for (const k of Object.keys(POWERUP_DEFS)) discoverPowerup(k);
      setMenuPage("powerupCodex");
      const { ctx, images } = makeSpyCtx();
      drawMenu(ctx, 0, "normal", DIFFICULTY_PRESETS, []);

      const rects = getPowerupCardRects();
      assert.equal(rects.length, Object.keys(POWERUP_DEFS).length, "每种道具都应有一张卡片");
      for (const r of rects) {
        assert.ok(images.some((m) => m.src.includes(`/powerup_${r.key}.png`)),
          `道具 ${r.key} 卡片未画图标贴图`);
      }
      // 图标水平居中、且落在名称（y+35）之上，避免压字
      const first = rects[0];
      const icon = images.find((m) => m.src.includes(`/powerup_${first.key}.png`));
      assert.ok(Math.abs(icon.x + icon.w / 2 - (first.rect.x + first.rect.w / 2)) < 0.5,
        "图标必须水平居中于卡片");
      assert.ok(icon.y >= first.rect.y - 1, "图标不得越出卡片顶部");
      assert.ok(icon.y + icon.h <= first.rect.y + 28.5, "图标不得压到名称文字");
    });

    it("道具图鉴：未发现的道具不画贴图（保持未点亮态）", () => {
      setMenuPage("powerupCodex");
      const { ctx, images } = makeSpyCtx();
      drawMenu(ctx, 0, "normal", DIFFICULTY_PRESETS, []);
      assert.equal(images.length, 0, "没有已发现道具时不应画任何图标");
      assert.equal(getPowerupCardRects().length, Object.keys(POWERUP_DEFS).length);
    });

    it("道具图鉴：卡片文字新布局（名称 y+35、描述 y+52）", () => {
      for (const k of Object.keys(POWERUP_DEFS)) discoverPowerup(k);
      setMenuPage("powerupCodex");
      const { ctx, texts } = makeSpyCtx();
      drawMenu(ctx, 0, "normal", DIFFICULTY_PRESETS, []);
      const first = getPowerupCardRects()[0];
      const cy = first.rect.y;
      const cardCx = first.rect.x + first.rect.w / 2;
      const name = POWERUP_DEFS[first.key].name;
      const nameHit = texts.find((t) => t.t === name && Math.abs(t.x - cardCx) < 0.5
        && Math.abs(t.y - (cy + 35)) < 0.5);
      assert.ok(nameHit, `道具名称应落在卡片 y+35，实际命中 ${JSON.stringify(texts.filter(t => t.t === name))}`);
      const descHit = texts.find((t) => t.x === cardCx && Math.abs(t.y - (cy + 52)) < 0.5);
      assert.ok(descHit, "道具描述应落在卡片 y+52（图标上方腾出的行）");
      assert.notEqual(descHit.t, "未拾取", "本例全部已发现，描述应为真实文案");
    });

    it("详情卡：带 spriteId 画贴图，缺图回退字母/符号，画完还原 alpha", () => {
      const { ctx, images, texts } = makeSpyCtx();
      ctx.globalAlpha = 1;

      setDetailCard({
        type: "powerup",
        data: {
          name: "火力道具", color: "#ff6633", icon: "P", got: true,
          spriteId: "powerup_power", desc: "", fullDesc: "本局火力等级 +1",
        },
      });
      drawDetailCard(ctx);
      assert.ok(images.some((m) => m.src.includes("/powerup_power.png")), "应画出道具贴图");
      assert.equal(texts.some((t) => t.t === "P"), false, "有贴图时不再画字母 P");
      assert.equal(ctx.globalAlpha, 1, "已收录：globalAlpha 必须还原为 1");

      images.length = 0; texts.length = 0;
      setDetailCard({
        type: "skill",
        data: {
          name: "火力强化", color: "#ff4488", icon: "✦", got: true, curLv: 1, max: 3,
          spriteId: "skill_not_exists", desc: "", fullDesc: "",
        },
      });
      drawDetailCard(ctx);
      assert.equal(images.length, 0, "缺图必须回退，不得画出空白");
      assert.ok(texts.some((t) => t.t === "✦"), "缺图应回退到原符号");

      images.length = 0; texts.length = 0;
      setDetailCard({
        type: "powerup",
        data: {
          name: "火力道具", color: "#ff6633", icon: "P", got: false,
          spriteId: "powerup_power", desc: "", fullDesc: "",
        },
      });
      drawDetailCard(ctx);
      assert.ok(images.length === 1, "未收录也画贴图（只是压暗）");
      assert.equal(ctx.globalAlpha, 1, "未收录的压暗不得泄漏到后续绘制");

      setDetailCard(null);
    });

    it("详情卡无 spriteId（成就等）走原字母分支", () => {
      const { ctx, images, texts } = makeSpyCtx();
      setDetailCard({
        type: "achievement",
        data: { name: "首杀", color: "#ffd700", icon: "A", achieved: true, reward: 10, desc: "" },
      });
      drawDetailCard(ctx);
      assert.equal(images.length, 0, "成就没有贴图，不应调用 drawImage");
      assert.ok(texts.some((t) => t.t === "A"), "应保留原字母绘制");
      setDetailCard(null);
    });
  });

  // ---------- 回归：toast 可指定纵向位置，不再压住结算大标题 ----------
  it("drawToast 默认位于 0.38H，结算态可下移/上移避让", () => {
    const { ctx, texts } = makeSpyCtx();
    drawToast(ctx, { text: "成就达成", color: "#7CFC00", t: 1 }, 0.38);
    const y38 = texts.find(t => t.t === "成就达成").y;
    assert.ok(Math.abs(y38 - H * 0.38) < 0.5, "默认应落在 0.38H，实测 " + y38);

    texts.length = 0;
    drawToast(ctx, { text: "成就达成", color: "#7CFC00", t: 1 }, 0.20);
    const y20 = texts.find(t => t.t === "成就达成").y;
    assert.ok(Math.abs(y20 - H * 0.20) < 0.5, "结算态应落在 0.20H，实测 " + y20);
    assert.ok(y20 < y38, "结算态的横幅必须离开大标题所在的 0.30~0.40H 区间");
  });

  it("drawToast 对 t<=0 或空对象不绘制", () => {
    const { ctx, texts } = makeSpyCtx();
    drawToast(ctx, null);
    drawToast(ctx, { text: "x", color: "#fff", t: 0 });
    assert.equal(texts.length, 0);
  });

  // ---------- 回归：天赋购买确认框 ----------
  it("天赋确认框绘制标题/天赋名/确认与取消按钮", () => {
    setTalentConfirm({ id: "t_dmg1", name: "攻击强化I", cost: 100, desc: "基础伤害+1" });
    drawTalentConfirm(makeCtx());
    assert.ok(getTalentConfirmYesButton(), "应暴露确认按钮");
    assert.ok(getTalentConfirmNoButton(), "应暴露取消按钮");
    const yes = getTalentConfirmYesButton(), no = getTalentConfirmNoButton();
    assert.ok(yes.x + yes.w <= no.x || no.x + no.w <= yes.x, "确认/取消按钮不得重叠");
    setTalentConfirm(null);
    assert.doesNotThrow(() => drawTalentConfirm(makeCtx()));
  });

  it("setMenuPage 切页时清掉 talentConfirm，避免跨页残留", () => {
    setMenuPage("talent");   // 先到一个非 main 页
    setTalentConfirm({ id: "x", name: "x", cost: 1, desc: "" });
    setMenuPage("main");     // 切回 main 应顺带清掉确认框
    assert.equal(getTalentConfirm(), null);
  });
});
