import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirs = [];

function listJavaScript(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listJavaScript(path.join(dir, entry.name), relative);
      return entry.isFile() && entry.name.endsWith(".js") ? [relative] : [];
    });
}

function makeDeploymentFixture({ omitModule = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plane-war-deploy-"));
  temporaryDirs.push(dir);
  for (const file of ["deploy.sh", "index.html", ".htaccess"]) {
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  // 夹具用固定基准版本，不复制仓库 VERSION：deploy.sh 会把它 +1 成 v0.3.6，
  // 与下方断言一致。若跟随仓库 VERSION，每次部署回写版本号后本用例就会漂移失败，
  // 且 deploy.sh 自身的 npm test 门禁也含本用例 → 部署一次后再也部署不了。
  fs.writeFileSync(path.join(dir, "VERSION"), "0.3.5\n");
  fs.cpSync(path.join(ROOT, "js"), path.join(dir, "js"), { recursive: true });
  for (const dirname of ["plane_war_js_fixture", "pw_test_fixture"]) {
    const temporaryModuleDir = path.join(dir, "js", dirname);
    fs.mkdirSync(temporaryModuleDir);
    fs.writeFileSync(path.join(temporaryModuleDir, "game.js"), "export const fixtureOnly = true;\n");
  }
  if (omitModule) fs.rmSync(path.join(dir, "js", omitModule));
  fs.writeFileSync(path.join(dir, ".deploy.env"), [
    "FTP_HOST=invalid.example",
    "FTP_USER=test-user",
    "FTP_PASS=test-password",
    "FTP_REMOTE_DIR=htdocs/wwwroot",
  ].join("\n") + "\n");

  const binDir = path.join(dir, "bin");
  fs.mkdirSync(binDir);
  const fakeLftp = path.join(binDir, "lftp");
  fs.writeFileSync(fakeLftp, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const command = process.argv[process.argv.indexOf("-e") + 1];
const remote = process.env.FAKE_REMOTE_ROOT;
fs.appendFileSync(process.env.FAKE_LFTP_LOG, command + "\\n");
for (const segment of command.split(";")) {
  const parts = [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\\S+)/g)]
    .map(match => match[1] ?? match[2] ?? match[3]);
  if (parts[0] === "mkdir" && parts.includes("-p")) {
    fs.mkdirSync(path.join(remote, parts.at(-1).replace(/^\\//, "")), { recursive: true });
  } else if (parts[0] === "put" && parts.includes("-o")) {
    const target = path.join(remote, parts[parts.indexOf("-o") + 1].replace(/^\\//, ""));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(parts[1], target);
  }
}
`);
  fs.chmodSync(fakeLftp, 0o755);
  const remoteRoot = path.join(dir, "remote");
  const log = path.join(dir, "lftp.log");
  fs.mkdirSync(remoteRoot);
  return { dir, remoteRoot, log, binDir };
}

function runDeploy(fixture) {
  return spawnSync("bash", [path.join(fixture.dir, "deploy.sh")], {
    cwd: fixture.dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.binDir}:${process.env.PATH}`,
      FAKE_REMOTE_ROOT: fixture.remoteRoot,
      FAKE_LFTP_LOG: fixture.log,
      SKIP_TESTS: "1",
    },
  });
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("recursive deployment versioning", () => {
  it("uploads all reachable modules and rewrites nested relative imports", () => {
    const fixture = makeDeploymentFixture();
    const result = runDeploy(fixture);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /30 个产物，30 个可达模块/);

    const remoteJs = path.join(fixture.remoteRoot, "htdocs", "wwwroot", "js");
    const modules = listJavaScript(remoteJs);
    assert.equal(modules.length, 30);
    assert.ok(modules.includes("level/patterns.v0.3.6.js"));
    assert.ok(modules.includes("game.v0.3.6.js"));
    assert.ok(modules.includes("ui/menus.v0.3.6.js"));
    assert.equal(modules.some(file => file.startsWith("plane_war_js_") || file.startsWith("pw_test_")), false);

    const moduleSet = new Set(modules);
    const importPattern = /\b(?:from\s*|import\s*\(\s*|import\s*)(["'])(\.{1,2}\/[^"']+\.js)\1/g;
    for (const file of modules) {
      const source = fs.readFileSync(path.join(remoteJs, file), "utf8");
      for (const match of source.matchAll(importPattern)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[2]));
        assert.ok(moduleSet.has(target), `${file} points to missing versioned module ${match[2]}`);
      }
    }

    const facade = fs.readFileSync(path.join(remoteJs, "ui.v0.3.6.js"), "utf8");
    assert.match(facade, /from "\.\/ui\/effects\.v0\.3\.6\.js"/);
    const nestedModule = fs.readFileSync(path.join(remoteJs, "ui", "common.v0.3.6.js"), "utf8");
    assert.match(nestedModule, /from "\.\.\/config\.v0\.3\.6\.js"/);
  });

  it("blocks deployment before remote writes when a referenced nested module is missing", () => {
    const fixture = makeDeploymentFixture({ omitModule: "ui/common.js" });
    const result = runDeploy(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /imports missing module/);
    assert.equal(fs.existsSync(fixture.log), false);
    assert.deepEqual(listJavaScript(path.join(fixture.remoteRoot)), []);
  });
});
