import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { META, BULLET } from "../js/config.js";
import { createPlayer, getShootPattern } from "../js/player.js";

function fullPlayer() {
  const p = createPlayer(META.aircraft.falcon, {});
  p.power = 4;
  p.skills = { ...p.skills, dmg: 6, scatter: 6, volley: 6, dual: 4, sideBullets: 4 };
  return p;
}

describe("主副武器配份额度", () => {
  it("满配单波刚好 waveCap，主弹 8 发、副武器 8 发", () => {
    const shots = getShootPattern(fullPlayer());
    assert.equal(shots.length, BULLET.waveCap);
    assert.equal(shots.length, 16);

    // 主弹无 x/spd；侧翼炮有 x 无 spd；左右护法有 x 且有 spd
    const main = shots.filter(s => s.x === undefined);
    const dual = shots.filter(s => s.x !== undefined && s.spd === undefined);
    const side = shots.filter(s => s.x !== undefined && s.spd !== undefined);

    assert.equal(main.length, 8, `主弹应占 8 发（实际 ${main.length}）`);
    assert.equal(dual.length + side.length, 8, `副武器应占 8 发（实际 ${dual.length + side.length}）`);
    assert.ok(dual.length > 0 && side.length > 0, "两类副武器都应保留");
  });

  it("副武器不得超过总配额的一半", () => {
    const shots = getShootPattern(fullPlayer());
    const secondary = shots.filter(s => s.x !== undefined);
    assert.ok(secondary.length <= Math.floor(BULLET.waveCap / 2),
      `副武器 ${secondary.length} 发超过配额一半`);
  });

  it("无副武器时主弹道行为不变（仍吃满 waveCap）", () => {
    const p = fullPlayer();
    p.skills = { ...p.skills, dual: 0, sideBullets: 0 };
    const shots = getShootPattern(p);
    assert.equal(shots.length, BULLET.waveCap);
    assert.ok(shots.every(s => s.x === undefined), "不应出现副武器");
  });

  it("低火力时主弹数量不因配额规则减少", () => {
    const p = createPlayer(META.aircraft.falcon, {});
    p.power = 1;
    const shots = getShootPattern(p);
    assert.equal(shots.length, 1);
    assert.equal(shots.filter(s => s.x === undefined).length, 1);
  });
});