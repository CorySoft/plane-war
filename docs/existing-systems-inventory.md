# plane_war 现有系统可复用清单（代码级锚点）

> **用途**：为「各自出玩法方案」阶段提供「现状能做什么、接在哪里、会不会碰到 UI」的技术底稿。
> **基线**：`HEAD a54eeed` / `VERSION 0.5.3`（2026-11-08 读码）；`npm test` 静默树复跑 **398/398、47 suites**。
> **口径**：行号为读码时点值，随版本漂移；引用前用 `grep -n` 复核，不要把本文行号当稳定契约。
> **边界**：纯读码，未改任何产品代码；本文不含新方案，只描述既有能力与改动触发面。

---

## 0. 一页速览

| 系统 | 代码锚点 | 一句话能力边界 | 灰度是否需碰 `js/ui/**` |
|---|---|---|---|
| 模式入口（URL 灰度） | `js/level/loader.js:24`、`js/modes/bossrush.js:39`、`js/game.js:74-77` | 只有 `?campaign=` 与 `?bossrush=1` 两个参数；战役优先 | **否** |
| 战役加载/校验/runner | `js/level/loader.js:45/79/129`、`js/level/schema.js:141/176` | JSON 驱动 6 关，beat 五段式，schema 严格校验 | **否** |
| 弹幕注册表 | `js/level/patterns.js:3-12/251/333` | 8 类参数化弹道 + 2 别名，未知参数整组拒绝 | **否** |
| 数值/内容配置 | `js/config.js` | 28 技能、15 道具、10 项时长、7 段得分轴、3 敌种 + 3 Boss | **否** |
| 得分与难度 | `js/config.js:336/351`、`js/game.js:454-455` | `SCORE_AXIS` 单一真源，战役可覆盖 | **否** |
| 技能/道具运行时 | `js/skill.js:38/74`、`js/powerup.js:74` | 三选一、道具即时生效、时长读单源表 | **否**（图鉴文案在 ui） |
| meta 存档/元进程 | `js/meta.js:7/123/206/218` | localStorage 单档、脏标记 + debounce 落盘 | **否**（页面在 ui） |
| 敌弹密度闸门 | `js/bullet.js:213/228/235/275` | 同屏/每秒双上限，战役与 Boss Rush 已接入 | **否** |
| 敌机/Boss | `js/enemy.js:57/106/154/252`、`js/wave.js:83/110` | 3 敌种、3 Boss、三相位、贴图+程序化回退 | **否** |
| 渲染与 HUD | `js/game.js:1483-1641`、`js/hud.js:38` | Canvas 主绘制；HUD 独立于 `js/ui/**` | **HUD 否 / 菜单是** |
| UI 菜单与面板 | `js/ui.js` facade、`js/ui/*.js` | 菜单、图鉴、机库、商城、设置、帮助、弹窗 | **是** |
| 门禁 | `package.json`、`.github/workflows/ci.yml`、`deploy.sh:310` | 398 单测 + 真机 smoke + 版本化完整性 31/31 | — |

---

## 1. 模式入口与灰度机制

**现有两个入口（全仓 `URLSearchParams` 只有两处）：**

| 入口 | 解析 | 生效点 | 边界 |
|---|---|---|---|
| `?campaign=<id>` | `loader.js:24-26` `getCampaignId` | `game.js:74-85` 模块期加载；失败回退并 `console.error` + `window.__campaignFallbackError` | 仅开发直通；正式入口是菜单按钮（走同一 runner） |
| `?bossrush=1` / `=true` | `modes/bossrush.js:39-43` | `game.js:76-77`（与战役互斥，战役优先）→ `resetGame` `game.js:1344` → `update` `game.js:510-524` | 原型：无限车轮、无通关、无菜单入口 |

**共同灰度写法（可直接复制）：**

1. 参数只在**模块加载期解析一次**（`game.js:74/77`），不参与默认分支；
2. 状态对象默认 `null`（`game.js:156-157` `campaignRunner` / `bossRush`），`resetGame` 才创建（`game.js:1340-1345`）；
3. `update` 里用 `if (campaignRunner) … else if (bossRush) … else { 原无限模式 }`（`game.js:466/510/525`），默认路径逐位不变；
4. 调试观测口挂 `window.__game`（`game.js:2063+`），只在启用时返回细节（`getBossRush` `game.js:2076-2079`）。

**约束**：新增参数必须自己写解析（没有通用参数框架）；`?campaign` 与其它模式同时出现时以战役为准。

---

## 2. 战役系统（数据驱动）

| 能力 | 锚点 | 边界 |
|---|---|---|
| 加载 | `loader.js:45 loadCampaign` / `:79 loadCampaignSafely` | 一次拉 manifest + 全部 stage JSON（`assets/levels/`），`?v=` 版本化查询；超时 8s |
| 运行 | `loader.js:129 createCampaignRunner` | 逐 beat 推进、`update(dt, enemyCount)` 返回 `stageChanged/beatChanged/events/timedOut/complete/densityBudget`；`game.js:466-505` 消费 |
| 校验 | `schema.js:141 validateCampaignManifest` / `:176 validateStage` | 只允许白名单字段/敌种/图案；`scoreAxis` 必须与 `SCORE_AXIS` 逐点严格相等 |
| 内容 | `assets/levels/campaign-01.json` + `level-01..06.json` | 6 关，每关 `teach→test→twist→rest→boss` 五 beat |
| 节拍文案 | `loader.js:12-21 BEAT_LABELS` | role→中文（教学/实战/变招/喘息/首领战），未知 role 返回空串 |
| 进度 | `meta.js:409 getCampaignProgress` / `:422 recordCampaignStageCompletion` | 存 `meta.js` 战役进度；旧档缺字段按空进度 |

**改动成本**：加关卡=纯 JSON（但需过 schema 且五 beat 齐全）；加战役机制=改 runner（`js/level/loader.js`）+ 可能的 `game.js` 消费点；**不需要碰 `js/ui/**`**（菜单入口已存在）。

---

## 3. 弹幕注册表（patterns）

| 能力 | 锚点 |
|---|---|
| 图案清单 | `patterns.js:3-12`：`fan / ring / spiral / petal / rain / stack / laserGrid / aimed` |
| 别名 | `patterns.js:14-17`：`laser→laserGrid`、`burst→ring` |
| 参数校验 | `patterns.js:73 validatePatternParams`（字段白名单 + 数值范围） |
| 弹数预估 | `patterns.js:136 patternBulletCount` |
| 敌机弹幕 | `patterns.js:251 buildPatternSpecs`（`game.js` 消费，`patternRef` 挂在敌机对象上） |
| Boss 弹幕 | `patterns.js:333 buildBossPatternSpecs`（三相位 `pattern` 字段） |
| rank 派生 | `patterns.js:142 rankFromScore`（与 `SCORE_AXIS` 同源） |

**边界**：新增图案 = 注册表加条目 + 参数白名单 + `buildPatternSpecs` 分支；超限参数在**加载期与运行时都整组原子拒绝**（无半截弹幕）。**不需要碰 UI**；但新图案会改变弹幕密度，必须通过 `setHostileBulletBudget` 闸门。

---

## 4. 数值与内容配置（单一来源）

| 表 | 锚点 | 规模/边界 |
|---|---|---|
| `SKILLS` | `config.js:258` | 28 条；每条 `id/name/max/desc/fullDesc` 等；`skillMax(id)` `:304` |
| `POWERUP_DEFS` | `config.js:184` | **15** 条（不是 16）；`randomSkill` 不在掉落权重表，仅 Boss 掉落分支 |
| `POWERUP_DURATION` | `config.js:204` | **10** 项计时（含 `power:15`、`freeze:8`）；powerup/hud/codex/game 四处共读 |
| `POWERUP_DROP` | `config.js:218` | 掉落率闸门（`base 0.18` 等），平衡红线 |
| `ENEMY_TYPES` / `ENEMY_LEVEL` | `config.js:174 / :110` | 6 敌种；敌方等级硬上限 **99**、软上限 30（超软上限成长减半）；`SCORE_AXIS` 在 180000 分时 E=18 |
| `DIFFICULTY` | `config.js:318` | 难度预设、Boss/精英/虫群间隔 |
| `SCORE_AXIS` | `config.js:336` | 7 段 `{at, playerLevel, enemyLevel}`；**唯一派生** `levelFromScore` `:351` |
| `COMBO` / `XP_BASE` / `PLAYER` / `META` / `LIFESTEAL` / `BULLET` | `config.js:412/416/419/425/292/56` | 连击、经验、玩家上限、元经济、吸血、子弹与敌弹硬上限 |

**单源纪律（已固化）**：得分轴的派生只有 `levelFromScore`（`config.js:351`）与 `rankFromScore`（`patterns.js:142`），调用点集中在 `game.js:454-456`；时长只读 `POWERUP_DURATION`；不得在 UI/绘制层复制等级或时长规则。

---

## 5. 技能 / 道具 / 战斗运行时

| 能力 | 锚点 | 边界 |
|---|---|---|
| 生成三选一 | `skill.js:38 generateSkillChoices` | 未拥有优先、缺口补足；满级过滤；返回 3 项 |
| 应用技能 | `skill.js:74 applySkill` | 前置 `requires` 校验；满级拦截；返回是否成功 |
| 道具生效 | `powerup.js:74 applyPowerup` | 即时改 `player`；`power/freeze/xppack` 走标记位由 `game.js` 消费（`game.js:424-443`） |
| 玩家实体 | `player.js:10 createPlayer` / `:100 updatePlayer` | 机型、技能、护盾、buff、无敌帧、吸血（`:166 tryLifesteal`） |
| 射击形态 | `player.js:282 getShootPattern` / `:262 volleyOffsets` | 主弹/副武器配额、暴击、穿透等行为合成 |
| 护体弹 | `player.js:245 getOrbitBullets` / `:186 orbitDamage` | 护盾技能驱动；`game.js` 命中处理 |
| 子弹行为 | `js/bullet.js` | 穿透/爆炸/分裂/追踪等 `Set` 可叠加；敌方弹与玩家弹同池不同 `friendly` |
| 升级流程 | `game.js:1154 doLevelUp` → `STATE.LEVELUP`（`:1166`）→ `skill.js` | 三选一暂停世界；`applySkill` 后回 `PLAYING`（`:1177`） |

**边界**：加技能 = `SKILLS` 加条目 + `applySkill` 分支（+可能 `player.js` 效果）；**升级弹窗会自动多一项**（读 `SKILLS`），不需要改 `js/ui/**`；但**技能图鉴文案**在 `js/ui/codex.js:219/239`（`powerupDesc` / `powerupDescFull`），加道具要改这里。

---

## 6. meta 存档与元进程

| 能力 | 锚点 | 边界 |
|---|---|---|
| 存储键/结构 | `meta.js:7 STORAGE_KEY="planeWarMeta"`、`:15` 默认字段 | 单档 localStorage，`.bak` 备份（`:180`） |
| 读取/设置 | `:123 getSettings`、`:141 setSetting`、`:149 toggleSetting` | 设置项（静音/难度/跳过教程/helpSeen） |
| 落盘 | `:206 saveMeta`（只打脏标记）、`:218 flushMeta`（debounce/隐藏页）、`:233 saveNow`（强制） | **改了内存不落盘是既有缺陷类别**：关键节点必须显式 flush |
| 星尘/最高分 | `:250 earnStardust`、`:266 bonusStardust`、`:274 spendStardust`、`:282 getStardust`、`:283 getBest` | 软货币，结算/商店消费 |
| 解锁/装备 | `:313 unlockAircraft`、`:328 setSelectedAircraft`、`:349 purchaseTalent` | 购机/天赋需落盘 |
| 统计/成就 | `:378 addKill`、`:384 addBossKill`、`:502 checkAchievements` | 成就检查在 `game.js` 结算/复活等节点调用 |
| 任务 | `:450 ensureQuests`、`:473 getQuestView`、`:487 claimQuest` | 每日任务本地生成与领取 |
| 商店 | `:538 purchaseShopItem` | 星尘购买 |
| 战役进度 | `:409 / :422` | 记录完成/解锁 stage |

**边界**：新增元数据字段必须给默认值（旧档兼容）；页面在 `js/ui/**`（机库/天赋/商城/成就/任务/设置），**但存档逻辑与入口函数在 meta.js**——只要不新增页面就不需要碰 UI。

---

## 7. 敌弹密度闸门（红线）

| 项 | 锚点 | 说明 |
|---|---|---|
| 全局硬上限 | `config.js:68-69` `hostileScreenCap=140` / `hostileSpawnRateCap=140` | 任何预算不得超过 |
| 设置预算 | `bullet.js:213 setHostileBulletBudget({maxHostileActive, maxHostileBulletsPerSec})` | 传 `null` 恢复全局上限；非法值抛 `RangeError` |
| 执行点 | `bullet.js:275`（同屏 + 每秒令牌桶） | 超限整组拒绝并计 `deniedVolleys` |
| 观测 | `bullet.js:228 countHostileBullets`、`:235 getHostileBulletBudgetStats` | 返回 `active/maxActive/maxPerSecond/tokens/deniedVolleys` |
| 接入点 | `game.js:476`（战役逐 beat）、`:1347`（模式初始化） | Boss Rush 用 `BOSS_RUSH_BUDGET`（120/90，`modes/bossrush.js:30`） |

**红线**：任何新模式的密集弹幕必须先过此闸门，不得新开乘算口子绕过。

---

## 8. 渲染、HUD 与 UI 分层

**绘制主链路**：`game.js:1483 draw` → 背景/世界/敌机/子弹/特效 → `drawHUD`（`:1572`）→ 状态面板（`:1633-1641`）。

| 层 | 文件 | 职责 | 是否属 `js/ui/**` |
|---|---|---|---|
| HUD | `js/hud.js:38 drawHUD`（分区：得分 `:46`、难度/等级/经验 `:60`、连击 `:78`、生命 `:109`、buff 条 `:149`） | 对局内信息条 | **否**（独立文件） |
| 世界特效 | `js/particles.js`、`js/camera.js`、`js/ui/effects.js`（星尘/伤害数字） | 粒子/震屏/数字 | 部分 |
| UI facade | `js/ui.js:1-34` | 稳定对外导入面（`game.js` 只从 facade 取） | 是（桥） |
| 菜单与子页 | `js/ui/menus.js:65 drawMenu`、`:89-95` 子页分派（codex/achieve/hangar/talent/settings/powerupCodex/shop） | 主菜单、导航、布局与控件矩形 | **是** |
| 弹窗/覆盖层 | `js/ui/overlays.js`：`drawLevelUp:96`、`drawRevive:345`、`drawPause:210`、`drawGameOver:19`、`drawHelp:414`、`isHelpOpen:405` | 升级/复活/暂停/结算/帮助/Toast | **是** |
| 图鉴 | `js/ui/codex.js`：`drawSkillCodex:61`、`drawPowerupCodex:141`、`powerupDesc:219`、`powerupDescFull:239` | 技能/道具图鉴与文案 | **是** |
| 详情/确认框 | `js/ui/dialogs.js`（详情卡、清缓存、机库/天赋购买确认） | 模态确认 | **是** |
| 通用控件 | `js/ui/common.js:27 getTouchTargetRect`、`:38 hitTestButton`、`:43 drawBackButton` | 热区扩展（≥44px）与返回 | **是** |

**已知行为**：首次进入主菜单会**自动弹一次帮助面板**（`menus.js:97-101`），且它是模态、会吞掉第一次点击（`game.js:1772-1776`）——新玩家流程与截图探针都要考虑。

---

## 9. 状态机

`config.js:41 STATE = { MENU:0, PLAYING:1, OVER:2, LEVELUP:3, PAUSED:4, TUTORIAL:5, REVIVE:6, GACHA:7 }`

| 状态 | 进入点 | 退出点 | 边界 |
|---|---|---|---|
| `MENU` | 初始（`game.js:96`）、结算返回 | 开始按钮 / 战役按钮 | 菜单绘制 `game.js:1633` |
| `PLAYING` | `resetGame`（`:1366`）、`startPlaying`（`:1423-1424`）、关卡选择后 | 死亡/升级/暂停 | 世界更新与输入主态 |
| `TUTORIAL` | 首局（`:1371`） | 点击/按键 → `startPlaying`（`:1695`、`:1762`） | 只画教程，不跑世界 |
| `LEVELUP` | `doLevelUp`（`:1166`） | `applySkill` 后回 `PLAYING`（`:1177`） | 三选一暂停 |
| `PAUSED` | 按键 P / 失焦（`:218`、`:1676`） | 再按 P 恢复（`:1677`） | 暂停面板 |
| `REVIVE` | 死亡且星尘够（`:285`） | 复活消费（`:1234-1246`）/ 结算 | 每局限 1 次 |
| `GACHA` | 抽奖动画（`:281`、`:297`） | 动画结束 | 暂停世界，仅更新动画 |
| `OVER` | `gameOver`（`:1221`） | 重新开始/返回菜单 | 结算面板 |

**边界**：新玩法**优先复用 `PLAYING`**（Boss Rush 就是如此），改状态机会牵动 `loop`、`draw` 分派、输入与大量测试；若必须新增状态，必然要改 `js/ui/overlays.js`（新面板）与 `js/game.js`。

---

## 10. 测试与部署门禁

| 项 | 锚点 | 现状 |
|---|---|---|
| 单元测试 | `package.json` `npm test` = `node --test --test-concurrency=1 test/*.test.mjs` | **398/398、47 suites**；42 个 `test/*.test.mjs` |
| 导入图守护 | `test/modules.test.mjs` | 所有相对导入存在、具名导出一致、源码不得带版本查询串 |
| 版本化产物守护 | `test/deploy-versioning.test.mjs:98/102` | **硬编码 31 个产物 / 31 个可达模块**——新增 `js/**` 模块必须同步 |
| 性能护栏 | `test/perf-gate.test.mjs` + `tools/perf/bench.mjs` | madHunt 六项等价、分配削减 95.9% |
| 真机 smoke | `npm run test:smoke`（`tools/dev/smoke.mjs`） | 四路径开关：`CAMPAIGN`、`MENU_CAMPAIGN`、`COMPLETE_FIRST_STAGE`、`EXPECT_CAMPAIGN_FALLBACK`（`:25-31`）；默认断言 `state===1` |
| 部署 | `deploy.sh:105`（测试门禁）、`:152-176`（版本递增 + 写入 `VERSION`/`version.js`）、`:178-215`（EXCLUDES）、`:310`（完整性校验） | 版本化上传，`js/**` 全量递归；`docs/`、`test/`、`tools/` 不上传 |
| CI | `.github/workflows/ci.yml` | 两个 job：unit（`npm test`）+ smoke（Playwright） |

**改动成本提醒**：新增 `js/modes/xxx.js` 会自动进入版本化清单并让完整性从 31 变 32——`deploy-versioning` 断言必须同步，否则测试红。

---

## 11. 灰度上线能力矩阵（方案阶段直接对照）

| 需求形态 | 是否需碰 `js/ui/**` | 现成接法 / 先例 |
|---|---|---|
| 新模式（无菜单入口，URL 参数进入） | **否** | Boss Rush：`modes/bossrush.js` + `game.js:76/510/1344` + `__game` 观测口 |
| 新关卡 / 新战役内容 | **否** | 纯 JSON（`assets/levels/`）+ schema |
| 新弹幕图案 / 参数 | **否** | `patterns.js` 注册表 |
| 技能/道具数值与效果 | **否** | `config.js` 表 + `skill.js`/`powerup.js`/`player.js` |
| 得分曲线 / 难度节奏 | **否** | `SCORE_AXIS`（唯一派生 `levelFromScore`） |
| HUD 新增指示（轮次、危险度、计时） | **否**（`js/hud.js` 独立） | `drawHUD` 传入字段需从 `game.js:1572` 补 |
| 节拍/事件提示 | **否** | `game.js` 设 `toast`，由 `ui/overlays` 绘制 |
| 主菜单新增模式入口/按钮 | **是** | `js/ui/menus.js`（布局自适应 + 44px 热区） |
| 新面板（如 Boss 奖励二选一、通关结算页） | **是** | `js/ui/overlays.js` + `game.js` 状态分派 |
| 图鉴/机库/商城/成就/任务/设置页改动 | **是** | `js/ui/codex.js` / `menus.js` / `dialogs.js` |
| 帮助面板文案 | **是** | `js/ui/overlays.js:414` |
| 难度选择 UI | **是**（存档在 meta） | `menus.js` + `meta.js:132 setDifficulty` |

---

## 12. 可直接复用 vs 需要新层（给方案阶段）

**直接复用（零或少改核心）：**
1. Boss 三型 + 三相位 + `spawnBoss`（`wave.js:83/110`）；
2. 战役 runner 的「事件流 + 密度预算 + 节拍播报」（`loader.js:129`）；
3. 三选一生成/应用（`skill.js:38/74`）；
4. 星尘经济 + 存档 + 成就/任务/商店钩子（`meta.js`）；
5. 敌弹令牌桶闸门（`bullet.js:213`）；
6. URL 灰度范式（`game.js:74-77/466-525`）；
7. HUD 扩展位（`hud.js` 分区绘制）。

**需要新写一层（中等成本）：**
1. 新模式的**轮次/目标/结算条件**（Boss Rush 只有车轮，没有「N 轮通关」）；
2. 全局随机源收敛（`Math.random` 全仓 28 处；每日挑战/确定性回放的前提）；
3. 新面板与新状态（必然进 `js/ui/**` 与 `STATE`）；
4. 周期排行榜/离线收益等**长线运营**（可本地模拟，但需新存档字段与时钟校验）。

---

## 13. 已知坑（方案落地前必须规避）

1. **首局帮助面板自动弹出并拦截首次点击**（`menus.js:97-101`、`game.js:1772-1776`）：自动化探针/新手引导设计都要先处理。
2. **Boss 贴图懒加载**（`assets.js:100/141`，2s 后预载）：涉及 Boss 的截图/探针必须先 `preloadBossSkin()` 并等 `getSprite("boss_*")`，否则走程序化回退。
3. **贴图未就绪会静默回退**（`assets.js:153-160`）：视觉差异先用就绪探针排除假阴性。
4. **meta 落盘是脏标记 + debounce**（`meta.js:206/218/233`）：新养成数据改内存后必须显式 `saveNow/flushMeta`。
5. **版本化完整性硬编码 31**（`test/deploy-versioning.test.mjs:98/102`）：新增模块必须同步，否则门禁红。
6. **`docs/`、`test/`、`tools/` 不上传**（`deploy.sh:178-215`）：方案文档不会进生产静态目录。
7. **`?campaign` 优先于 `?bossrush`**（`game.js:77`）：多参数组合需显式定义优先级。
8. **`SCORE_AXIS` 涨分即涨难度**（`config.js:336`）：任何「高分奖励」若直接计入得分会反过来加压，危险度/擦弹分应独立记账（此前提案已记录）。
9. **`STATE` 与 UI 分派强耦合**（`game.js:1633-1641` 等）：新增状态=必须改 UI 面板与输入分支。
10. **`.htaccess`/index.html 单独上传**（`deploy.sh:178-215` 排除 + 单独 put）：缓存与入口变更走部署脚本，不要手改远端。

---

## 14. 未核实/待确认

- 本文行号只对 `a54eeed` 成立；后续任何提交都可能漂移。
- 未逐条核对 UI 内部绘制坐标与热区数据（属 `docs/review-ui-ux.md` 范畴）。
- `tools/perf/bench.mjs` 的六项等价口径未在本文复算（见 `docs/perf-baseline.md` 与 CI 结果）。
- 本清单不评价各方案的玩法价值，只回答「接到哪里、会不会碰 UI、门禁怎么过」。