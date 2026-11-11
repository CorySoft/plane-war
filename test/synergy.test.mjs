/* ===========================================================
 * synergy.test.mjs — P3（1a）协同表守护
 *
 * 1a 的定位是「零行为改动」：只把生产代码里已经成立的组合显性化，并把一处散写字面量
 * 收回单源。它的判定方式**不是**整局快照——test/ 内没有 LCG 整局快照基建（唯一确定性
 * 用例是 test/lifesteal.test.mjs 的种子），整局差分只活在 tools/perf/ 的手工脚本里。
 * 因此这里用三条可证伪的局部断言代替：
 *   ① 表结构与锚点不漂移（锚点行段内必须仍能读到 probe 字符串）；
 *   ② dual 上限由硬编码 4 改读 skillMax("dual") 前后**等值**；
 *   ③ exclusive 条目不得被当成叠加协同（calcFireRate 是短路 return）。
 * 另附 1b 落地后的守护：madHunt 波内封顶（madHuntWaveCap）已落地；
 * move×speed 总乘算 2.58× 经平衡评审确认为有意设计不变式（不封顶），本文件守护其不被误改。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./_env.mjs";
import { makeSpyCtx } from "./_env.mjs";
import {
  BULLET, H, POWERUP_DURATION, SKILLS, SYNERGY, W,
  activeSynergies, calcFireRate, skillMax,
} from "../js/config.js";
import { createPlayer, getShootPattern } from "../js/player.js";
import { drawHUD } from "../js/hud.js";

const srcOf = (rel) => readFileSync(new URL("../" + rel, import.meta.url), "utf8").split("\n");
const skillIds = new Set(SKILLS.map(s => s.id));
const buffIds = new Set(Object.keys(POWERUP_DURATION));

function playerWith({ skills = {}, buffs = {}, power } = {}) {
  const p = createPlayer(null, {}, {});
  for (const [k, v] of Object.entries(skills)) p.skills[k] = v;
  for (const [k, v] of Object.entries(buffs)) p.buffs[k] = v;
  if (power !== undefined) p.power = power;
  return p;
}

describe("SYNERGY 协同表（P3 1a：显性化，不改行为）", () => {
  it("条目结构完备，且不含 score 轴组合", () => {
    assert.ok(SYNERGY.length >= 1, "表不应为空");
    const banned = new Set(["score", "double", "drop"]);
    for (const s of SYNERGY) {
      assert.ok(s.id && s.label && s.formula, `${s.id} 缺少 id/label/formula`);
      assert.ok(["stack", "exclusive", "debuff"].includes(s.state), `${s.id} state 非法：${s.state}`);
      assert.ok(Array.isArray(s.anchors) && s.anchors.length > 0, `${s.id} 必须有生产代码锚点`);
      for (const id of [...(s.skills ?? []), ...(s.buffs ?? []), ...(s.anyOf ?? [])]) {
        assert.ok(!banned.has(id), `${s.id} 引用了 score 轴条目 ${id}：涨分即涨难度，禁止显性化`);
      }
    }
  });

  it("锚点不漂移：声明名 + 全文唯一命中（line 仅作注释，不强制）", () => {
    for (const s of SYNERGY) {
      for (const a of s.anchors) {
        assert.ok(a.file && a.probe, `${s.id} 锚点需含 file 与 probe`);
        const full = srcOf(a.file).join("\n");
        // 只在「生产代码段」里查：截掉文件末尾的 SYNERGY 表，避免 probe 字符串本身（写在锚点里）被算成命中
        const cut = full.indexOf("export const SYNERGY");
        const codeOnly = cut === -1 ? full : full.slice(0, cut);
        const hits = codeOnly.split(a.probe).length - 1;
        assert.equal(hits, 1,
          `${s.id} 锚点 probe "${a.probe}" 在 ${a.file} 生产代码段须唯一命中，实际 ${hits} 次（注释行号 ${a.line ?? "?"}）`);
      }
    }
  });

  it("条件里的 id 必须存在于 SKILLS / POWERUP_DURATION 单源", () => {
    for (const s of SYNERGY) {
      for (const id of s.skills ?? []) assert.ok(skillIds.has(id), `${s.id} 引用了不存在的技能 ${id}`);
      for (const id of s.anyOf ?? []) assert.ok(skillIds.has(id), `${s.id} 引用了不存在的技能 ${id}`);
      for (const id of s.buffs ?? []) assert.ok(buffIds.has(id), `${s.id} 引用了不存在的道具 buff ${id}`);
    }
  });

  it("1a 零行为：dual 上限改读 skillMax 前后等值且仍生效", () => {
    assert.equal(skillMax("dual"), 4, "SKILLS.dual.max 已不是旧硬编码值 4，1a 的「等值」前提失效，须重跑弹道对比");
    const at = getShootPattern(playerWith({ skills: { dual: 4 }, power: 1 })).length;
    const over = getShootPattern(playerWith({ skills: { dual: 9 }, power: 1 })).length;
    assert.equal(over, at, "dual 超上限未被钳制：Math.min(skillMax) 这层保护失效");
  });

  it("exclusive 条目：急速与疯狂追击互斥，不得宣称叠加", () => {
    const p = playerWith({ buffs: { rapid: POWERUP_DURATION.rapid, madHunt: POWERUP_DURATION.madHunt } });
    assert.equal(calcFireRate(p), 0.055, "calcFireRate 应对急速短路返回 0.055（不是与追击 0.045 叠加）");
    const ids = activeSynergies(p).map(s => s.id);
    assert.ok(ids.includes("rapid_madHunt"), "两者同时生效时应给出互斥提示");
    assert.equal(SYNERGY.find(s => s.id === "rapid_madHunt").state, "exclusive");
  });

  it("activeSynergies 只在组合两侧同时成立时返回", () => {
    assert.deepEqual(activeSynergies(playerWith({})).map(s => s.id), []);
    assert.ok(activeSynergies(playerWith({ skills: { move: 1 } })).length === 0, "单边不成立不应报协同");
    const both = activeSynergies(playerWith({ skills: { move: skillMax("move") }, buffs: { speed: 1 } }));
    assert.ok(both.some(s => s.id === "mobility"));
  });
});

describe("HUD 协同读数（1a 唯一的新增绘制，纯显示不参与判定）", () => {
  const hudBase = (player) => ({
    score: 0, best: 0, level: 1, enemyLevel: 1, pLevel: 1, xp: 0, xpNeed: 10,
    lives: 3, maxLives: 3, combo: 0, player, frame: 1,
  });

  it("协同 / 互斥文案真的落到画布右上空列", () => {
    const mob = playerWith({ skills: { move: skillMax("move") }, buffs: { speed: 1 } });
    const { ctx, texts } = makeSpyCtx();
    drawHUD(ctx, hudBase(mob));
    const hit = texts.find(t => String(t.t).startsWith("协同 "));
    assert.ok(hit, `未找到协同读数，实际文字：${texts.map(t => t.t).join(" | ")}`);
    assert.equal(hit.t, "协同 机动 × 加速");
    assert.equal(hit.x, W - 16, "应右对齐落在空列，避开左侧射程/行为行");
    assert.equal(hit.y, H - 56);
  });

  it("急速 + 追击同时生效时标为「互斥」而非叠加", () => {
    const p = playerWith({ skills: { dual: 2 }, buffs: { rapid: 8, madHunt: 5 } });
    const { ctx, texts } = makeSpyCtx();
    drawHUD(ctx, hudBase(p));
    const lines = texts.filter(t => /^(协同|互斥) /.test(String(t.t))).map(t => t.t);
    assert.ok(lines.some(t => t.startsWith("互斥 ")),
      `应给出互斥提示，实际读数：${lines.join(" | ") || "（无）"}`);
    // 表序即优先级：mobility → burst → rapid_madHunt → explosion_chain，同屏最多显示两行
    assert.ok(lines.some(t => t.startsWith("协同 侧翼炮")), `burst 协同应占另一行，实际：${lines.join(" | ")}`);
    assert.ok(!lines.some(t => t.startsWith("协同 机动")), "机动协同未成立，不得出现");
    assert.equal(lines.length, 2, "读数上限两行");
  });

  it("无协同时一行都不画（默认 HUD 不被污染）", () => {
    const { ctx, texts } = makeSpyCtx();
    drawHUD(ctx, hudBase(playerWith({})));
    assert.ok(!texts.some(t => /^(协同|互斥) /.test(String(t.t))), "空组合不应出现读数");
  });
});

describe("1b：封顶已落地（madHunt 波内封顶 + move×speed 设计不变式）", () => {
  it("madHunt 满配单波经均匀采样截到 madHuntWaveCap", () => {
    const p = playerWith({
      skills: { scatter: skillMax("scatter"), volley: skillMax("volley") },
      buffs: { madHunt: POWERUP_DURATION.madHunt },
    });
    const native = (8 + 2 * skillMax("scatter")) * (1 + skillMax("volley"));
    const n = getShootPattern(p).length;
    assert.ok(native > BULLET.madHuntWaveCap, `原生=${native} 应大于 cap=${BULLET.madHuntWaveCap}，否则采样未生效`);
    assert.equal(n, BULLET.madHuntWaveCap, "madHunt 单波应恰好截到 madHuntWaveCap");
    assert.ok(n <= BULLET.waveCap * 4, `madHuntWaveCap=${BULLET.madHuntWaveCap} 不得超过 waveCap*4 太多`);
  });

  it("move × speed 总乘算锁定 2.58× 为设计不变式（经平衡评审不封顶）", () => {
    const total = (1 + 0.12 * skillMax("move")) * 1.5;
    assert.ok(Math.abs(total - 2.58) < 1e-12, `机动满配总乘算应为 2.58×，实际 ${total}`);
    const seg = srcOf("js/player.js").slice(101, 104).join("\n");   // js/player.js:102-104
    assert.doesNotMatch(seg, /Math\.min/,
      "若在此处新增总封顶，须同步 SYNERGY.mobility 与 1b 平衡评审结论：move×speed 不封顶是有意设计");
  });
});
