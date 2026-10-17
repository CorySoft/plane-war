# plane_war 部署文档

本项目为纯前端 HTML5 + ES Modules 游戏，无需构建步骤，修改后直接上传到 Byethost 空间即可生效。

## 空间信息

| 配置项 | 值 |
|--------|-----|
| FTP 地址 | `ftp.byethost8.com` |
| FTP 账号 | `b8_42906515` |
| FTP 密码 | 见 `.deploy.env`（本地文件，已 gitignore） |
| 远程目录 | `htdocs/wwwroot` （即 `ftp://ftp.byethost8.com/htdocs/wwwroot/`） |
| 网站地址 | `http://corysoft.byethost8.com/` |
| 空间后台 | `http://cpanel.byethost8.com/` |
| MySQL | `sql212.byethost8.com` |

> ⚠️ 安全提示：FTP / MySQL 密码已写入本地 `.deploy.env`，**永不提交到 git**。若凭据在聊天或日志中泄露过，请立即到 cPanel 修改密码。

### 服务器目录结构与加载原理（重要）

本空间已存在一个 PHP 应用（微信 API 工具），结构如下：

```
htdocs/                  ← web 根
├── .htaccess            ← 重写规则（见下）
├── public/
│   └── index.php        ← PHP 应用入口：GET / 时 readfile(../wwwroot/index.html)
├── src/ config.php …    ← PHP 应用代码
└── wwwroot/             ← ⭐ 游戏部署目录（deploy.sh 上传到这）
    ├── index.html
    └── js/*.js
```

访问流程：浏览器访问 `/` → Apache 执行 `.htaccess` → `public/index.php` 读取并输出 `wwwroot/index.html`（游戏首页）→ 游戏 JS 请求 `/js/*.js` → 由 `.htaccess` 中的 wwwroot 静态资源规则直接提供。

**⚠️ 若 `.htaccess` 缺失或退回旧版**（只有 `RewriteRule ^ public/index.php [QSA,L]`），所有静态资源（`/js/*.js`）都会被转发给 PHP 应用 → 返回 404 → 游戏进度条走完后提示"⚠ 加载失败"。`deploy.sh` 会自动把本地 `.htaccess` 上传到 `htdocs/.htaccess`，请勿删除。

## 部署方式

### 手动部署

```bash
./deploy.sh                # 增量上传（仅上传变更文件）
./deploy.sh --force        # 强制全量上传
./deploy.sh --verify       # 只校验远程文件清单
./deploy.sh --prune        # 额外清理远程 js/ 下的历史版本副本
```

依赖 `lftp`（未安装时：`apt-get install -y lftp`）。

**关于旧版本堆积**：每次部署都会在 `js/` 里多留 20 个 `<name>.v<旧版本>.js`，
只增不删。攒多了用 `--prune` 清掉非当前版本的副本（当前版本由脚本自动排除）。

**关于 FTP 凭据**：

- 默认把密码放在 `.deploy.env`（已 gitignore），并通过 `lftp -u user,pass` 传递，
  密码会出现在进程参数里，同机其他用户 `ps` 可见
- 想避免，把凭据写进 `~/.netrc`（权限 600）即可，脚本会自动检测到并改用
  `-u user`（不传密码）：

  ```bash
  printf 'machine %s login %s password %s\n' ftp.byethost8.com b8_42906515 '你的密码' > ~/.netrc
  chmod 600 ~/.netrc
  ```

- 想启用显式 FTPS：在 `.deploy.env` 里加 `FTP_SSL=1`（默认 0，
  因为免费空间多用自签证书，强开会直接连不上）

### 自动部署约定

**每次修改代码并确认测试通过后，运行 `./deploy.sh --force`（或增量 `./deploy.sh`）将变更同步到服务器。** 上传完成以 lftp 无报错 + 远程文件大小比对为准，不依赖 HTTP 可达性（Byethost 有访问门禁，HTTP 空回复属正常，不代表文件未上传）。

### git 提交后自动部署（已启用）

仓库已启用 `.githooks/post-commit`：**每次 `git commit` 后自动执行增量部署**，无需手动跑脚本。

- 触发的提交会运行 `./deploy.sh --force`，日志写入 `/tmp/plane_war_auto_deploy.log`
- 只涉及测试/文档/部署脚本本身的提交不会触发上传
- 想临时跳过自动部署：`git commit --no-verify`
- 若钩子失效，重新启用：`git config core.hooksPath .githooks`

### 上传内容

- `index.html`、`package.json`
- `js/`（全部游戏逻辑，ES Modules）

### 排除项（不会上传）

- `.git/`、`node_modules/`、`test/`、`test-results/`、`test.mjs`、`test_http.cjs`
- `.deploy.env`、`.gitignore`
- `.htaccess`（不随 mirror 进入 `wwwroot/`，由 deploy.sh **单独上传**到 `htdocs/.htaccess`，用于静态资源路由）
- `deploy.sh`（可选保留在远端）

## 本地开发

```bash
python3 -m http.server 8080 --bind 0.0.0.0   # 在项目根启动
npm test                                      # 单元测试（当前 237+ 项）
node tools/dev/smoke.mjs                      # 真机冒烟（需 playwright）
```

**关于 `index.html` 的入口**：HTML 里写的是 `js/game.v<版本>.js`（部署时生成，
换文件名是破除 Byethost 路径缓存的关键）。本地仓库里只有 `js/game.js`，
所以页面用动态 import：**先试版本化副本，404 时自动回退到 `js/game.js`**，
直接起 http server 打开就能跑，不用先跑一次部署。

## 服务端安全（重要）

**`feedback.php` 的推送凭据不要写进仓库**。当前实现：

- `feedback.secret.php`（本地文件，**已 gitignore**）存放方糖 `SCT_TOKEN`、
  统一网关地址与 `WP_SECRET`；缺失时推送自动停用（失败关闭），接口其余部分照常工作
- 接口只接受**同源**请求（旧版 `Access-Control-Allow-Origin: *` 相当于公开的微信推送机）
- 单 IP 滑窗限流：60 秒 5 次，超出返回 429
- 日志与限流计数优先写到**文档根之外**（`htdocs/..`），不可写才退回 `wwwroot/`，
  届时由根 `.htaccess` 的 403 规则兜底

根 `.htaccess` 里挡日志的规则**必须带 `wwwroot/` 前缀**：

```apache
RewriteRule ^wwwroot/(feedback\.log|\.push_throttle)$ - [F]
```

原因：per-directory 上下文中 `RewriteRule` 匹配的是**剥掉本目录前缀后的相对路径**。
.htaccess 在 `htdocs/`、日志在 `htdocs/wwwroot/` 下，请求 `/wwwroot/feedback.log`
时匹配串是 `wwwroot/feedback.log`；只写 `^(feedback\.log)$` 匹配不上，
文件会被原样下载出去。

## 部署清单（Checklist）

1. [ ] 文案/数值改动 → `js/config.js`、`js/*.js`
2. [ ] 运行 `npm test` 全部通过
3. [ ] 运行 `node tools/dev/smoke.mjs` 确认真机无 console error / 404
4. [ ] 运行 `./deploy.sh`（增量）或 `--force`（重要改动）
5. [ ] `./deploy.sh --verify` 确认远程文件大小与本地一致
6. [ ] 首次上线后自查：`GET /wwwroot/feedback.log` 应返回 403、`GET /js/` 应返回 403