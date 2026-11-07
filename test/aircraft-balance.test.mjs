import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { META, XP_BASE, XP_GROWTH, calcFireRate } from "../js/config.js";
import { createPlayer } from "../js/player.js";

describe("飞机 fireRate 语义与机型差异", () => {
  it("高射速机型的射击间隔更短（blaze < falcon < ironwall）", () => {
    const intervalOf = (id) => calcFireRate(createPlayer(META.aircraft[id], {}));
    const falcon = intervalOf("falcon");
    const blaze = intervalOf("blaze");
    const ironwall = intervalOf("ironwall");
    assert.ok(blaze < falcon, `blaze 间隔 ${blaze} 应小于 falcon ${falcon}`);
    assert.ok(falcon < ironwall, `ironwall 间隔 ${ironwall} 应大于 falcon ${falcon}`);
  });

  it("相对 DPS 全部落在 0.70~1.15，不再有两个极端值", () => {
    for (const [id, cfg] of Object.entries(META.aircraft)) {
      const rel = cfg.baseDmg / cfg.fireRate;
      assert.ok(rel >= 0.7 && rel <= 1.15, `${id} 相对 DPS ${rel.toFixed(3)} 超出 0.70~1.15`);
    }
    // 修复前 blaze=0.615（最弱）、ironwall=1.5（最强），与文案完全相反
    assert.ok(META.aircraft.blaze.baseDmg / META.aircraft.blaze.fireRate > 0.7);
    assert.ok(META.aircraft.ironwall.baseDmg / META.aircraft.ironwall.fireRate < 1.15);
  });

  it("机型定位与数值顺序一致", () => {
    assert.ok(META.aircraft.blaze.fireRate < META.aircraft.falcon.fireRate, "blaze 应比 falcon 快");
    assert.ok(META.aircraft.ironwall.fireRate > META.aircraft.falcon.fireRate, "ironwall 应比 falcon 慢");
    assert.ok(META.aircraft.ironwall.baseDmg > META.aircraft.falcon.baseDmg, "ironwall 单发伤害应更高");
  });
});

describe("经验曲线", () => {
  const need = (lv) => Math.round(XP_BASE * Math.pow(XP_GROWTH, lv - 1));

  it("20 级需求 6,533，低于 12,000 护栏", () => {
    assert.equal(XP_GROWTH, 1.28);
    assert.equal(need(20), 6533);
    assert.ok(need(20) < 12000, `20 级需求 ${need(20)} 过陡`);
  });

  it("需求单调递增", () => {
    for (let lv = 2; lv <= 30; lv++) {
      assert.ok(need(lv) > need(lv - 1), `${lv} 级需求未增长`);
    }
  });
});