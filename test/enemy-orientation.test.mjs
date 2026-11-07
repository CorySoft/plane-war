/* ===========================================================
 * enemy-orientation.test.mjs — 敌机机鼻统一朝下
 * 素材原方向由目检裁定编码为常量；断言「素材朝向 + 绘制旋转 = 朝下」。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./_env.mjs";
import { ENEMY_TEXTURE_ROT, BOSS_TEXTURE_ROT, enemyBaseRotation } from "../js/enemy.js";

// 角度制：上=-90、下=90、左=180、右=0（Canvas y 向下，顺时针为正）
const FACING_DEG = { up: -90, down: 90, left: 180, right: 0 };
const DOWN = 90;

// 素材原生机鼻朝向（主持人逐张目检裁定）
const TEXTURE_FACING = {
  small: "up",
  mid: "down",
  big: "down",
  laser: "left",
  shield: "up",
  split: "down",
};
const BOSS_FACING = {
  mothership: "down",
  fortress: "up",
  phantom: "down",
};

const norm = d => ((d % 360) + 360) % 360;
const deg = rad => rad * 180 / Math.PI;

describe("敌机机鼻统一朝下", () => {
  it("每种普通敌机：素材朝向 + 绘制旋转 = 朝下", () => {
    for (const [type, facing] of Object.entries(TEXTURE_FACING)) {
      const rot = ENEMY_TEXTURE_ROT[type];
      assert.equal(typeof rot, "number", `${type} 缺少旋转配置`);
      const final = norm(FACING_DEG[facing] + deg(rot));
      assert.equal(final, DOWN, `${type} 最终朝向 ${final}° 不是朝下`);
      assert.equal(enemyBaseRotation({ type }), rot, `${type} 取用的旋转与配置不一致`);
    }
  });

  it("Boss 三型同样朝下", () => {
    for (const [bossType, facing] of Object.entries(BOSS_FACING)) {
      const rot = BOSS_TEXTURE_ROT[bossType];
      assert.equal(typeof rot, "number", `boss_${bossType} 缺少旋转配置`);
      const final = norm(FACING_DEG[facing] + deg(rot));
      assert.equal(final, DOWN, `boss_${bossType} 最终朝向 ${final}° 不是朝下`);
      assert.equal(enemyBaseRotation({ isBoss: true, bossType }), rot);
    }
  });

  it("未知类型/空值保守按「朝上」处理（+π）", () => {
    assert.equal(enemyBaseRotation({ type: "unknown" }), Math.PI);
    assert.equal(enemyBaseRotation(null), Math.PI);
    assert.equal(enemyBaseRotation({ isBoss: true, bossType: "unknown" }), 0);
  });

  it("旋转量为 0 的机型保持素材原方向（朝下）", () => {
    for (const type of ["mid", "big", "split"]) {
      assert.equal(enemyBaseRotation({ type }), 0, `${type} 不应额外旋转`);
      assert.equal(TEXTURE_FACING[type], "down");
    }
  });
});