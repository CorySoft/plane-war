# 玩法深度提案 —— 构筑与元进程轴

> 任务来源：主持人 Codebuddy「探索更多玩法」三路并行之一。
> 本文档只做设计与拍板材料，**不改任何现有模式行为**，不 commit。
> 模式轴（Boss Rush / 每日挑战 / 突变词条等）归 Loomy `docs/gameplay-modes-proposal.md`；本文不重复。
> 关联阅读：`docs/design-research.md`（此前借鉴调研）、`docs/revamp-numbers.md`、`docs/review-explosion.md`。

---

## 0. 事实基线（逐条读码核对，非估算）

| 系统 | 实际规模 | 来源 |
|---|---|---|
| 技能 | **28** 条，`max` 1~10，4 条带 `requires`（expChance/expDmg/expRange←explosion，splitDist←split） | `js/config.js` SKILLS |
| 道具 | **15** 种（不是 16） | `POWERUP_DEFS` 键数 |
| 掉落权重表 | 早/晚表各只有 **14** 项 —— `randomSkill` 不在权重表里，仅 Boss 掉落专用 | `POWERUP_WEIGHTS_EARLY/LATE`、`js/powerup.js:36-37` |
| 计时 buff 单一来源 | `POWERUP_DURATION` 现覆盖 **10** 项（v0.5.2 已闭环） | `js/config.js` |
| 子弹行为 | `getBulletBehaviors()` 返回 **Set，可叠加**（penetrate/explosion/split 共存），`primaryBehavior()` 仅用于染色 | `js/bullet.js:610-627` |
| 爆炸触发点 | 命中且击杀时判 `b.behaviors.has("explosion")` 才结算死亡爆炸 | `js/game.js:715-730` |
| 连锁衰减 | `chainDamageMultiplier = 0.7^depth`，另有深度上限 `explosionMaxChainDepth` | `js/game.js:817-819` |
| 天基武器 | 每帧 `min(curSpd + accel*dt*60, orbitalMaxSpeed)` —— 速度受**飞行距离**驱动 | `js/bullet.js:352-354` |
| 击退 | `b.knockback = b.dmg * (perLevel*kbLv + buff)` —— 与伤害**已经是乘算** | `js/bullet.js:152-154` |
| 成就 | 12 条，`cond(view)` 函数式判定，`checkAchievements(run)` 局末调用，奖励走 `bonusStardust` | `js/meta.js:502-526` |
| 每日任务 | 5 条，`questEvent(type)` 挂在 addKill/addBossKill/addPowerupCollected 上 | `js/meta.js:378-394` |
| 商城 | 9 条线（`max` 2~5），12 条天赋含 `requires` 链 | `SHOP_ITEMS`、`META.talents` |
| Boss 奖励现状 | 击杀 Boss = +3000 分 + 屏幕震动 + **3 个随机 Boss 道具**（skillup/randomSkill 二选一随机） | `js/game.js:705-710` |
| 三选一暂停范式 | `STATE.LEVELUP` + `drawLevelUp` + 独立输入分支，**可直接复用** | `js/game.js:286,1147,1617,1679,1735` |

**两条基线结论决定本提案的取舍**：
1. 行为是 Set、爆炸在命中点结算 —— **技能协同不需要新机制，现网已经在乘算**，只是没被"命名"和"上限化"。这是本轴最便宜的一块钱。
2. `rate` 的 fullDesc 已写明「满配后敌机血量封顶，继续堆射速边际收益递减」—— 项目**已有软上限纪律**。任何构筑深化都必须复用这条纪律，不得新开乘算口子。

> 诚实约束（承接 `design-research.md:15,87`）：本文**不引用**任何「留存提升 N%」类数字，公开文献无可比数据。收益判断只谈设计意图与成本。

---

## 1. 提案 D1 —— 技能协同/进化（可命名 combo）

**玩家动机一句话**：让我这一局的技能组合"读起来像个流派"，而不是 28 个独立数字的堆叠。

### 设计
把已经存在的乘算关系**显式命名 + 显式设上限**，分两步落地，第一步零新机制：

| combo id | 名称 | 组成（现有技能） | 现在的隐性效果 | 进化后定义 | 新增机制 |
|---|---|---|---|---|---|
| `c_chain` | 连锁雷区 | `penetrate` × `explosion`+`expChance` | 穿透弹存活期间**每次击杀**都会判爆炸（`game.js:715`） | 爆炸半径按穿透等级放大 `×(1+0.08*penLv)`，并显式封顶 | 仅常量 |
| `c_siege` | 天基齐射 | `orbital` × `range` | range 决定加速距离，orbital 决定加速度 —— 距离越长末速越接近 `orbitalMaxSpeed`（`bullet.js:352`） | 末速达 cap 的子弹命中时附 `+10%` 伤害，HUD 显示"充能完成" | 常量 + 1 个 HUD 标记 |
| `c_reaper` | 收割回路 | `lifesteal` × `crit` × `critdmg` | 暴击只是数字更大，回血只在击杀判定时触发 | 暴击击杀回血 ×2，非暴击击杀 ×1（保持原值） | 1 处乘子 |
| `c_barrage` | 弹幕压制 | `volley` × `scatter` × `dual`/`sideBullets` | 纯加发数，已被敌机血量软上限吃掉边际 | **不做乘算**，改为「同屏友弹数达阈值时 `rate` 间隔 -X%」，阈值与 X 双封顶 | 需新读同屏弹数，仍便宜 |
| `c_knock` | 铁壁推拒 | `knockback` × `maxhp`/`shield` | knockback 已与 dmg 乘算（`bullet.js:152`） | 击退距离并入"生存评分"，与敌机逼近速度对冲，给一条**可读的防守指标** | 只加 HUD 语义 |

### 接入点
- 定义表：`js/config.js` 新增 `SKILL_SYNERGIES`（与 `POWERUP_DURATION` 同款单一来源表）。
- 判定与乘子：`js/bullet.js:114-154`（发弹期）、`js/game.js:660-730`（命中期）。
- 呈现：`js/ui/codex.js` 技能详情卡 + `js/hud.js` 「流派激活」提示（复用 `getBehaviorLabel` 的 extras 机制，`hud.js:199-220`）。

### 工作量 / 风险
- **工作量**：S~M。`c_chain`/`c_reaper` 是纯常量 + 一张表；`c_siege`/`c_barrage` 需 M（读运行时状态）。
- **风险 1（数值膨胀）**：combo 乘算必须**双封顶**（每 combo 一个 `cap` 字段 + 总乘子 ≤1.5），否则穿透×爆炸会绕过既有连锁 0.7^depth 的刹车。
- **风险 2（负向协同）**：`bulletSpeed × orbital` 是**减益**（弹更快到达 → 加速距离更短）。若把它们做成"看起来是 combo"的推荐，会坑玩家。**必须在 UI 上明确标注互斥/不推荐**，这是本次设计要主动写进负空间的项。
- **风险 3（复杂度）**：28 技能两两组合读起来爆炸。只在**5 条命名 combo**内做，其余一律不宣称协同。
- **测试缝**：守护用例锁「每条 combo 的两端技能 id 必须存在于 SKILLS」+「总乘子 ≤ cap」；差分探针（既有 LCG 定种流）对比 `无 combo` vs `有 combo` 的 600 帧 DPS 区间，超阈值即红。

---

## 2. 提案 D2 —— 道具稀有度分层

**玩家动机一句话**：让我捡到东西时"心跳程度"能被预判，稀有掉落值得专门绕过去拿。

### 设计
在**现有掉落闸门之后**分层，绝不动 `POWERUP_DROP.base`（那条闸门被 `balance.test.mjs:155-159` 锁着「叠加后仍 ≤100%」）：

```
spawnPowerup()  →  Math.random() < base + dropBonus   ← 保持不变（是否掉落）
                →  原 weightedPick(weights) 选类型     ← 保持不变
                →  【新】以 tierBump 对选定类型加稀有标记（视觉/图鉴/音效）
                →  【新】保底：连续 N 次掉落未出稀有 → 本次强制升级为稀有版
```

分层归属（建议，纯元数据，不改权重表）：

| tier | 成员 |
|---|---|
| 普通 Common | `life` `speed` `magnet` `rapid` |
| 稀有 Rare | `power` `shield` `double` `drop` `critboost` `knockback` `madHunt` |
| 史诗 Epic | `freeze` `xppack` `skillup` |
| 传说 Legendary | `randomSkill`（现状已是 Boss 专属、不在权重表 —— 天然稀缺，分层成本为零） |

"稀有版"只做**同型强化版**（不改类型语义，避免新增道具）：持续时长 ×1.5（读 `POWERUP_DURATION` 后乘，仍走单源表）、光柱/描边升级、图鉴记录为同一条目。

### 接入点
- `js/config.js`：新增 `POWERUP_TIER`（type→tier）与 `POWERUP_TIER_MULT`（稀有版倍率）。
- `js/powerup.js:31-44`（spawn 后打 tier）、`:74-135`（apply 时套倍率）、`:161-231`（绘制分层描边）。
- `js/ui/codex.js`：卡片加 tier 角标；文案时长继续走模板（已有守护用例，改了必红）。

### 工作量 / 风险
- **工作量**：S（纯编排现有内容 + 一张表 + 一个计数器）。
- **风险 1**：倍率 ×1.5 直接压在 `madHunt`(5s) 上会变成"手感回归"——正是 v0.5.0 被砍的东西。**建议稀有版倍率只作用于 `double/critboost/drop/knockback`，明确排除 `madHunt/xppack/freeze`**。
- **风险 2**：保底计数器必须落 `metaData` 并在 `resetMeta()` 归零，否则跨局漂移；这是 v0.4.9 持久化 bug 的同款坑（写路径要 `saveNow()`，不能只 `flushMeta()`）。
- **测试缝**：守护用例锁「tier 表键集 === `POWERUP_DEFS` 键集」（漏一个就红）+「稀有版倍率不得作用于排除清单」+「保底第 N 次必出稀有」。

---

## 3. 提案 D3 —— Boss 奖励二选一

**玩家动机一句话**：把"我辛苦打完 Boss 却拿到一个用不上的随机技能"改成"我自己决定这局往哪个流派走"。

### 设计
现状是纯随机（`game.js:705-710`：3 个 Boss 道具，每个内部再 `skillup`/`randomSkill` 随机）。改为**一次显式二选一**：

- 击杀 Boss → 进入 `STATE.BOSSREWARD`（复用 `STATE.LEVELUP` 的暂停/输入/绘制范式，`game.js:286,1617,1679,1735`）
- 两个候选：一个"已拥有技能的进化方向"（走 D1 combo 判定，优先给出会**点亮 combo** 的那条）、一个"新技能/道具"（保底非垃圾）
- 选择后走既有 `applySkill()`，前置校验（`skill.js:79-81`）与图鉴点亮逻辑完全复用
- 三选一/道具掉落路径**不动**（避免与 Loomy 的生存模式提案打架）

### 接入点
- 主循环分支：`js/game.js`（Boss 击杀结算处 + state 机 + 输入分发）
- 候选生成：`js/skill.js:38-68`（`generateSkillChoices` 已实现"未拥有优先、缺口补足"的确定性逻辑，改成取 2 即可）
- 呈现：`js/ui/`（新面板，可参照 `drawLevelUp`）

### 工作量 / 风险
- **工作量**：M。逻辑几乎全是复用，成本在**一个新 UI 面板 + 一条 state 分支 + 结算/复活路径回归**。
- **边界提醒**：本项要写 `js/ui/**`，而 codearts 当前被排除在 `js/ui/**` 之外，需主持人另行指派归属。
- **风险 1**：Boss 战结束瞬间插入面板，若与 Boss 死亡爆炸/粒子同帧，可能吞掉点击 —— 正是 P1「帮助面板吞掉菜单点击」的同族缺陷。**必须走既有 uidump + smoke「实证进对局」双验，不接受只看 exit 0**。
- **风险 2**：`skillup`/`randomSkill` 道具与 Boss 二选会同屏触发时的竞态（`applySkill` 已有上限钳制，但 toast/抽奖动画 `setGachaAnim` 会双开）——需要一条互斥规则。
- **测试缝**：用例锁「Boss 击杀 → state 进入 BOSSREWARD，候选数=2 且无重复」「面板存活期内点击不落到 HUD 区域」；`state:1` 冒烟四路径扩一条"打穿到 Boss 并选奖励"。

---

## 4. 提案 D4 —— 成就系统接入（构筑向）

**玩家动机一句话**：让"这局玩成了某个流派"这件事被永久记住。

### 设计
`ACHIEVEMENTS` 已有 `cond(view)` 函数式判定与 `bonusStardust` 发奖，**接入成本极低**，缺的只是"构筑视角的 view 字段"：

| 新成就 | 触发语义 | 现在能不能判定 |
|---|---|---|
| 流派初成 | 本局点亮任意一条 `SKILL_SYNERGIES` combo | ✗ 需新 view 字段 `run.comboFired` |
| 满配狂徒 | 本局同时有 ≥3 条技能达 `max` | △ 可由 `run.buildSnapshot` 算 |
| 全图鉴 | `discoveredSkills` / `discoveredPowerups` 全满 | ✓ 已有（`a_skills` 已存在，需核对口径） |
| 免复活通关 | `reviveUsed === false` 且通关难度 ≥ 上限档 | ✓ 字段已在 `view` |
| 道具猎手 | 单局集齐全部 tier | ✗ 依赖 D2 先落地 |

**关键实现点**：`checkAchievements(run)` 是局末一次性判定，所以 combo/流派类成就需要**局内事件记录**（`run.comboFired = Set`），这是 D4 唯一真正的增量成本。

### 接入点
- `js/config.js` `ACHIEVEMENTS` 扩表；`js/meta.js:502-526` 扩 `view`。
- 局内记录点：D1 的 combo 判定处顺带写入 `player._comboFired`（零额外遍历）。
- 面板：`getAchievementView()` 已给 def+achieved，UI 只需分组显示。

### 工作量 / 风险
- **工作量**：S（扩表）~ M（若要局内 `comboFired` 记录）。
- **风险**：成就奖励直接进 `bonusStardust`，会**绕过** `stardustPerScore` 经济曲线。`balance.test.mjs:111-116` 锁的是「2 万分产出 ≥20 且复活成本 ≤一局产出」。新增成就奖励前必须重算这条，否则元进度通胀。**建议每条新成就 ≤ 单局均值产出的 50%，且总成就奖励池设上限并入用例。**
- **测试缝**：守护用例遍历 `ACHIEVEMENTS` 断言「每条 `cond` 对空 view 不抛错」+「奖励总额 / midRun ≤ 阈值」。

---

## 5. 提案 D5 —— 跨局解锁目标

**玩家动机一句话**：给我一个"下一局要试的东西"，让关游戏之后还有理由回来。

### 设计（分两档，第二档建议**不做**）
- **档 A（推荐，便宜且低风险）**：**解锁"目标"而非"强度"**。用 12 条成就 + 5 条每日任务 + campaign 关卡进度拼一条可读的长线：`称号 / 涂装位 / 图鉴评价语 / 下一局挑战签`。数值零变化，纯元数据。
- **档 B（不推荐）**：用星尘**解锁技能池条目**（如"要先买天赋才会在三选一里出现 orbital"）。这会把 28 技能池收窄，直接和 D1 的 combo 完整性冲突（combo 缺一条腿就点不亮），并且制造"想玩流派必须先肝钱"的劝退墙。**明确列为负空间**。

### 接入点
档 A：`js/meta.js` `ACHIEVEMENTS`/`DAILY_QUESTS`/`getCampaignProgress`/`recordCampaignStageCompletion` 全部现成；`ensureQuests()`/`todayKey()` 已有每日轮换机制，跨局目标可直接复用其轮换骨架。UI 只需在现有成就/任务面板加分组。

### 工作量 / 风险
- **工作量**：档 A = S；档 B = L（且要重做平衡）。
- **风险**：档 A 的主要风险是"面板堆叠"——成就 12 + 任务 5 + 图鉴 28/15 + 商城 9 + 天赋 12 已经很多元。**若档 A 上线，应同步做一次面板合并（单一"目标"入口），否则是加负担不是加动机。**

---

## 6. Top3 推荐

| 排名 | 提案 | 一句话理由 | 属性 |
|---|---|---|---|
| **1** | **D1 技能协同/进化（只做 5 条命名 combo + 一张表）** | 乘算关系**代码里已经存在**（穿透×爆炸在 `game.js:715` 已可连锁、击退已与伤害乘算、天基已受距离驱动），我们只是把它命名、封顶、并在 HUD 说给玩家听。玩家感知增益最高，新机制接近零。 | **纯编排（便宜）** |
| **2** | **D2 道具稀有度分层（含倍率排除清单 + 保底）** | 一张 tier 表 + 一个计数器，掉落闸门不动所以不会碰 `POWERUP_DROP ≤100%` 那条锁。`randomSkill` 天然已是传说档，分层叙事免费成立。 | **纯编排（便宜）** |
| **3** | **D3 Boss 奖励二选一** | 唯一真正提升"构筑主权"的项，且候选生成/应用/图鉴/暂停范式**全部现成**（`generateSkillChoices` + `applySkill` + `STATE.LEVELUP`）。成本主要在新 UI 面板与面板吞点击回归风险。 | **半新机制（M）** |

**便宜 vs 贵的分界**：D1/D2/D4/档 A 是"编排 + 加表"，可在 1 个批次内完成并各自配守护用例；D3 需要一个新 state + 新面板（M）；D5 档 B 与任何"新增第 16 种道具/新增技能"都是 **L（贵）**，本提案不建议进入下一轮。

**建议的实施顺序**（若用户拍板走本轴）：`D1 表 + 2 条最便宜的 combo（c_chain/c_reaper）` → `D2 tier` → `D4 扩成就（含奖励通胀重算）` → `D3 面板` → 回头补 D1 其余 3 条。每一步都保持 `npm test` 全绿、默认路径零变化。

---

## 7. 负空间（明确不做）

1. **不做** 28 技能的全自动协同推荐/评分 —— 复杂度失控且会把"我的构筑"变成"系统的最优解"。
2. **不做** `bulletSpeed × orbital` 的协同宣称（实测为**减益**，见 `js/bullet.js:352`）。
3. **不做** 新增计时 buff 类型；一切时长走 `POWERUP_DURATION` 单源表（v0.5.2 已闭环，守护用例会在漏改时直接报错）。
4. **不做** 对 `madHunt/xppack/freeze` 的稀有版倍率（madHunt 时长刚在 v0.5.0 被砍，不能从后门加回去）。
5. **不做** 星尘解锁技能池条目（D5 档 B）。
6. **不承诺** 任何留存/时长提升百分比（承接 `docs/design-research.md:15,87` 的诚实约束）。
7. **不动** `POWERUP_DROP.base` 闸门与 `chainDamageMultiplier` 刹车 —— 被 `balance.test.mjs` 锁着，且是数值雪崩的唯一防线。

---

## 8. 与另两路的接口（避免打架）

- **Loomy（模式轴）**：D3 的 Boss 二选一若上线，与「生存模式（无升级三选一）」直接冲突 —— 生存模式的前提就是没有选择权。拍板时需**互斥声明**：生存模式禁用 BOSSREWARD state，回落到现有随机掉落。突变词条模式则与本轴 D1/D2 天然兼容（词条可以就是"combo 门槛降低"）。
- **codearts（Boss Rush 原型）**：Boss Rush = 连续 Boss 战。若 D3 落地，Boss Rush 会**每轮插入一次选择面板**，节奏可能被打断。建议接口约定：原型与 D3 都通过同一个"Boss 击杀后结算钩子"挂载，谁先落地谁定义钩子签名。另外 D3 需要 `js/ui/**`，而 codearts 本批不碰 `js/ui/**`，不冲突。

---

## 9. 互斥与负空间声明（终裁）

1. **稀有倍率排除清单**：`madHunt / xppack / freeze` 永不参与 D2 稀有版倍率（madHunt 时长刚在 v0.5.0 被砍，不能从后门加回去；xppack 语义是「直接 +1 级」，倍率无意义）。
2. **`bulletSpeed × orbital` 为减益**：实测末速按飞行距离 clamp（`js/bullet.js:352-354`），该组合不得作为协同推荐（对应第 7 节负空间第 2 条）。
3. **D5 档 B 不做**：星尘解锁技能池条目明确列为负空间；另 **D3 与生存模式互斥**（生存模式禁用 `BOSSREWARD`，见第 8 节）。
