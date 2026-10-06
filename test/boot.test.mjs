/* ===========================================================
 * boot.test.mjs — 入口模块真实启动冒烟
 * 用最小 DOM/Canvas 模拟真实 import 一次 game.js，覆盖「模块顶层初始化
 * + 首帧 loop」这条线上唯一无法靠单测拼出来的路径。
 * 只要启动期抛异常，页面就会停在加载失败页，因此这里必须为真。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./_dom.mjs";

describe("boot", () => {
  it("game.js 可在最小 DOM 环境下完成初始化并标记 __gameReady", async () => {
    installDom();
    const mod = await import("../js/game.js");
    assert.ok(mod, "入口模块应能正常求值");
    assert.equal(globalThis.window.__gameReady, true, "入口必须标记启动成功，否则线上显示加载失败");
  });

  it("入口导出的调试句柄可用", async () => {
    installDom();
    await import("../js/game.js");
    const g = globalThis.window.__game;
    assert.ok(g, "应挂载 window.__game 调试句柄");
    assert.equal(typeof g.resetGame, "function");
    assert.equal(typeof g.getScore, "function");
    assert.equal(typeof g.getEnemyLevel, "function");
  });

  it("resetGame 可完成一局初始化（玩家/敌方等级/子弹就绪）", async () => {
    installDom();
    await import("../js/game.js");
    const g = globalThis.window.__game;
    g.resetGame();
    assert.equal(g.getScore(), 0);
    assert.equal(g.getEnemyLevel(), 1);
    const p = g.getPlayer();
    assert.ok(p, "resetGame 后必须存在玩家对象");
    assert.ok(g.getMaxLives() >= 1);
    assert.ok(g.getLives() >= 1);
    // 射击图案可生成（覆盖 createPlayer → getShootPattern 全链）
    const pattern = g.getShootPattern(p);
    assert.ok(Array.isArray(pattern) && pattern.length >= 1);
  });
});
