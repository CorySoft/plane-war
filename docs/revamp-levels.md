# 关卡与玩法改版提案

- 日期：2026-11-07
- 范围：关卡数据化、弹幕图案注册表、节拍内容与迁移路径
- 状态：**P-A 已随 v0.3.9 受控上线（灰度，默认关闭）**；**P-B 已通过等价性复核，随本轮受控上线（v0.3.10）**；P-C/P-D 待排期
- P-A 交付：`?campaign=campaign-01` 灰度入口（不带参数时执行路径与 v0.3.8 逐位一致）、`assets/levels/` 三关、`js/level/` 零依赖校验与安全回退、敌弹独立密度闸门（active/rate 双上限 + 原子 volley 准入）；测试 317→326，deploy 版本化完整性 27→29。
- 灰度说明：仅 URL 参数可进入战役，默认无限模式零变化；静态 JSON 走 `mirror` 普通上传，loader 以 `?v=APP_VERSION` 查询串破缓存（`.htaccess` 对 `.json` 设了 no-cache 头，且版本号每次部署递增）。若后续要在同一版本内 edit-in-place 改 JSON 内容，需评估文件名版本化（Byethost 忽略查询串的历史结论见 `deploy.sh` 注释）。
- P-B 交付：八类图案注册表、旧 Boss pattern 兼容映射、`patternRef + params` 校验与密度预算检查；P-A 的密度闸门与 fallback 保留不回滚。
- 依据：`docs/design-levels-editor.md`、`docs/design-current-state.md`、`docs/design-research.md`

## 决策摘要

1. 以 `chapters → stages → beats → waves → spawns` 表达结构关卡；数据放 `assets/levels/`，运行时由 `js/level/` 驱动。
2. 先新增章节模式，旧无限模式继续使用 `wave.js` 的现有路径；只有显式选择章节模式才进入新 runner。
3. 把 `difficulty.scoreAxis` 定为数值方案与关卡方案的唯一等级接口：按分数阈值同时求 `playerLevel`、`enemyLevel`，禁止两处各写一条增长公式。
4. 敌弹当前没有友弹 `BULLET.screenCap` 对等的上限。P-A 必须先加全局敌弹硬上限及关卡密度预算；后续每期内容和弹幕扩展都受此门禁约束。
5. 先做 JSON + Schema + 静态校验；图案注册表随后复用 `BOSS_TYPES[].phases[].pattern` / `bossFire` 的缝。首批内容通过数据验证后再扩展完整章节。
6. 随机源统一和确定性回放列在 P-C 之后；`seed` 字段在此之前只作预留元数据，不承诺随机事件可复现。

## 对齐接口

以下是本提案与数值提案合并时的接口约定；具体分数阈值、等级上限和乘数由数值提案负责，不在这里另造一套。

| 接口 | 约定 | 校验 / 所有者 |
|---|---|---|
| `difficulty.scoreAxis` | 有序数组，每行为 `{ at, playerLevel, enemyLevel }`；`at` 是累计 `runScore` 门槛，边界间按线性插值并向下取整，首末端钳制。关卡切换不重置 `runScore`。 | 数值提案定具体行；共用 `levelFromScore(axis, score)`；Schema/测试检查首行、排序、非负值、两条等级均单调不减及等级差上限。 |
| 双等级真源 | 同一行同时给出玩家与敌方等级；`game.js` 不再保留独立的 `score / 4500`、`score / 6000` 计算。 | 数值层提供唯一 `levelFromScore(axis, score)`；关卡 runner 调用，不复制公式。 |
| 图案 `$rank` | 由 `levelFromScore` 得到的当前 `enemyLevel` 在本 stage 的 `scoreAxis` 首末敌方等级间归一化到 `[0,1]`；首末等级相同时取 `0`。DDA 若启用，只能按 beat 对该 rank 作有界偏移，不能改写 scoreAxis。 | 图案注册表只消费这个 rank；不再为弹速、密度另设第二条隐式等级曲线。 |
| `difficulty.axes` | `bulletSpeed`、`density`、`grace` 是相对基准的正乘数；`grace` 放大预告/躲避准备时间。`density` 还须受 `densityBudget` 和全局敌弹硬上限约束。 | 默认为 `1`；Schema 检查正值，运行时 clamp 仅作最后保险，不替代设计校验。 |
| 难度责任边界 | 数值提案负责 scoreAxis 数值与敌机成长/射速缺陷；本提案负责 stage/beat 消费接口、弹幕注册与 density gate。 | 三项已知数值缺陷继续按用户决策并入数值改版，不在关卡分期中抢先改数值。 |

### `rank` 计算语义

```text
{ playerLevel, enemyLevel } = levelFromScore(scoreAxis, runScore)
lo = scoreAxis[0].enemyLevel
hi = scoreAxis[last].enemyLevel
rank = hi == lo ? 0 : clamp((enemyLevel - lo) / (hi - lo), 0, 1)
```

这是 stage 内的归一化难度坐标，不代表特定玩家能力，也不是 DDA 结果。它消费 `levelFromScore` 的最终等级，不再自己实现分段/插值。数值提案当前建议玩家等级封顶 14、敌方等级封顶 18、差值不超过 4；合并时以最终数值提案为准，并在同一 helper 测试中锁定边界。图案只用 rank 对已批准的参数做插值，例如 `speed = baseSpeed × (1 + rank × speedGain) × axes.bulletSpeed`；弹数、弹速仍须服从 Schema 上限和密度门禁。

## 分期实施

### P-A：数据地基与首批三关

**工作量：L。** 这是唯一涉及新 runner、主循环接线和安全密度闸门的一期。首批三个 stage 用于验证 schema 与节奏，不视作完整章节平衡稿。

| 文件 / 区域 | P-A 实施状态 |
|---|---|
| `assets/levels/campaign-01.json`、`level-01.json` 至 `level-03.json` | 已实现首批 manifest 与三关 teach/test/twist/rest/boss 节拍；仅引用现有敌种、Boss 与 `aimed`/`laser` pattern。 |
| `js/level/schema.js`、`js/level/loader.js` | 已实现无运行时依赖的结构校验、引用与预算检查、`APP_VERSION` 查询缓存、8 秒请求超时及 time/allCleared/hybrid runner。校验/加载失败会明确记录并回退到无限模式。 |
| `js/game.js`、`js/enemy.js` | 已实现 `?campaign=campaign-01` 显式入口；无参数时走原 `updateWaves` 路径。关卡可指定敌种、坐标与受限 pattern；全战役结束复用结算界面并显示完成标题。 |
| `js/config.js`、`js/bullet.js` | 已实现独立敌弹 active/rate cap、计数、token bucket 与原子 volley admission；Boss spread/burst 和激光 volley 不会被密度门禁截成半组。 |
| `test/level-loader.test.mjs`、`test/bullet.test.mjs`、`test/enemy.test.mjs` | 已覆盖样例加载、版本 URL、无参数/非法输入、scoreAxis/敌种/预算校验、telegraph 与 runner 推进，以及敌弹预算边界和指定敌种。 |
| `test/deploy-versioning.test.mjs`、`tools/dev/smoke.mjs` | 已确认新增模块进入 JS 递归版本化；smoke 支持 `CAMPAIGN=campaign-01` 验证浏览器关卡入口。静态 JSON 走普通静态上传路径，不进入 JS 文件名版本器。 |

**密度预算：** 每个 stage/beat 声明 `densityBudget.maxHostileActive` 与 `maxHostileBulletsPerSec`，beat 覆盖值不得超过 stage 预算；stage 预算不得超过 `hostileScreenCap`。全局硬上限初始可与友弹 `BULLET.screenCap` 的 140 对齐作为安全基线，但它不是平衡目标，须由 bench 与实机帧耗确认。超预算 pattern 以整组为单位拒绝发射并记录 debug 计数，不生成部分扇形/半个圆；不积压过期 volley 等待补发。

**验收与回滚：** 当前工作区已有测试、默认模式 smoke、`CAMPAIGN=campaign-01` smoke 与 madHunt 性能基线验证；仍需部署前复核静态 JSON 发布。新章节仅由显式查询参数启用，移除 loader/数据即可恢复旧无限模式；敌弹全局硬上限作为独立稳定性闸门保留。

### P-B：弹幕图案注册表

**工作量：M。** 注册表已实现并通过独立等价性复核；旧 Boss 字符串与 P-A 的 `aimed`/`laser` 引用均走兼容映射。P-B 随本轮受控上线（v0.3.10）。

| 文件 / 区域 | P-B 实施状态 |
|---|---|
| `js/level/patterns.js`（新增） | 纯 builder 支持 fan、ring、spiral、petal、rain、stack、laserGrid、aimed。`speed: { base, rankGain }` 的 rank 由共用 `levelFromScore(scoreAxis, score)` 结果归一化；不引入 BulletML/XML 或协程运行时。兼容别名 `burst → ring`、`laser → laserGrid`。 |
| `js/game.js`、`js/level/loader.js`、`js/enemy.js` | 显式声明的敌机 `patternRef + params` 经注册表构建 spec；未知 Boss pattern 仍走旧默认发射分支。Boss `spread/homing/burst/laser/spawn` 已映射到注册表或等价零弹输出。 |
| `js/level/schema.js` | stage `patterns` 扩展至 8 类，spawn 支持严格校验的 `params`；单次 volley 弹数必须同时不超过 beat 的 active 与每秒速率预算。无 `patternRef` 时不改变旧敌机射击路径。 |
| `js/bullet.js` | 未改动；注册表只生成完整 spec 数组，统一交给 P-A `spawnHostileBullets` 做原子准入。 |
| `test/patterns.test.mjs` | 覆盖八类图案确定性输出、参数边界、rank 单调、beat 预算拒绝，以及所有旧 Boss pattern 的弹道等价性。另将 `test/deploy-versioning.test.mjs` 的版本化模块断言从 29 调整为 30，并断言新增模块可达；其余既有测试未修改。 |
| P-A 首批 JSON | 保留现有 `aimed`/`laser` 字段和值；它们通过兼容别名/默认参数迁移到注册表，没有改变 3 关内容或难度节奏。 |

**等价性结论：** Boss `spread` 保留原各发速度向量；`homing` 映射为发射瞬间瞄准的 `aimed`；`burst` 映射为 8 向 `ring`；`laser` 映射为三发平行 `laserGrid`；`spawn` 不发弹，继续由 Boss AI 生成护航机。`homing`/`laser` 的瞄准向量从敌机中心计算，子弹仍从原炮口坐标发射；与 v0.3.9 一致。四种旧开火 pattern 通过旧版本固定随机源黄金弹道表校验。**裁定：该「瞄准中心、出生炮口」是既有设计语义，不是 bug，不列入遗留修复清单；P-B 只做无行为变化的架构迁移。** `homing` 不是弹丸持续追踪；真正追踪需另行设计转向与公平性。

**密度预算：** schema 根据 pattern 默认/显式 `count` 计算单次 emission size，必须同时满足 beat 的 `maxHostileActive` 与 `maxHostileBulletsPerSec`；运行时仍走 P-A 全局硬上限和原子 admission。每次 emission 都是短时子弹 spec，不表示持续激光碰撞体。

**缓存评估：** 静态 JSON 以 `?v=APP_VERSION` 请求并使用 `cache: "no-cache"`；`.htaccess` 已为 JSON 设置 no-cache，且生产曾验证版本参数请求成功。若未来需要同版本内 edit-in-place 更新 JSON，再评估文件名版本化。

**验收状态：** `npm test` 332/332；默认模式、`campaign-01` 与非法 campaign fallback 的浏览器 smoke 均通过。`node --expose-gc tools/perf/bench.mjs` 的 madHunt 六项等价指标保持一致，分配量仍减少约 95.9%。部署前补查：超 beat 密度预算的 `patternRef` 在加载期被拒、运行时整组原子拒绝（0 半截泄漏）；`?campaign=campaign-01` 实测 level-01 五节拍逐 beat 推进至 level-02.teach-laser，0 console/pageerror。

### P-C：内容编排、章节接入与只读预览

**工作量：M。** 扩展首批 stage 成一个章节节奏，接入玩家可选模式与只读预览；只在章节模式启用新内容，不替换 endless fallback。

| 文件 / 区域 | 计划改动 |
|---|---|
| `assets/levels/chapter-1/*.json` | 补齐 teach → test → twist → rest → elite/boss 节拍；类型/编队显式声明，随机 pool 只能带权重并有预算。 |
| `js/ui/menus.js`、`js/game.js` | 增加章节模式入口/关卡选择；默认保留无限模式，章节模式初期只开放一章及经测的难度档。 |
| `tools/level-preview/`（新增静态工具） | 只读显示 beat 时间、role、强度、spawn 数和密度预算；不先做拖拽编辑、实时修改或时间轴回放。 |
| `test/level-content.test.mjs`、`test/boot.test.mjs`、`tools/perf/bench.mjs` | 验证内容节拍、全量 patternRef、每 beat 静态预算、章节启动/退出，以及同一配置下的敌弹峰值与更新耗时。 |

**密度预算：** 每个新增 beat 必须有预算或继承 stage 预算；内容测试展开最大同时存活估算，bench 再以实际弹丸寿命和发射间隔采样 peak。Boss/虫群等混合段需覆盖最坏组合，不只分别测单一敌种。

**验收与回滚：** 章节从菜单可启动/退出，旧无限模式的默认入口与旧波次行为不变；若章节内容回归，隐藏章节入口或回滚 JSON 即可，runner 与 pattern registry 保留但不被默认调用。

### P-D（后续）：随机源收敛与可复现回放

**工作量：L，暂不进入前三期关键路径。** 收敛 `Math.random()` 到注入式 seeded RNG，覆盖敌种、散布、掉落、弹道和升级抽取；记录 seed、关卡版本、scoreAxis 和 DDA 决策，才能让时间轴回放可信。此前 `seed` 仅保留在数据格式，不承诺跨运行确定性，也不据此做排行榜公平性保证。

## 迁移与编辑器档位

- **旧无限模式：** 未选择章节时继续 `updateWaves` + 现有随机生成；不迁移、不删除现有波次行为。新章节只能经显式入口启用。选中章节但文件缺失或非法时明确记录错误，并回退到无限模式。
- **旧 Boss pattern：** 未提供 `patternRef` 时按原 `phase.pattern` 执行。明确写了 `patternRef` 但引用不存在时拒绝该 stage 并报错；避免 typo 被旧默认行为掩盖。
- **灰度：** P-A 先在测试/开发入口验证；P-B 先只迁移章节 Boss 和一类常规敌机；P-C 才开放单章节模式。每批可通过隐藏入口/回滚数据撤下，不更改默认 endless 体验。
- **编辑器建议：** 档位 1（JSON + Schema + 内容测试）随 P-A 实施；档位 2 只读节拍/密度预览放 P-C；档位 3（时间轴编辑、确定性回放）待 P-D 和设计数据稳定后再评估。现在做完整可视化编辑器会先固化尚未验证的 schema，投入与收益不成比例。

## 主要风险与总验收门槛

| 风险 | 对策 / 验收 |
|---|---|
| 主循环同时处理旧 wave 与新 runner，造成重复刷怪 | 新旧模式互斥；测试断言每帧只由一个 runner 派发 spawn。 |
| `scoreAxis` 再次分叉或旧公式残留 | 静态搜索/测试禁止 `game.js` 与 level runner 自行计算独立 score→level 公式；同一组 score fixture 同时断言两等级。 |
| 敌弹组合造成卡顿或屏幕不可读 | P-A 全局 cap；每 beat active/rate budget；pattern 原子准入；`tools/perf/bench.mjs` 测最坏组合。 |
| 时间触发与清场触发互相卡死 | Schema 限定 `timeoutSec`；runner 测试 time、allCleared、hybrid 的正常与超时路径。 |
| 随机 spawn 让缺陷难复现 | P-A/P-C 的内容优先固定编排；保留随机 pool 但不声称 deterministic；P-D 再收敛随机源。 |
| 静态 JSON 未被生产站点发布 | `assets/levels/` 走普通静态 mirror；部署测试确认 manifest 与 stage JSON 均进入上传清单，生产验收 fetch 返回有效 JSON。 |

各期均以完整现有测试套件通过为门槛；P-A/B/C 分别新增 Schema/runner/density、pattern 输出、内容与模式集成测试。性能验收复用并扩展 `tools/perf/bench.mjs`，不以“测试没超时”替代敌弹峰值和帧耗数据。
