import { test } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { makeCtx } from "./_env.mjs";
import {
  glowText, softPanel, lineBtn, bar, hexToRgba, pulse, C,
} from "../js/theme.js";
import { drawHUD } from "../js/hud.js";

test("theme: hexToRgba 与 pulse 语义正确", () => {
  assert.equal(hexToRgba("#5ee6ff", 0.5), "rgba(94,230,255,0.5)");
  assert.equal(hexToRgba("#5ef", 1), "rgba(85,238,255,1)");
  assert.equal(hexToRgba("rgba(0,0,0,.2)", 1), "rgba(0,0,0,.2)");
  assert.ok(C.cyan && C.gold && C.track);
  for (let i = 0; i < 20; i++) {
    const v = pulse(i * 0.37, 4);
    assert.ok(v >= 0 && v <= 1, "pulse 值域应落在 0..1");
  }
});

test("theme: 绘制助手在 mock ctx 上不抛错", () => {
  const ctx = makeCtx();
  assert.doesNotThrow(() => {
    glowText(ctx, { text: "hello", x: 10, y: 20, size: 18, color: "#fff" });
    softPanel(ctx, 5, 5, 100, 60, 12, { glow: 4 });
    lineBtn(ctx, 10, 10, 90, 34, "#5ee6ff", "确定", { size: 16 });
    bar(ctx, 5, 5, 80, 8, 0.6, "#7dffb0", { glow: 5 });
  });
});

function fakePlayer() {
  return {
    power: 4,
    shield: 0,
    maxShield: 3,
    powerTime: 0,
    level: 2,
    skills: { range: 1, dmg: 0, crit: 0, maxhp: 0 },
    buffs: {
      rapid: 6, speed: 0, double: 4, magnet: 0, madHunt: 0, drop: 0, critboost: 5,
    },
  };
}

test("drawHUD: 高分连击与多 buff 下正常绘制（含计数趋近）", () => {
  const ctx = makeCtx();
  const base = {
    score: 12345, best: 9000, level: 4, enemyLevel: 3, pLevel: 2,
    xp: 30, xpNeed: 60, lives: 3, maxLives: 3, combo: 10,
    player: fakePlayer(), frame: 1,
  };
  assert.doesNotThrow(() => drawHUD(ctx, base));
  // 二次调用触发分数跨帧趋近路径
  assert.doesNotThrow(() => drawHUD(ctx, { ...base, score: 16000, frame: 2 }));
  // 低血量、低连击路径
  assert.doesNotThrow(() => drawHUD(ctx, { ...base, lives: 1, combo: 2, frame: 3 }));
});
