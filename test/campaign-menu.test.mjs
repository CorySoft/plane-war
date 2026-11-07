import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeCtx, resetStorage } from "./_env.mjs";
import { DIFFICULTY_PRESETS, H, setViewport } from "../js/config.js";
import { resetMeta, loadMeta } from "../js/meta.js";
import { drawMenu, getCampaignButton, getStartButton, hitTestButton, setMenuPage } from "../js/ui.js";

describe("campaign menu entry", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
    setViewport(480, 720);
    setMenuPage("main");
  });

  it("draws a distinct campaign CTA marked new with an independent hit target", () => {
    const ctx = makeCtx();
    const labels = [];
    ctx.fillText = text => labels.push(String(text));
    drawMenu(ctx, 0, "normal", DIFFICULTY_PRESETS, [], null);
    const start = getStartButton();
    const campaign = getCampaignButton();
    assert.ok(start && campaign);
    assert.ok(campaign.y >= start.y + start.h);
    assert.equal(hitTestButton(campaign.x + campaign.w / 2, campaign.y + campaign.h / 2, campaign), true);
    assert.equal(hitTestButton(start.x + start.w / 2, start.y + start.h / 2, campaign), false);
    assert.ok(campaign.y + campaign.h + 12 < H * 0.64, "campaign button must not overlap navigation tiles");
    assert.ok(labels.includes("战役模式") && labels.includes("新"));
  });
});
