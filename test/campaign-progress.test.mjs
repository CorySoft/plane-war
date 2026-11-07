import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { resetStorage } from "./_env.mjs";
import {
  getCampaignProgress,
  loadMeta,
  recordCampaignStageCompletion,
  resetMeta,
} from "../js/meta.js";
import { createCampaignRunner } from "../js/level/loader.js";

describe("campaign progress", () => {
  beforeEach(() => {
    resetStorage();
    resetMeta();
    loadMeta();
  });

  it("old saves default to empty campaign progress", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({ stardust: 42 }));
    const data = loadMeta();
    assert.deepEqual(data.campaignProgress, {});
    assert.deepEqual(getCampaignProgress("campaign-01"), {
      completedStageIds: [],
      unlockedStageIds: [],
    });
  });

  it("records completion and unlocks the next stage across save reloads", () => {
    assert.equal(recordCampaignStageCompletion("campaign-01", "level-01", "level-02"), true);
    assert.deepEqual(getCampaignProgress("campaign-01"), {
      completedStageIds: ["level-01"],
      unlockedStageIds: ["level-01", "level-02"],
    });
    const saved = localStorage.getItem("planeWarMeta");
    assert.deepEqual(JSON.parse(saved).campaignProgress["campaign-01"].unlockedStageIds, ["level-01", "level-02"]);

    resetMeta();
    localStorage.setItem("planeWarMeta", saved);
    loadMeta();
    assert.deepEqual(getCampaignProgress("campaign-01"), {
      completedStageIds: ["level-01"],
      unlockedStageIds: ["level-01", "level-02"],
    });
  });

  it("ignores malformed progress IDs and rejects invalid completion input", () => {
    localStorage.setItem("planeWarMeta", JSON.stringify({
      campaignProgress: {
        "campaign-01": {
          completedStageIds: ["level-01", "../bad", 3],
          unlockedStageIds: ["level-02", "__proto__"],
        },
        "../bad": { completedStageIds: ["level-99"], unlockedStageIds: [] },
      },
    }));
    loadMeta();
    assert.deepEqual(getCampaignProgress("campaign-01"), {
      completedStageIds: ["level-01"],
      unlockedStageIds: ["level-01", "level-02"],
    });
    assert.equal(recordCampaignStageCompletion("campaign-01", "../bad"), false);
  });

  it("starts the runner at the requested unlocked stage and rejects unknown stages", () => {
    const makeStage = id => ({
      id,
      densityBudget: { maxHostileActive: 10, maxHostileBulletsPerSec: 10 },
      beats: [{ id: `${id}-beat`, waves: [], advance: { type: "time", atSec: 1 } }],
    });
    const campaign = {
      chapters: [{ stages: [makeStage("level-01"), makeStage("level-02")] }],
    };
    assert.equal(createCampaignRunner(campaign, { startStageId: "level-02" }).stage.id, "level-02");
    assert.throws(() => createCampaignRunner(campaign, { startStageId: "level-99" }), /does not exist/);
  });
});
