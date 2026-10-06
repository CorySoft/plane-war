import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { META, PLAYER_BASE, W, BULLET, refireGateDistance } from "../js/config.js";
import { createPlayer, updatePlayer, getShootPattern, getOrbitBullets, removeOrbitBullet, volleyOffsets, orbitDamage } from "../js/player.js";
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

  it("散射与连射叠加子弹（每级 1 发）", () => {
    const p = dummyPlayer({ power: 1, skills: { scatter: 2, volley: 1 } });
    const n = getShootPattern(p).length;
    assert.equal(n, 1 + 2 + 1);
  });

  it("散射每升一级增加一发（左右交替展开）", () => {
    const p = dummyPlayer({ power: 1, skills: { scatter: 3 } });
    const shots = getShootPattern(p);
    assert.equal(shots.length, 1 + 3, "主弹 + 3 级散射 = 4 发（每级 1 发）");
    // 散射弹应在扇形范围内，且随等级向两侧展开
    const spread = BULLET.scatterSpread;
    for (const s of shots) {
      assert.ok(Math.abs(s.angle) <= 3 * spread + 1e-9, "散射角度应落在 ±3·spread 扇形内");
    }
  });

  it("急速射击改为对称双轨（每通道±两侧）", () => {
    const p = dummyPlayer({ power: 4 });
    p.buffs.rapid = 8;
    const shots = getShootPattern(p);
    assert.equal(shots.length, 8, "power4 四通道 × 双轨 = 8 发");
    const angs = shots.map(s => s.angle).sort((a, b) => a - b);
    for (let i = 0; i < angs.length / 2; i++) {
      assert.ok(Math.abs(angs[i] + angs[angs.length - 1 - i]) < 1e-9, "双轨应中心对称：" + angs.join(","));
    }
  });

  it("每波子弹总量不超过 WAVE_CAP", () => {
    const p = dummyPlayer({
      power: 4,
      skills: { scatter: 5, volley: 5, dual: 5, sideBullets: 5 },
    });
    p.buffs.rapid = 8;
    assert.ok(getShootPattern(p).length <= BULLET.waveCap, "全技能+急速也压入单波上限内");
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

  // ---------- 回归：连射布局 ----------
  it("连射偏移恒不为 0（不产生与主弹重合的隐形弹）", () => {
    for (let lv = 1; lv <= 6; lv++) {
      const p = dummyPlayer();
      const offs = volleyOffsets(lv, p);
      assert.equal(offs.length, lv, `${lv} 级连射应给出 ${lv} 个偏移`);
      for (const o of offs) assert.notEqual(o, 0, "连射弹不得与主弹同角重合");
      assert.equal(new Set(offs).size, offs.length, "偏移不得重复");
    }
  });

  it("连射偏移左右交替且长期平衡", () => {
    const p = dummyPlayer();
    // 奇数级多出的一发应在左右之间交替
    const a = volleyOffsets(3, p);
    const b = volleyOffsets(3, p);
    const sumA = a.reduce((s, v) => s + v, 0);
    const sumB = b.reduce((s, v) => s + v, 0);
    assert.equal(sumA + sumB, 0, "两次奇数级连射的偏移和应互相抵消");
    // 偶数级天然对称
    const even = volleyOffsets(4, p);
    assert.equal(even.reduce((s, v) => s + v, 0), 0);
  });

  it("连射子弹不与主弹道重合（整体图案）", () => {
    const p = dummyPlayer({ power: 1, skills: { volley: 3 } });
    const shots = getShootPattern(p);
    assert.equal(shots.length, 4, "主弹 1 发 + 连射 3 发");
    const angs = shots.map(s => s.angle);
    assert.equal(angs.filter(a => Math.abs(a) < 1e-9).length, 1, "只能有主弹位于 0 度");
  });

  // ---------- 回归：射速闸门 ----------
  it("射速技能真正缩短射击间隔（不被飞行距离闸门抵消）", () => {
    // 旧实现把闸门固定为 250px：子弹射程 250 时永远无法达标，
    // 实际射速被锁死在「上一发销毁才能再射」，射速技能形同虚设。
    const gateBase = refireGateDistance(0.5);
    const gateMax = refireGateDistance(0.5 * (1 - 0.08 * 6));
    assert.ok(gateMax < gateBase * 0.75, "满级射速应显著缩短波间距");
  });

  it("闸门推导模式下按飞行距离放行（不再依赖子弹生死）", () => {
    // refireDist 传 0 → updatePlayer 内部按当前射速推导闸门
    const p = dummyPlayer({ fireCd: 0 });
    assert.equal(updatePlayer(0.02, p, 0, 9999), true, "飞行距离达标即可再射");

    const p2 = dummyPlayer({ fireCd: 0 });
    assert.equal(updatePlayer(0.02, p2, 0, 1), false, "刚出膛（距离不够）则暂缓");
    assert.ok(p2.fireCd > 0, "暂缓时保留微小冷却防抖");

    // 显式传入闸门距离时沿用旧语义（兼容直接调用方）
    const p3 = dummyPlayer({ fireCd: 0 });
    assert.equal(updatePlayer(0.02, p3, 100, 100), true);
    const p4 = dummyPlayer({ fireCd: 0 });
    assert.equal(updatePlayer(0.02, p4, 100, 99), false);
  });

  it("护体弹伤害随火力与火力强化成长（不再是固定 1 点）", () => {
    const p = dummyPlayer({ power: 1, skills: {} });
    assert.ok(orbitDamage(p) >= 2, "1 级火力也应有基础伤害");
    const strong = dummyPlayer({ power: 4, skills: { dmg: 10 } });
    assert.ok(orbitDamage(strong) > orbitDamage(p), "火力/伤害技能应放大护体弹伤害");
    // 护体弹实际生成时使用该数值
    strong.skills = { ...strong.skills, guard: 1 };
    updatePlayer(0.016, strong, 250, 0);
    assert.equal(strong.orbit[0].dmg, orbitDamage(strong));
  });

  it("护体弹自动生成并可重生", () => {
    const p = dummyPlayer();
    p.skills = { ...p.skills, guard: 1 };
    updatePlayer(0.016, p, 250, 0);
    assert.ok(p.orbit.length >= 1);
    const live = getOrbitBullets(p);
    assert.ok(live.length >= 1);
    removeOrbitBullet(p, live[0]);
    assert.ok(live[0].respawn > 0);
    assert.equal(getOrbitBullets(p).length, live.length - 1);
  });
});
