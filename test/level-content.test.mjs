import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SCORE_AXIS } from "../js/config.js";
import { patternBulletCount } from "../js/level/patterns.js";
import { validateCampaignManifest, validateStage } from "../js/level/schema.js";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../assets/levels/${path}`, import.meta.url), "utf8"));
}

describe("campaign chapter content", () => {
  it("validates all six stages, five-beat arcs, registered patterns, and beat budgets", async () => {
    const manifest = validateCampaignManifest(await readJson("campaign-01.json"), "campaign-01");
    const refs = manifest.chapters.flatMap(chapter =>
      chapter.stages.map(stageId => ({ chapterId: chapter.id, stageId })),
    );
    assert.equal(refs.length, 6);

    const usedPatterns = new Set();
    for (const { chapterId, stageId } of refs) {
      const stage = validateStage(await readJson(`${stageId}.json`), {
        expectedId: stageId,
        expectedChapterId: chapterId,
      });
      assert.equal(stage.beats.length, 5, `${stageId} beat count`);
      assert.deepEqual(stage.beats.map(beat => beat.role), ["teach", "test", "twist", "rest", "boss"]);
      assert.deepEqual(stage.difficulty.scoreAxis, SCORE_AXIS);
      for (const pattern of stage.patterns) usedPatterns.add(pattern);

      for (const beat of stage.beats) {
        const budget = beat.densityBudget ?? stage.densityBudget;
        for (const wave of beat.waves) {
          let plannedWaveBullets = 0;
          for (const spawn of wave.spawns) {
            assert.ok(stage.patterns.includes(spawn.patternRef), `${stageId}:${spawn.type} needs a declared patternRef`);
            const count = patternBulletCount(spawn.patternRef, spawn.params ?? {});
            assert.ok(count <= budget.maxHostileActive, `${stageId}:${spawn.patternRef} exceeds active budget`);
            assert.ok(count <= budget.maxHostileBulletsPerSec, `${stageId}:${spawn.patternRef} exceeds rate budget`);
            plannedWaveBullets += spawn.count * count;
          }
          assert.ok(plannedWaveBullets <= budget.maxHostileActive, `${stageId}:${beat.id} wave aggregate exceeds active budget`);
          assert.ok(plannedWaveBullets <= budget.maxHostileBulletsPerSec, `${stageId}:${beat.id} wave aggregate exceeds rate budget`);
        }
      }
    }

    assert.deepEqual([...usedPatterns].sort(), [
      "aimed", "fan", "laser", "laserGrid", "petal", "rain", "ring", "spiral", "stack",
    ]);
  });
});
