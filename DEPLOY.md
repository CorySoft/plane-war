# plane_war 部署文档

本项目为纯前端 HTML5 + ES Modules 游戏，无需构建步骤，修改后直接上传到 Byethost 空间即可生效。

## 空间信息

| 配置项 | 值 |
|--------|-----|
| FTP 地址 | `ftp.byethost8.com` |
| FTP 账号 | 见 `.deploy.env` 的 `FTP_USER`（本地文件，已 gitignore；不在文档里写死） |
| FTP 密码 | 见 `.deploy.env` 的 `FTP_PASS`（本地文件，已 gitignore） |
| 远程目录 | `htdocs/wwwroot` （即 `ftp://ftp.byethost8.com/htdocs/wwwroot/`） |
| 网站地址 | `http://corysoft.byethost8.com/` |
| 空间后台 | `http://cpanel.byethost8.com/` |
| MySQL | `sql212.byethost8.com` |

> ⚠️ 安全提示：FTP / MySQL 密码已写入本地 `.deploy.env`，**永不提交到 git**。若凭据在聊天或日志中泄露过，请立即到 cPanel 修改密码。

### 服务器目录结构与加载原理（重要）

`htdocs/` 这个 web 根**同时承载两个项目**，根 `.htaccess` 是它们唯一的路由契约：

```
htdocs/                  ← web 根
├── .htaccess            ← ⭐ 两个项目共用的路由契约（deploy.sh 每次提交自动上传本仓库 .htaccess）
├── public/
│   └── index.php        ← wechat-publisher（PHP 应用）入口：/publish、/draft/*、/material/* 等
├── src/ config.php …    ← wechat-publisher 应用代码
└── wwwroot/             ← ⭐ 游戏部署目录（deploy.sh 上传到这）
    ├── index.html
    └── js/*.js
```

访问流程（全部由根 `.htaccess` 决定，不经 PHP）：

- 浏览器访问 `/` → 规则 1 直接输出 `wwwroot/index.html`
- 游戏请求 `/js/game.js?v=x.y.z` → 规则 2 命中 `wwwroot/js/game.js` 直出
- `POST /publish`、`/draft/list`、`/material/*` → 规则 5 转发给 `public/index.php`（微信 API）
- `/public/index.php/publish` 这类带 pathinfo 的直连 → 规则 4 原样放行，由应用自己解析

> `public/index.php` 里另有一段 `GET /` 时 `readfile(../wwwroot/index.html)` 的兜底，
> 仅在 `.htaccess` 规则 1 未生效时才会走到，正常部署下不经过它。

**⚠️ 两个方向的破坏都会立刻发生线上事故：**

| 情形 | 后果 |
|---|---|
| `.htaccess` 退回"只有游戏路由"（无规则 5 兜底） | `/publish`、`/draft/*` 全部变 Apache 404 → **daily-ai-article 两条 GitHub 流水线每天失败**（2026-10-17 起连败 30 次即此因） |
| `.htaccess` 退回"只有 `RewriteRule ^ public/index.php`" | 静态资源全被塞给 PHP → `/js/*.js` 404 → 游戏进度条走完后提示"⚠ 加载失败" |

因此：**本仓库 `.htaccess` 是线上权威版本**（`deploy.sh:146` 每次提交都会上传它），
`wechat-publisher/.htaccess` 是同一份内容的副本，改任意一份必须同步另一份并用
`cmp plane_war/.htaccess wechat-publisher/.htaccess` 校验。文件头部注释已写明共存约定，
请勿删除规则 5，也请勿把它改回纯游戏路由。

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

以 `deploy.sh` 的 `EXCLUDES` 数组为准，当前是：

- 目录：`.git/`、`node_modules/`、`test/`、`test-results/`、`tools/`、`js/`（js 走下面
  「文件名版本化」单独上传，避免留下未版本化副本）、`.githooks/`
- 文件：`VERSION`、`.deploy.env`、`.gitignore`、`index.html`（单独生成后上传）、
  `deploy.sh`、`DEPLOY.md`、`README.md`、`AGENTS.md`、`package.json`、`package-lock.json`、
  `test*.mjs`、`test*.cjs`
- `.htaccess`（不随 mirror 进入 `wwwroot/`，由 deploy.sh **单独上传**到 `htdocs/.htaccess`；
  该文件是本站**双项目共用的路由契约**，同时决定游戏静态资源与 `wechat-publisher` 应用
  谁能被访问，详见上文「服务器目录结构与加载原理」）

> ⚠️ **上面这份清单是 2026-11-06 才对齐的**。此前文档写着"test.mjs/deploy.sh 已排除"，
> 实际 `EXCLUDES` 里根本没有——`wwwroot/` 是 web 根，于是这些脚手架被当成游戏资源传上去，
> 任何人都能直接下载（当时实测）：
>
> | 线上地址 | 结果 |
> |---|---|
> | `/wwwroot/deploy.sh` | 200，7266 B（整套部署逻辑 + `.deploy.env` 约定） |
> | `/wwwroot/DEPLOY.md` | 200，6447 B（含 **FTP 账号**、空间后台、MySQL 主机名） |
> | `/wwwroot/.githooks/post-commit` | 200，1103 B（自动部署入口） |
> | `/wwwroot/package.json`、`/wwwroot/test.mjs` | 200 |
>
> 密码本身没有泄露（`.deploy.env` 一直有排除，脚本里也没有明文），但攻击面已经够写钓鱼流程了。
>
> **两个必须知道的机制细节：**
>
> 1. `mirror` **没有 `--delete`**，加排除只能阻止"再传"，**远端已有的残留不会自动消失**。
>    所以上面那几个文件仍挂在服务器上，得手工删一次（本地都有副本 / 已不存在，删了不影响游戏）。
> 2. 排除项里**不能用 `()` 或 `|`**：`deploy.sh` 是把 `${EXCLUDES[*]}` 直接拼进 lftp 的
>    命令字符串，lftp 解析时把 `|` 当命令分隔符，正则会被截断成废规则并打断整个 mirror
>    （报 `Unmatched ( or \(`）。要多文件匹配就用 `--exclude-glob 'test*.mjs'` 这种 glob 写法。

## 本地开发

```bash
python3 -m http.server 8080 --bind 0.0.0.0   # 在项目根启动
npm test                                      # 单元测试（当前 257 项 / 21 suites）
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
6. [ ] 上线后自查共存路由：`php ../wechat-publisher/tools/http-check.php`（13 项断言，全绿才收工）。
    > **不要用 `curl` 判 403**：ByetHost 的 openresty 门禁会在 Apache 之前应答，curl 不带
    > `__test` cookie 时要么被掐断（`Empty reply from server`）、要么拿到 200 的门禁 JS 页，
    > 状态码跟 `.htaccess` 写得对不对毫无关系。该脚本内置了门禁解密，才能看到 Apache 的真实响应。
    > 同一层还带反扫描限流：探测太密会直接回 `429 Too Many Requests - Scanner activity detected`
    > （50 字节纯文本，非 Apache 应答）。脚本把 429 单独判为**退出码 2 = 本轮不可信**，
    > 隔几分钟重跑即可，别据此推断某条规则"状态码不稳定"。