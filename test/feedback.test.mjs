/* ===========================================================
 * feedback.test.mjs — 反馈接口安全回归
 *
 * 两层覆盖：
 *   1) feedback.php 静态安全断言（PHP 无法在 Node 运行时执行，沿用
 *      modules.test.mjs 的静态解析风格，但把断言收拢成专门的回归用例）
 *   2) js/feedback.js 前端提交行为（成功 / 失败 / 网络异常 / 空内容 / 互斥）
 *
 * 这些断言锁定的是「曾经出过或极易出」的安全/健壮性问题：
 * 通配 CORS、无频率限制、日志注入、凭据入库、默认文档根内落盘、前端提交竞态。
 * =========================================================== */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./_env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHP = fs.readFileSync(path.join(ROOT, "feedback.php"), "utf8");
const HTACCESS = fs.readFileSync(path.join(ROOT, ".htaccess"), "utf8");
const GITIGNORE = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");

describe("feedback.php 静态安全", () => {
  it("只做同源校验，不得再发通配 CORS", () => {
    // 只匹配真实的 header() 调用，避开注释里对旧版写法的引用
    assert.ok(!/header\(['"]Access-Control-Allow-Origin:\s*\*/.test(PHP), "不得出现通配 CORS 头");
    assert.ok(/forbidden_origin/.test(PHP), "非同源应返回 forbidden_origin");
    assert.ok(/HTTP_ORIGIN/.test(PHP), "应读取 Origin 做同源判定");
    assert.ok(/Access-Control-Allow-Origin/.test(PHP), "同源时仍需回写 CORS 头");
    assert.ok(/Vary:\s*Origin/.test(PHP), "CORS 响应应带 Vary: Origin");
  });

  it("单 IP 滑窗限流，超出返回 429 且不落盘", () => {
    assert.ok(/RATE_WINDOW_SEC/.test(PHP) && /RATE_MAX_REQ/.test(PHP), "应定义限流窗口与阈值");
    assert.ok(/REMOTE_ADDR/.test(PHP), "限流应按来源 IP 计数");
    assert.ok(/429/.test(PHP) && /rate_limited/.test(PHP), "超限应返回 429 rate_limited");
    // 限流分支必须在写日志之前返回，保证被限流的请求不落盘
    const rateIdx = PHP.indexOf("rate_limited");
    const logIdx = PHP.indexOf("file_put_contents($logFile");
    assert.ok(rateIdx > 0 && logIdx > rateIdx, "限流判定必须先于日志写入");
  });

  it("客户端可控字段单行化，防日志 / 推送标题注入", () => {
    assert.ok(/function fw_one_line/.test(PHP), "应提供 fw_one_line 清洗函数");
    // 剥控制字符（含 CRLF 与 Unicode 行/段分隔符）
    assert.ok(PHP.includes("\\x00-\\x1F"), "清洗需覆盖控制字符区间");
    assert.ok(PHP.includes("\\x{2028}"), "清洗需覆盖 Unicode 行分隔符");
    assert.ok(/fw_one_line\(\$payload\['content'\]/.test(PHP), "content 必须过清洗");
    assert.ok(/\$ver\s*=\s*fw_one_line\(/.test(PHP), "ver 必须过清洗（防伪造推送标题）");
    assert.ok(/\$from\s*=\s*fw_one_line\(/.test(PHP), "from 必须过清洗");
  });

  it("空内容返回 400，不产生日志", () => {
    assert.ok(/empty/.test(PHP), "空内容应返回 empty 错误");
    const emptyIdx = PHP.indexOf("'error' => 'empty'");
    const logIdx = PHP.indexOf("file_put_contents($logFile");
    assert.ok(emptyIdx > 0 && emptyIdx < logIdx, "空内容判定应在落盘之前");
  });

  it("日志 / 限流 / 节流文件优先写到文档根之外", () => {
    assert.ok(/__DIR__\s*\.\s*'\/\.\.\/\.\.'/.test(PHP), "状态目录应取 __DIR__/../..（文档根上一级）");
    assert.ok(/is_writable\(\$stateDir\)/.test(PHP), "不可写时应回退而非报错");
    // .htaccess 兜底：即使回退到文档根内也挡得住
    assert.ok(/feedback\\\.log/.test(HTACCESS), ".htaccess 应屏蔽 feedback.log");
    assert.ok(/push_throttle/.test(HTACCESS), ".htaccess 应屏蔽 .push_throttle");
  });

  it("推送凭据外置、失败关闭；仅密钥文件被忽略，接口源码入库", () => {
    assert.ok(!/SCT[A-Za-z0-9]{20,}/.test(PHP), "feedback.php 不得硬编码 token");
    assert.ok(/feedback\.secret\.php/.test(PHP), "应从 feedback.secret.php 加载凭据");
    assert.ok(
      /if\s*\(!defined\('SCT_TOKEN'\)\)\s*\{\s*define\('SCT_TOKEN',\s*''\)/.test(PHP),
      "缺失凭据时应默认空串（失败关闭）"
    );

    // 按 .gitignore 的「有效规则」判定忽略状态：注释行不作数，! 行是反忽略。
    // feedback.php 本身零密钥、必须入库（CI 全新 checkout 才能跑本文件的静态断言），
    // 真正含密钥的 feedback.secret.php / .deploy.env 才需要被忽略。
    // 不再用 GITIGNORE.includes(文件名) 做子串匹配——注释里出现同名就会误判。
    const rules = GITIGNORE.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"));
    const isIgnored = (file) => {
      let ignored = false;
      for (const r of rules) {
        const neg = r.startsWith("!");
        if ((neg ? r.slice(1) : r) === file) ignored = !neg;
      }
      return ignored;
    };
    assert.ok(!isIgnored("feedback.php"), "feedback.php 应纳入版本库，不得被 .gitignore 忽略");
    for (const f of ["feedback.secret.php", ".deploy.env"]) {
      assert.ok(isIgnored(f), `.gitignore 必须忽略 ${f}`);
    }
  });

  it("推送在落盘之后，失败不影响反馈留档", () => {
    const logIdx = PHP.indexOf("file_put_contents($logFile");
    const pushIdx = PHP.indexOf("sct_send(");
    assert.ok(logIdx > 0 && pushIdx > logIdx, "应先写日志再推送");
    assert.ok(PHP.includes("'pushed' => $pushed"), "响应需区分「已记录」与「已推送」");
  });

  it("响应不回显原始输入（无反射 XSS 面）", () => {
    // 成功分支只回 ok/pushed/pushError，绝不把 $content 拼回响应体
    const tail = PHP.slice(PHP.indexOf("echo json_encode(['ok' => true, 'pushed'"));
    assert.ok(!/\$content/.test(tail), "成功响应不得回显用户内容");
    assert.ok(/nosniff/.test(PHP), "应带 X-Content-Type-Options: nosniff");
    assert.ok(/application\/json/.test(PHP), "响应用 application/json");
  });

  it("OPTIONS 预检返回 204", () => {
    assert.ok(/REQUEST_METHOD'\]\s*===\s*'OPTIONS'/.test(PHP), "应处理 OPTIONS 预检");
    assert.ok(/http_response_code\(204\)/.test(PHP), "预检应返回 204");
  });
});

// ---------- 前端 feedback.js 行为 ----------
// 每个用例用带唯一查询串的动态 import 取一份全新模块实例（模块级状态隔离）
let els;

function makeEl() {
  const listeners = {};
  return {
    textContent: "",
    value: "",
    className: "",
    disabled: false,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
    focus() {},
    fire(type, ev = {}) {
      let out;
      for (const fn of (listeners[type] || [])) out = fn(ev);
      return out;
    },
  };
}

function setupDom() {
  els = {
    fbMask: makeEl(), fbInput: makeEl(), fbStatus: makeEl(),
    fbCancel: makeEl(), fbSubmit: makeEl(),
  };
  globalThis.document.getElementById = id => els[id] || null;
}

async function freshFeedback() {
  // 唯一查询串 → 新模块实例，避免上一个用例的模块级状态污染
  return import("../js/feedback.js?t=" + Math.random().toString(36).slice(2) + Date.now());
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe("feedback.js 前端行为", () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => setupDom());
  afterEach(() => { globalThis.fetch = origFetch; });

  it("初始化成功标记 __feedbackLoaded", async () => {
    const fb = await freshFeedback();
    fb.initFeedback();
    assert.equal(globalThis.window.__feedbackLoaded, true);
  });

  it("开关面板：showFeedback / hideFeedback / isFeedbackOpen", async () => {
    const fb = await freshFeedback();
    fb.initFeedback();
    assert.equal(fb.isFeedbackOpen(), false);
    fb.showFeedback();
    assert.equal(fb.isFeedbackOpen(), true);
    fb.hideFeedback();
    assert.equal(fb.isFeedbackOpen(), false);
  });

  it("空内容不发起请求，提示先填写", async () => {
    const fb = await freshFeedback();
    let called = false;
    globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({ ok: true }) }; };
    fb.initFeedback();
    fb.showFeedback();
    els.fbInput.value = "   ";
    els.fbSubmit.fire("click");
    await flush();
    assert.equal(called, false, "空内容不应发请求");
    assert.match(els.fbStatus.textContent, /请先填写/);
  });

  it("提交成功：payload 含 content 与 ver，状态转为成功", async () => {
    const fb = await freshFeedback();
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ ok: true, pushed: true }) };
    };
    fb.initFeedback();
    fb.showFeedback();
    els.fbInput.value = "  这里有个 bug  ";
    els.fbSubmit.fire("click");
    await flush(); await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "feedback.php");
    assert.equal(calls[0].body.content, "这里有个 bug");   // trim 后提交
    assert.equal(typeof calls[0].body.ver, "string");
    assert.match(els.fbStatus.textContent, /已记录/);
    assert.equal(els.fbStatus.className, "fb-status ok");
  });

  it("服务端拒绝：状态为失败且按钮文案复位", async () => {
    const fb = await freshFeedback();
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ ok: false, error: "rate_limited" }) });
    fb.initFeedback();
    fb.showFeedback();
    els.fbInput.value = "hello";
    els.fbSubmit.fire("click");
    await flush(); await flush();
    assert.match(els.fbStatus.textContent, /提交失败/);
    assert.equal(els.fbSubmit.disabled, false);
    assert.equal(els.fbSubmit.textContent, "提交");
  });

  it("网络异常：捕获并提示网络错误，不抛出", async () => {
    const fb = await freshFeedback();
    globalThis.fetch = async () => { throw new Error("boom"); };
    fb.initFeedback();
    fb.showFeedback();
    els.fbInput.value = "hello";
    await els.fbSubmit.fire("click");
    await flush(); await flush();
    assert.match(els.fbStatus.textContent, /网络异常/);
    assert.equal(els.fbSubmit.disabled, false);
  });

  it("提交中互斥：请求未返回时按钮禁用，返回后恢复", async () => {
    const fb = await freshFeedback();
    let resolveFetch;
    globalThis.fetch = () => new Promise(res => { resolveFetch = res; });
    fb.initFeedback();
    fb.showFeedback();
    els.fbInput.value = "hello";
    els.fbSubmit.fire("click");
    await flush();
    assert.equal(els.fbSubmit.disabled, true, "提交中应禁用按钮");
    resolveFetch({ ok: true, json: async () => ({ ok: true, pushed: false }) });
    await flush(); await flush();
    assert.equal(els.fbSubmit.disabled, false, "完成后应恢复");
  });
});
