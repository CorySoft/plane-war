#!/usr/bin/env bash
# ============================================================
# deploy.sh — plane_war 自动部署脚本（上传到 Byethost FTP）
# 用法：
#   ./deploy.sh            # 增量上传（仅变更文件）
#   ./deploy.sh --force    # 强制全量上传
#   ./deploy.sh --verify   # 仅校验远程文件，不上传
#   ./deploy.sh --both     # 强制全量 + 校验
# 依赖：lftp（apt-get install -y lftp）
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

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

MODE="incremental"
for arg in "$@"; do
  case "$arg" in
    --force)  MODE="full" ;;
    --verify) MODE="verify" ;;
    --both)   MODE="both" ;;
  esac
done

# lftp 设置（必须在同一 -e 中生效，SSL 校验关闭以适配 Byethost 证书）
LF_SET="set ssl:verify-certificate no; set ftp:ssl-force off; set ftp:ssl-allow no;"

# ---------- 版本号管理（每次部署 +1，逢十进位） ----------
VERSION_FILE="VERSION"
if [ -f "$VERSION_FILE" ]; then
  CUR_VER=$(cat "$VERSION_FILE" | tr -d '[:space:]')
else
  CUR_VER="0.0.1"
fi

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
  --exclude '^js/'            # js 由下方「文件名版本化」步骤单独上传，避免留下未版本化副本
  --exclude '^tools/'         # 皮肤生成脚本与 raw 缓存不上传
)

upload() {
  local flag="$1"
  echo ">> 上传 [${flag}] → ftp://${FTP_HOST}/${FTP_REMOTE_DIR}/"
  lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" -e \
    # --parallel 必须为 1：并行传输时 lftp 会先于父目录确认完成就去 mkdir 子目录，
    # Byethost 返回 550「No such file or directory」导致 mirror 中断（set -e 直接终止整个部署）。
    "$LF_SET mirror -R $flag --parallel=1 ${EXCLUDES[*]} ./ $FTP_REMOTE_DIR/; quit"

  # 版本化 js：把每个模块复制为「文件名.v版本.js」并重写相对 import 指向版本化文件名。
  # 必须用「文件名」而非 ?v= 查询串来破除缓存——Byethost 按路径缓存且会忽略查询串，
  # 导致 enemy.js?v=X 仍返回多年前缓存的旧文件（不含后续新增的导出），引发
  # “does not provide an export” 类错误。改文件名即换新路径，必定缓存未命中。
  TMP_JS="$(mktemp -d /tmp/plane_war_js_XXXX)"
  for src in js/*.js; do
    base="$(basename "$src" .js)"
    cp "$src" "$TMP_JS/${base}.v${NEW_VER}.js"
  done
  # 把 from "./x.js" / from './x.js' 改写为 from "./x.v版本.js"
  sed -i -E "s|(from [\"']\./[A-Za-z0-9_./-]+)\.js([\"'])|\\1.v${NEW_VER}.js\\2|g" "$TMP_JS"/*.js 2>/dev/null || true
  echo ">> 上传版本化 js（v${NEW_VER}）→ $FTP_REMOTE_DIR/js/"
  # mirror -R 对绝对路径源目录不可靠，改用 put 逐文件覆盖
  for f in "$TMP_JS"/*.js; do
    lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" -e \
      "$LF_SET put \"$f\" -o $FTP_REMOTE_DIR/js/$(basename "$f"); quit"
  done
  rm -rf "$TMP_JS"

  # index.html 单独上传：替换 js/game.js 的版本号（缓存破除），版本号变更后 URL 随之变化
  TMP_HTML="$(mktemp /tmp/plane_war_index_XXXX.html)"
  sed "s/__VERSION__/${NEW_VER}/g" index.html > "$TMP_HTML"
  echo ">> 上传 index.html（版本 ${NEW_VER}）"
  lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" -e \
    "$LF_SET put $TMP_HTML -o $FTP_REMOTE_DIR/index.html; quit"
  rm -f "$TMP_HTML"

  # .htaccess 放在远端 htdocs/ 根（web 根目录，游戏在 wwwroot/ 子目录）：
  # 将静态资源请求路由到 wwwroot，避免被 public/index.php（微信 API）全部接管
  HTDOCS_DIR="${FTP_REMOTE_DIR%/wwwroot}"
  [ "$HTDOCS_DIR" = "$FTP_REMOTE_DIR" ] && HTDOCS_DIR="$FTP_REMOTE_DIR/.."
  echo ">> 上传 .htaccess → $HTDOCS_DIR/.htaccess"
  lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" -e \
    "$LF_SET put .htaccess -o $HTDOCS_DIR/.htaccess; quit"
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