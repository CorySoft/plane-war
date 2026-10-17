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

  it("推送凭据不进仓库、不下发到浏览器", () => {
    const root = path.resolve(JS_DIR, "..");
    const serverSrc = fs.readFileSync(path.resolve(root, "feedback.php"), "utf8");

    // 1) feedback.php 本体不得再硬编码 token：它随仓库流转，一旦外泄
    //    任何拿到的人都能用 token 往你微信推任意内容
    assert.ok(
      !/SCT[A-Za-z0-9]{20,}/.test(serverSrc),
      "feedback.php 不得硬编码方糖 token（应外置到 feedback.secret.php）"
    );

    // 2) 缺失凭据时必须失败关闭（停用推送而不是 500）
    assert.ok(
      /if\s*\(!defined\('SCT_TOKEN'\)\)\s*\{\s*define\('SCT_TOKEN',\s*''\)/.test(serverSrc),
      "未配置 SCT_TOKEN 时应默认为空串（失败关闭）"
    );

    // 3) 真正的 token 放在 gitignore 掉的 feedback.secret.php 里
    const ignore = fs.readFileSync(path.resolve(root, ".gitignore"), "utf8");
    assert.ok(ignore.includes("feedback.secret.php"), ".gitignore 必须忽略 feedback.secret.php");

    // 4) 前端任何地方都不许出现 token
    const secretPath = path.resolve(root, "feedback.secret.php");
    if (fs.existsSync(secretPath)) {
      const m = fs.readFileSync(secretPath, "utf8").match(/SCT[A-Za-z0-9]{20,}/);
      if (m) {
        for (const f of FILES) {
          assert.ok(!readModule(f).includes(m[0]), `token 泄露到前端模块 ${f}`);
        }
        const html = fs.readFileSync(path.resolve(root, "index.html"), "utf8");
        assert.ok(!html.includes(m[0]), "token 泄露到 index.html");
      }
    }
  });

  it("feedback.php 只接受同源请求并做频率限制", () => {
    const serverSrc = fs.readFileSync(path.resolve(JS_DIR, "../feedback.php"), "utf8");
    // 旧版是 Access-Control-Allow-Origin: *，等于把接口开放成公共微信推送机
    assert.ok(
      !/header\('Access-Control-Allow-Origin:\s*\*'\)/.test(serverSrc),
      "不得再无条件发送通配 CORS 头（应只对同源回 Access-Control-Allow-Origin）"
    );
    assert.ok(/Access-Control-Allow-Origin/.test(serverSrc), "同源时仍需回 CORS 头");
    assert.ok(/RATE_MAX_REQ/.test(serverSrc), "应具备单 IP 频率限制");
    assert.ok(/REMOTE_ADDR/.test(serverSrc), "频率限制需按来源 IP 计数");
  });

  it("feedback.php 对客户端输入做单行化（防日志/推送注入）", () => {
    const serverSrc = fs.readFileSync(path.resolve(JS_DIR, "../feedback.php"), "utf8");
    // 内容若含换行就能在按行分隔的日志里伪造多条记录、在 Markdown 推送里伪造标题
    assert.ok(/function fw_one_line/.test(serverSrc), "应提供单行化清洗函数");
    assert.ok(/fw_one_line\(\$payload\['content'\]/.test(serverSrc), "content 必须过清洗");
    assert.ok(
      /\$ver\s*=\s*fw_one_line\([^)]*\['ver'\]/.test(serverSrc),
      "ver 必须过清洗（否则可伪造推送标题）"
    );
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
