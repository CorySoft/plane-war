# plane_war 玩法终稿：适合本项目落地的方案与分期（Qoder CN）

> 收敛依据：`docs/gameplay-catalog.md`（63 项总目录）→ 两份独立提案（`proposal-qoder-cn.md` / `proposal-codearts.md`）→ 两份交叉评审（`review-proposal-qoder-cn.md` / `review-proposal-codearts.md`）→ **决定性实证 `docs/graze-feasibility.md`**。
> 基线 HEAD `a54eeed` / v0.5.3 / 398 测试 / 产物计数 31。本文只写文档，未改 `js/**`；`tools/perf/` 下 3 个测量脚本为只读探针。
> **归档标记（2026-11-12 追加）**：本文是特定时点的收敛快照；正文 `file:line` 按写作时版本有效。以下四份历史评审快照**不得作为现行行号依据**：`existing-systems-inventory.md`、`review-proposal-codearts.md`、`graze-feasibility.md`、`proposal-codearts.md`；现行代码锚点以 `docs/design-current-state.md` 为准。

## 0. 落地状态（2026-11-11 执行轮追加，覆盖下文与实做不一致的表述）

批 0 + P3(1a) 已实施（提交 `bac1dfc`，版本 `0.5.3 → 0.5.4`）：`npm test` **413 tests / 50 suites / 0 fail**（基线 398/47，新增 15 例 / 3 套件 = enemy +4、synergy +11），`npm run test:smoke` `state:1`、console error 与 pageerror 均为「无」，运行时 `js/**` 文件数 **31 不变**（未新增模块，deploy 版本化计数无需 31→32）。

实施中对本文的四处更正（以代码为准）：

1. **批 0 表值取 `fireCd: [1.4, 2.0]`，不是 `[1.5, 2.2]`**。落速还乘 `(1 + level × DIFFICULTY.speedScalePerLevel)`（`js/config.js:427` = 0.045，本文与交叉评审最初都漏了这项），窗口时间实测推导：level 1 → 2.63s、level 5 → 2.24s、**level 6 → 2.16s**、level 14（maxLevel）→ 1.68s。上界 2.2 在 level 6 的最坏组合下**小于**窗口下限即失守，会让本方案自己要求的「level ∈ {1,6} 至少一枪」用例变红；2.0 留出 0.16s（约 10 帧）余量。
2. **「800/2400 帧 LCG 快照」不是 CI 门禁**：`test/` 内没有整局快照基建（唯一确定性用例是 `test/lifesteal.test.mjs` 的种子），快照逻辑只活在 `tools/perf/` 手工脚本里。1a 的零行为判定改为三条局部可证伪断言（锚点 probe 守护、`skillMax("dual") === 4` 等值、`calcFireRate` 短路互斥），写在 `test/synergy.test.mjs`。
3. **P3 的「双封顶」目标写错了对象**：爆炸连锁**早已双封顶**（`explosionMaxChainDepth = 2` `js/config.js:106` + `0.7^depth` `js/game.js:900`（`depth ≥ 上限` 停递归在 `:927`，闪电链每跳衰减在 `:814`）），无需再加；真正的失控点是 `js/player.js` 的 madHunt 分支在读取 `waveCap`（`:355`）之前就 `return`，满配单波 **140 发**不受 16 约束，以及 `move × speed` 总乘算 **2.58×** 无上限。二者连同「批 0 复射读表」都属改行为，已作为 **1b 落地**：madHunt 经 `BULLET.madHuntWaveCap=48` 均匀采样封顶、保留 360° 弹雨；`move×speed` 经平衡评审确认为有意设计不变式（不封顶，理由见批 1b 行）。
4. **「`dual` 上限不在 config」表述不准**：`js/config.js:300` 有 `max: 4`、`skillMax()` 现成（`:358`）、`js/skill.js:20` 已在升级时钳制；原缺陷只是 `js/player.js` 的重复字面量没调用它（现为 `:302` 的 `skillMax("dual")`），属零行为重构（已改）。

## 1. 结论

| 排序 | 方案 | 判定 | 一句话理由 |
|---|---|---|---|
| **批 0（新增，实测得出）** | 默认模式弹幕燃料前置（灰度 `?fuel=1`） | **最高优先，S** | 实测默认无尽模式 level<3 时**同屏敌弹 = 0**（3 种子 × 60s 时间线全零），根因是三条常量的算术必然（`js/enemy.js:177` 的窗口 gate `e.y <= 10` **或** `e.y >= H*0.7` 在 `:197` 的 `fireCd -= dt` **之前**就 `continue`，敌机出窗即不计冷却，而 `small` 首发 4~6s > 穿越窗口 2.74~4.29s）。这是**既有缺陷**，修它比加任何新玩法更值钱，且是 P2 复活的前置。 |
| **主推 P3** | 技能协同命名 + 双封顶 + HUD 呈现 | **1a 与 1b 均已落地** | 乘算协同在代码里已经成立且从未告诉玩家：`js/player.js:105-107` `(1+0.12×move) × (speed 道具?1.5:1)` 总乘算 2.58× 经 1b 平衡评审确认为**有意设计不变式（不封顶）**；madHunt 分支从 `js/player.js:309` 入口、`js/player.js:337` 于 `waveCap` 之前 return（满配单波原生 140 发不受 16 约束），已由 `BULLET.madHuntWaveCap=48` 均匀采样封顶（`js/player.js:327-336`）；`js/player.js:302` 把 `dual` 上限改读 `skillMax`（1a 已落地）。爆炸连锁则**已有双封顶**（深度上限 `js/config.js:106` + 逐层衰减 `js/config.js:117` → `chainDamageMultiplier` `js/game.js:899-901`，消费点 `js/game.js:927`），不需要 P3 再动。 |
| **P2（原主推）** | 擦弹/危险度 | **降级为纯度量项** | 两条预先钉死的判据同时触发（`<8 次/分`、`每局 <20 次或满槽 <1`）；`full=15` 时**全场景满槽 0 次**，护盾奖励等于永不发放。保留只读计量 + `bestDanger`，等批 0 出数后重评。 |
| **P1** | Boss Rush 升格 | **延后打包** | 两份评审一致反对现在做（S~M 成本买"新按钮"而非"新体验"，且必碰 `js/ui/menus.js`）。与「N 轮通关条件 + 轮次 HUD」捆绑成一个正式化批次再做；实测顺带给了新论据：Boss Rush 10s 只有 11 发同屏、6 次擦弹/分，密度预算 120/90 远未吃满，升格前应先谈密度。 |

## 2. v1 收益通道（已在交叉评审中消解，此处固化）

**裁定：满槽 → 1 层护盾，星尘兑换整体二期。** 双方独立收敛（`review-proposal-codearts.md:51-55`、`review-proposal-qoder-cn.md §2`）。

但实测给这条裁定加了一个前置条件：**`DANGER.full` 现在无法钉**——`full=15` 永不满槽、`full=5` 只在合成层（同屏 20-30 发）成立。所以 P2 的奖励通道**随批 0 一起冻结**，v1 只发计量。

星尘兑换解禁的三条件（缺一不得开工）：
1. 换算式与 `META.stardustPerScore = 400`（`js/config.js:531`）**同构**，禁止平顶常数（实测：`+20/局` 在 3k 分局是 +286%、20k 基准局 +40%，与局长反比）；
2. 限额口径改**每日**并复用既有基建（`todayKey()` `js/config.js:487` + `q.claimed` `js/meta.js:488-497`；`bonusStardust` `js/meta.js:266` 本身**没有**任何按局上限概念），量级 ≤ 每日任务总预算一半（≤10/天，DAILY_QUESTS 全部 5 条 = 20/天，`js/config.js:479-483`）；
3. `test/balance.test.mjs` 加护栏：现有 5 处星尘断言（`:113/:119/:129/:137/:163`）全部由 `stardustPerScore` 静态折算，**新通道对它们完全隐形**。

## 3. 三条 must-fix（任何一项实施前）

1. **`_grazed` 字段生命周期**：唯一回收口是 `freeBullet`（`js/bullet.js:73-91`），三个创建路径全部经 `allocBullet`（`:20`，调用点 `:145/:187/:272`）。最小充分修法 = `freeBullet` 清零 + `allocBullet` 字面量补初始值（稳定隐藏类），共 2 行；**漏 `freeBullet` 的后果已在测量侧同型复现**：对象池复用导致复用弹永不计数且**不报错**（`graze-feasibility.md §1` 偏差 2）。
2. **反证用例必须带固定 fixture**（防空转）：`固定单弹 dist=27 → grazeCount === 1`；`DANGER.grazeRadius 改为 20 → 同场景 === 0`。只有 tripwire 而无 fixture 时，两种配置可能都是 0、测试照样绿。
3. **成就接入要么列全调用点，要么移出 v1**：`checkAchievements` 有四处调用 `js/game.js:1178 / :1298 / :1344 / :1360`（`:1298`、`:1360` 两处多带 `reviveUsed: true`），`view` 字段在 `js/meta.js:503-514`——新增 `runGraze` 必须四处都传、`view` 也要加字段，漏一处即该路径永不成就且无报错。**采纳"移出 v1"**：成就发放走 `bonusStardust(a.reward)`（`js/meta.js:520`，跨局星尘）、`bestDanger` 要进 `metaData`（新存档字段 + 旧档默认值），都会把"零 UI 的纯局内计量"拖成元进程改动。

## 4. 六项评审口径（对批 0 与 P3 逐条一句话）

| 口径 | 批 0 燃料前置 `?fuel=1` | 主推 P3 协同命名 |
|---|---|---|
| ① 复用现有系统 | `ENEMY_TYPES.small.fireCd = [1.4, 2.0]`（`js/config.js:208`，批 0 落地值；原 `[4, 6]`）、`getEnemyShooters`（`js/enemy.js:172-208`，窗口 gate `:177` 早于 `fireCd -= dt` `:197`）、`setHostileBulletBudget`（`js/bullet.js:238`）与每秒硬顶 `hostileSpawnRateCap = 140`（`js/config.js:78`；`:244` 明确拒绝超限值，默认 140/140 未动） | `SKILLS` 表、`js/hud.js` 独立文件、`getBulletBehaviors()`、`toast` |
| ② 碰 `js/ui/**`？ | 不碰（URL 参数灰度，复刻 `js/game.js:74-77` 模块期解析 + `js/modes/bossrush.js:39 isBossRushRequested` 只认显式 `=1` 的范式） | **部分碰**：HUD/toast 不碰；图鉴文案在 `js/ui/codex.js` → 协同列表进图鉴那一步**会碰 UI**，须拆开排期（我原说"两轴都不碰 UI"已按 codearts 更正收回） |
| ③ 新增乘算口子？ | 否——只改首发计时，不改任何伤害/得分乘算；敌弹增量受 `deniedVolleys` 闸门（`js/bullet.js:302`，计数声明在 `:16`）与 140/秒硬顶约束 | 否——**只做命名与封顶**，`dual` 上限 4 从 `js/player.js` 迁入 config（现 `:302` 调用 `skillMax`）；显式禁止新增乘算项（红线沿用 catalog §3） |
| ④ 默认路径逐位一致 | 关闭态逐位一致（800/2400 帧 LCG 快照 `diffs: []`）；**开启态**改用「同屏敌弹峰值 ≤ 预算 且 死亡率增幅在 ±X 带内」的护栏断言（开启态必然改变对局，不得假装一致） | 关闭灰度时逐位一致；开启时只增加显示与文案，判定/伤害路径零改动 → 用同 LCG 断言 `score/hp/enemyLevel` 三项逐位相等，仅 HUD 文本可变 |
| ⑤ 成本 / 首版边界 | **S**（实做 0.5 人日：表值 + 复射读表 + 3 组用例）。落地=`ENEMY_TYPES.small.fireCd` `[4, 6]` → **`[1.4, 2.0]`**（见 §0-1 的窗口推导），并把 `js/enemy.js:199` 的复射硬编码改为读表 + 乘 `fireMul`；**默认生效，未加 `?fuel=1`**（它是缺陷修复而非玩法灰度，"默认路径逐位一致"这条红线本次由主持人裁定让位）。二期备选=把 `e.fireCd -= dt`（`js/enemy.js:197`）移出窗口 gate（结构性，全机型首发提前，需单独裁定） | **S**（1a 实做 <0.5 人日）：`SYNERGY` 三态表（声明式条件 + 锚点 probe 守护）+ `dual` 上限改读 `skillMax` + HUD 一行读数；**1b（madHunt 波内封顶、`move×speed` 总封顶）延期**，只留 tripwire。图鉴条目（碰 `js/ui/codex.js`）与成就另批 |
| ⑥ 依赖阻塞项 | 不依赖 P-D | 不依赖 P-D |

**P2 计量项（降级后的形态）另附参数纪律**：
- `export const DANGER = Object.freeze({ grazeRadius: 34, decay: …, capPerRun: 3, full: /* 待批 0 复测后钉 */ })` 入 `js/config.js`，禁止散写（沿用 `POWERUP_DURATION` / `SCORE_AXIS` 单源范式）；
- 守护断言：HUD 文案数字 ↔ 表值正则比对（v0.5.2 已验证能治"改一漏二"）；
- tripwire + fixture 见 §3.2；
- 判定实现走 `js/game.js:662` 已有 `dist` 的 `else if`，**不开第二遍扫描**（实测同结构比值：单循环 : 双扫描 ≈ 1 : 1.98；`Math.hypot` : 平方距离 ≈ 4.5 : 1；且第二遍需复刻 `:658-661` 四道过滤，漏 `friendly` 即把自家弹计成擦弹）；
- 帧率条款修正：不要求「30/60fps 偏差 ≤10%」（实测 −22.2%/+16.7%/−11.1%，是抽样相位噪声），改为**「对 `spawnLaserVolley` 类 8.5~9.7 px/帧高速弹，须用每弹最近距离或把该类排除在计量之外」**。

## 5. 排除 / 阻塞 / 互斥（沿用 catalog §4，附本轮新增）

- **强后端排除**：F1 gacha/内购/激励广告、F2 PVP/co-op/公会、F3 全服榜、E7 体力、E8 离线收益。
- **P-D 阻塞**：A13 每日挑战、C13 程序化每日任务、E3 回放——须先收敛随机源（`Math.random` 28 处 + dt 依赖帧率）。本轮实测新增一条同族风险：**擦弹计量本身也随帧率抖动**（±22%），任何"固定题目同题比拼"都必须先解决确定性。
- **反面教材**：C5 动态 rank（Battle Garegga：玩家被迫压火力、故意送命）。本项目 `SCORE_AXIS` 已同构，故：任何新奖励**不得写入 `score`**。**订正（旧债修正，HEAD `12aec58` 逐条核对实码）**：本行原写「合法回流只有一条既有的（星尘 → 商城 `score` 加成）」——**少算了两条**。`addScore()`（`js/game.js:1164-1170`）实际有 4 个乘子依次进 `score`：`double` 道具 ×2（`:1166`）、局内技能「幸运得分」`+10%×level`（`:1167` ← `js/config.js:315`，满级 +60%）、商城 `scoreBonus`（`:1168` ← `js/config.js:280`，星尘→得分这条既有回流）、关卡可覆盖的 `difficulty.scoreScale`（`:1169`）。**结论方向不变、口径要收紧**：`score` 已经同时被道具、技能、元进程、关卡四路注入，难度会跟着涨，所以「新通道不得增加第五条」是硬约束；`js/config.js:364-365` 也把 `score / double / 商店 scoreBonus` 明确排除在「可宣传的协同」之外，理由写的正是「score 是难度的唯一输入」。
- **互斥**：A14 生存模式 ⟂ D10 Boss 奖励二选一。
- **负空间**：F4 星尘解锁技能池条目（把构筑变付费墙）；`bulletSpeed × orbital` 实测是**减益**，禁止当协同宣传（P3 命名表须显式标"不成立"）；不给"留存 +N%"承诺（无可靠同类公开来源）。
- **本轮新增排除**：`DANGER.full` 在未做批 0 前不得实施（实测无解）。

**未核实 / 未成文（如实记录，不补造）**：
1. `docs/research-roguelike-shooter.md` 未成文（Loomy 三轮中断），D/E 轴依据为既有本地文档；
2. `research-mobile-shmup.md` 的「长线循环 × 单机化」补节未落盘；
3. `research-arcade-danmaku.md:51`「Gameplay 段为空」是作者原文内部矛盾，OpenCode 已禁用未在源头更正，以 catalog §1.3 为准；
4. 本文所有测量为**无头仿真，无真人测试、无触屏真机**；合成层（ring 密度 20-30 发）是自造供给，不代表官方推荐密度；
5. 测量环境为 2 核共享机，微基准绝对值不可用（对照组 370ns/元素），只引用同结构重复测得的比值（±3%）。

## 6. 面向用户：一句话推荐与分期路线

**推荐**：先修「默认模式其实没有弹幕」这个实测发现的缺陷（半天工作量、灰度可控），再把已经存在却从没告诉玩家的技能协同显性化（零新机制）；擦弹危险度保留为只读计量，等弹幕真的有密度之后再决定给不给奖励。

| 批次 | 内容 | 成本 | 验收判据（可证伪） | 降级/回退条件 |
|---|---|---|---|---|
| 批 0 | **已落地（默认生效，非灰度）**：`ENEMY_TYPES.small.fireCd` `[4,6]`→`[1.4,2.0]` + `js/enemy.js:199` 复射改读表并乘 `fireMul` + 子代 `e.fireMul = 1` 堵池泄漏 | S | 实际验收：① `npm test` 413/413（新增 4 条 enemy 用例：复射锁数值、高等级复射乘 `fireMul`、level∈{1,6} 最坏组合「至少一枪」、分裂子代 `fireMul` 池泄漏守护）；② `test:smoke` `state:1`、0 console error / 0 pageerror；③ 运行期探针 `tools/perf/graze-fuel-probe.mjs`：修复前 `hostileFrames 0 / peakHostile 0` → 修复后 `hostileFrames 1668~3439 / peakHostile 8~11`、`errors []` | 密度侧已复核（独立探针：level 1/6 穿窗开火率 50/50、level 14 为 45/50 且符合表注释预期；60s 满负荷 `totalFired 178~213`、`peakHostile 14~20` 远低于 140/秒硬顶、`deniedVolleys 0`；split 子代穿窗期 **0 发**，因 `fireCd=rand(5,8)` 恒大于其 2.58s 穿越时间，故 1a 的 `e.fireMul=1` 只是防池泄漏、不产生二次节奏扰动）。**仍未回答的是死亡率**：`framesPlayed 665 < 900` 且 `minDist 0.4` 提示仿真写轮机提前阵亡，无真人试玩数据；若真人反馈死亡率增幅 >1.5× 则回调表值**下界**，而不是回退读表修复本身 |
| 批 1a | **已落地**：`SYNERGY` 三态表（4 条已核锚点，排除 score 轴）+ `js/player.js:302` → `skillMax("dual")` + `js/hud.js` 协同/互斥读数 | S | `test/synergy.test.mjs` 6 条守护：表结构、锚点 probe 不漂移、id 存在于 `SKILLS`/`POWERUP_DURATION`、dual 等值且仍钳制、rapid/madHunt 短路互斥、`activeSynergies` 双边成立才显示 | 若某条"协同"后续被证伪 → 从表中删除并入负空间清单，禁止留在表里当卖点 |
| 批 1b | **已落地（代码，待部署）**：madHunt 经 `BULLET.madHuntWaveCap=48` 均匀采样封顶（满配 140→48，保留 360° 弹雨观感）；`move×speed` 经平衡评审确认为有意设计不变式（2.58× 不封顶——理由：P2 擦弹已降级，封顶等于纯削弱机动流，无缺陷证据） | S~M | 原 `FIXME(1b)` 现状锁定用例已转为守护用例（`test/synergy.test.mjs`）：madHunt 断言恰好 `== madHuntWaveCap`、move×speed 守护 `2.58×` 不被误改 | 改手感项；实测 cap 控制**爆发粒度**而非总密度——32/48/64 三档峰值友方弹均钉在 `screenCap=140`，吞吐差异(260~331/5s)在种子噪声(±12%)内分不出高下，真实收益是削峰+降吞吐 13~32%（验证见 `tools/perf/madhunt-cap-probe.mjs`，须带 SEED）；预测函数 `expectedMadHuntPatterns` 同步封顶，screenCap 预判与实产一致 |
| 批 2 | P2 计量项：`DANGER` 表 + `else if` 环 + HUD 读数 + fixture/tripwire 双测 | S | 判定环是**闭开区间** `PLAYER.hitRadius(20) ≤ dist < grazeRadius(34)`（两端常量取自实测量具 `tools/perf/graze-feasibility.mjs:22-23`，`20` 同时是 `js/config.js:523` 的受击判定半径）→ fixture 期望：`dist=27` 计 1、`dist=35` 计 0（环外）、`dist=19` 计 0（已进受击判定，算命中不算擦弹，二者不得同时计）；`full` **不发奖励**，只统计 | 若批 0 未达标 → 本批只做 HUD 计量，不进入奖励设计 |
| 批 3 | 依批 0 复测数据决定：P2 奖励通道（满槽→护盾，`full` 按实测钉）+ 图鉴/成就 + 星尘二期三条件 | M | 需重跑三层测量 + 真人试玩；满槽在真实（非合成）场景 ≥1 次/局 才允许上线 | 任一条件不满足 → 停在计量形态，不再投入 |
| 批 4 | P1 Boss Rush 升格（菜单入口 + 轮次 HUD + N 轮通关） | S~M | 必碰 `js/ui/menus.js`，走 UI 改动专用评审；升格前先定密度目标（现实测仅 11 发同屏） | 用户不要求"正式入口"则一直延后 |
| Phase-1 | **已落地（代码 `3557386`，VERSION 仍 0.5.6，本轮未部署）**：6 个局内技能 homing / nova / regen / overload / secondWind / chain（`config.js:321-326`，技能表 28→34 条）+ nova 自催化闸门 + 合成弹与真实弹池隔离 + secondWind 副作用修正 | M | 带 seed 基线见 `docs/perf-baseline.md` 第七节。闸门修复把「一次 `addXp` 内的新星环数」从 **4 → 1**（守护用例 `test/skills-phase1.test.mjs:203-223`，回退闸门后实测 4）；得分在四个形状里恒为 19,500 = 40×100 本体分 + 31×500 连击分，每杀 487.5（nova）vs 488.2（对照组扣背景）→ **nova 不是得分打印机**，那 15,500 是既有连击规则（`js/game.js:745-746`：`combo>=10` 每杀 +500，同一式在 `:859-860` 重复一份）本来就给的。存活侧 12 seeds：基线 7/12 满窗（5 次打光命）→ 满级 12/12，等级增量下限 +1 → +10 | **本行不写「nova 推高难度」**：得分未变 ⇒ `score` 这根 Garegga 唯一难度输入没被 nova 撬动（该说法已由带 seed 对照撤回）。**裁定 C 口径：nova 专项危害只计「一次 `addXp` 内的新星环数 4 → 1」**（守护用例 `test/skills-phase1.test.mjs:203-223`，回退闸门后实测 4）；等级增量 **+4**（对照组 +5，扣背景后同为 +4，`docs/perf-baseline.md` 7.1 表）**不记作 bug 残留**——`pLevel++` 位于闸门之前（`js/game.js:1205`），同一次 `addXp` 内的多级经验本就该级联，实测与对照组同量级 ⇒ 判为**正常经验结算**；本行旧版写的「等级虚增 = 残留边界」是我方误判，**按裁定 C 撤回**。代码注释自陈的「实测一次升级被放大成 4~5 次」（`js/game.js:1212-1214`）指的是**新星环数与 `doLevelUp` 次数**（闸门各压成 1 次/帧，`:1210-1216`），不是等级增量。回归护栏只断言环数=1 与生命=+1、**未断言等级增量**，与「等级增量属正常结算」一致，故不列为护栏缺口。反过来，**不能把闸门的价值描述成「少给 3 条命 / 少 3 次三选一重 roll」**：生命只在完整去掉闸门的变体 B 下多 +1，重 roll 在 0 帧窗内四臂 `处理过的升级事件` 全为 0 → 不可测、不做裁定（数据见 `docs/perf-baseline.md` 7.1）。**Phase-2 硬约束（本轮实测得出）**：任何「瞬时清场」机制都会把击杀压进 `COMBO.window=2.5s` 内，于是 **≈80%（实测 15,500/19,500 = 79.5%）的得分来自连击奖励**；`nuke` 一类全屏清除道具必须**显式决定**它的击杀是否给连击/得分，不允许默认吃这条通道。**同轮口径**：闪电链与爆炸连锁「同源不同式」——衰减常量已单源为 `BULLET.chainDecay=0.7`，闪电链按跳相乘、爆炸按层相乘，**爆炸侧数值不变**。**判决纪律**：无 seed 不出数值判决（③ 在 3 seed 时组间差被 seed 内方差整个覆盖；得分在 12 seed 下区间仍重叠 → 不许写「满级推高得分」） |

复现：`node tools/perf/graze-feasibility.mjs --out=/tmp/graze-feasibility.json`（33 组，约 6 分钟）。
