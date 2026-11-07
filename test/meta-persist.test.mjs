/* ===========================================================
 * meta-persist.test.mjs — 「改了内存必须落盘」
 * 每个购买/消费/结算入口执行后，直接用 loadMeta() 从 localStorage
 * 重新读取（模拟刷新），断言改动仍在；防止只 flush 不置 dirty 的静默丢失。
 * =========================================================== */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { resetStorage } from "./_env.mjs";
import { META, SHOP_ITEMS, DAILY_QUESTS, getShopItemCost } from "../js/config.js";
import {
  resetMeta, loadMeta, bonusStardust, earnStardust, spendStardust,
  unlockAircraft, isAircraftUnlocked, purchaseTalent, isTalentPurchased,
  purchaseShopItem, getShopLevel, getStardust,
  questEvent, claimQuest, getQuestView,
} from "../js/meta.js";

function reload() {
  return loadMeta();
}

describe("meta 持久化：购买/消费后模拟刷新仍生效", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
  });

  it("解锁战机：刷新后仍解锁且星尘已扣", () => {
    const cost = META.aircraft.blaze.cost;
    bonusStardust(cost + 100);
    const before = getStardust();
    assert.equal(unlockAircraft("blaze"), true);
    reload();
    assert.equal(isAircraftUnlocked("blaze"), true, "刷新后烈焰应仍解锁");
    assert.equal(getStardust(), before - cost, "刷新后星尘应已扣除");
  });

  it("购买天赋：刷新后仍已购且星尘已扣", () => {
    const t = META.talents.find(x => x.id === "t_dmg1");
    bonusStardust(t.cost + 50);
    const before = getStardust();
    assert.equal(purchaseTalent(t.id), true);
    reload();
    assert.equal(isTalentPurchased(t.id), true);
    assert.equal(getStardust(), before - t.cost);
  });

  it("购买商城道具：刷新后等级保留且星尘已扣", () => {
    const item = SHOP_ITEMS.find(s => s.max > 0);
    bonusStardust(100000);
    const before = getStardust();
    assert.equal(purchaseShopItem(item.id), true);
    reload();
    assert.equal(getShopLevel(item.id), 1);
    assert.equal(getStardust(), before - getShopItemCost(item, 0));
  });

  it("spendStardust：刷新后余额保留", () => {
    bonusStardust(100);
    assert.equal(spendStardust(30), true);
    reload();
    assert.equal(getStardust(), 70);
  });

  it("earnStardust 结算：刷新后收益保留", () => {
    for (let i = 0; i < META.newbieRuns; i++) earnStardust(0);
    const before = getStardust();
    earnStardust(META.stardustPerScore * 2);
    reload();
    assert.equal(getStardust(), before + 2);
  });

  it("bonusStardust 奖励：刷新后仍入账", () => {
    bonusStardust(123);
    reload();
    assert.equal(getStardust(), 123);
  });

  it("claimQuest：刷新后任务仍是已领取", () => {
    const q = DAILY_QUESTS.find(d => d.target > 0);
    bonusStardust(0);
    questEvent(q.type, q.target);
    const reward = claimQuest(q.id);
    assert.ok(reward > 0, "任务应可领取");
    reload();
    const item = getQuestView().items.find(i => i.def.id === q.id);
    assert.equal(item.claimed, true, "刷新后任务不得变回可领取");
  });
});