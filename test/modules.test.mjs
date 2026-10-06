/* ===========================================================
 * modules.test.mjs — 模块图静态一致性
 * 线上最常见的一类致命故障是「The requested module './ui.js' does not
 * provide an export named 'xxx'」：ESM 在解析期就会整图失败，页面只剩
 * 加载失败页。本测试在 Node 下静态解析所有 import/export，提前拦住。
 * =========================================================== */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../js");

function readModule(file) {
  return fs.readFileSync(path.join(JS_DIR, file), "utf8");
}

/** 收集某模块对外暴露的名字（function / const|let|var / export {} / export * 展开） */
function collectExports(file) {
  const src = readModule(file);
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const n = part.trim();
      if (!n) continue;
      names.add(n.split(/\s+as\s+/).pop().trim());
    }
  }
  return names;
}

const FILES = fs.readdirSync(JS_DIR).filter(f => f.endsWith(".js")).sort();
const EXPORT_MAP = new Map(FILES.map(f => [f, collectExports(f)]));

/** 解析 import 语句（兼容部署脚本追加的 ?v= 版本查询串） */
function collectImports(file) {
  const src = readModule(file);
  const out = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["']\.\/([A-Za-z0-9_.\-]+\.js)(?:\?[^"']*)?["']/g;
  for (const m of src.matchAll(re)) {
    const names = m[1].split(",")
      .map(s => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ names, target: m[2] });
  }
  return out;
}

describe("modules", () => {
  it("js 目录下存在全部核心模块", () => {
    for (const need of ["game.js", "ui.js", "config.js", "player.js", "bullet.js", "enemy.js", "wave.js", "skill.js", "meta.js", "powerup.js", "version.js"]) {
      assert.ok(FILES.includes(need), `缺少模块 ${need}`);
    }
  });

  it("所有相对导入的模块文件都存在", () => {
    for (const f of FILES) {
      for (const imp of collectImports(f)) {
        assert.ok(EXPORT_MAP.has(imp.target), `${f} 导入了不存在的模块 ${imp.target}`);
      }
    }
  });

  it("所有具名导入都能在目标模块找到对应导出", () => {
    for (const f of FILES) {
      for (const imp of collectImports(f)) {
        const set = EXPORT_MAP.get(imp.target);
        for (const n of imp.names) {
          assert.ok(set.has(n), `${f} 从 ${imp.target} 导入了不存在的导出 "${n}"`);
        }
      }
    }
  });

  it("导入语句不带版本查询串（部署时才由 deploy.sh 注入）", () => {
    for (const f of FILES) {
      const src = readModule(f);
      const bad = src.match(/from\s*["']\.\/[A-Za-z0-9_.\-]+\.js\?[^"']*["']/);
      assert.equal(bad, null, `${f} 源码里出现了版本化 import，会导致本地与线上不一致`);
    }
  });

  it("version.js 导出 APP_VERSION", () => {
    assert.ok(EXPORT_MAP.get("version.js").has("APP_VERSION"));
  });

  it("源码里调用的每个 sfx.xxx 都真实存在", async () => {
    // 回归：sfx.click 曾被 game.js 调用但 audio.js 未定义，
    // 导致机库点「确认购买」时抛 TypeError（ESM 解析期发现不了）
    const { sfx } = await import("../js/audio.js");
    const used = new Set();
    for (const f of FILES) {
      const src = readModule(f);
      for (const m of src.matchAll(/\bsfx\.([A-Za-z0-9_$]+)/g)) used.add(m[1]);
    }
    assert.ok(used.size > 0, "应至少扫描到一处 sfx 调用");
    for (const name of used) {
      assert.equal(typeof sfx[name], "function", `audio.js 缺少音效方法 sfx.${name}（被源码调用）`);
    }
  });

  it("方糖 token 只存在于服务端，不下发到浏览器", () => {
    // token 一旦出现在前端就会被任意访问者拿去刷微信消息
    const serverSrc = fs.readFileSync(path.resolve(JS_DIR, "../feedback.php"), "utf8");
    const m = serverSrc.match(/SCT[A-Za-z0-9]{20,}/);
    assert.ok(m, "feedback.php 应保存方糖 token");
    const token = m[0];
    for (const f of FILES) {
      assert.ok(!readModule(f).includes(token), `token 泄露到前端模块 ${f}`);
    }
    const html = fs.readFileSync(path.resolve(JS_DIR, "../index.html"), "utf8");
    assert.ok(!html.includes(token), "token 泄露到 index.html");
  });

  it("feedback.php 推送失败不影响反馈落盘", () => {
    const src = fs.readFileSync(path.resolve(JS_DIR, "../feedback.php"), "utf8");
    // 推送逻辑必须在写日志之后，且响应用 pushed 标记而不是整体失败
    const logIdx = src.indexOf("file_put_contents($logFile");
    const pushIdx = src.indexOf("sct_send(");
    assert.ok(logIdx > 0 && pushIdx > logIdx, "应先写日志再推送");
    assert.ok(src.includes("'pushed' => $pushed"), "响应需区分「已记录」与「已推送」");
  });

  it("每个模块都能被 node 解析（语法）", async () => {
    for (const f of FILES) {
      const { execFileSync } = await import("node:child_process");
      execFileSync(process.execPath, ["--check", path.join(JS_DIR, f)]);
    }
  });
});
