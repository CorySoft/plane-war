# 玩法模式提案 —— 对局模式轴

> 任务来源：主持人 Codebuddy「探索更多玩法」三路并行之一（模式轴）。
> 本文档只做设计与拍板材料，**不改任何现有模式行为**，不 commit。
> 构筑/元进程轴（技能协同、稀有度分层、Boss 奖励二选一等）归 Qoder CN `docs/gameplay-depth-proposal.md`，本文不重复。
> 关联阅读：`docs/revamp-levels.md`（关卡数据化）、`docs/revamp-numbers.md`、`docs/perf-baseline.md`。

---

## 0. 事实基线（逐条读码核对，非估算）

| 可复用系统 | 实际规模 / 接口 | 来源 |
|---|---|---|
| Campaign runner | `createCampaignRunner(campaign, {startStageId})` → `.update(dt, enemyCount)` 返回 `{events, beatChanged, stageChanged, complete, timedOut}`；beat 由 `beatEvents()` 展开成 `atSec` 事件流；含 `densityBudget`、`scoreAxis` | `js/level/loader.js:129-247` |
| 关卡加载与灰度 | `loadCampaignSafely(campaignId, {version})` → `{campaign, error}`；URL 参数 `?campaign=`；非法/损坏干净回退无限模式 | `js/level/loader.js`、`js/game.js:78-87` |
| Boss Rush 原型 | `js/modes/bossrush.js`：`isBossRushRequested()`、`stepBossRush(state, dt, hasBoss)`、`bossRushRoundType/HpScale/RoundInterval`、`scaleBossForRound()`；`?bossrush=1` 与 campaign 互斥 | `js/modes/bossrush.js`（已集成 `js/game.js:31,77,1345`） |
| Boss 类型 / 相位 | `BOSS_TYPES` 三型（mothership/fortress/phantom），各 3 相位，`spawnBoss(type, level)` 按难度缩血 | `js/wave.js:83-149` |
| 弹幕注册表 | 8 类图案（fan/ring/spiral/petal/rain/stack/laserGrid/aimed），`validatePatternParams(ref, params)` + `patternBulletCount(ref, params)`，`$rank` 由 `SCORE_AXIS` 派生 | `js/level/patterns.js` |
| 难度单一真源 | `SCORE_AXIS` + `levelFromScore(axis, score)` + `rankFromScore(axis, score, levels)`；campaign 的 axis 被 schema 锁死与 SCORE_AXIS 等值 | `js/config.js`、`js/level/schema.js:189-196` |
| 敌方弹幕密度闸门 | `setHostileBulletBudget(budget)`（P-A 引入，原子整组准入） | `js/game.js:1346` |
| 道具权重表 | `POWERUP_WEIGHTS_EARLY/LATE` 各 14 项（`randomSkill` 仅 Boss 掉落）；`POWERUP_DURATION` 10 项单一来源 | `js/config.js` |
| 状态机 | `STATE.{MENU,PLAYING,OVER,LEVELUP,PAUSED,TUTORIAL,REVIVE,GACHA}`；结算/复活/三选一路径现成 | `js/config.js:41` |
| 通关/进度持久化 | `getCampaignProgress` / `recordCampaignStageCompletion(campaignId, stageId, nextStageId)`，localStorage | `js/meta.js:413-434` |
| 已知障碍 | `Math.random()` 散布多处 → 确定性 seed 收敛是 P-D 待办，**当前无法做可复现的每日挑战** | `docs/revamp-levels.md`（P-D） |

> 两条基线结论决定取舍：① 灰度模式已跑通「URL 参数入口 + 默认零变化 + 干净回退」范式，任何新模式都应复用同一范式，不碰 UI 菜单；② 敌方弹幕有独立密度预算，新模式的密集弹幕必须先过预算校验，否则重演 P-A 前的无上限问题。

---

## 1. 提案 M1 —— Boss Rush（连续 Boss 车轮战）

**核心循环一句话**：无小怪干扰，三型 Boss 循环出场、逐轮血量递增、轮间喘息递减，撑到撑不住为止。

### 现状
原型已在 `js/modes/bossrush.js` 落地并通过 `?bossrush=1` 灰度集成，默认路径零变化。本提案将其从「原型」升为「正式可玩模式」。

### 复用
- 三型 Boss + 相位系统（`BOSS_TYPES` / `spawnBoss` / `getCurrentBossPhase`）。
- 既有结算 / 复活 / 无敌帧 / 死亡慢动作状态机。
- Boss 掉落（3 道具，含 skillup/randomSkill 二选一）。

### 新增
- 模式选择菜单入口（P-C 的 UI 范式，菜单加一项，默认无限模式不变）。
- 轮次计数 HUD（第 N 轮 / 下一轮类型预告）。
- 轮次奖励阶梯（每 5 轮额外给一个稀有道具，复用权重表 tier 概念，见深度提案 D2）。
- 通关/阵亡结算文案区分（vs 无限模式）。

### 工作量：S~M
原型逻辑已就绪；新增主要是 UI 入口 + HUD + 结算文案，无新机制。

### 灰度兼容
天然兼容：URL 参数已跑通，菜单入口只是多一个触发点，默认仍 `?bossrush` 缺省 = 关闭。

---

## 2. 提案 M2 —— 每日挑战（固定 seed 全网同题）

**核心循环一句话**：每天一个固定 seed 生成的对局，全网玩家当天打同一局，比拼分数/存活。

### 复用
- 无限模式整体对局循环、SCORE_AXIS、道具权重表、成就/每日任务钩子。
- `recordCampaignStageCompletion` 同款的「每日进度」持久化（可新增 `dailyChallenge` 存档键）。

### 新增
- **seed 收敛（前置硬依赖）**：把散落的 `Math.random()` 收敛到单一 `makeRng(seed)`，P-D 待办项。在此前，每日挑战**不可做**。
- 每日种子生成器（日期 → seed），seed 决定道具掉落、敌机生成序列、图案参数（复用 `patterns.js` 的 `$rank` + params）。
- 当日成绩上传/比对（需服务端，成本 M；可选先只做本地每日榜）。
- 每日挑战入口 + 当日进度 UI。

### 工作量：L（受 seed 收敛阻塞）
seed 收敛本身是 P-D 范围；若 P-D 完成，剩余为 M。

### 灰度兼容
中。URL 参数入口可行（`?daily=YYYY-MM-DD`），但「全网同题」依赖 seed 收敛与可选的服务端比对，不宜在 seed 未收敛前灰度。

---

## 3. 提案 M3 —— 无限模式突变词条（Mutator）

**核心循环一句话**：在无限模式上叠加随机全局规则（突变），每 5 级随机抽一条，规则持续整局或限时。

### 复用
- 无限模式主循环、SCORE_AXIS 的难度跳点（第 5/10/15 级是天然的突变触发点）。
- `patterns.js` 参数表 + `POWERUP_WEIGHTS_*` 权重表（突变直接改这两张表即可改弹幕/掉落）。
- `POWERUP_DURATION` 单一来源（限时突变改时长只改表）。
- hostile bullet budget（突变若加弹幕须过预算）。

### 新增
- 突变词条表（~12 条，示例：敌机移速 ×1.3、道具权重互换、爆炸半径 +30%、boss 提前到场、敌弹射速 +20%），每条给「修改哪张表 / 改哪个常量」。
- 突变抽取器（固定 seed 可选，接入 P-D 的 rng）。
- HUD 突变指示条 + toast 提示新突变到来。
- 突变与既有「软上限纪律」的边界（不得新开乘算口子绕过 SCORE_AXIS / 连锁 0.7^depth）。

### 工作量：M
词条表是纯数值编排（便宜），但需逐条接准入点并加回归测试锁住「突变后弹幕不破 density budget」。

### 灰度兼容
高。可做成 `?mutators=1` 在无限模式上开启，默认关闭；词条可逐条灰度。

---

## 4. 提案 M4 —— 生存模式（无升级三选一，纯道具构筑）

**核心循环一句话**：取消升级三选一，靠捡道具堆构筑活到最后，每存活一段难度递增。

### 复用
- 无限模式对局循环、道具拾取/应用管线（`applyPowerup`）、状态机。
- 生存压力用 SCORE_AXIS 的既有跳点 + 存活时长双轴驱动。

### 新增
- 屏蔽 LEVELUP 状态（`doLevelUp` 在生存模式下改为自动加护盾/回血，不弹三选一）。
- 生存计时 HUD + 生存段位（每 30s 一档，档位驱动道具权重调整——复用早晚表机制扩成多档）。
- 生存模式专用结算（存活时长 + 击杀数）。
- 道具稀有度分层（接深度提案 D2 的 tier 概念）——生存模式靠稀有道具撑构筑深度。

### 工作量：M
屏蔽升级 + 计时 HUD 是 S；多档权重 + 稀有度分层需接深度提案，整体 M。

### 灰度兼容
高。`?survival=1` 入口，默认关闭。

---

## 5. 提案 M5 —— 竞速模式（限时冲分）

**核心循环一句话**：固定倒计时内冲最高分，倒计时结束结算。

### 复用
- 无限模式对局循环、SCORE_AXIS、得分/连击/成就钩子。
- 倒计时复用 `beat` 的 `timeoutSec` 思路（loader 已有 timedOut 路径）。

### 新增
- 倒计时 HUD（倒计时结束前 N 秒的「最后冲刺」提示可复用现有 toast）。
- 倒计时归零强制结算（复用 `gameOver()` 路径）。
- 竞速专用结算（分数 + 剩余时间惩罚的变体可选）。
- 难度随时间而非分数推进（可选变体：计时内难度阶梯）。

### 工作量：S
几乎纯编排，复用计时器与结算状态机。

### 灰度兼容
最高。`?timeattack=1` 入口，默认关闭。

---

## 6. Top3 推荐与理由

| 排序 | 模式 | 工作量 | 类型 | 理由 |
|---|---|---|---|---|
| **1** | **Boss Rush** | S~M | **纯编排现有内容**（原型已就位） | 唯一已有原型且已灰度集成的模式；复用度最高（三型 Boss + 相位 + 状态机全现成），零新机制；从「原型」到「正式模式」只差 UI 入口 + HUD，性价比最高。**建议第一个正式立项。** |
| **2** | **竞速模式** | S | 纯编排 | 成本最低、独立于 seed 收敛；倒计时 + 结算复用现成计时器；与 Boss Rush 不冲突（一个打 boss、一个冲分），可作为第二个低成本模式充实玩法矩阵。 |
| **3** | **突变词条** | M | 纯数值编排为主 | 接入缝清晰（权重表 / patterns / POWERUP_DURATION 都是单一来源表，改一行即生效）；为无限模式注入长线新鲜感，且不依赖 seed 收敛（词条抽取可用普通随机，也可接 P-D rng）。比生存/每日挑战便宜，且与既有「软上限纪律」兼容。 |

**明确不进 Top3 的理由**：
- **每日挑战（M2）**：被 seed 收敛（P-D）硬阻塞，当前无法做「全网同题」的核心承诺，投入产出比低，等 P-D 完成后再评估。
- **生存模式（M4）**：本身不算贵，但依赖稀有度分层（深度提案 D2，M~L）才能形成构筑深度，否则只是「去掉升级的无限模式」，体验单薄；应与深度提案联动排期。

---

## 7. 便宜 vs 昂贵矩阵

| 模式 | 纯编排（便宜） | 需新机制（贵） | 阻塞项 |
|---|---|---|---|
| Boss Rush | ✅ 三型 boss + 相位 + 状态机 | UI 入口 + HUD（轻） | 无（原型已就位） |
| 竞速 | ✅ 计时器 + 结算 | 倒计时 HUD（轻） | 无 |
| 突变词条 | ✅ 权重表 / patterns / 时长表 | 词条表 + HUD 指示（中） | 无（seed 可选） |
| 生存 | ✅ 屏蔽升级 + 计时 | 多档权重 + 稀有度（依赖深度提案） | 依赖 D2 |
| 每日挑战 | ❌ | seed 收敛 + 服务端比对 | **P-D seed 收敛** |

---

## 8. 跨模式风险（统一裁定前置）

1. **density budget 必须过闸**：任何新模式的密集弹幕（突变词条、每日挑战的 patternRef 弹幕、Boss Rush 的 burst/spread）必须先过 `setHostileBulletBudget` 校验，否则重演 P-A 前的无上限问题。
2. **不得新开乘算口子**：所有模式的数值调整须复用「软上限纪律」（SCORE_AXIS 封顶 / 连锁 0.7^depth / POWERUP_DURATION 单一来源），不得绕过既有刹车造成数值膨胀。
3. **默认零变化是硬约束**：所有新模式走 URL 参数 / 菜单入口灰度，不带参数时执行路径与 v0.5.2 逐位一致（沿用 campaign runner 已验证的灰度范式）。
4. **UI 菜单不冲突**：新模式菜单入口须走 v0.4.4 自适应布局 + 44px 触控 + 帮助面板模态拦截，避免重叠回归。

---

## 9. 边界声明

- 本文只覆盖「对局模式」轴，不涉及技能协同 / 稀有度 / Boss 奖励二选一 / 成就 / 跨局解锁（归 `docs/gameplay-depth-proposal.md`）。
- 本文不引用任何「留存提升 N%」类数字（公开文献无可比数据，见 `docs/design-research.md`）。
- Boss Rush 原型已由 codearts 落地于 `js/modes/bossrush.js`，本文的 M1 是将其「原型 → 正式模式」的升格设计，非重新设计。

---

## 10. 互斥与负空间声明（终裁）

1. **生存模式 ⟂ D3 Boss 奖励二选一**：二者互斥。生存模式的前提是「没有升级三选一」，若同时存在 Boss 二选一，其构筑前提自我否定；拍板生存模式时须禁用 `BOSSREWARD` 状态，回落到现有随机掉落。
2. **每日挑战阻塞于 seed 收敛**：`Math.random()` 全仓 28 处且推进步长 `dt` 依赖真实帧间隔，未完成 P-D 的固定步长确定性回放前，不做「全网同题」承诺。
3. **Boss Rush 已接密度闸门**：`?bossrush=1` 使用专用预算 `maxHostileActive=120 / maxHostileBulletsPerSec=90`（`js/modes/bossrush.js` 的 `BOSS_RUSH_BUDGET`），任何新模式都不得绕过 `setHostileBulletBudget`。
