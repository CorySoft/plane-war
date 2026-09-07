import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { META, PLAYER_BASE, W } from "../js/config.js";
import { createPlayer, updatePlayer, getShootPattern, getOrbitBullets, removeOrbitBullet } from "../js/player.js";
import { pressed } from "../js/input.js";

function dummyPlayer(extra = {}) {
  const p = createPlayer(META.aircraft.falcon, {});
  Object.assign(p, extra);
  return p;
}

describe("player", () => {
  beforeEach(() => {
    pressed.left = false;
    pressed.right = false;
  });

  it("默认血量使用 startLives", () => {
    const p = createPlayer();
    assert.equal(p.baseHp, PLAYER_BASE.startLives);
    assert.equal(p.x, W / 2);
    assert.equal(p.level, 1);
    assert.equal(p.power, 1);
  });

  it("飞机与天赋叠加属性", () => {
    const p = createPlayer(META.aircraft.thor, { startHp: 1, baseDmg: 1, startPower: 1, startRange: 80 });
    assert.equal(p.baseHp, META.aircraft.thor.startHp + 1);
    assert.equal(p.power, 2);
    assert.equal(p.skills.explosion, 1);
    assert.ok(p.skills.range >= 1);
    assert.equal(p.talentDmg, 1);
  });

  it("天赋暴击加成透出到玩家", () => {
    const p = createPlayer(META.aircraft.falcon, { critAdd: 0.05 });
    assert.equal(p.talentCrit, 0.05);
  });

  it("火力天赋按加算生效", () => {
    const p = createPlayer(META.aircraft.falcon, { baseDmg: 1 });
    p.skills.dmg = 0;
    const [shot] = getShootPattern(p);
    assert.equal(shot.dmg, 2);
  });

  it("射击图案随火力等级变宽", () => {
    const p = dummyPlayer();
    p.power = 1;
    assert.equal(getShootPattern(p).length, 1);
    p.power = 2;
    assert.equal(getShootPattern(p).length, 2);
    p.power = 3;
    assert.equal(getShootPattern(p).length, 3);
    p.power = 4;
    assert.equal(getShootPattern(p).length, 4);
  });

  it("散射与连射叠加子弹", () => {
    const p = dummyPlayer({ power: 1, skills: { scatter: 2, volley: 1 } });
    const n = getShootPattern(p).length;
    assert.equal(n, 1 + 2 + 1);
  });

  it("侧翼炮每级加两发", () => {
    const p = dummyPlayer({ power: 1, skills: { dual: 2 } });
    assert.equal(getShootPattern(p).length, 1 + 4);
  });

  it("疯狂追击固定 8 发追踪弹", () => {
    const p = dummyPlayer();
    p.buffs.madHunt = 8;
    const shots = getShootPattern(p);
    assert.equal(shots.length, 8);
    assert.ok(shots.every(s => s.homing));
  });

  it("移动被边界夹紧", () => {
    const p = dummyPlayer({ x: 20 });
    pressed.left = true;
    updatePlayer(1, p, 250, 250);
    assert.equal(p.x, 20);
    pressed.left = false;
    pressed.right = true;
    p.x = W - 20;
    updatePlayer(1, p, 250, 250);
    assert.equal(p.x, W - 20);
  });

  it("无主弹时冷却结束即可开火", () => {
    const p = dummyPlayer({ fireCd: 0 });
    assert.equal(updatePlayer(0.02, p, 250, 0), true);
  });

  it("主弹未飞够距离时暂缓开火", () => {
    const p = dummyPlayer({ fireCd: 0 });
    assert.equal(updatePlayer(0.02, p, 250, 50), false);
  });

  it("buff 计时衰减", () => {
    const p = dummyPlayer();
    p.buffs.rapid = 0.1;
    updatePlayer(0.2, p, 250, 0);
    assert.equal(p.buffs.rapid, 0);
  });

  it("护体弹自动生成并可重生", () => {
    const p = dummyPlayer();
    updatePlayer(0.016, p, 250, 0);
    assert.ok(p.orbit.length >= 1);
    const live = getOrbitBullets(p);
    assert.ok(live.length >= 1);
    removeOrbitBullet(p, live[0]);
    assert.ok(live[0].respawn > 0);
    assert.equal(getOrbitBullets(p).length, live.length - 1);
  });
});
