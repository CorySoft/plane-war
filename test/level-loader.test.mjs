import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_VERSION } from "../js/version.js";
import {
  createCampaignRunner,
  getCampaignId,
  loadCampaign,
  loadCampaignSafely,
} from "../js/level/loader.js";
import { validateStage } from "../js/level/schema.js";

const readJson = async name => JSON.parse(
  await readFile(new URL(`../assets/levels/${name}.json`, import.meta.url), "utf8"),
);

describe("campaign loader", () => {
  it("接受随版本管理的首批 manifest 与全部关卡", async () => {
    const manifest = await readJson("campaign-01");
    const requested = [];
    const fetchImpl = async url => {
      requested.push(url);
      const name = url.split("/").at(-1).split("?")[0].replace(".json", "");
      return { ok: true, json: async () => readJson(name) };
    };

    const campaign = await loadCampaign("campaign-01", { fetchImpl, version: APP_VERSION });
    assert.equal(campaign.id, "campaign-01");
    assert.equal(campaign.chapters[0].stages.length, manifest.chapters[0].stages.length);
    assert.deepEqual(campaign.chapters[0].stages.map(stage => stage.id), [
      "level-01", "level-02", "level-03",
    ]);
    assert.ok(requested.every(url => url.endsWith(`?v=${APP_VERSION}`)));
  });

  it("无 campaign 参数保持默认模式，非法 campaign 显式返回加载错误", async () => {
    assert.equal(getCampaignId(""), null);
    assert.equal(getCampaignId("?mode=classic&campaign=campaign-01"), "campaign-01");

    const absent = await loadCampaignSafely(null);
    assert.deepEqual(absent, { campaign: null, error: null });
    const invalid = await loadCampaignSafely("../private");
    assert.equal(invalid.campaign, null);
    assert.match(invalid.error.message, /campaign id/);
    const missing = await loadCampaignSafely("campaign-01", {
      fetchImpl: async () => ({ ok: false, status: 404 }),
    });
    assert.equal(missing.campaign, null);
    assert.match(missing.error.message, /HTTP 404/);
  });

  it("拒绝偏离共享 scoreAxis 与未知敌种的关卡数据", async () => {
    const valid = await readJson("level-01");
    const wrongAxis = structuredClone(valid);
    wrongAxis.difficulty.scoreAxis[0].enemyLevel = 2;
    assert.throws(() => validateStage(wrongAxis), /shared SCORE_AXIS/);

    const wrongEnemy = structuredClone(valid);
    wrongEnemy.beats[0].waves[0].spawns[0].type = "unknown";
    assert.throws(() => validateStage(wrongEnemy), /unknown enemy type/);
  });

  it("按 telegraph 和队形间隔派发事件，再等待清场推进节拍", async () => {
    const stage = await readJson("level-01");
    const runner = createCampaignRunner({
      chapters: [{ stages: [stage] }],
    });

    assert.deepEqual(runner.update(0.99, 0).events, []);
    assert.equal(runner.update(0.02, 0).events.length, 1);
    assert.equal(runner.update(0.71, 1).events.length, 1);
    assert.equal(runner.update(0.7, 2).events.length, 1);
    const transition = runner.update(0, 0);
    assert.equal(transition.beatChanged, true);
    assert.equal(runner.beat.id, "test-aimed");
  });

  it("time/hybrid 正常推进，超时时丢弃未派发事件", async () => {
    const source = await readJson("level-01");
    const restRunner = createCampaignRunner({
      chapters: [{ stages: [{ ...source, beats: [source.beats[3]] }] }],
    });
    assert.equal(restRunner.update(4.1, 0).complete, true);

    const hybridRunner = createCampaignRunner({
      chapters: [{ stages: [{ ...source, beats: [source.beats[1]] }] }],
    });
    const hybridEvents = hybridRunner.update(3.1, 0);
    assert.equal(hybridEvents.events.length, 5);
    const hybridAdvance = hybridRunner.update(0, 0);
    assert.equal(hybridAdvance.complete, true);
    assert.equal(hybridAdvance.timedOut, false);

    const timeoutRunner = createCampaignRunner({
      chapters: [{ stages: [{ ...source, beats: [source.beats[1]] }] }],
    });
    const timeout = timeoutRunner.update(24.1, 0);
    assert.deepEqual(timeout.events, []);
    assert.equal(timeout.skippedEvents, 5);
    assert.equal(timeout.timedOut, true);
  });

  it("beat 密度预算不能突破 stage 上限", async () => {
    const stage = await readJson("level-01");
    const invalid = structuredClone(stage);
    invalid.densityBudget.maxHostileActive = 100;
    invalid.beats[0].densityBudget.maxHostileActive = 101;
    assert.throws(() => validateStage(invalid), /must not exceed its stage budget/);

    const overfull = structuredClone(stage);
    const oversizedWave = structuredClone(overfull.beats[0].waves[0]);
    oversizedWave.spawns[0].count = 60;
    overfull.beats[0].waves.push(oversizedWave);
    assert.throws(() => validateStage(overfull), /at most 60 enemies per beat/);
  });
});
