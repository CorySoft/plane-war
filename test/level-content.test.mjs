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
  it("validates all twelve stages, five-beat arcs, registered patterns, and beat budgets", async () => {
    const manifest = validateCampaignManifest(await readJson("campaign-01.v2.json"), "campaign-01");
    const refs = manifest.chapters.flatMap(chapter =>
      chapter.stages.map(stageId => ({ chapterId: chapter.id, stageId })),
    );
    assert.equal(refs.length, manifest.chapters.reduce((n, c) => n + c.stages.length, 0));
    assert.equal(refs.length, 12);

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
      "aimed", "cross", "fan", "laser", "laserGrid", "petal", "pincerWave", "rain", "ring", "spiral", "stack", "wall",
    ]);
  });

  it("beat 角色均有玩家可读中文映射，内部 role 不会弹给玩家", async () => {
    const { beatLabel } = await import("../js/level/loader.js");
    const manifest = validateCampaignManifest(await readJson("campaign-01.v2.json"), "campaign-01");
    const roles = new Set();
    for (const chapter of manifest.chapters) {
      for (const stageId of chapter.stages) {
        const stage = await readJson(`${stageId}.json`);
        for (const beat of stage.beats) {
          roles.add(beat.role);
          const label = beatLabel(beat.role);
          assert.ok(label, `${stageId}.${beat.id} 的 role=${beat.role} 缺少中文映射`);
          assert.notEqual(label, beat.role, `role=${beat.role} 不能原样展示给玩家`);
          assert.ok(!/test|debug/i.test(label), `${beat.role} 的中文映射不得含开发标识`);
        }
      }
    }
    assert.ok(roles.has("test"), "内部 test 节拍仍存在，只是不再直接展示");
  });
});
