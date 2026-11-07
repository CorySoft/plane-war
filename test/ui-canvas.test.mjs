import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { resetMeta, loadMeta } from "../js/meta.js";
import { DIFFICULTY_PRESETS } from "../js/config.js";
import {
  clearDamageNumbers,
  drawClearCacheConfirm,
  drawDamageNumbers,
  drawDetailCard,
  drawGameOver,
  drawHangarConfirm,
  drawLevelUp,
  drawMenu,
  drawPause,
  drawPauseButton,
  drawRevive,
  drawStars,
  drawTalentConfirm,
  drawToast,
  getClearNoButton,
  getClearYesButton,
  getHangarConfirmNoButton,
  getHangarConfirmYesButton,
  getTalentConfirmNoButton,
  getTalentConfirmYesButton,
  initStars,
  setDetailCard,
  setHangarConfirm,
  setMenuPage,
  setShowClearCache,
  setTalentConfirm,
  spawnDamageNumber,
} from "../js/ui.js";

function makeTrackedContext() {
  const state = { depth: 0, saves: 0, restores: 0, underflows: 0, texts: [] };
  const gradient = { addColorStop() {} };
  const target = {
    canvas: { width: 480, height: 720 },
    globalAlpha: 1,
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    save() {
      state.depth++;
      state.saves++;
    },
    restore() {
      state.restores++;
      if (state.depth === 0) state.underflows++;
      else state.depth--;
    },
    fillText(text) {
      state.texts.push(String(text));
    },
  };
  const noop = () => {};
  const ctx = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === "symbol") return undefined;
      obj[prop] = noop;
      return obj[prop];
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
  return { ctx, state };
}

function assertBalanced(label, render) {
  const { ctx, state } = makeTrackedContext();
  render(ctx);
  assert.equal(state.underflows, 0, `${label} called restore without a matching save`);
  assert.equal(state.depth, 0, `${label} left ${state.depth} unmatched save(s)`);
  assert.equal(state.saves, state.restores, `${label} save/restore counts differ`);
  return state;
}

describe("UI canvas state stack", () => {
  it("balances save/restore for every menu page and major overlay", () => {
    resetStorage();
    resetMeta();
    loadMeta();
    clearDamageNumbers();
    initStars();

    for (const page of [
      "main", "hangar", "talent", "codex", "achieve", "settings", "powerupCodex", "shop",
    ]) {
      setMenuPage(page);
      assertBalanced(`drawMenu(${page})`, ctx =>
        drawMenu(ctx, 0, "normal", DIFFICULTY_PRESETS, []));
    }

    assertBalanced("drawStars", ctx => drawStars(ctx, 1));
    spawnDamageNumber(20, 20, "1");
    assertBalanced("drawDamageNumbers", ctx => drawDamageNumbers(ctx));
    assertBalanced("drawGameOver", ctx => drawGameOver(ctx, 100, 50));
    assertBalanced("drawLevelUp", ctx =>
      drawLevelUp(ctx, [{ id: "dmg", name: "火力", desc: "伤害提升", color: "#fff" }], {}));
    assertBalanced("drawPauseButton", ctx => drawPauseButton(ctx));
    assertBalanced("drawPause", ctx => drawPause(ctx, null));
    assertBalanced("drawToast", ctx =>
      drawToast(ctx, { text: "提示", color: "#fff", t: 1 }));
    assertBalanced("drawRevive", ctx => drawRevive(ctx, 100, 20));

    setDetailCard({
      type: "achievement",
      data: { name: "首杀", color: "#ffd700", icon: "A", achieved: true, desc: "" },
    });
    assertBalanced("drawDetailCard", ctx => drawDetailCard(ctx));
    setDetailCard(null);

    setShowClearCache(true);
    const clearState = assertBalanced("drawClearCacheConfirm", ctx => drawClearCacheConfirm(ctx));
    assert.ok(getClearYesButton() && getClearNoButton());
    assert.ok(clearState.texts.includes("确认清除") && clearState.texts.includes("取消"));
    setShowClearCache(false);

    setHangarConfirm({ id: "falcon", name: "战机", cost: 10 });
    const hangarState = assertBalanced("drawHangarConfirm", ctx => drawHangarConfirm(ctx));
    assert.ok(getHangarConfirmYesButton() && getHangarConfirmNoButton());
    assert.ok(hangarState.texts.includes("确认") && hangarState.texts.includes("取消"));
    setHangarConfirm(null);

    setTalentConfirm({ id: "t_dmg1", name: "强化", cost: 10, desc: "伤害提升" });
    const talentState = assertBalanced("drawTalentConfirm", ctx => drawTalentConfirm(ctx));
    assert.ok(getTalentConfirmYesButton() && getTalentConfirmNoButton());
    assert.ok(talentState.texts.includes("确认") && talentState.texts.includes("取消"));
    setTalentConfirm(null);
  });
});
