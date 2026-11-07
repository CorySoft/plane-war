#!/usr/bin/env bash
# ============================================================
# deploy.sh — plane_war 自动部署脚本（上传到 Byethost FTP）
# 用法：
#   ./deploy.sh            # 增量上传（仅变更文件）
#   ./deploy.sh --force    # 强制全量上传
#   ./deploy.sh --verify   # 仅校验远程文件，不上传
#   ./deploy.sh --both     # 强制全量 + 校验
#   ./deploy.sh --prune    # 额外清理远程 js/ 下的历史版本副本
#   ./deploy.sh --rollback <版本>   # 回滚 index.html 到指定历史版本（x.y.z）
#   ./deploy.sh --skip-tests        # 跳过部署前 npm test 门禁（紧急用）
#   ./deploy.sh --help | -h         # 显示用法并退出（不读配置、无副作用）
# 环境变量：
#   SKIP_TESTS=1    同 --skip-tests
#   FTP_SSL=1       启用显式 FTPS + 证书校验
# 依赖：lftp（apt-get install -y lftp）；测试门禁需要 node/npm
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

# --help / -h 必须在读取 .deploy.env 之前处理：旧实现未识别该参数，会一路落到
# 「跑测试 + 上传」的真实部署路径（且无凭据环境下还会被配置检查挡住）。
# 直接复用文件头的用法注释，避免与文档重复维护。
usage() {
  awk '/^# =====/ { n++; next } n == 1 { sub(/^# ?/, ""); print }' "$0"
}
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
  esac
done

# ---------- 读取配置 ----------
ENV_FILE=".deploy.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "错误：缺少 $ENV_FILE（复制示例并填入 FTP 凭据）" >&2
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

: "${FTP_HOST:?FTP_HOST 未设置}"
: "${FTP_USER:?FTP_USER 未设置}"
: "${FTP_PASS:?FTP_PASS 未设置}"
: "${FTP_REMOTE_DIR:=htdocs/wwwroot}"
# FTP_SSL=1 启用显式 FTPS + 证书校验（宿主支持时应打开，默认关闭以兼容旧空间）
: "${FTP_SSL:=0}"

MODE="incremental"
PRUNE=0
ROLLBACK_VER=""
ROLLBACK_REQUESTED=0
SKIP_TESTS="${SKIP_TESTS:-0}"
while [ $# -gt 0 ]; do
  case "$1" in
    --force)  MODE="full" ;;
    --verify) MODE="verify" ;;
    --both)   MODE="both" ;;
    --prune)  PRUNE=1 ;;                          # 额外清理远程 js/ 下的历史版本副本
    --skip-tests) SKIP_TESTS=1 ;;                    # 跳过部署前测试门禁（紧急用）
    --rollback)   shift; ROLLBACK_VER="${1:-}"; ROLLBACK_REQUESTED=1 ;;
    --rollback=*) ROLLBACK_VER="${1#--rollback=}"; ROLLBACK_REQUESTED=1 ;;
  esac
  shift
done

# --rollback 必须带合法版本号：旧实现里参数缺失 / 为空会「静默退化成一次正常部署」，
# 误触发上传与版本递增；版本号还会被拼进 sed / lftp 命令串，故限定为 x.y.z。
if [ "$ROLLBACK_REQUESTED" = "1" ]; then
  if ! printf '%s' "$ROLLBACK_VER" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "错误：--rollback 需要 x.y.z 格式版本号（如 --rollback 0.3.4），实际「${ROLLBACK_VER:-空}」" >&2
    exit 1
  fi
fi

# lftp 设置（必须在同一 -e 中生效）。
# 默认关闭 SSL：Byethost 免费空间用自签证书，强开会把部署直接卡死。
# 设 FTP_SSL=1 可切到「显式 FTPS + 校验证书」（宿主支持时推荐）。
if [ "$FTP_SSL" = "1" ]; then
  LF_SET="set ftp:ssl-force on; set ftp:ssl-allow yes; set ssl:verify-certificate yes;"
else
  LF_SET="set ssl:verify-certificate no; set ftp:ssl-force off; set ftp:ssl-allow no;"
fi

# 凭据传递：优先用 ~/.netrc（600），避免密码出现在 ps/argv 里被同机其他用户看到。
# 生成：printf 'machine %s login %s password %s\n' "$FTP_HOST" "$FTP_USER" "$FTP_PASS" \
#         > ~/.netrc && chmod 600 ~/.netrc
if [ -r "$HOME/.netrc" ] && grep -q "machine ${FTP_HOST}" "$HOME/.netrc" 2>/dev/null; then
  LFTP_AUTH=(-u "$FTP_USER")
else
  LFTP_AUTH=(-u "$FTP_USER","$FTP_PASS")
fi

# 所有 lftp 调用统一走这个包装，避免每处重复写 -u 与 -e
lftp_run() {
  local cmds="$1"
  lftp "${LFTP_AUTH[@]}" "$FTP_HOST" -e "$LF_SET $cmds"
}

# 版本号文件路径（回滚分支与版本号管理段共用，故提前定义）
VERSION_FILE="VERSION"

# ---------- 部署前测试门禁 ----------
# 用于修掉旧流程「未跑测试直接上线」的问题：除 --verify / --rollback 外，
# 上传前先跑单元测试，失败即中止（不改 VERSION、不上传）。
# 紧急绕过：SKIP_TESTS=1 ./deploy.sh --force（或 --skip-tests）。
if [ "$MODE" != "verify" ] && [ -z "$ROLLBACK_VER" ] && [ "$SKIP_TESTS" != "1" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "错误：未找到 npm，无法执行测试门禁。安装 Node/npm 或设 SKIP_TESTS=1 紧急绕过。" >&2
    exit 1
  fi
  echo ">> 部署前测试门禁：npm test"
  if ! npm test; then
    echo "错误：单元测试未通过，已中止部署。紧急绕过：SKIP_TESTS=1 ./deploy.sh" >&2
    exit 1
  fi
fi

# ---------- 回滚 ----------
# 文件名版本化后，未被 --prune 清理的历史 *.v<ver>.js 仍在远端。回滚即把
# index.html 指向旧版本并同步 VERSION，无需重传 js（凭内容寻址的版本化文件名，
# 且旧版源码本地已不存在，重传也无从生成）。
# 前提：目标版本的版本化文件仍在远端（被 prune 过则无法回滚，需 checkout 旧源码重发）。
if [ -n "$ROLLBACK_VER" ]; then
  echo ">> 回滚到版本 $ROLLBACK_VER"
  remote_list="$(lftp_run "find $FTP_REMOTE_DIR/js/; quit" || true)"
  if ! printf '%s\n' "$remote_list" | grep -qE "(^|/)game\.v${ROLLBACK_VER}\.js$"; then
    echo "错误：远端不存在 game.v${ROLLBACK_VER}.js，无法回滚。" >&2
    echo "      请 checkout 目标版本源码后重新部署，或确认未对该版本执行过 --prune。" >&2
    exit 1
  fi
  # 完整性提示：递归统计该版本的模块数（包括 ui/ 等子目录），
  # 便于发现「上传中断 / 部分 prune 导致半套版本」。版本较旧时模块数偏少属正常，
  # 故只警告不阻断（旧版本的模块集本就与当前源码不同）。
  module_count=$(find js -type f -name '*.js' | wc -l | tr -d '[:space:]')
  found_count=$(printf '%s\n' "$remote_list" | grep -c "\.v${ROLLBACK_VER}\.js$" || true)
  if [ "$found_count" -lt "$module_count" ]; then
    echo "警告：远端仅有 ${found_count} 个 v${ROLLBACK_VER} 模块（当前源码 ${module_count} 个）。" >&2
    echo "      版本较旧属正常；若该版本曾被部分 --prune 或上传中断（含子目录模块），游戏可能缺模块。" >&2
  fi
  TMP_RB="$(mktemp /tmp/plane_war_index_rollback_XXXX.html)"
  sed "s/__VERSION__/${ROLLBACK_VER}/g" index.html > "$TMP_RB"
  lftp_run "put $TMP_RB -o $FTP_REMOTE_DIR/index.html; quit"
  rm -f "$TMP_RB"
  echo "$ROLLBACK_VER" > "$VERSION_FILE"
  echo ">> 已将 index.html 指向 v${ROLLBACK_VER}，VERSION 回退为 ${ROLLBACK_VER}（下次部署从该版本续增）"
  exit 0
fi

# ---------- 版本号管理（每次上传 +1，逢十进位；--verify 不改版本） ----------
# VERSION_FILE 已在上方（lftp_run 之后）提前定义，回滚分支与本节共用
if [ -f "$VERSION_FILE" ]; then
  CUR_VER=$(cat "$VERSION_FILE" | tr -d '[:space:]')
else
  CUR_VER="0.0.1"
fi

if [ "$MODE" = "verify" ]; then
  NEW_VER="$CUR_VER"
else
  IFS='.' read -r VMAJOR VMINOR VMICRO <<< "$CUR_VER"
  VMICRO=$((VMICRO + 1))
  if [ "$VMICRO" -ge 10 ]; then VMICRO=0; VMINOR=$((VMINOR+1)); fi
  if [ "$VMINOR" -ge 10 ]; then VMINOR=0; VMAJOR=$((VMAJOR+1)); fi
  NEW_VER="${VMAJOR}.${VMINOR}.${VMICRO}"
  echo "$NEW_VER" > "$VERSION_FILE"

  # 生成 js/version.js
  cat > js/version.js <<EOF
/* 版本号由 deploy.sh 每次部署自动递增生成，勿手动修改 */
export const APP_VERSION = "${NEW_VER}";
EOF
  echo ">> 版本 ${CUR_VER} → ${NEW_VER}"
fi

# ---------- 排除项：测试 / node_modules / 部署元文件 ----------
# （mirror 目标为 $FTP_REMOTE_DIR，.htaccess 需单独上传到其上级目录）
EXCLUDES=(
  --exclude '^\.git/'
  --exclude '^node_modules/'
  --exclude '^test/'
  --exclude '^test-results/'
  --exclude '^VERSION'
  --exclude-glob '.deploy.env'
  --exclude-glob '.gitignore'
  --exclude-glob '.htaccess'
  --exclude-glob 'index.html'
  --exclude '^js/plane_war_js_'
  --exclude '^js/pw_test_'
  --exclude '^js/'            # js 由下方「文件名版本化」步骤单独上传，避免留下未版本化副本
  --exclude '^tools/'         # 皮肤生成脚本与 raw 缓存不上传
  # ↓ 2026-11-06 补：以下都是仓库/部署脚手架，曾经被 mirror 传进 wwwroot/ 变成可公开下载
  #   （/wwwroot/deploy.sh、/wwwroot/DEPLOY.md 当时实测 200，DEPLOY.md 里还写着 FTP 账号）。
  #   mirror 没有 --delete，加排除只能阻止「再传」，远端已有的残留要手工删一次。
  #   ⚠ 这里刻意只用 --exclude-glob、不写 ()/|：deploy.sh 是把 ${EXCLUDES[*]} 拼进
  #   lftp 的命令行字符串的，lftp 解析时会把 '|' 当命令分隔符，带 | 的正则会被截断成
  #   一条废规则并打断整个 mirror（实测报 "Unmatched ( or \("）。
  --exclude '^\.githooks/'    # core.hooksPath 指向它，post-commit 只在本地 git 里跑，服务器不需要
  --exclude '^\.github/'      # CI 配置：本轮新增目录，不进静态根
  --exclude '^docs/'          # 性能基线/设计文档：本轮新增目录，不进静态根
  --exclude '^\.clawbench/'   # 远端清理的本地备份：含旧 DEPLOY.md 明文 FTP 账号，绝不可发布
  --exclude-glob '.clawbench'
  --exclude-glob 'deploy.sh'
  --exclude-glob 'DEPLOY.md'
  --exclude-glob 'README.md'
  --exclude-glob 'AGENTS.md'
  --exclude-glob 'package.json'
  --exclude-glob 'package-lock.json'
  --exclude-glob 'test*.mjs'
  --exclude-glob 'test*.cjs'
  --exclude-glob '.gitignore'
  --exclude-glob 'cover-test.png'
)

upload() {
  local flag="$1"
  echo ">> 上传 [${flag}] → ftp://${FTP_HOST}/${FTP_REMOTE_DIR}/"
  # 版本化 js：递归复制整个 js/ 树为「文件名.v版本.js」，保留目录结构，
  # 并重写 import/export 的相对路径，确保 ui/ 等子目录模块也能正常加载。
  # 必须用「文件名」而非 ?v= 查询串来破除缓存——Byethost 按路径缓存且会忽略查询串，
  # 导致 enemy.js?v=X 仍返回多年前缓存的旧文件（不含后续新增的导出），引发
  # “does not provide an export” 类错误。改文件名即换新路径，必定缓存未命中。
  TMP_JS="$(mktemp -d /tmp/plane_war_js_XXXX)"
  if ! node --input-type=module - js "$TMP_JS" "$NEW_VER" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [sourceDir, outputDir, version] = process.argv.slice(2);
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
  throw new Error(`Invalid version: ${version}`);
}

function listModules(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!prefix && /^(?:plane_war_js_|pw_test_)/.test(entry.name)) return [];
        return listModules(path.join(dir, entry.name), relative);
      }
      return entry.isFile() && entry.name.endsWith(".js") ? [relative] : [];
    });
}

const sourceFiles = listModules(sourceDir);
const sourceSet = new Set(sourceFiles);
const specifierPattern = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\.{1,2}\/[^"']+\.js)\2/g;
function moduleEdges(file) {
  const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
  return [...source.matchAll(specifierPattern)].map(match => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[3]));
    if (target.startsWith("../") || target === "..") {
      throw new Error(`${file} imports outside js/: ${match[3]}`);
    }
    if (!sourceSet.has(target)) {
      throw new Error(`${file} imports missing module ${match[3]} (${target})`);
    }
    return { specifier: match[3], target };
  });
}

const reachable = new Set();
const pending = ["game.js"];
while (pending.length) {
  const file = pending.pop();
  if (reachable.has(file)) continue;
  if (!sourceSet.has(file)) throw new Error(`Missing entry or dependency: ${file}`);
  reachable.add(file);
  for (const edge of moduleEdges(file)) pending.push(edge.target);
}
const unreachable = sourceFiles.filter(file => !reachable.has(file));
if (unreachable.length) {
  throw new Error(`Unreachable JS modules: ${unreachable.join(", ")}`);
}

const versionedPath = relative => relative.replace(/\.js$/, `.v${version}.js`);
const artifactSet = new Set(sourceFiles.map(versionedPath));
fs.mkdirSync(outputDir, { recursive: true });
for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(sourceDir, file), "utf8");
  const rewritten = source.replace(specifierPattern, (full, prefix, quote, specifier) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    if (!reachable.has(target)) throw new Error(`${file} references unreachable module ${target}`);
    const versionedSpecifier = specifier.replace(/\.js$/, `.v${version}.js`);
    const versionedTarget = path.posix.normalize(path.posix.join(path.posix.dirname(versionedPath(file)), versionedSpecifier));
    if (!artifactSet.has(versionedTarget)) {
      throw new Error(`${file} import has no versioned artifact: ${specifier}`);
    }
    return `${prefix}${quote}${versionedSpecifier}${quote}`;
  });
  const destination = path.join(outputDir, versionedPath(file));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, rewritten);
}

const artifacts = listModules(outputDir);
if (artifacts.length !== reachable.size
    || artifacts.some(file => !artifactSet.has(file))
    || [...artifactSet].some(file => !artifacts.includes(file))) {
  throw new Error(`Versioned artifact count ${artifacts.length} does not match reachable module count ${reachable.size}`);
}
for (const file of artifacts) {
  const source = fs.readFileSync(path.join(outputDir, file), "utf8");
  for (const match of source.matchAll(specifierPattern)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[3]));
    if (!artifactSet.has(target)) throw new Error(`${file} references missing versioned artifact ${match[3]}`);
  }
}
console.log(`>> 版本化 JS 完整性校验通过：${artifacts.length} 个产物，${reachable.size} 个可达模块（入口 game.js）`);
NODE
  then
    rm -rf "$TMP_JS"
    return 1
  fi

# 在本地模块图校验通过前不执行任何远端写操作。
# --parallel 必须为 1：并行传输时 lftp 可能先于父目录确认完成就去 mkdir 子目录。
lftp_run "mirror -R $flag --parallel=1 ${EXCLUDES[*]} ./ $FTP_REMOTE_DIR/; quit"

  echo ">> 上传版本化 js（v${NEW_VER}）→ $FTP_REMOTE_DIR/js/"
  while IFS= read -r -d '' f; do
    rel="${f#"$TMP_JS"/}"
    remote_path="$FTP_REMOTE_DIR/js/$rel"
    remote_dir="${remote_path%/*}"
    lftp_run "mkdir -p \"$remote_dir\"; put \"$f\" -o \"$remote_path\"; quit"
  done < <(find "$TMP_JS" -type f -name '*.js' -print0)
  rm -rf "$TMP_JS"

  # index.html 单独上传：替换 js/game.js 的版本号（缓存破除），版本号变更后 URL 随之变化
  TMP_HTML="$(mktemp /tmp/plane_war_index_XXXX.html)"
  sed "s/__VERSION__/${NEW_VER}/g" index.html > "$TMP_HTML"
  echo ">> 上传 index.html（版本 ${NEW_VER}）"
  lftp_run "put $TMP_HTML -o $FTP_REMOTE_DIR/index.html; quit"
  rm -f "$TMP_HTML"

  # .htaccess 放在远端 htdocs/ 根（web 根目录，游戏在 wwwroot/ 子目录）：
  # 将静态资源请求路由到 wwwroot，避免被 public/index.php（微信 API）全部接管
  HTDOCS_DIR="${FTP_REMOTE_DIR%/wwwroot}"
  [ "$HTDOCS_DIR" = "$FTP_REMOTE_DIR" ] && HTDOCS_DIR="$FTP_REMOTE_DIR/.."
  echo ">> 上传 .htaccess → $HTDOCS_DIR/.htaccess"
  lftp_run "put .htaccess -o $HTDOCS_DIR/.htaccess; quit"

  # 清理历史版本模块：版本化文件递归保留目录结构，--prune 时也递归删除旧副本。
  if [ "$PRUNE" = "1" ]; then
    echo ">> 清理旧版本 js 副本（保留 v${NEW_VER}）"
    remote_list="$(lftp_run "find $FTP_REMOTE_DIR/js/; quit" || true)"
    while IFS= read -r old; do
      old="${old#/}"
      old="${old#"$FTP_REMOTE_DIR/js/"}"
      if [[ "$old" =~ (^|/)[A-Za-z0-9_]+\.v[0-9]+\.[0-9]+\.[0-9]+\.js$ ]] \
          && [[ "$old" != *".v${NEW_VER}.js" ]]; then
        echo "   rm js/$old"
        lftp_run "rm \"$FTP_REMOTE_DIR/js/$old\"; quit"
      fi
    done <<< "$remote_list"
  fi
  echo ">> 上传完成"
}

verify() {
  echo ">> 校验远程文件清单…"
  lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" -e \
    "$LF_SET ls -la $FTP_REMOTE_DIR/; echo ---; ls $FTP_REMOTE_DIR/js/; quit"
}

case "$MODE" in
  incremental) upload "--only-newer" ;;
  full)        upload "--scan-all-first" ;;
  verify)      verify ;;
  both)        upload "--scan-all-first"; verify ;;
esac