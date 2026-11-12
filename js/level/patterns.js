import { SCORE_AXIS, levelFromScore } from "../config.js";

const PATTERN_DEFAULTS = Object.freeze({
  fan: { count: 5 },
  ring: { count: 12 },
  spiral: { count: 8 },
  petal: { count: 16 },
  rain: { count: 8 },
  stack: { count: 5 },
  laserGrid: { count: 3 },
  aimed: { count: 1 },
  wall: { count: 11 },
  cross: { count: 8 },
  pincerWave: { count: 8 },
});

const PATTERN_ALIASES = Object.freeze({
  laser: "laserGrid",
  burst: "ring",
});

const PATTERN_PARAMS = Object.freeze({
  fan: ["count", "spreadDeg", "baseAngleDeg", "speed", "color", "radius", "maxRange", "life"],
  ring: ["count", "baseAngleDeg", "speed", "color", "radius", "maxRange", "life"],
  spiral: ["count", "baseAngleDeg", "angleStepDeg", "speed", "color", "radius", "maxRange", "life"],
  petal: ["count", "baseAngleDeg", "lobes", "amplitude", "speed", "color", "radius", "maxRange", "life"],
  rain: ["count", "span", "angleDeg", "speed", "color", "radius", "maxRange", "life"],
  stack: ["count", "baseAngleDeg", "speedStep", "speed", "color", "radius", "maxRange", "life"],
  laserGrid: ["count", "spacing", "speed", "color", "radius", "maxRange", "life"],
  aimed: ["speed", "color", "radius", "maxRange", "life"],
  wall: ["count", "span", "gapAt", "angleDeg", "speed", "color", "radius", "maxRange", "life"],
  cross: ["count", "baseAngleDeg", "spacing", "speed", "color", "radius", "maxRange", "life"],
  pincerWave: ["count", "spreadDeg", "lobeOffset", "speed", "color", "radius", "maxRange", "life"],
});

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`);
}

function canonicalPatternRef(ref) {
  return PATTERN_ALIASES[ref] ?? ref;
}

function requireNumber(value, path, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    fail(path, `must be a finite number in [${min}, ${max}]`);
  }
}

function requireInteger(value, path, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(path, `must be an integer in [${min}, ${max}]`);
  }
}

function validateSpeed(speed, path) {
  if (typeof speed === "number") {
    requireNumber(speed, path, 0.1, 20);
    return;
  }
  if (!speed || typeof speed !== "object" || Array.isArray(speed)) {
    fail(path, "must be a number or { base, rankGain }");
  }
  const keys = Object.keys(speed);
  if (keys.some(key => !["base", "rankGain"].includes(key))) {
    fail(path, "only base and rankGain are allowed");
  }
  requireNumber(speed.base, `${path}.base`, 0.1, 20);
  const rankGain = speed.rankGain ?? 0;
  requireNumber(rankGain, `${path}.rankGain`, -20, 20);
  if (speed.base + rankGain <= 0) {
    fail(path, "speed must remain positive at rank 1");
  }
  if (speed.base + Math.max(0, rankGain) > 20) {
    fail(path, "speed must not exceed 20 at rank 1");
  }
}

export function validatePatternParams(ref, params = {}) {
  const canonicalRef = canonicalPatternRef(ref);
  const allowed = PATTERN_PARAMS[canonicalRef];
  if (!allowed) fail("patternRef", `unknown pattern "${ref}"`);
  params ??= {};
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    fail("params", "must be an object");
  }
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) fail(`params.${key}`, `is not supported by ${ref}`);
  }

  if (params.count !== undefined) {
    if (canonicalRef === "cross") {
      requireInteger(params.count, "params.count", 4, 16);
      if (params.count % 4 !== 0) fail("params.count", "cross count must be a multiple of 4");
    } else if (canonicalRef === "pincerWave") {
      requireInteger(params.count, "params.count", 2, 16);
      if (params.count % 2 !== 0) fail("params.count", "pincerWave count must be even");
    } else if (canonicalRef === "wall") {
      requireInteger(params.count, "params.count", 3, 24);
    } else {
      const [min, max] = canonicalRef === "ring" || canonicalRef === "spiral" || canonicalRef === "stack"
        ? [2, canonicalRef === "stack" ? 16 : 32]
        : canonicalRef === "laserGrid" ? [2, 12]
          : canonicalRef === "petal" ? [3, 32]
            : canonicalRef === "rain" ? [1, 24] : [1, 16];
      requireInteger(params.count, "params.count", min, max);
    }
  }
  if (params.speed !== undefined) validateSpeed(params.speed, "params.speed");

  for (const key of ["baseAngleDeg", "angleStepDeg", "angleDeg"]) {
    if (params[key] !== undefined) requireNumber(params[key], `params.${key}`, -360, 360);
  }
  if (params.spreadDeg !== undefined) requireNumber(params.spreadDeg, "params.spreadDeg", 0, 180);
  if (params.lobes !== undefined) requireInteger(params.lobes, "params.lobes", 1, 8);
  if (params.amplitude !== undefined) requireNumber(params.amplitude, "params.amplitude", 0, 0.75);
  if (params.span !== undefined) requireNumber(params.span, "params.span", 0, 600);
  if (params.spacing !== undefined) requireNumber(params.spacing, "params.spacing", 0, 80);
  if (params.gapAt !== undefined) {
    const lanes = params.count ?? PATTERN_DEFAULTS.wall.count;
    requireInteger(params.gapAt, "params.gapAt", -1, lanes - 1);
  }
  if (params.lobeOffset !== undefined) requireNumber(params.lobeOffset, "params.lobeOffset", 0, 80);
  if (params.speedStep !== undefined) requireNumber(params.speedStep, "params.speedStep", 0, 2);
  if (canonicalRef === "stack") {
    const count = params.count ?? PATTERN_DEFAULTS.stack.count;
    const speedStep = params.speedStep ?? 0.1;
    if (speedStep * (count - 1) / 2 >= 1) {
      fail("params.speedStep", "would create a non-positive bullet speed");
    }
    const baseSpeed = typeof params.speed === "number"
      ? params.speed
      : params.speed?.base ?? 3;
    const rankGain = typeof params.speed === "object" ? params.speed.rankGain ?? 0 : 0;
    if ((baseSpeed + Math.max(0, rankGain)) * (1 + (count - 1) / 2 * speedStep) > 20) {
      fail("params.speedStep", "would exceed the maximum bullet speed");
    }
  }
  if (canonicalRef === "petal" && params.speed !== undefined) {
    const baseSpeed = typeof params.speed === "number" ? params.speed : params.speed.base;
    const rankGain = typeof params.speed === "object" ? params.speed.rankGain ?? 0 : 0;
    const amplitude = params.amplitude ?? 0.35;
    if ((baseSpeed + Math.max(0, rankGain)) * (1 + amplitude) > 20) {
      fail("params.speed", "would exceed the maximum petal bullet speed");
    }
  }
  if (params.color !== undefined
      && (typeof params.color !== "string" || params.color.length === 0 || params.color.length > 32)) {
    fail("params.color", "must be a string of 1-32 characters");
  }
  if (params.radius !== undefined) requireNumber(params.radius, "params.radius", 0.5, 20);
  if (params.maxRange !== undefined) requireNumber(params.maxRange, "params.maxRange", 1, 2000);
  if (params.life !== undefined) requireNumber(params.life, "params.life", 0.1, 60);
  return params;
}

export function patternBulletCount(ref, params = {}) {
  params ??= {};
  validatePatternParams(ref, params);
  return params.count ?? PATTERN_DEFAULTS[canonicalPatternRef(ref)].count;
}

export function rankFromScore(axis = SCORE_AXIS, score = 0, levels = levelFromScore(axis, score)) {
  if (!Array.isArray(axis) || axis.length === 0) throw new TypeError("scoreAxis must be a non-empty array");
  const low = axis[0].enemyLevel;
  const high = axis[axis.length - 1].enemyLevel;
  if (high <= low) return 0;
  return Math.max(0, Math.min(1, (levels.enemyLevel - low) / (high - low)));
}

function resolveSpeed(params, fallback, rank, fireScale) {
  const spec = params.speed;
  const base = typeof spec === "number" ? spec : spec?.base ?? fallback;
  const rankGain = typeof spec === "object" ? spec.rankGain ?? 0 : 0;
  return (base + rankGain * rank) * fireScale;
}

function bulletOptions(params, defaults) {
  return {
    r: params.radius ?? defaults.r,
    color: params.color ?? defaults.color,
    maxRange: params.maxRange ?? defaults.maxRange,
    life: params.life ?? defaults.life,
  };
}

function getRandom(context) {
  const value = typeof context.random === "function" ? context.random() : 0.5;
  if (!Number.isFinite(value)) throw new TypeError("pattern random source must return a finite number");
  return Math.max(0, Math.min(1, value));
}

function getOrigin(context, yOffset = 0) {
  const emitter = context.emitter || context;
  const offset = context.originYOffset ?? yOffset;
  return { x: emitter.x, y: emitter.y + (emitter.r || 0) * offset };
}

function getTarget(context, origin) {
  return {
    x: context.targetX ?? context.target?.x ?? origin.x,
    y: context.targetY ?? context.target?.y ?? origin.y,
  };
}

function getAimOrigin(context, bulletOrigin) {
  if (!context.aimFromCenter) return bulletOrigin;
  const emitter = context.emitter || context;
  return { x: emitter.x, y: emitter.y };
}

function makeSpec(x, y, angle, speed, opts) {
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    opts: { ...opts },
  };
}

function aimedSpecs(params, context, rank) {
  const origin = getOrigin(context, 0.5);
  const aimOrigin = getAimOrigin(context, origin);
  const target = getTarget(context, aimOrigin);
  const dx = target.x - aimOrigin.x;
  const dy = target.y - aimOrigin.y;
  const len = Math.hypot(dx, dy) || 1;
  const defaults = { r: 5, color: "#ff8fa3", maxRange: 600, life: 6 };
  let speed;
  if (params.speed === undefined) {
    speed = (3 + getRandom(context) * 1.5) * context.fireScale;
  } else {
    speed = resolveSpeed(params, 3.75, rank, context.fireScale);
  }
  return [{
    x: origin.x,
    y: origin.y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    opts: bulletOptions(params, defaults),
  }];
}

function laserGridSpecs(params, context, rank) {
  const origin = getOrigin(context, 0.5);
  const aimOrigin = getAimOrigin(context, origin);
  const target = getTarget(context, aimOrigin);
  const dx = target.x - aimOrigin.x;
  const dy = target.y - aimOrigin.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const px = -ny, py = nx;
  const count = params.count ?? 3;
  const spacing = params.spacing ?? 11;
  const speed = params.speed === undefined
    ? (8.5 + getRandom(context) * 1.2) * context.fireScale
    : resolveSpeed(params, 9.1, rank, context.fireScale);
  const opts = bulletOptions(params, { r: 3.5, color: "#ff4444", maxRange: 720, life: 2.4 });
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - mid) * spacing;
    return {
      x: origin.x + px * offset,
      y: origin.y + py * offset,
      vx: nx * speed,
      vy: ny * speed,
      opts: { ...opts },
    };
  });
}

export function buildPatternSpecs(ref, params = {}, context = {}) {
  params ??= {};
  validatePatternParams(ref, params);
  ref = canonicalPatternRef(ref);
  const rank = context.rank ?? 0;
  if (!Number.isFinite(rank) || rank < 0 || rank > 1) {
    throw new RangeError("pattern rank must be in [0, 1]");
  }
  const fireScale = context.fireScale ?? 1;
  if (!Number.isFinite(fireScale) || fireScale < 0) {
    throw new RangeError("pattern fireScale must be a non-negative number");
  }
  const normalizedContext = { ...context, fireScale };
  if (ref === "aimed") return aimedSpecs(params, normalizedContext, rank);
  if (ref === "laserGrid") return laserGridSpecs(params, normalizedContext, rank);

  const origin = getOrigin(normalizedContext, 0.5);
  const opts = bulletOptions(params, { r: 5, color: "#ff8fa3", maxRange: 600, life: 6 });
  const speed = resolveSpeed(params, 3, rank, fireScale);
  const defaultBaseAngle = ref === "fan" || ref === "rain" || ref === "wall" ? 90 : 0;
  const baseAngle = (params.baseAngleDeg ?? defaultBaseAngle) * Math.PI / 180;
  const count = params.count ?? PATTERN_DEFAULTS[ref].count;
  switch (ref) {
    case "fan": {
      const spread = (params.spreadDeg ?? 48) * Math.PI / 180;
      return Array.from({ length: count }, (_, i) => {
        const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
        return makeSpec(origin.x, origin.y, baseAngle + offset, speed, opts);
      });
    }
    case "ring":
      return Array.from({ length: count }, (_, i) =>
        makeSpec(origin.x, origin.y, baseAngle + i * Math.PI * 2 / count, speed, opts));
    case "spiral": {
      const step = (params.angleStepDeg ?? 22.5) * Math.PI / 180;
      return Array.from({ length: count }, (_, i) =>
        makeSpec(origin.x, origin.y, baseAngle + i * step, speed, opts));
    }
    case "petal": {
      const lobes = params.lobes ?? 4;
      const amplitude = params.amplitude ?? 0.35;
      return Array.from({ length: count }, (_, i) => {
        const angle = baseAngle + i * Math.PI * 2 / count;
        const petalSpeed = speed * (1 + amplitude * Math.cos(lobes * angle));
        return makeSpec(origin.x, origin.y, angle, petalSpeed, opts);
      });
    }
    case "rain": {
      const span = params.span ?? 280;
      const angle = (params.angleDeg ?? 90) * Math.PI / 180;
      return Array.from({ length: count }, (_, i) => {
        const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * span;
        return makeSpec(origin.x + offset, origin.y, angle, speed, opts);
      });
    }
    case "stack": {
      const step = params.speedStep ?? 0.1;
      return Array.from({ length: count }, (_, i) => {
        const layer = 1 + ((count - 1) / 2 - i) * step;
        return makeSpec(origin.x, origin.y, baseAngle, speed * layer, opts);
      });
    }
    case "wall": {
      // 等距横排；gapAt>=0 时多留一条空道，形成可穿行的闪避缺口。
      // lanes 比 count 多 1，跳过 gapAt 后仍恰好产出 count 发，
      // 保证 patternBulletCount() 与实际产出相等（关卡密度预算的分母）。
      const span = params.span ?? 360;
      const gapAt = params.gapAt ?? -1;
      const lanes = gapAt >= 0 ? count + 1 : count;
      const step = span / Math.max(1, lanes - 1);
      const specs = [];
      for (let i = 0; i < lanes; i++) {
        if (i === gapAt) continue;
        specs.push(makeSpec(
          origin.x + (i - (lanes - 1) / 2) * step,
          origin.y,
          baseAngle,
          speed,
          opts,
        ));
      }
      return specs;
    }
    case "cross": {
      // 四向等分：每臂 count/4 发，沿臂方向按 spacing 错位。
      const per = count / 4;
      const spacing = params.spacing ?? 0;
      const specs = [];
      for (let arm = 0; arm < 4; arm++) {
        const angle = baseAngle + arm * Math.PI / 2;
        for (let k = 0; k < per; k++) {
          specs.push(makeSpec(
            origin.x + Math.cos(angle) * k * spacing,
            origin.y + Math.sin(angle) * k * spacing,
            angle,
            speed,
            opts,
          ));
        }
      }
      return specs;
    }
    case "pincerWave": {
      // 左右两瓣夹击：以瞄准角为中线，各偏 ±spreadDeg/2，发射点向两侧错开 lobeOffset。
      const half = count / 2;
      const spread = (params.spreadDeg ?? 60) * Math.PI / 180;
      const lobe = params.lobeOffset ?? 24;
      const target = getTarget(normalizedContext, origin);
      const base = Math.atan2(target.y - origin.y, target.x - origin.x);
      const px = -Math.sin(base);
      const py = Math.cos(base);
      const specs = [];
      for (const side of [-1, 1]) {
        for (let k = 0; k < half; k++) {
          const t = half === 1 ? 0.5 : k / (half - 1);
          specs.push(makeSpec(
            origin.x + px * side * lobe,
            origin.y + py * side * lobe,
            base + side * (t - 0.5) * spread,
            speed,
            opts,
          ));
        }
      }
      return specs;
    }
    default:
      throw new TypeError(`Unknown pattern "${ref}"`);
  }
}

function legacyBossSpread(context) {
  const emitter = context.emitter || context;
  const scale = context.fireScale ?? 1;
  return Array.from({ length: 5 }, (_, i) => {
    const angle = (i - 2) * 0.3;
    return {
      x: emitter.x,
      y: emitter.y + emitter.r * 0.5,
      vx: Math.sin(angle) * 3 * scale,
      vy: 3.5 * scale,
      opts: { r: 6, color: "#ff4488", maxRange: 500, life: 5 },
    };
  });
}

export function buildBossPatternSpecs(pattern, context = {}) {
  switch (pattern) {
    case "spawn":
      return [];
    case "spread":
      return legacyBossSpread(context);
    case "homing":
      return buildPatternSpecs("aimed", {}, { ...context, aimFromCenter: true });
    case "burst":
      return buildPatternSpecs("ring", {
        count: 8, baseAngleDeg: 0, speed: 3,
        radius: 5, color: "#aa44ff", maxRange: 400, life: 4,
      }, { ...context, originYOffset: 0 });
    case "laser":
      return buildPatternSpecs("laserGrid", {}, { ...context, aimFromCenter: true });
    default:
      return null;
  }
}
