import { BULLET, ENEMY_TYPES, SCORE_AXIS } from "../config.js";
import { BOSS_TYPES } from "../wave.js";
import { patternBulletCount, validatePatternParams } from "./patterns.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ROLES = new Set(["teach", "test", "twist", "rest", "elite", "boss"]);
const FORMATION_TYPES = new Set(["line", "v", "column", "pincer"]);
const MAX_CAMPAIGN_STAGES = 30;
const MAX_BEATS_PER_STAGE = 30;
const MAX_ENEMIES_PER_BEAT = 60;
const MAX_BEAT_SECONDS = 180;

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, path) {
  if (!isRecord(value)) fail(path, "must be an object");
  return value;
}

function requireString(value, path) {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value;
}

function requireId(value, path) {
  const id = requireString(value, path);
  if (!ID_PATTERN.test(id)) fail(path, "must use lowercase letters, digits, or hyphens");
  return id;
}

function requireFinite(value, path, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(path, `must be a finite number in [${min}, ${max}]`);
  }
  return value;
}

function requireInteger(value, path, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(path, `must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function validateDensityBudget(budget, path, parent = null) {
  requireRecord(budget, path);
  const maxActive = requireInteger(
    budget.maxHostileActive,
    `${path}.maxHostileActive`,
    0,
    BULLET.hostileScreenCap,
  );
  const maxRate = requireFinite(
    budget.maxHostileBulletsPerSec,
    `${path}.maxHostileBulletsPerSec`,
    0,
    BULLET.hostileSpawnRateCap,
  );
  if (parent && (maxActive > parent.maxHostileActive || maxRate > parent.maxHostileBulletsPerSec)) {
    fail(path, "beat budget must not exceed its stage budget");
  }
  return { maxHostileActive: maxActive, maxHostileBulletsPerSec: maxRate };
}

function validateAdvance(advance, path) {
  requireRecord(advance, path);
  switch (advance.type) {
    case "time":
      requireFinite(advance.atSec, `${path}.atSec`, 0.05, MAX_BEAT_SECONDS);
      break;
    case "allCleared":
      requireFinite(advance.timeoutSec, `${path}.timeoutSec`, 0.1, MAX_BEAT_SECONDS);
      break;
    case "hybrid":
      requireFinite(advance.atSec, `${path}.atSec`, 0.05, MAX_BEAT_SECONDS);
      requireFinite(advance.timeoutSec, `${path}.timeoutSec`, advance.atSec, MAX_BEAT_SECONDS);
      break;
    default:
      fail(`${path}.type`, 'must be "time", "allCleared", or "hybrid"');
  }
}

function validateWave(wave, stage, path, beatBudget) {
  requireRecord(wave, path);
  requireFinite(wave.delaySec ?? 0, `${path}.delaySec`, 0, MAX_BEAT_SECONDS);
  if (!Array.isArray(wave.spawns)) fail(`${path}.spawns`, "must be an array");
  if (wave.bossType !== undefined) {
    if (!Object.hasOwn(BOSS_TYPES, wave.bossType)) fail(`${path}.bossType`, "references an unknown boss");
  }
  if (wave.spawns.length === 0 && wave.bossType === undefined) {
    fail(path, "must contain at least one spawn or bossType");
  }

  let totalCount = 0;
  for (let i = 0; i < wave.spawns.length; i++) {
    const spawn = requireRecord(wave.spawns[i], `${path}.spawns[${i}]`);
    if (!Object.hasOwn(ENEMY_TYPES, spawn.type)) {
      fail(`${path}.spawns[${i}].type`, "references an unknown enemy type");
    }
    const count = requireInteger(spawn.count, `${path}.spawns[${i}].count`, 1, MAX_ENEMIES_PER_BEAT);
    totalCount += count;
    if (totalCount > MAX_ENEMIES_PER_BEAT) {
      fail(`${path}.spawns`, `may request at most ${MAX_ENEMIES_PER_BEAT} enemies per beat`);
    }
    if (!Object.hasOwn(stage.formations, spawn.formation)) {
      fail(`${path}.spawns[${i}].formation`, "references an unknown formation");
    }
    requireFinite(spawn.centerX, `${path}.spawns[${i}].centerX`, 0, 1);
    requireFinite(spawn.spawnY, `${path}.spawns[${i}].spawnY`, -720, 720);
    requireFinite(spawn.intervalSec ?? 0, `${path}.spawns[${i}].intervalSec`, 0, 30);
    if (spawn.patternRef !== undefined) {
      if (!stage.patterns.includes(spawn.patternRef)) {
        fail(`${path}.spawns[${i}].patternRef`, "references an unknown pattern");
      }
      try {
        validatePatternParams(spawn.patternRef, spawn.params ?? {});
        const emissionSize = patternBulletCount(spawn.patternRef, spawn.params ?? {});
        if (emissionSize > beatBudget.maxHostileActive
            || emissionSize > beatBudget.maxHostileBulletsPerSec) {
          fail(`${path}.spawns[${i}].params`, "one emission exceeds the beat density budget");
        }
      } catch (error) {
        if (error instanceof TypeError && error.message.startsWith(`${path}.spawns[${i}].params`)) {
          throw error;
        }
        fail(`${path}.spawns[${i}].patternRef`, error.message);
      }
    } else if (spawn.params !== undefined) {
      fail(`${path}.spawns[${i}].params`, "requires patternRef");
    }
  }
  return totalCount;
}

export function validateCampaignManifest(manifest, expectedId) {
  requireRecord(manifest, "campaign");
  if (manifest.schemaVersion !== 1) fail("campaign.schemaVersion", "must be 1");
  const id = requireId(manifest.id, "campaign.id");
  if (expectedId && id !== expectedId) fail("campaign.id", "does not match the requested campaign");
  requireString(manifest.title, "campaign.title");
  if (!Array.isArray(manifest.chapters) || manifest.chapters.length === 0) {
    fail("campaign.chapters", "must be a non-empty array");
  }

  let totalStages = 0;
  const chapterIds = new Set();
  const stageIds = new Set();
  for (let i = 0; i < manifest.chapters.length; i++) {
    const chapter = requireRecord(manifest.chapters[i], `campaign.chapters[${i}]`);
    const chapterId = requireId(chapter.id, `campaign.chapters[${i}].id`);
    if (chapterIds.has(chapterId)) fail(`campaign.chapters[${i}].id`, "must be unique");
    chapterIds.add(chapterId);
    requireString(chapter.title, `campaign.chapters[${i}].title`);
    if (!Array.isArray(chapter.stages) || chapter.stages.length === 0) {
      fail(`campaign.chapters[${i}].stages`, "must be a non-empty array");
    }
    for (let j = 0; j < chapter.stages.length; j++) {
      const stageId = requireId(chapter.stages[j], `campaign.chapters[${i}].stages[${j}]`);
      if (stageIds.has(stageId)) fail(`campaign.chapters[${i}].stages[${j}]`, "must be unique");
      stageIds.add(stageId);
      totalStages++;
    }
  }
  if (totalStages > MAX_CAMPAIGN_STAGES) {
    fail("campaign.chapters", `may contain at most ${MAX_CAMPAIGN_STAGES} stages`);
  }
  return manifest;
}

export function validateStage(stage, { expectedId, expectedChapterId } = {}) {
  requireRecord(stage, "stage");
  if (stage.schemaVersion !== 1) fail("stage.schemaVersion", "must be 1");
  const id = requireId(stage.id, "stage.id");
  if (expectedId && id !== expectedId) fail("stage.id", "does not match the manifest reference");
  const chapterId = requireId(stage.chapterId, "stage.chapterId");
  if (expectedChapterId && chapterId !== expectedChapterId) {
    fail("stage.chapterId", "does not match the containing chapter");
  }
  requireString(stage.title, "stage.title");

  requireRecord(stage.difficulty, "stage.difficulty");
  const axis = stage.difficulty.scoreAxis;
  if (!Array.isArray(axis) || axis.length !== SCORE_AXIS.length) {
    fail("stage.difficulty.scoreAxis", `must match the ${SCORE_AXIS.length}-point SCORE_AXIS`);
  }
  for (let i = 0; i < axis.length; i++) {
    const point = requireRecord(axis[i], `stage.difficulty.scoreAxis[${i}]`);
    for (const key of ["at", "playerLevel", "enemyLevel"]) {
      if (point[key] !== SCORE_AXIS[i][key]) {
        fail(`stage.difficulty.scoreAxis[${i}].${key}`, "must match the shared SCORE_AXIS");
      }
    }
  }

  const stageBudget = validateDensityBudget(stage.densityBudget, "stage.densityBudget");
  if (!Array.isArray(stage.patterns)) fail("stage.patterns", "must be an array");
  for (const pattern of stage.patterns) {
    try {
      validatePatternParams(pattern);
    } catch (error) {
      fail("stage.patterns", error.message);
    }
  }
  requireRecord(stage.formations, "stage.formations");
  for (const [name, formation] of Object.entries(stage.formations)) {
    requireId(name, `stage.formations.${name}`);
    requireRecord(formation, `stage.formations.${name}`);
    if (!FORMATION_TYPES.has(formation.type)) {
      fail(`stage.formations.${name}.type`, "must be line, v, column, or pincer");
    }
    requireFinite(formation.spacing, `stage.formations.${name}.spacing`, 0, 120);
  }

  if (!Array.isArray(stage.beats) || stage.beats.length === 0 || stage.beats.length > MAX_BEATS_PER_STAGE) {
    fail("stage.beats", `must contain 1-${MAX_BEATS_PER_STAGE} beats`);
  }
  const beatIds = new Set();
  for (let i = 0; i < stage.beats.length; i++) {
    const beat = requireRecord(stage.beats[i], `stage.beats[${i}]`);
    const beatId = requireId(beat.id, `stage.beats[${i}].id`);
    if (beatIds.has(beatId)) fail(`stage.beats[${i}].id`, "must be unique within a stage");
    beatIds.add(beatId);
    if (!ROLES.has(beat.role)) fail(`stage.beats[${i}].role`, "is not a supported beat role");
    requireFinite(beat.telegraphSec ?? 0, `stage.beats[${i}].telegraphSec`, 0, 10);
    validateAdvance(beat.advance, `stage.beats[${i}].advance`);
    const beatBudget = beat.densityBudget === undefined
      ? stageBudget
      : validateDensityBudget(beat.densityBudget, `stage.beats[${i}].densityBudget`, stageBudget);
    if (!Array.isArray(beat.waves)) fail(`stage.beats[${i}].waves`, "must be an array");
    let totalEnemies = 0;
    for (let j = 0; j < beat.waves.length; j++) {
      totalEnemies += validateWave(
        beat.waves[j], stage, `stage.beats[${i}].waves[${j}]`, beatBudget,
      );
      if (totalEnemies > MAX_ENEMIES_PER_BEAT) {
        fail(`stage.beats[${i}].waves`, `may request at most ${MAX_ENEMIES_PER_BEAT} enemies per beat`);
      }
    }
  }
  return stage;
}
