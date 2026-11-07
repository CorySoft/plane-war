import { W } from "../config.js";
import {
  validateCampaignManifest,
  validateStage,
} from "./schema.js";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FETCH_TIMEOUT_MS = 8000;

// beat.role 是关卡内部标识（teach/test/twist/rest/boss），不能直接展示给玩家。
// 玩家可见的节拍提示统一走这里的中文映射；未知 role 返回空串，宁可不弹也不弹英文。
const BEAT_LABELS = {
  teach: "教学",
  test: "实战",
  twist: "变招",
  rest: "喘息",
  boss: "首领战",
};

export function beatLabel(role) {
  return BEAT_LABELS[role] || "";
}

export function getCampaignId(search = "") {
  return new URLSearchParams(search).get("campaign");
}

async function fetchJson(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      cache: "no-cache",
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "error"}`);
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to load ${url}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadCampaign(id, {
  fetchImpl = globalThis.fetch,
  version = "dev",
} = {}) {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new TypeError("campaign id must use lowercase letters, digits, or hyphens");
  }
  if (typeof fetchImpl !== "function") throw new Error("Fetch is not available");

  const versionQuery = `?v=${encodeURIComponent(version)}`;
  const manifestUrl = `assets/levels/${id}.json${versionQuery}`;
  const manifest = validateCampaignManifest(await fetchJson(fetchImpl, manifestUrl), id);
  const stageRefs = manifest.chapters.flatMap(chapter =>
    chapter.stages.map(stageId => ({ chapterId: chapter.id, stageId })),
  );
  const stageEntries = await Promise.all(stageRefs.map(async ref => {
    const stageUrl = `assets/levels/${ref.stageId}.json${versionQuery}`;
    const stage = validateStage(await fetchJson(fetchImpl, stageUrl), {
      expectedId: ref.stageId,
      expectedChapterId: ref.chapterId,
    });
    return [ref.stageId, stage];
  }));
  const stageById = new Map(stageEntries);

  return {
    ...manifest,
    chapters: manifest.chapters.map(chapter => ({
      ...chapter,
      stages: chapter.stages.map(stageId => stageById.get(stageId)),
    })),
  };
}

export async function loadCampaignSafely(id, options) {
  if (id === null || id === undefined || id === "") return { campaign: null, error: null };
  try {
    return { campaign: await loadCampaign(id, options), error: null };
  } catch (error) {
    return { campaign: null, error };
  }
}

function formationOffsets(formation, count) {
  const mid = (count - 1) / 2;
  const spacing = formation.spacing;
  return Array.from({ length: count }, (_, i) => {
    const centered = i - mid;
    switch (formation.type) {
      case "column": return [0, i * spacing];
      case "v": return [centered * spacing, Math.abs(centered) * spacing * 0.55];
      case "pincer": return [centered * spacing, -Math.abs(centered) * spacing * 0.35];
      default: return [centered * spacing, 0];
    }
  });
}

function beatEvents(stage, beat) {
  const events = [];
  const telegraphSec = beat.telegraphSec ?? 0;
  for (const wave of beat.waves) {
    const delaySec = telegraphSec + (wave.delaySec ?? 0);
    if (wave.bossType) {
      events.push({ atSec: delaySec, type: "boss", bossType: wave.bossType });
    }
    for (const spawn of wave.spawns) {
      const formation = stage.formations[spawn.formation];
      const offsets = formationOffsets(formation, spawn.count);
      offsets.forEach(([dx, dy], index) => {
        events.push({
          atSec: delaySec + index * (spawn.intervalSec ?? 0),
          type: "enemy",
          enemyType: spawn.type,
          patternRef: spawn.patternRef ?? null,
          params: spawn.params ?? null,
          x: Math.max(20, Math.min(W - 20, spawn.centerX * W + dx)),
          y: spawn.spawnY + dy,
        });
      });
    }
  }
  return events.sort((a, b) => a.atSec - b.atSec);
}

export function createCampaignRunner(campaign, { startStageId = null } = {}) {
  const stages = campaign.chapters.flatMap(chapter => chapter.stages);
  if (stages.length === 0) throw new TypeError("campaign must contain at least one stage");

  const requestedStageIndex = startStageId === null
    ? 0
    : stages.findIndex(stage => stage.id === startStageId);
  if (requestedStageIndex < 0) {
    throw new TypeError(`campaign start stage "${startStageId}" does not exist`);
  }
  let stageIndex = requestedStageIndex;
  let beatIndex = 0;
  let beatElapsed = 0;
  let pending = [];
  let pendingIndex = 0;
  let complete = false;

  function enterBeat() {
    beatElapsed = 0;
    pending = beatEvents(stages[stageIndex], stages[stageIndex].beats[beatIndex]);
    pendingIndex = 0;
  }

  enterBeat();

  function currentStage() {
    return stages[stageIndex] ?? null;
  }

  function currentBeat() {
    return currentStage()?.beats[beatIndex] ?? null;
  }

  function currentDensityBudget() {
    const stage = currentStage();
    const beat = currentBeat();
    return {
      ...stage.densityBudget,
      ...(beat?.densityBudget || {}),
    };
  }

  return {
    get stage() { return currentStage(); },
    get beat() { return currentBeat(); },
    get isComplete() { return complete; },
    get densityBudget() { return currentDensityBudget(); },

    update(dt, enemyCount) {
      if (complete) {
        return {
          events: [], beatChanged: false, stageChanged: false, complete: true,
          timedOut: false, skippedEvents: 0,
        };
      }
      beatElapsed += Math.max(0, dt);

      const beat = currentBeat();
      const advance = beat.advance;
      const deadlineReached = advance.type === "allCleared"
        ? beatElapsed >= advance.timeoutSec
        : advance.type === "hybrid" && beatElapsed >= advance.timeoutSec;
      const events = [];
      let skippedEvents = 0;
      if (deadlineReached) {
        skippedEvents = pending.length - pendingIndex;
        pendingIndex = pending.length;
      } else {
        while (pendingIndex < pending.length && pending[pendingIndex].atSec <= beatElapsed) {
          const { atSec, ...event } = pending[pendingIndex++];
          events.push(event);
        }
      }

      const allSpawned = pendingIndex >= pending.length;
      const cleared = allSpawned && events.length === 0 && skippedEvents === 0 && enemyCount === 0;
      let shouldAdvance = false;
      let timedOut = false;
      if (advance.type === "time") {
        shouldAdvance = beatElapsed >= advance.atSec && allSpawned;
      } else if (advance.type === "allCleared") {
        shouldAdvance = cleared || beatElapsed >= advance.timeoutSec;
        timedOut = shouldAdvance && !cleared;
      } else {
        shouldAdvance = (beatElapsed >= advance.atSec && cleared) || beatElapsed >= advance.timeoutSec;
        timedOut = shouldAdvance && !cleared;
      }

      let beatChanged = false;
      let stageChanged = false;
      if (shouldAdvance) {
        if (beatIndex + 1 < currentStage().beats.length) {
          beatIndex++;
          enterBeat();
          beatChanged = true;
        } else if (stageIndex + 1 < stages.length) {
          stageIndex++;
          beatIndex = 0;
          enterBeat();
          stageChanged = true;
        } else {
          complete = true;
        }
      }

      return {
        events,
        beatChanged,
        stageChanged,
        complete,
        timedOut,
        stage: currentStage(),
        beat: currentBeat(),
        densityBudget: currentDensityBudget(),
        skippedEvents,
      };
    },
  };
}
