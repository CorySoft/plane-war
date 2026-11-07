# plane_war 数值改版提案

- 起草：codearts（现状盘点人）
- 依据：`docs/design-current-state.md`（本人数值全盘点）、`docs/design-levels-editor.md`（Codebuddy，schema 与 `scoreAxis`）、`docs/design-research.md`（Copilot，三轴难度 / DPS-TTK）
- 状态：**批 1~3 已实施并随 v0.3.7 受控上线**（2026-11-07）；批 4（经济 / 数值孤岛）与 P-A（关卡数据地基）待排期。本文为提案底稿，落地值以代码与新增回归测试为准。
- 实施记录：`SCORE_AXIS` 七段表 + `levelFromScore` 落在 `js/config.js`；敌机开火乘数钳正在 `js/enemy.js`；`getDifficultyLevel` 已从 `game.js` 移除读取点。新增 `test/score-axis.test.mjs` / `test/aircraft-balance.test.mjs` / `test/weapon-quota.test.mjs` 共 16 项回归（300→316）。
- 用户已定：三个已证实缺陷**并入数值改版**统一处理，生产 0.3.6 暂时带缺陷运行。

---

## 〇、设计原则与硬护栏

改版必须同时满足以下护栏（来自现有 300 项测试，违反会直接红灯）：

| 护栏 | 位置 | 对本提案的约束 |
|---|---|---|
| 默认射速精确 = 0.56s | `config.test.mjs:137` | 不改 `calcFireRate` 公式系数，只做字段真源化 |
| power4+rate6 = 0.2288s | `config.test.mjs:138-139` | 同上 |
| `ENEMY_LEVEL.maxLevel > 30` | `config.test.mjs:94` | **不能把 maxLevel 降到 18**；只能让 `scoreAxis` 实际封顶 |
| 20 级经验需求 < 12,000 | `balance.test.mjs:146` | 新 XP 曲线必须满足（当前 11,723 已逼近上限） |
| `waveCap <= 20`、`screenCap ∈ [waveCap×4, 200]` | `balance.test.mjs:51-55` | 弹道配额调整不得突破 |
| 满级生成率 > `spawnCap` | `balance.test.mjs:28` | 不改 `DIFFICULTY.maxLevel=14` |
| 难度封顶时敌方等级 >= 5 | `balance.test.mjs:40` | 新 axis 必须满足 |
| 商城全满 <= 120 个中期局 | `balance.test.mjs:138` | 经济方案不得加价 |

**口径更正**：`design-current-state.md` 写「商店满级需 ~284 局」是按**早期一局 2 万分 ≈50 星尘**算的；按测试口径「中期一局 6 万分 ≈150 星尘」是 **95 局**（14,198/150），已在护栏内。所以经济不是紧急项，本提案只做新手保底。

---

## 一、必含验收项（三个已证实缺陷）

### A. 敌机开火乘数钳正

| 项 | 内容 |
|---|---|
| 问题 | `enemy.js:81` 的 `1 + scale × (-0.03)`；E>34（scale>33.3）后为负 → 新敌机首射冷却 ≤0，出生即开火 |
| 新数值 | 新增 `ENEMY_LEVEL.fireCdMinMul = 0.25`；`fireMul = max(fireCdMinMul, 1 + scale × fireCdPerLevel)` |
| 生效区间 | E<=25 行为**完全不变**；E 26~33 由 0.25→0.04 被钳在 0.25；E>=34 不再为负 |
| 预期体验 | 超后期不再出现「敌机秒射」；高等级首射间隔最多压到基础的 25%（4 倍射速），仍可读 |
| 回归风险 | 低。仅影响 E>=26（约 15 万分以上）；`enemy.test.mjs:83` 的 `fireCd > 0` 断言反而被加固 |
| 依赖 | **纯 `config.js` + `enemy.js` 一处，可独立上线** |
| 验收 | 新增测试遍历 E=1..99：`fireMul >= 0.25` 且 `spawnEnemy(..., E).fireCd > 0` |

> 与 C 的关系：C 把实际 E 封顶 18 后，A 在线上几乎不触发；保留 A 作为**防御性钳制**，防止未来调高上限时回归。

### B. 飞机 `fireRate` 语义与文案对齐

| 项 | 内容 |
|---|---|
| 问题 | `player.js:24` 把 `aircraft.fireRate` 乘进**射击间隔**（越大越慢）；但 blaze 标「高射速」却是 `1.3`（最慢），ironwall 标「高血量」却是 `0.8`（最快） |
| 选择 | **改数值迁就语义**（不选改文案，也不选改实现） |
| 理由 | ① 文案是对 500 星尘付费玩家的承诺，改文案等于摧毁机型定位；② 改实现（`fireRateMul /= fireRate`）会让「飞机字段=射速倍率」与「天赋/商店字段=间隔倍率」语义分裂，后续必踩坑；③ 只改 6 个数字，改动面最小、无结构性风险 |
| 新数值 | 见下表 |

| 机型 | 旧 fireRate | 新 fireRate | 旧 baseDmg | 新 baseDmg | 相对 DPS（旧→新，falcon=1） | 定位 |
|---|---|---|---|---|---|---|
| falcon | 1.0 | 1.0 | 1.0 | 1.0 | 1.00 → 1.00 | 均衡 |
| blaze | 1.3 | **0.80** | 0.8 | **0.70** | 0.615 → **0.875** | 高射速低伤 |
| ironwall | 0.8 | **1.20** | 1.2 | **1.35** | 1.500 → **1.125** | 重甲慢射高伤 |
| phantom | 1.1 | 1.00 | 0.9 | 0.90 | 0.818 → 0.900 | 高机动 |
| thor | 1.0 | 1.0 | 0.7 | 0.7 | 0.700 → 0.700 | 爆炸 |
| void | 1.0 | 1.0 | 1.0 | 1.0 | 1.000 → 1.000 | 穿透 |

- 修复后旧表的两个极端（blaze 0.615 最弱、ironwall 1.5 最强）收拢到 **0.70~1.125**，且顺序与描述一致。
- 预期体验：blaze 从「花钱买弱化」变成名副其实的高射速；ironwall 从「隐藏最强」回落到重甲定位。
- 回归风险：**中**。老玩家手感变化明显，需在更新日志声明「机型数值调整，不返还星尘」；现有测试**无** `aircraft.fireRate` 硬断言，不会红灯。
- 依赖：**纯 `config.js`（META.aircraft），可独立上线**。
- 验收：新增测试断言「blaze 的 fireRate < falcon < ironwall」且「相对 DPS 落在 0.7~1.15」。

### C. 双难度曲线收敛（scoreAxis）

| 项 | 内容 |
|---|---|
| 问题 | 玩家难度 `min(14, 1+score/4500)` 在 58,500 分封顶；敌方等级 `min(99, 1+score/6000)` 可到 588,000 分 → 后期完全脱钩 |
| 新结构 | 新增 `SCORE_AXIS`（数组）与 `levelFromScore(axis, score)`；`game.js:422-433` 改读它。字段名/结构**与 `docs/design-levels-editor.md` 的 `difficulty.scoreAxis` 完全一致**（`{at, playerLevel, enemyLevel}`，两条序列单调不减、长度一致） |

建议分段（分数为累计得分）：

| at | playerLevel | enemyLevel | 说明 |
|---|---|---|---|
| 0 | 1 | 1 | 起步 |
| 8,000 | 3 | 3 | 首个 Boss 前 |
| 20,000 | 6 | 6 | 第一次 Boss（L=5）后 |
| 35,000 | 10 | 11 | 第二次 Boss（L=10） |
| 58,500 | 14 | 14 | 玩家难度封顶 |
| 100,000 | 14 | 16 | 敌方专属延伸（+2） |
| 180,000 | 14 | 18 | **终点**（+4，且不再增长） |

- 解析用分段线性 + `floor`，并钳制 `playerLevel <= DIFFICULTY.maxLevel`、`enemyLevel <= ENEMY_LEVEL.maxLevel`。
- **差值上限 +4**，既保留「后期敌人仍加压」，又不会重演脱钩。
- E 封顶 18 → `scale=17` → 开火乘数 `1-0.51=0.49 > 0`，与 A 呼应。
- 预期体验：后期不再「敌人无限变强、玩家原地踏步」；180,000 分后进入稳定终点局。
- 回归风险：**中**。`wave.test.mjs` 仍测旧 `getDifficultyLevel`（保留为 fallback，不删）；`balance.test.mjs:40` 用新 axis 在 58,500 分处 E=14 >= 5 ✅。
- 依赖：`config.js` + `game.js`，**可独立上线，不必等关卡系统**；后续 `level.js` 直接复用同一个 `levelFromScore`，不各造一套。
- 验收：新增测试断言 axis 单调不减、长度一致、任意 score 下 `enemyLevel - playerLevel <= 4`、`playerLevel <= 14`。

---

## 二、其余短板逐项处理

### D. 经验曲线中期断崖

| 项 | 内容 |
|---|---|
| 问题 | `XP_GROWTH=1.32`，20 级需 11,723、30 级需 188,276，而经验来源只随敌方等级**线性**增长 |
| 新数值 | `XP_GROWTH: 1.32 → 1.28`（`XP_BASE=60` 不变） |
| 新曲线 | 10 级 553（原 730）、20 级 **6,533**（原 11,723）、30 级 77,133（原 188,276） |
| 预期体验 | 20 级从「后期断崖」变成中期目标；30 级仍属长线，但不至于遥不可及 |
| 回归风险 | **低**。`balance.test.mjs:146` 要求 need(20) < 12,000，新值 6,540 ✅；单调递增 ✅；系数仍 < 1.4 ✅ |
| 依赖 | 纯 `config.js`，可独立上线 |
| 注意 | build 成型会提前，需与 C（敌方封顶 18）配套观察；若升级过快，回调到 1.30 |

### E. `waveCap` 主副武器挤占

| 项 | 内容 |
|---|---|
| 问题 | 满配单波 16 发中主弹只剩 4 发（`player.js:347-349` 的 `reserve` 被副武器 8 对占满），主武器成长被稀释 |
| 新规则 | `sideCap = min(sidePairs.length×2, floor(cap×0.5))`；`mainCap = max(channels.length, cap - sideCap)` |
| 效果 | cap=16、4 通道、8 对副武器时：主弹 4→**8**（每通道 2 发），副武器 12→8；总弹数仍 16 |
| 预期体验 | 主弹伤害占比 44/228→88/272，玩家能感知「主武器在成长」；副武器仍保留 50% 配额 |
| 回归风险 | **中**。`player.test.mjs` 只断言 `<= waveCap`，仍通过；但总伤害 +约 13%，需 bench 复核 DPS 段位 |
| 依赖 | `player.js`，**单独一批**（非纯 config） |
| 验证 | 现有 `player.test.mjs` + `balance.test.mjs`（左右护法伤害）+ `tools/perf/bench.mjs` |

### F. madHunt 与常规量级关系（结论：不改，列观察项）

| 项 | 内容 |
|---|---|
| 复算 | 单波 140 发 / 3300 伤，但 `screenCap` 限速到 0.8 波/秒 → **实际 DPS ≈2,640**；常规满配暴击 **≈3,508** |
| 结论 | madHunt **名义数量 14 倍，实际 DPS 反而略低于常规满配**，不存在「量级失控」 |
| 处理 | **本轮不改数字**。在关卡批用 TTK 指标复核后再决定是否改为「少发高频」（如单波 70 发、触发频率提高） |
| 依赖 | 需 Copilot 的 TTK/DPS 指标体系与实测，**列曲线重做批之后的观察项** |

> 这是对 `design-current-state.md` 第 6 条短板的修正：问题不是「太强」，而是「数量与手感不匹配」。诚实记录，避免凭数量误削。

### G. 经济（只做新手保底）

| 项 | 内容 |
|---|---|
| 问题 | 早期一局收益低，新号遇到 0 星尘局；但按中期口径商城全满仅 95 局，总量并不离谱 |
| 新规则 | `earnStardust` 产出改为 `max(floor(score/stardustPerScore), 10)`（`meta.js:220`） |
| 预期体验 | 新手每局至少 10 星尘，首件 150 的成本从「4 局」降到「最多 15 局内必然」；老玩家无感 |
| 回归风险 | 低。`balance.test.mjs:108-110` 仍通过（2 万分为 50，保底只在低分局兜底） |
| 依赖 | `meta.js`，单独一批；**可独立上线** |

### H. 数值孤岛与注释清理（零平衡影响）

| 项 | 改动 | 风险 |
|---|---|---|
| `BULLET.baseDmg`（0 引用） | `player.js:269` 的硬编码 `1` 改为 `BULLET.baseDmg`（值 1，行为等价） | 低 |
| `PLAYER_BASE.fireInterval=0.16`（无人读） | 值改为 `0.56`，`calcFireRate` 读它替代字面量；测试断言 0.56 仍通过 | 低 |
| `ORBIT_GROW_INTERVAL/ORBIT_MAX_BASE` 误导注释 | 删除「无技能每 30s 增长」注释与死常量；保留「无 guard 不生成」的正确行为 | 低 |
| `power` 上限硬编码 4 | 新增 `BULLET.maxPower = 4`，`powerup.js:83` 引用 | 低 |
| `critMulti` 注释 2.5 | 注释改为 1.5（与 `config.js:72` 一致） | 零 |
| `game.js:428` 注释「8000/上限 30」 | 改为指向 `scoreAxis`（C 落地后） | 零 |

---

## 三、依赖矩阵

| 项 | 改动文件 | 纯 config | 依赖关卡数据化 | 建议批次 |
|---|---|---|---|---|
| A 开火钳正 | `config.js`、`enemy.js` | 否（含 enemy.js 一行） | 否 | 止血批 |
| B 飞机语义 | `config.js` | **是** | 否 | 曲线批 |
| C scoreAxis | `config.js`、`game.js` | 否 | **否**（字段与 schema 对齐，但不依赖它上线） | 止血批 |
| D 经验曲线 | `config.js` | **是** | 否 | 曲线批 |
| E 主副配额 | `player.js` | 否 | 否 | 武器批 |
| F madHunt | `player.js`/`config.js`（未定） | 否 | 是（需 TTK 实测） | 关卡后观察 |
| G 经济保底 | `meta.js` | 否 | 否 | 经济批 |
| H 孤岛清理 | `config.js`、`player.js`、`powerup.js` | 部分 | 否 | 清理批 |

**与 Copilot 关卡包的对齐点**（合并时校验）：

1. `scoreAxis` 字段名与结构：`{at, playerLevel, enemyLevel}`，两条序列单调不减、长度一致。
2. `levelFromScore(axis, score)` 作为**唯一解析函数**；关卡文件里的 `difficulty.scoreAxis` 直接传入，不另写一套。
3. 敌方等级上限 18、玩家 14；差值 <= 4（加载期与运行期双重校验）。
4. `enemyLevel` 的消费点统一为 `spawnEnemy`/`updateWaves`/`spawnBoss` 的入参，关卡 runner 接管时不得绕过。
5. 敌弹密度上限（Copilot 红线）与本包的 `screenCap` 概念分开：友方 140 不变，敌方新增独立预算。

---

## 四、分批序列与验证

### 批 1：数值止血（可独立上线，风险低）

- 内容：A 开火钳正、C scoreAxis 常量 + `game.js` 读取、H 的注释类修正
- 预期收益：消除负冷却、消除双曲线脱钩
- 验证：
  - 现有 300 项全过（`wave.test.mjs` 旧函数保留）
  - 新增 `test/score-axis.test.mjs`：单调性、长度一致、差值 <= 4、边界分数（0 / 58,500 / 180,000 / 1e9）
  - 新增敌机用例：E=1..99 的 `fireMul > 0`
  - `node tools/dev/smoke.mjs` 冒烟

### 批 2：曲线与机型（手感变化可感知）

- 内容：B 飞机语义 + 配套 baseDmg、D 经验曲线
- 验证：
  - `balance.test.mjs` 全过（need(20)=6,533 < 12,000）
  - 新增测试：`fireRate(blaze) < fireRate(falcon) < fireRate(ironwall)`、相对 DPS 在 0.7~1.15
  - 更新日志需写明「机型数值调整」

### 批 3：武器配额

- 内容：E 主副武器 50/50
- 验证：
  - `player.test.mjs`、`balance.test.mjs` 全过
  - `node --expose-gc tools/perf/bench.mjs`：确认单波伤害与帧耗时未超基线
  - 新增测试：cap=16、4 通道时主弹数 = 8

### 批 4：经济与清理

- 内容：G 星尘保底、H 剩余项（`baseDmg` 真源、`fireInterval`、`maxPower`）
- 验证：
  - `meta.test.mjs`、`balance.test.mjs` 全过
  - 新增测试：0 分局仍得 10 星尘；`calcFireRate` 默认仍为 0.56
  - `node tools/dev/smoke.mjs`

### 批 5：与关卡系统合流（等 Copilot P-A/P-B）

- 内容：F madHunt 复核、scoreAxis 迁入 `stage.schema.json`、敌弹密度预算
- 验证：关卡 runner 接管后，`levelFromScore` 行为与批 1 一致（同一组用例双跑）

---

## 五、需要拍板的分歧点

1. **B 的实现方式**：本提案选「改数值迁就语义」。若更看重 blaze 现有的低 DPS 手感，可改为「改实现把 `fireRate` 解释为射速倍率」——但那会让飞机与天赋/商店的倍率语义分裂，不推荐。
2. **C 的敌方上限**：本提案封顶 **18**（彻底避开负乘数）。若希望保留「无限变强」的超长期目标，可保留 99 仅靠 A 钳制，但后期会明显变硬、且 A 的 0.25 下限会被频繁触发。
3. **D 的系数**：1.28（本提案，保守）vs 1.25（升级更快、build 成型更早）。
4. **G 是否值得动 `meta.js`**：若认为新手保底不是问题，可整批跳过，只保留 C/A 的止血。

---

## 附：验证命令

```bash
cd plane_war
npm test                              # 现有 300 项
node tools/dev/smoke.mjs              # 真机冒烟
node --expose-gc tools/perf/bench.mjs # 帧耗时 / 分配基线
```