/* ===========================================================
 * balance.test.mjs — 数值平衡与经济专项
 * 这些断言不校验「手感好不好」，而是锁住那些一旦写错就让玩家
 * 直接感受为「卡关 / 废技能 / 元进度不存在」的数值关系。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import {
  BULLET, DIFFICULTY, ENEMY_LEVEL, XP_BASE, XP_GROWTH, META,
  SHOP_ITEMS, getShopItemCost, POWERUP_DROP, enemyLevelScale,
} from "../js/config.js";

describe("balance", () => {
  // ---------- 难度曲线 ----------
  it("难度等级上限撑得住中后期，不会过早断档", () => {
    assert.ok(DIFFICULTY.maxLevel >= 12);
    assert.ok(DIFFICULTY.levelUpScore * (DIFFICULTY.maxLevel - 1) >= 45000);
  });

  it("生成率随难度等级单调上升并最终封顶", () => {
    let prev = -1;
    for (let lv = 1; lv <= DIFFICULTY.maxLevel; lv++) {
      const r = DIFFICULTY.spawnBase + lv * DIFFICULTY.spawnPerLevel;
      assert.ok(r > prev, `等级 ${lv} 的生成率未上升`);
      prev = r;
    }
    assert.ok(DIFFICULTY.spawnBase + DIFFICULTY.maxLevel * DIFFICULTY.spawnPerLevel > DIFFICULTY.spawnCap,
      "满级时应触到生成率上限，否则后期敌机数量不再增长");
  });

  it("敌机下落速度不会被难度等级放大到无法闪避", () => {
    const mult = 1 + DIFFICULTY.maxLevel * DIFFICULTY.speedScalePerLevel;
    assert.ok(mult < 2, `满级敌机速度倍率 ${mult.toFixed(2)} 过高，会挤压闪避空间`);
  });

  it("敌方等级与难度等级同步推进（不会一方长期停滞）", () => {
    const capScore = DIFFICULTY.levelUpScore * (DIFFICULTY.maxLevel - 1);
    const enemyLvAtCap = 1 + Math.floor(capScore / ENEMY_LEVEL.scorePerLevel);
    assert.ok(enemyLvAtCap >= 5, "难度封顶时敌方等级也应已成长多轮");
  });

  it("敌方等级成长在软上限后减半，不会指数爆炸", () => {
    const at30 = enemyLevelScale(30);
    const at60 = enemyLevelScale(60);
    assert.ok(at60 - at30 < (30 - 1), "后 30 级的成长必须慢于前 30 级");
  });

  // ---------- 弹幕密度 ----------
  it("单波子弹上限与同屏上限构成合理密度", () => {
    assert.ok(BULLET.waveCap <= 20, "单波上限过高会失去队形感");
    assert.ok(BULLET.screenCap > 0);
    // 同屏上限至少容纳数波（射程内），但不能放任堆积到几百发
    assert.ok(BULLET.screenCap >= BULLET.waveCap * 4);
    assert.ok(BULLET.screenCap <= 200);
  });

  it("最短波间距保证弹幕不叠成一条线", () => {
    // 射速拉满时的波间距仍需 >= 36px（约 6 倍子弹长度）
    assert.ok(BULLET.refireDist >= 36);
    assert.ok(BULLET.baseSpeed > 0);
  });

  // ---------- 技能强度 ----------
  it("左右护法副炮伤害随等级明显成长", async () => {
    const { createPlayer, getShootPattern } = await import("../js/player.js");
    const { META: METACFG } = await import("../js/config.js");
    // 以中期火力（dmg 技能 3 级）为基准，避免 baseDmg=1 时取整把差异抹平
    const mk = (lv) => {
      const p = createPlayer(METACFG.aircraft.falcon, {});
      p.skills = { ...p.skills, sideBullets: lv, dmg: 3 };
      return p;
    };
    const dmgOf = (lv) => {
      const shots = getShootPattern(mk(lv));
      const side = shots.filter(s => Math.abs(Math.abs(s.angle) - Math.PI / 2) < 1e-9);
      assert.ok(side.length >= 2, `${lv} 级应左右各发一发`);
      return { side: side[0].dmg, main: shots[0].dmg, slow: side[0].spd };
    };
    const l1 = dmgOf(1);
    const l5 = dmgOf(5);
    assert.ok(l1.side > l1.main, "1 级副炮伤害就应高于主弹，否则白占波次额度");
    assert.ok(l5.side > l1.side, "副炮伤害应随等级成长");
    assert.ok(l5.side >= l1.side * 1.6, `满级副炮成长不足：${l1.side} → ${l5.side}`);
    assert.ok(l1.slow < BULLET.baseSpeed, "副炮应比主弹慢（设计就是缓慢横扫）");
  });

  it("护体弹重生时间随等级缩短且有下限", async () => {
    const { createPlayer, updatePlayer, getOrbitBullets, removeOrbitBullet } = await import("../js/player.js");
    const { META: METACFG } = await import("../js/config.js");
    const respawnOf = (guard) => {
      const p = createPlayer(METACFG.aircraft.falcon, {});
      p.skills = { ...p.skills, guard };
      updatePlayer(0.016, p, 0, 0);
      const ob = getOrbitBullets(p)[0];
      removeOrbitBullet(p, ob);
      return ob.respawn;
    };
    const low = respawnOf(1);
    const high = respawnOf(5);
    assert.ok(high < low, "高等级护体应更快补充");
    assert.ok(high >= 1.3, "重生时间不得被压到不存在");
  });

  // ---------- 掉落与经济 ----------
  it("星尘产出速率支撑得起元进度", () => {
    // 一局 2 万分应能拿到几十星尘，而不是个位数（旧 10000:1 时只有 2 个）
    const per20k = Math.floor(20000 / META.stardustPerScore);
    assert.ok(per20k >= 20, `2 万分仅产出 ${per20k} 星尘，元进度形同虚设`);
    assert.ok(META.reviveCost <= per20k, "复活成本不应超过一局产出");
  });

  it("商城成本曲线可在一局收益量级内起步", () => {
    const perRun = Math.floor(20000 / META.stardustPerScore);
    for (const item of SHOP_ITEMS) {
      assert.ok(item.baseCost <= perRun * 3, `${item.id} 起步价需 ${Math.round(item.baseCost / perRun)} 局，太劝退`);
      const c1 = getShopItemCost(item, 0);
      const c2 = getShopItemCost(item, 1);
      const c3 = getShopItemCost(item, 2);
      assert.ok(c2 > c1 && c3 > c2, "成本应逐级递增");
      assert.ok(c2 / c1 <= 2, "单级涨幅不应超过 2 倍，否则后两级沦为摆设");
    }
    // 点满一条线应是可期的中期目标（以中期一局 6 万分为基准）
    const midRun = Math.floor(60000 / META.stardustPerScore);
    const line = SHOP_ITEMS.find(i => i.max === 5);
    let lineTotal = 0;
    for (let i = 0; i < line.max; i++) lineTotal += getShopItemCost(line, i);
    assert.ok(lineTotal / midRun <= 20, `点满 ${line.id} 需 ${Math.round(lineTotal / midRun)} 局，过慢`);
  });

  it("点满全部商城是长期但可完成的目标", () => {
    const midRun = Math.floor(60000 / META.stardustPerScore);
    const total = SHOP_ITEMS.reduce((s, it) => {
      let t = 0;
      for (let i = 0; i < it.max; i++) t += getShopItemCost(it, i);
      return s + t;
    }, 0);
    assert.ok(total / midRun <= 120, `点满商城需 ${Math.round(total / midRun)} 局，已超出可完成范围`);
  });

  it("升级经验曲线不会后期停滞", () => {
    const need = (lv) => Math.round(XP_BASE * Math.pow(XP_GROWTH, lv - 1));
    assert.equal(need(1), XP_BASE);
    assert.ok(XP_GROWTH > 1 && XP_GROWTH < 1.4, "增长系数过快会导致后期几乎升不动");
    // 20 级需求应仍在「数百次击杀」量级
    assert.ok(need(20) < 12000, `20 级需要 ${need(20)} 经验，过陡`);
    for (let lv = 2; lv <= 20; lv++) assert.ok(need(lv) > need(lv - 1));
  });

  it("掉落率叠加后仍是合法概率", () => {
    // 基础 + 爆率技能满级(6×5%) + buff(10%) + 天赋/商城(上限 5%×4)
    const max = POWERUP_DROP.base + 6 * POWERUP_DROP.skillPerLevel + POWERUP_DROP.buffBonus + 0.2 + 0.2;
    assert.ok(max <= 1, `掉落率上限 ${max.toFixed(2)} 超过 100%`);
    assert.ok(POWERUP_DROP.base > 0.1, "基础掉落率过低会让道具存在感缺失");
  });

  it("飞机与天赋成本与星尘产出同量级", () => {
    const midRun = Math.floor(60000 / META.stardustPerScore);
    for (const [id, cfg] of Object.entries(META.aircraft)) {
      if (cfg.cost === 0) continue;
      assert.ok(cfg.cost / midRun <= 10, `${id} 需要 ${Math.round(cfg.cost / midRun)} 局才能解锁，过慢`);
    }
    for (const t of META.talents) {
      assert.ok(t.cost / midRun <= 3, `${t.id} 成本过高`);
    }
  });
});
