/* ===========================================================
 * skin-assets.test.mjs — 六机型皮肤资产规格
 * 直接读文件校验：PNG/RGBA/高 320/六张互不相同，防止换图时退化成
 * 无透明通道、尺寸漂移或六张重复。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { skinManifestIds, SKIN_STYLE } from "../js/assets.js";

const IDS = [
  "player_falcon", "player_blaze", "player_ironwall",
  "player_phantom", "player_thor", "player_void",
];

describe("皮肤资产规格", () => {
  it("六个机型 id 都在皮肤清单中", () => {
    const manifest = skinManifestIds();
    for (const id of IDS) assert.ok(manifest.includes(id), `${id} 不在清单`);
  });

  it("六张图均为 RGBA PNG，高 320，有真实透明通道", async () => {
    for (const id of IDS) {
      const buf = await readFile(new URL(`../assets/skin/${SKIN_STYLE}/${id}.png`, import.meta.url));
      assert.equal(buf.subarray(1, 4).toString(), "PNG", `${id} 不是 PNG`);
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), colorType = buf[25];
      assert.equal(h, 320, `${id} 高度应为 320，实际 ${h}`);
      assert.ok(w >= 120 && w <= 400, `${id} 宽度 ${w} 异常`);
      assert.equal(colorType, 6, `${id} 必须是 RGBA（colorType=6）`);
      assert.ok(buf.length > 8000, `${id} 体积异常（疑似空图）`);
    }
  });

  it("六张图 md5 互不相同（每机型都有独立皮肤）", async () => {
    const hashes = new Set();
    for (const id of IDS) {
      const buf = await readFile(new URL(`../assets/skin/${SKIN_STYLE}/${id}.png`, import.meta.url));
      hashes.add(createHash("md5").update(buf).digest("hex"));
    }
    assert.equal(hashes.size, IDS.length, "六张皮肤存在重复");
  });
});