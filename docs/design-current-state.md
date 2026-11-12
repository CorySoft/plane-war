# plane_war 现状数值全盘点（设计讨论地基）

- 首次盘点：2026-11-07
- **最近复核：2026-11-12 @ HEAD `12aec58`**（含 `85740c5` 技能修复、`3557386` 单一真源、`12aec58` regen/nova/文案重档三批 `js/` 改动）
- 范围：`js/config.js`、`js/enemy.js`、`js/wave.js`、`js/bullet.js`、`js/powerup.js`、`js/player.js`、`js/skill.js`、`js/game.js`、`js/meta.js`、`js/level/*`、`assets/levels/*.json`
- 方法：**行号由 probe 字符串逐条重定位**（不是按上版偏移推），每条锚点都在 `12aec58` 上验证过实际内容；`config.js` 内部因新增注释行整体下移，旧版全部行号已作废
- 标注约定：**「推算」**= 按代码公式手算、非运行时采样；其余数字均为代码字面量
- 本版同时**撤回若干旧论断**（原文里写错、后被代码改掉的），逐条列在文末「附 A / 附 B」，不做悄悄改写

> 本文只陈述代码事实与推导，不做业界对标。业界方案见 `docs/design-research.md`，关卡/弹幕专题见 `docs/design-levels-editor.md`。

---

## 一、玩家侧数值

### 1.1 基础属性

| 参数 | 值 | 位置 | 设计意图 / 推测 |
|---|---|---|---|
| 移动速度 | 6.2 | `config.js:45` | 基准 6.2 px/帧；实际 `× (1 + 0.12×move) × (speed buff ? 1.5 : 1)`（`js/player.js:105-107`） |
| 碰撞半径（渲染/逻辑） | 18 | `config.js:46` | 机身尺寸参考 |
| **受击判定半径** | **20** | `config.js:523` | 比机身略宽，便于「贴身擦弹」；与 18 并存（`PLAYER_BASE.radius` vs `PLAYER.hitRadius`），属近似重复定义，见第十节 11 |
| 机体宽/高 | 44 / 52 | `config.js:47-48` | 贴图与枪口锚点基准 |
| 基础射击间隔 | **0.56** | `config.js:49` | `PLAYER_BASE.fireInterval`，**就是 `calcFireRate` 读的那一个**（`config.js:172`），不是孤岛 —— 旧版此处写「0.16 且无人读取」是错的，见附 A-1 |
| 受伤无敌时间 | 2.2s | `config.js:50` | 与死亡慢动作 `deathTimer`（`game.js:146`）配合，避免「死了还被打」；也是再生不变量右边的分母（见 7.1 `regen`） |
| 护盾上限 | 3 | `config.js:51` | 可叠天赋 +1、商店 +2 → 最高 6 |
| 起始生命 | 3 | `config.js:52` | 各机型可覆盖（2~5，`config.js:536-541`） |
| 初始火力等级 | 1 | `js/player.js:72` | 天赋「起始武器等级+1」可 +1 |
| 火力等级硬上限 | 4 | `powerup.js:79` | `Math.min(PLAYER.maxPower, …)`；上限值本身已单一真源到 `config.js:524 maxPower: 4`（旧版写「硬编码 4、未读配置」，见附 A-2） |
| 火力道具持续 | 15s | `config.js:238` | 取值点 `powerup.js:80`；到期回落 1 级（`js/player.js:148-151`） |
| 升级回血 | +1 生命 | `game.js:1246` | 每次升级必回 1；无可选技能时改为 +1 生命 +1 护盾（`game.js:1249-1251`） |

### 1.2 射击间隔真源 `calcFireRate`

位置 `config.js:167-181`：

```
普通：(PLAYER_BASE.fireInterval - (power-1)×0.04) × (1 - 0.08×rate) × fireRateMul   // :170
急速：0.055 × fireRateMul                                                            // :167
疯狂追击：0.045 × fireRateMul                                                        // :168
过载核心：fr /= 1 + (1-hpRatio)×0.18×overload（仅常规路径）                            // :173-178
```

| 状态 | 间隔 | 推导 |
|---|---|---|
| 1 级、无技能 | 0.56s | ≈1.79 波/秒 |
| power=4、rate=6 | 0.2288s | (0.56-0.12)×0.52 |
| 再叠天赋 0.9 + 商店 0.8 | 0.1647s | ×0.72 |
| 急速射击 | 0.055s | 固定值，不看 power/rate |
| 疯狂追击 | 0.045s | 固定值，同上 |

**再射闸门** `refireGateDistance`（`config.js:154-159`）：`min(250, max(20, 3×60×fireRate))`。射速越快波间距越小，下限 20px 防抖。
⚠ 口径：`maxRange` 与再射闸门都以子弹的 `traveled` 为尺度，而 `traveled` 是**弧长**（`bullet.js:389` 逐帧 `hypot` 累加）。追踪弹因此会比直线弹更早触顶，实测提前量 ≤14%（见 7.1 `homing` 与 `docs/perf-baseline.md` 7.5）。

### 1.3 输出能力（推算）

| 阶段 | 假设 | 单波子弹 | 单波伤害 | DPS（推算） |
|---|---|---|---|---|
| 开局 | dmg=0、power=1 | 1 | 1 | **1.79** |
| 中期 | dmg=10、rate=6、power=4、无 volley/scatter/副武器 | 4（主弹×4 通道） | 44 | **192** |
| 满常规 | dmg=10、rate=6、power=4、volley6、scatter6、dual4、side4 | 16（受 `waveCap`） | ≈228 | **≈996** |
| 满常规+暴击 | 再叠 crit6（72%）+critdmg6（×4.5） | 16 | 期望 ×3.52 | **≈3506** |
| 疯狂追击（1b 封顶后） | dmg=10、scatter6、volley6 | **48**（原生 140 被 `madHuntWaveCap` 跨采样截断） | **≈1,130**（按 48/140 等比，弹种比例不变） | 见下方注 |

> 推算口径：单目标全命中、无天赋/商店/飞机加成、不含爆炸/分裂/穿透的额外命中；暴击期望倍率 `0.28×1 + 0.72×4.5 = 3.52`（基础倍率 1.5 + critdmg6×0.5 = 4.5，`bullet.js:124-127`）。
> 伤害基数唯一来源已收敛到 `calcPlayerBaseDmg(player) = round((BULLET.baseDmg + dmgLv + talentDmg) × baseDmgMul)`（`js/player.js:291-293`），`getShootPattern`（`js/player.js:301`）与 nova（`game.js:1227`）共用同一函数。
> 满常规单波 16 发中，主弹只占 4 发，其余被 dual/sideBullets 挤占（`js/player.js:390-394` 的 `sideCap/mainCap` 计算）——这是「副武器先占额度」策略的直接后果。
> madHunt 一行的吞吐**不给单一数**：封顶前 `docs/perf-baseline.md` 第三节实测 0.8 波/秒（140 发/波），封顶后 `config.js:69-72` 的注释记「满配 5s 仅 ~13 波、峰值友方弹钉在 140，48 使吞吐降约 13~32%」；两个口径（单波伤害 vs 吞吐）不可混用，实测复算排在 `docs/perf-baseline.md` 待办。

### 1.4 护体弹（guard）

| 参数 | 值 | 位置 |
|---|---|---|
| 轨道半径 | 46px | `js/player.js:187` |
| 角速度 | 2.2 rad/s | `js/player.js:188` |
| 击毁后重生 | 2.5s，每级 -0.24s，下限 1.3s | `js/player.js:189`、`js/player.js:265` |
| 无技能增长间隔 | 30s（**永不生效**，见第九节） | `js/player.js:190` |
| 每级缩短 | -4s，下限 4s | `js/player.js:233` |
| 数量上限 | `(guard>0?1:0) + guard×1` → 1 级 2 颗、满级 6 颗 | `js/player.js:224` |
| 单颗伤害 | `max(2, round(power) + round(dmgLv×0.5))` | `js/player.js:197-201` |

---

## 二、子弹与武器数值

### 2.1 `BULLET` 配置（`config.js:56-124`）

| 参数 | 值 | 位置 | 消费点 / 意图 |
|---|---|---|---|
| baseSpeed | 3 | :57 | 玩家主弹初速，60fps 下 180px/s |
| baseRange | 250 | :58 | 起始射程 10m（1m=25px） |
| rangePerLevel | 50 | :59 | 射程技能每级 +2m |
| levelRangePerLevel | 2.5 | :60 | 玩家每级 +0.1m（线性） |
| rangeCapMargin | 80 | :61 | 射程上限 = 屏高 + 80 |
| refireDist | 250 | :62 | 再射闸门上限 10m |
| waveCap | **16** | :66 | 单波子弹总量上限（副武器与主弹共享） |
| madHuntWaveCap | **48** | :73 | 疯狂追击单波原生 140 → 均匀跨采样截断到 48（1b 封顶，代码 `js/player.js:327-336`，实测 `tools/perf/madhunt-cap-probe.mjs`） |
| screenCap | **140** | :74 | **单轮发射闸**：`friendlyCount + patterns.length <= 140` 才发整波（`game.js:405`）。注释已明确它**不是同屏硬上限**：分裂碎片走 `spawnSplitBurst → spawnSplitBullet → pushBullet`（`bullet.js:224-235`、`:185-207`）不经过此闸 |
| hostileScreenCap / hostileSpawnRateCap | 140 / 140 | :75,:76 | 敌弹同屏与每秒发射上限（整组原子准入，`bullet.js:298-307`） |
| baseRadius / critRadius | 4 / 5.5 | :79,:80 | 弹体判定半径 |
| **baseDmg** | **1** | :81 | **有消费点**：`js/player.js:293` 的 `calcPlayerBaseDmg` 是玩家伤害唯一来源 —— 旧版列为「全仓引用 0 次的数值孤岛」是错的，见附 A-1 |
| critChance | 0.12 | :82 | 每级暴击率 |
| critMulti | 1.5 | :83 | 实现为 `1.5 + 0.5×critdmg + 0.5×buff`（`bullet.js:124-127`），满级 = 4.5；旧注释曾写「基础 2.5」，与代码不符（第九节漂移表） |
| knockbackPerLevel | 0.30 | :85 | 击退力 = 伤害 × 0.3/级 |
| splitDmgRatio | 0.30 | :87 | 分裂碎片伤害比例（满级 6 片，降权防爆量） |
| splitCountPerLevel | 1 | :88 | 分裂片数 = 1 + lv（满级 6） |
| splitFragBaseRange | 25 | :91 | 碎片基础射程 1m |
| splitFragRangePerLevel | 60 | :92 | 分裂距离技能每级 +60px |
| volleyAngleGap | 0.04 | :94 | 连射角间距 |
| scatterSpread | 0.06 | :95 | 散射角间距 |
| explosionBaseRadius | 40 | :96 | 爆炸基础半径 |
| explosionRadiusPerLevel | 12 | :97 | 冲击扩域每级 +12px |
| explosionBaseChance | 0.10 | :99 | 爆炸基础触发率 |
| explosionChancePerLevel | 0.10 | :100 | 爆破掌握每级 +10% |
| explosionBaseDmgRatio | 0.45 | :102 | 爆炸伤害比例 |
| explosionDmgRatioPerLevel | 0.15 | :103 | 爆裂强化每级 +15% |
| explosionMaxRadius | 250 | :105 | AOE 半径硬上限 |
| explosionMaxChainDepth | 2 | :106 | 连锁爆炸深度 |
| explosionParticlesPerHit | 8 | :107 | 每次爆炸粒子数 |
| fxRingsCap / fxBlastsCap | 48 / 24 | :108,:111 | 特效池上限 |
| orbitalAccel / PerLevel / MaxSpeed | 0.035 / 0.015 / 22 | :113-115 | 天基武器出膛加速 |
| chainRange / **chainDecay** | 170 / **0.7** | :116,:117 | 闪电链半径与每跳衰减；`chainDecay` 现为爆炸连锁与闪电链**共用**的单一真源（`game.js:899` `chainDamageMultiplier` 读它） |
| novaBaseRadius / PerLevel | 120 / 40 | :118,:119 | 新星环半径 3 级 = 200 |
| novaDmgMulBase / novaDmgMulPerLevel | 2 / 1 | :122,:123 | **乘数**而非平值：伤害 = `round(calcPlayerBaseDmg × (2 + (lvl-1)))`（`game.js:1226-1227`），旧名 `novaBaseDmg`/`novaDmgPerLevel` 已在 `21cecd8` 改为现名（改名前此行锚点为 :120,:121），旧版「2→4 平值」已在 `12aec58` 改为随主弹成长 |

### 2.2 敌方子弹

| 参数 | 值 | 位置 |
|---|---|---|
| 普通敌弹速度 | `(3 + rand(0,1.5)) × enemyFireScale` | `bullet.js:319` |
| 普通敌弹半径 / 射程 / 寿命 | 5 / 600 / 6s | `bullet.js:320-322` |
| 激光弹速度 | `(8.5 + rand(0,1.2)) × enemyFireScale` | `bullet.js:332` |
| 激光弹（三发平行） | 半径 3.5、射程 720、寿命 2.4s、间距 11px | `bullet.js:335-341` |
| 分裂碎片数量上限 | 12 | `bullet.js:226` |
| 分裂扇形张角 | `min(1.2, n×0.2)` rad（±34°） | `bullet.js:228` |
| 碎片半径 | `max(2, parentR×0.45)` | `bullet.js:192` |

### 2.3 疯狂追击与常规模式的关系

- 常规：`waveCap=16` 限制单波总量（`js/player.js:390-394` 分配给主弹道与副武器），`screenCap=140` 是整波发射闸（`game.js:405`）。
- 疯狂追击：不走 `waveCap`，原生单波 = `(8 + scatter×2) × (1 + volley)`；满技能原生 **140**，现被 `BULLET.madHuntWaveCap=48` 以**等步长跨采样**截断（`js/player.js:327-336`），保留 360° 角度覆盖、只削单波数量。
- 伤害权重：madHunt 主弹 `×3`、连射 `×2`（`js/player.js:315`、`:320`），而常规主弹 `×1`、散射 `×0.5`、连射 `×0.6`（`js/player.js:357-358`、`:404`）。
- 结论：madHunt 仍是数量与伤害双高的爆发道具，但 1b 封顶后「单波 140 发」这个量级已不存在；`POWERUP_DURATION.madHunt` 也已从 8s 收到 **5s**（`config.js:239`）。

---

## 三、敌机数值

### 3.1 六种敌机（`config.js:207-214`）

| 类型 | 半径 | HP | 得分 | 经验 | 速度 | 开火间隔配置 | 特殊 |
|---|---|---|---|---|---|---|---|
| small | 16 | 1 | 100 | 8 | 2.4 | **[1.4, 2.0]** | 基础型（旧版写 [4,6]，已实改为快射型） |
| mid | 24 | 3 | 300 | 20 | 1.6 | [3.2, 3.2] | 中型 |
| big | 36 | 8 | 800 | 45 | 1.0 | [2.2, 2.2] | 高血量 |
| laser | 22 | 4 | 400 | 25 | 1.4 | [2.5, 3.5] | 三发平行激光（复射另走 `rand(2.4,3.6)`，见第九节） |
| shield | 28 | 6 | 500 | 30 | 1.2 | [3, 4] | 护盾 3 层 |
| split | 20 | 3 | 250 | 15 | 1.8 | [3.5, 5] | 死亡分裂 2 子代 |

### 3.2 敌机成长公式（`enemy.js:57-95`）

| 项 | 公式 | 位置 |
|---|---|---|
| 敌方等级成长系数 | `scale = enemyLevelScale(E)`：`(min(E,30)-1) + max(0,E-30)×0.5` | `config.js:142-147`，键值 `config.js:133-134` |
| HP | `max(1, round(cfg.hp × hpScale × (1 + scale×0.10)))` | `enemy.js:68,:70` |
| 得分/经验 | `cfg.score × (1 + scale×0.10)` | `enemy.js:69,:77-78` |
| 下落速度 | `cfg.speed × speedScale × rand(0.8,1.25) × (1 + 玩家难度等级×0.045)` | `enemy.js:83` |
| 初始开火冷却 | `rand(cfg.fireCd) × fireCdScale × fireMul`，`fireMul = max(0.25, 1 + scale×(-0.03))` | `enemy.js:87-89` |
| 复射间隔 | 与首射同源：读表 + `fireCdScale` + `e.fireMul` | `enemy.js:203-204` |
| 护盾层数 | 固定 3 | `enemy.js:93` |
| 分裂子代数 | 固定 2 | `enemy.js:94` |
| 激光首发延迟 | `rand(1,2)` s | `enemy.js:95` |

> `fireCdMinMul = 0.25`（`config.js:130`）把乘数钳在正区间：旧版「E≈34 后开火乘数变负、出生即开火」这条断点**已不成立**，且运行时敌方等级根本到不了 34（见 3.3）。

### 3.3 玩家难度等级与敌方等级：**已合并为同一张得分轴**

单一真源 `SCORE_AXIS` + `levelFromScore`（`config.js:439-447`、`config.js:454-465`），消费点 `game.js:481-482`：

| at（累计分） | playerLevel | enemyLevel |
|---|---|---|
| 0 | 1 | 1 |
| 8,000 | 3 | 3 |
| 20,000 | 6 | 6 |
| 35,000 | 10 | 11 |
| 58,500 | **14** | 14 |
| 100,000 | 14 | 16 |
| 180,000 | 14 | **18** |

- 表头注释（`config.js:436-438`）明写设计意图：**消除「玩家 58,500 分封顶 14、敌方涨到 99」的脱钩**；`ENEMY_LEVEL.maxLevel=99`（`config.js:132`）只作为 `enemyLevelScale` 的理论上限保留，**运行时敌方等级由本表封顶 18，与玩家等级差 ≤4**。
- 因此 E=18 → `scale = 17` → HP ×2.7、得分/经验 ×2.7、下落速度 ×1.765（L=14）、开火乘数 `1-0.51 = 0.49`（未触到 0.25 下限）。
- 旧版「两条曲线不同步 / 后期只剩敌方在变强」的表述**已作废**，见附 A-3。关卡（战役模式）可自带 `difficulty.scoreAxis` 覆盖本表（`game.js:481`）。

---

## 四、波次 / 关卡节奏

### 4.1 生成与波次（`config.js:421-433`、`wave.js`）

| 参数 | 值 | 位置 | 意图 |
|---|---|---|---|
| 生成率 | `min(1.6 + 0.18×L, 4.0)` 次/秒 | `config.js:424-426`、`js/wave.js:12-18` | 每帧按 `random < rate×dt` 判定（`game.js:574` 取率） |
| 同屏敌机上限 | 60 | `enemy.js:58` | 防爆量 |
| 精英波间隔 | 12s | `config.js:423` | L≥2 触发，判定 `js/wave.js:27-31` |
| Boss 间隔 | 每 5 个难度等级 | `config.js:428` | 默认模式在 `game.js:557` 出 Boss；战役/BossRush 走 `game.js:519`/`:543` |
| Boss 预警 | 3s | `js/wave.js:42`（`bossWarnTimer`） | 旧 2s 太短 |
| 虫群间隔 | 30s | `config.js:429` | L≥2（`config.js:431`），预警 `config.js:430` |
| 虫群数量 | `8 + min(L×2, 16)` = 10~24 | `js/wave.js:66-71` | 纵向编队 |
| 敌机类型解锁 | L≥2 mid、L≥3 mid×2、L≥4 laser、L≥5 big+shield、L≥6 split、L≥7 big、L≥8 shield+laser | `enemy.js:45-55` | 权重靠 `push` 次数；同等级内随机 `enemy.js:63` |

### 4.2 关卡结构现状：**战役模式已落地为数据驱动，默认模式仍是无限波次**

> 旧版本节写「没有关卡/章节数据结构，只有无限波次」——**该论断已不成立**，属代码前进、文档落后的漂移，见附 A-3。

- 数据层：`assets/levels/campaign-01.json`（1 章 6 关，`title: 第一章：初入空域`）+ `level-01…level-06.json`，每关 **5 个 beat**，role 固定 `teach / test / twist / rest / boss`（`test/level-content.test.mjs:12-23` 逐关断言）。
- 运行时：`js/level/schema.js` 校验（stage ≤ 30，`js/level/schema.js:8`、`:170-171`）、`js/level/loader.js` 拉取 `assets/levels/<id>.json`（`js/level/loader.js:55`、`:61`）并带 `?campaign=` 选择与超时保护（`js/level/loader.js:8`）、`js/level/patterns.js` 是弹幕词汇表（`fan/ring/spiral/petal/rain/stack/laserGrid/aimed` **8 种**，`js/level/patterns.js:3-12`；别名 `laser→laserGrid`、`burst→ring` 在 `js/level/patterns.js:14-17`，各型参数白名单 `js/level/patterns.js:19-28`）。
- 编排能力：beat 级 `densityBudget`（如 `level-01 teach` = 同屏 32 发 / 8 发每秒，逐 beat 到 boss 段 80/24）、`advance: allCleared|timeoutSec`、`waves[].spawns[]`（type/count/formation/centerX/spawnY/intervalSec/patternRef）。生成器在 `game.js:493-495` 推进，密度预算经 `setHostileBulletBudget` 注入（`game.js:1467` → `bullet.js:238-250`）。
- 规模实测（读 `assets/levels/*.json`）：level-01「初次接敌」3 个 spawn 组（small×8、mid×2，仅 `aimed`）→ level-05「棱镜风暴」5 组并首次引入 `spiral/petal/stack/laserGrid` → level-06「终幕·苍穹防线」5 组 + `rain/laserGrid/ring/petal`，boss beat 密度预算最高 112/36。
- **仍然存在的缺口**：① 入口是菜单「战役模式」按钮（`js/ui/menus.js:230-249`，显示 `已通关 N/6`），默认开局仍是无限波次 + 周期事件，玩家不点就遇不到编排；② 每关 stage 级 `densityBudget` 六关全为 140/140（与全局上限同值，等于没收紧），真正生效的是更细的 beat 级预算；③ Boss 类型由 beat 数据指定，但默认模式仍是 3 选 1 随机。

---

## 五、Boss 数值

`js/wave.js:83-107`：

| Boss | 半径 | HP | 一阶段 | 二阶段（≤50%） | 三阶段（≤25%） |
|---|---|---|---|---|---|
| 母舰 mothership | 70 | 200 | 召唤 3s / 不开枪 | 召唤 999s（停）/ 开火 2s spread | 召唤 4s + 开火 1.5s laser |
| 堡垒 fortress | 60 | 150 | 护盾 4 层 / 开火 4s homing | 护盾 2 层 / 3s | 护盾 0 / 1.5s burst |
| 幻影 phantom | 40 | 100 | 开火 2s + 瞬移 4s burst | 1.5s + 2.5s | 0.8s + 1.5s |

- 血量成长：`lvlScale = 1 + 0.15×max(0, L-5)`（`js/wave.js:114-115`）；L=10 时 ×1.75。Boss Rush 另有 `scaleBossForRound`（`game.js:543`）。
- 奖励基数 score 2000、xp 100，同样乘 `lvlScale`（`js/wave.js:125-126`）。
- 护盾：`shieldGens` 在 `spawnBoss` 落成首阶段的 `shieldHp`（`js/wave.js:137`），**切相位时会按新相位重新赋值**（`game.js:1041` `e.shieldHp = phase.shieldGens || 0`）。旧版说它「只在 spawnBoss 映射成数值、无消费点」不准确：它是堡垒三阶段护盾的实际来源，只是没有独立的「护盾发生器」实体。

---

## 六、道具数值

### 6.1 掉落（`config.js:251-255`、`game.js:1189-1196`）

| 参数 | 值 | 位置 |
|---|---|---|
| 基础掉落率 | 0.18 | `config.js:252` |
| 爆率技能每级 | +0.05（满级 +0.30） | `config.js:253`、技能 `config.js:316` |
| 幸运爆率 buff | +0.10 | `config.js:254` |
| 天赋掉落 | +0.05（仅 t_drop1，无二级） | `config.js:553` |
| 商店掉落 | +0.05×n，max 4 → +0.20 | `config.js:281` |
| **理论最高掉落率** | **0.83** | `getDropBonus()` 组装（`game.js:1189-1196`），调用点 `game.js:749`/`:765`/`:863`/`:872`/`:1000`/`:1008` |
| 同屏道具上限 | 30 | `config.js:432`，判定 `js/powerup.js:33` |
| 道具下落速度 | 1.8 px/帧 | `powerup.js:42` |
| 拾取半径 | 32px（按平方距离判定） | `powerup.js:66` |
| 磁铁范围 | 120px（buff 期间 200px） | `powerup.js:56` |

### 6.2 权重（早期 L=1 / 后期 L≥2，`config.js:261-270`）

| 道具 | 早期 | 后期 | 变化 |
|---|---|---|---|
| power | 16 | 20 | ↑ |
| life | 30 | 16 | ↓（早期保命） |
| shield | 14 | 14 | = |
| magnet | 12 | 11 | ≈ |
| xppack | 12 | 10 | ↓ |
| rapid | 7 | 9 | ↑ |
| drop | 7 | 6 | ↓ |
| **freeze** | **3** | **3** | =（旧文档写 6/7，与代码不符） |
| knockback | 6 | 6 | = |
| critboost | 5 | 7 | ↑ |
| speed | 5 | **6** | ↑（旧文档写 5/5） |
| double | 5 | 6 | ↑ |
| skillup | 4 | 6 | ↑ |
| madHunt | **3** | **4** | 最稀有常规道具 |
| randomSkill | — | — | 仅 Boss 掉落（`js/powerup.js:36-37` 的 `isBoss` 分支二选一） |

> 权重总和（逐项相加复核）：早期 **129**、后期 **124**。`madHunt` 早期命中率 3/129 ≈ **2.3%**。旧版写的 132/128 是加总错误。

### 6.3 效果时长

| 道具 | 效果 | 位置 |
|---|---|---|
| power | 火力 +1（上限 `PLAYER.maxPower=4`），持续 15s | `powerup.js:79-80`、`config.js:238`、`config.js:524` |
| life | 生命 +1 | `powerup.js:82` 一带 |
| shield | 护盾 +1（上限 maxShield） | `powerup.js:84` |
| **madHunt** | buff **5s** | `config.js:239`（旧文档归入 8s 组，错） |
| rapid / speed / magnet / double / drop / critboost / knockback / freeze | buff 计时 **8s** | `config.js:240-247`，写入点 `powerup.js:86-108` |
| xppack | `max(50, 当前升级需求×20%)` | `powerup.js:16-22` |
| skillup / randomSkill | 随机技能 +1（含前置校验） | `js/powerup.js:105-117` / `js/powerup.js:118-131` |

---

## 七、养成与元进程数值

### 7.1 局内技能（`config.js:291-327`，共 34 条）

> **旧债修正（非 Phase-1 引入的问题被记成 Phase-1 的问题）**：本表在 2026-11-07 版停在 28 条，缺 Phase-1 新增的 6 个技能（下表 `#29–#34`）。
> 补齐后条目数与 `SKILLS` 数组（`config.js:291-327`，34 项）一致。
> 本轮（`12aec58`）又按实码改了 4 条的**数值口径**：`regen` 降档、`nova` 改为随主弹成长、`homing` 补「最近目标」说明、`secondWind` 观测口拆分。

| 技能 | 每级 | 上限 | 满级总效果 |
|---|---|---|---|
| dmg | 伤害 +1 | 10 | +10（进 `calcPlayerBaseDmg`，`js/player.js:291-293`） |
| rate | 间隔 -8% | 6 | -48% |
| range | 射程 +2m | 10 | +20m（500px） |
| move | 移速 +12% | 6 | +72% |
| maxhp | 最大生命 +1 | 4 | +4 |
| shield | 护盾 +1 | 4 | +4 |
| crit | 暴击率 +12% | 6 | +72% |
| critdmg | 暴击倍率 +0.5 | 6 | +3 |
| dual | 侧翼 +2 发 | 4 | 8 发 |
| sideBullets | 伤害 +20% | 5 | 左右各 5 发 |
| explosion | 解锁 | 1 | — |
| expChance | 爆炸率 +10% | 6 | +60% |
| expDmg | 爆炸伤害 +18% | 6 | +108% |
| expRange | 半径 +12px | 6 | +72px |
| volley | 连射 +1 | 6 | 6 发 |
| scatter | 散射 +1 | 6 | 6 发 |
| split | 分裂 | 5 | 6 片 |
| splitDist | 碎片射程 +60 | 5 | +300px |
| penetrate | 穿透 +1 | 6 | 6 个 |
| guard | 护体弹 | 5 | 6 颗 |
| lifesteal | 每级 6% 击杀回血（触发后 5 秒冷却） | 4 | 24%；稳态上限 `1/5s = 0.2` 命/秒（`config.js:338-341`） |
| xpboost | 经验 +15% | 6 | +90% |
| magnet | 永久吸道具 | 1 | — |
| score | 得分 +10% | 6 | +60% |
| drop | 掉落 +5% | 6 | +30% |
| knockback | 击退 +30% | 6 | +180% |
| bulletSpeed | 弹速 +15% | 6 | +90% |
| orbital | 加速 | 5 | — |
| homing | 转向系数 `4 + 1.2×等级` | 5 | **1 级解锁追踪（全部友弹）**，2~5 级只提升转向灵敏度：5.2 → 10（`game.js:343`）；目标是**最近敌机**，Boss 在场时会优先打小怪 —— 文案已按此如实化（`config.js:321` 的 `fullDesc`） |
| nova | 升级释放新星环：半径 +40px、**伤害乘数 +1** | 3 | 半径 200；伤害 = `round(主弹伤害 × (2 + (lvl-1)))`（`game.js:1223-1227`）→ 无 dmg 技能时 2/3/4（与旧平值同值），`dmg=10` 满级时 = 11×4 = **44**，随玩家成长不再中期失效 |
| regen | 每秒回 `REGEN_RATE(0.03) × 等级` 命 | 5 | **0.15 命/秒 ≈ 6.7 秒 1 命**（旧值 0.05/0.25/4.0s 已在 `12aec58` 降档）；且**受击无敌帧 2.2s 内不累计**（`game.js:463-467` 的 `player.invincible <= 0` 前置条件）。写死的不变量：`0.03×5 + 1/5 = 0.35 < 1/2.2 ≈ 0.4545`（`config.js:331-332`），即与满级吸血叠加后仍低于受击速率上限 |
| overload | 残血射速增益 `(1-hpRatio)×0.18×等级` | 5 | hpRatio 1/3 时 ×1.60、1/7 时 ×1.77（`config.js:175-180`，实测见 `docs/perf-baseline.md` 7.6） |
| secondWind | 本局首次死亡免费复活 1 次 | 1 | 1 次；观测口 `getReviveStats()` 现返回 `{reviveUsed, secondWindRevives, paidRevives}`（`game.js:2194`），**技能复活与付费复活已分计数**（`game.js:1297`/`:1351`，复位 `game.js:1423-1424`） |
| chain | 命中后弹射 +1 跳，每跳伤害 ×`chainDecay(0.7)` | 5 | 5 跳、链内半径 170px（`config.js:116-117`、`game.js:899`）；衰减常量与爆炸连锁同源（`game.js:923` 用同一 `chainDamageMultiplier`） |

### 7.2 升级经验曲线

> **旧债修正（不是 Phase-1 引入）**：本节此前写的是 `1.32`，而代码里 `XP_GROWTH` 早在 Phase-1 之前
> 就已从 `1.4 → 1.32 → 1.28` 收敛（`config.js:520-521` 的注释就是这条历史）。
> 另外原表把「**当前等级升下一级**的单步需求」写成「N 级所需」，读者会当成累计量，一并拆开。

| 项 | 值 | 位置 |
|---|---|---|
| 1→2 级经验 | 60 | `config.js:519` |
| 增长系数 | **1.28**（1.4 → 1.32 → 1.28） | `config.js:520-521` |
| 公式 | `xpNeed = round(60 × 1.28^(L-1))`，L = 当前等级 | `game.js:1207` |
| 单步需求：10 级升 11 级 | 60×1.28⁹ = **553**（旧文档写 730，那是 1.32 的值） | 推算 |
| 单步需求：20 级升 21 级 | 60×1.28¹⁹ = **6,533**（旧文档写 11,723；与 `config.js:520-521` 注释自证一致） | 推算 |
| 单步需求：30 级升 31 级 | 60×1.28²⁹ = **77,133**（旧文档写 188,276） | 推算 |
| 累计：从 1 级到 10 级 | **1,762** | 推算（等比求和） |
| 累计：从 1 级到 20 级 | **23,119** | 推算 |
| 累计：从 1 级到 30 级 | **275,260** | 推算 |

> 经验来源：敌机 xp（8~45，`config.js:208-213`）× 敌方等级奖励倍率 `1 + scale×0.10`（`enemy.js:69,:77-78`）；经验包按当前需求的 20% 兜底（`powerup.js:16-22`）。
> 到 20 级需 23,119 经验 ≈ 2,890 只 small（未计奖励倍率），中期之后单靠击杀明显推不动。

### 7.3 星尘经济

| 项 | 值 | 位置 |
|---|---|---|
| 星尘产出 | `floor(score / META.stardustPerScore)`，400 分/星尘 | `meta.js:251`、`config.js:531` |
| 新手保底 | 前 5 局每局最低 10 星尘 | `config.js:532-533` |
| 一局 2 万分 | 50 星尘 | 推算 |
| 复活成本 | 40 星尘/局（限 1 次） | `config.js:534`、`game.js:285` |
| 商店成本增长 | `round(baseCost × 1.6^owned)` | `config.js:287`（增长注释 `config.js:285`） |
| 单件满级（5 级） | 150+240+384+614+983 = **2,371** | 推算 |
| 9 件商店全满 | **14,198** | 推算（逐件按 `round(baseCost×1.6^n)` 求和，表 `config.js:273-283`） |
| 全成就奖励 | **2,950** 星尘 | `config.js:562-575` 求和 |
| 每日任务全清 | **20**/天 | `config.js:578-584` 求和 |
| 飞机售价 | 500 / 500 / 800 / 1000 / 1200 | `config.js:535-541` |
| 天赋总成本 | **2,100** | `config.js:543-555` 求和 |

> 经济断点：按一局 2 万分 ≈ 50 星尘，商店 9 件全满约需 **260~300 局**（不含飞机与天赋），元进程满级周期极长。

---

## 八、成长曲线断点（基于数据可证实）

| # | 断点 | 证据 |
|---|---|---|
| 1 | ~~玩家难度等级 14 封顶、敌方等级可到 99，两轨脱钩~~ **已消除** | `SCORE_AXIS`（`config.js:439-447`）把两条曲线写进同一张表；运行时敌方等级封顶 18、与玩家差 ≤4（表头意图注释 `config.js:436-438`）。180,000 分之后**两条曲线都不再增长**，这才是剩下的真断点 |
| 2 | ~~敌方开火加速在高等级变负~~ **已钳位** | `fireMul = max(fireCdMinMul 0.25, 1 + scale×(-0.03))`（`enemy.js:87`、`config.js:130`）；且运行时 scale ≤ 17，乘数最低只到 0.49 |
| 3 | **敌方等级 HP 在 30 级后减半成长** | `softCapLevel/softCapFactor`（`config.js:133-134`、`enemyLevelScale` `config.js:142-147`）—— 但运行时等级封顶 18，该软上限**当前永不触发**，属为未来得分轴预留的保险 |
| 4 | **经验需求指数增长 vs 经验来源线性** | `XP_GROWTH=1.28`（`config.js:520-521`）指数；敌机 xp 只随 scale 线性（`enemy.js:77-78`）→ 20 级后升级骤慢 |
| 5 | **元进程经济陡峭** | 商店满级 14,198 星尘 vs 一局 ≈50 星尘，需 ~284 局（`config.js:287`、`meta.js:251`） |
| 6 | madHunt 名义吞吐 vs 实发 | 封顶前实测 0.8 波/秒 × 140 发（`docs/perf-baseline.md` 第三节）；1b 后单波 48（`config.js:73`），`config.js:69-72` 记「5s ~13 波、峰值钉 140、吞吐 -13~32%」—— 两口径不可混用，待复算 |
| 7 | **常规满配单波 16 发中主弹仅 4 发** | `js/player.js:390-394`，副武器 `sideCap` 先占最多 50% 配额 |
| 8 | **默认模式的编排为零** | 战役数据/校验/加载/弹幕词汇表都在（4.2），但默认开局不加载战役（`game.js:1460-1462`，`campaignRunner = null` 时无编排），玩家需主动点「战役模式」（`js/ui/menus.js:230-249`） |

---

## 九、数值孤岛与配置/实现漂移（可证实）

### 9.1 数值孤岛（定义但无消费点）

> 本表 2026-11-07 版有**两行是假的**（`fireInterval`、`baseDmg`），已由主持人复核并删除，理由见附 A-1；
> 另有「`power` 上限 4 硬编码」一行也随 `PLAYER.maxPower` 的引入失效。
> 其余行的独立复核由 OpenCode 负责，本节只陈述我逐条 grep 到的消费点。
>
> **2026-11-12 按 OpenCode 逐行审计 + 裁定 C 修订**：判定口径拆成两类——「字段无消费点」与「分支运行时不可达 / 名实不符」；
> 本表原把后两类也记成「非孤岛」，是口径混淆。**本轮只改结论文字，不重锚行号**（裁定 D：`js/` 马上要因 Phase 2 增行，
> 现在锚了立刻又漂；一次性机械全量重锚留到 v0.5.7 部署前、`js/` 冻结后做）。

| 字段 | 位置 | 证据 |
|---|---|---|
| ~~`BULLET.baseDmg`~~ | `config.js:81` | **不是孤岛**：`js/player.js:293` 的 `calcPlayerBaseDmg` 读它，是玩家伤害与 nova 伤害的共同起点 |
| ~~`PLAYER_BASE.fireInterval`~~ | `config.js:49` | **不是孤岛**：值就是 0.56，`calcFireRate` 在 `config.js:172` 直接读它 |
| ~~`power` 道具上限 4~~ | `config.js:524` | **不再是硬编码**：`powerup.js:79` 改为 `Math.min(PLAYER.maxPower, …)` |
| `ENEMY_LEVEL.softCapLevel/softCapFactor` 的外部键 | `config.js:133-134` | **字段非孤岛成立，但「活代码」不成立 ⇒ 改判「预留保险，当前不可达」**：读点在 `calcEnemyLevel` 的软上限分支内，而 `SCORE_AXIS` 把 enemyLevel 封顶在 **18**，30 级那道软上限任何模式都走不到；战役的 `difficulty.scoreAxis` 又被 `js/level/schema.js` **逐点强制等于** `SCORE_AXIS`，连「自定义轴绕过封顶」这条路也是关的。**本节原写「非孤岛」只答对了字段有读点，没答可达性**
| `Boss.phases[].shieldGens` | `js/wave.js:95-97` | **名实不符（本轮改判）**：消费点确实有两处（`js/wave.js` 首阶段 → `shieldHp`、`game.js` 切相位重赋值），但**值被直接当护盾层数用**（每次命中扣 1 层），名字说的却是「发生器数量」。缺的不是消费点，是**名字与语义对齐**：建议改名 `shieldLayers` 或在定义处注释写死「= 层数，不生成实体」。**属代码改名，本轮不做**（裁定 C：§9.1 只做文档语义订正） |
| ~~`player.js` 的 `ORBIT_GROW_INTERVAL=30`~~ | `js/player.js:190` | **不属于本表（本轮撤销该行）**：`ORBIT_GROW_INTERVAL` 有真实读点（增长间隔按 `guard` 缩紧），`maxOrbit` 在无护体时为 0 是**设计行为**而不是死代码 ⇒ 两半都不构成「数值孤岛」。另：本表旧版提到的 **`ORBIT_MAX_BASE` 在当前代码里不存在**（`docs/revamp-numbers.md` 已记录它被删除、只留 `ORBIT_GROW_INTERVAL` 并修正注释），本节此前却把它当「成立」的孤岛 ⇒ **doc-vs-doc 矛盾已消解：以 `revamp-numbers.md` 为准**（本轮复核 `js/config.js` 与 `js/player.js` 里 `ORBIT_MAX_BASE` 均已无字样）。曾经的真实缺陷「固定 30s 与 `30 − guard×4` 写进同一段注释」**已在 Phase-2 代码提交里修掉**，§9.2 那行随之转为已关闭项，本行只保留撤销理由 |

### 9.2 配置与实现漂移

| 问题 | 状态 | 位置 |
|---|---|---|
| 飞机 `fireRate` 语义与描述相反 | **机制已修、文案仍反**：`fireRate` 是**射击间隔倍率**（`calcFireRate` 把它乘在间隔上），blaze `0.8` 确实更快、ironwall `1.2` 确实更慢；**但 UI 直接印 `射速 ×0.8` / `射×1.2`，玩家读成「射速只有 0.8 倍 = 更慢」，方向与事实相反**。本轮由 codearts 改文案（`射速 +25%/−17%` 或 `射击间隔 ×0.8`），零平衡改动 | `config.js:537-538`、倍率入口 `js/player.js:24`、文案在 `js/ui/menus.js` 的机型详情/列表两处 |
| 敌机 `fireCd` 三型被硬编码覆盖 | **主体已修**：复射与首射同源读表（`enemy.js:203-204`，附修复理由注释 `enemy.js:201-202`）。**残留**：laser 复射仍走独立字面量 `rand(2.4, 3.6)`，与表值 `[2.5, 3.5]` 不一致 | `enemy.js:193` vs `config.js:211` |
| 暴击基础倍率注释与配置不符 | **仍在**：`bullet.js:124` 注释写「基础 1.5 + 每级 0.5 + buff 0.5」已与 `critMulti: 1.5` 一致；旧版「注释写 2.5」的错配在早期提交中被顺手改掉，本文按当前文本记录 | `config.js:83`、`bullet.js:124-127` |
| 敌方等级注释过时 | **已随 `SCORE_AXIS` 重写**：`ENEMY_LEVEL.maxLevel=99` 现明确标注为「理论上限，运行时由得分轴封顶 18」 | `config.js:132`、`config.js:436-438` |
| `screenCap` 注释称「同屏硬上限」 | **已修**：改为「单轮发射闸」，并写明分裂碎片不经此闸、峰值可能超过它 | `config.js:74-76`、闸门 `game.js:405`、旁路 `bullet.js:224-235` |
| `freeze` 图鉴文案是玩家可见的假话 | **本轮同批订正（纯文本）**：文案写「冻结全场敌机**与敌方子弹**」，而 `freezeAll()` 只给敌机设 `e.frozen`，`updateBullets` 里没有任何 freeze 分支 ⇒ **敌弹照常飞**。改成「冻结全场敌机（敌方子弹仍会飞行）」。**不去真冻子弹**（那是平衡改动）。另：`js/player.js` 的 `buffs.freeze` 是死 key（freeze 走 `_freeze`/`e.frozen`），本轮不碰，记为债 | `js/ui/codex.js` 的 `powerupDesc.freeze`、`freezeAll` 在 `js/game.js` |
| `ORBIT_GROW_INTERVAL` 注释与实现不同式（自 §9.1 移入） | **已修（Phase-2 代码提交里，非本轮）**：注释现写「有护体技能时每 30 秒增长一颗（每级 -4s，下限 4s）」，与增长分支的 `Math.max(4, ORBIT_GROW_INTERVAL - guard * 4)` 同式，另有一行「下限保护」注释说明为何不能压到 0；§9.1 旧版并列的 `ORBIT_MAX_BASE` **在 `js/config.js` 与 `js/player.js` 里都已无字样**（`grep -c` 双零，本轮复核）。本行保留为**已关闭项**，供 v0.5.7 重锚时核销 | `js/player.js` 的 `ORBIT_GROW_INTERVAL` 定义处与增长分支 |

---

## 十、现状设计短板清单（仅基于上述数字）

1. **编排已建但未默认**：战役（6 关 × 5 beat、beat 级密度预算、7 种弹幕词汇）已数据化，可默认模式仍是「无限波次 + 三类周期事件」，不点战役按钮就碰不到关卡曲线（4.2、断点 8）。
2. **得分轴 180,000 分后完全封顶**：两条曲线都不再增长（`config.js:446`），后期只剩「同屏数量与道具随机」在撑难度，没有新的数值压力来源。
3. ~~敌机成长公式存在负数区间~~ → 已被 `fireCdMinMul` 钳位（第九节）。
4. **默认模式 Boss 仍只有 L=5、10 两次且类型随机**（`config.js:428`、`game.js:557`）；章节化的 Boss 梯度只存在于战役数据里。
5. **常规满配的弹道被副武器挤占**：`waveCap=16` 下主弹只剩 4 发（`js/player.js:390-394`）。
6. **madHunt 与常规模式量级不可比**：单波 48 / 单波伤害 ≈1,130（封顶后），仍是常规满配（16 发 / 228 伤）的数倍；且其吞吐口径目前只有代码注释的实测值，缺一次同版本复算（断点 6）。
7. **道具强度断层**：`madHunt` 权重最低（3/129 ≈ 2.3%）却是量级最高的爆发；`power` 权重最高但只到 4 级（`config.js:524`）；缺乏中间稀有度分层。
8. **经验曲线 20 级后陡峭**：需求 ×1.28^n 指数 vs 来源线性（`config.js:520-521`、`game.js:1207`）。
9. **元进程回收周期过长**：商店满级 14,198 星尘 vs 一局 ≈50（`config.js:287`、`meta.js:251`）。
10. ~~配置字段与实现脱钩（baseDmg / fireInterval / fireCd / fireRate）~~ → 大部分已单一真源化；**残留**：laser 复射仍吃独立字面量（`enemy.js:193`）。
11. **玩家判定半径双份定义**：`PLAYER_BASE.radius=18`（`config.js:46`）与 `PLAYER.hitRadius=20`（`config.js:523`）并存，改一处不改另一处会产生「看起来擦过却被击中」的错觉。
12. **护体弹/副武器等系统缺少统一的「值」抽象**：轨道半径、重生时间、增长间隔仍在 `js/player.js:187-191`，未进 `config.js`，与主配置体系割裂；且 `ORBIT_GROW_INTERVAL` 那条增长路径恒不执行（9.1）。

---

## 附 A：本次复核撤回的旧论断（都是「代码前进、纸面落后」，非 Phase-1 引入）

| # | 旧论文本（2026-11-07 版） | 现状 | 证据 |
|---|---|---|---|
| A-1 | `BULLET.baseDmg`「全仓引用 0 次、玩家伤害从硬编码 `1 + dmgLv` 起算」；`PLAYER_BASE.fireInterval = 0.16` 且「`calcFireRate` 用 0.56 字面量、此字段无人读取」 | **两条都错，且方向是反的**：把两个活的单一真源说成死配置，比数字过时更危险 | `fireInterval: 0.56` 在 `config.js:49`，被 `config.js:172` 读；`BULLET.baseDmg` 在 `config.js:81`，被 `js/player.js:293` 读 |
| A-2 | 「`power` 道具上限 4 硬编码，未读 `SKILLS` 或配置」 | 已单一真源到 `PLAYER.maxPower` | `powerup.js:79` ← `config.js:524` |
| A-3 | 「没有关卡/章节数据结构，只有无限波次」；「玩家 14 级封顶、敌方涨到 99，两轨脱钩」；「开火乘数在 E≈34 后变负」 | 全部作废：战役数据层与运行时已落地；两轨合并为 `SCORE_AXIS`；乘数被钳在 0.25 | 4.2、`config.js:439-447`、`enemy.js:87` |
| A-4 | 「madHunt 满配单波 140、恰好等于 screenCap」 | 1b 已封顶到 48（跨采样截断，保留角度覆盖），且 buff 时长 8s → 5s | `config.js:73`、`js/player.js:327-336`、`config.js:239` |
| A-5 | 道具权重表 freeze 6/7、speed 5/5，总和 132/128 | 实为 freeze 3/3、speed 5/6，总和 **129/124**（原为加总错误） | `config.js:261-270` |
| A-6 | 「`shieldGens` 只在 `spawnBoss` 映射成数值，无消费点」 | 切相位还会重赋值 | `js/wave.js:137`、`game.js:1041` |

## 附 B：本次复核中**由我自己撤回的测量类结论**（在 `docs/perf-baseline.md` 有对应记录）

- ④ 弧长分离比旧读数 **1.008~1.014 / 1.163~1.264 作废**：探针弹被对象池复用污染（`bullet.js:20` 的 `allocBullet` 只 `pool.pop()`，身份不是稳定句柄）。干净读数为 **1.002（斜靶）/ 1.037（直角靶）/ 1.143（130° 反打靶）**，已在 `12aec58` 写进 `game.js:340` 的开发注释。
- 「一次 `addXp` 闸门故障 = 多 3 条命 + 多 3 次三选一重 roll」**未复现**：实测是多 3 道新星环，只有完整修复前形状多 1 条命，重 roll 在 0 帧窗内不可测 → 不裁定。详见 `docs/gameplay-final-plan.md` §6 Phase-1 行与 `docs/perf-baseline.md` 7.1/7.3。
- 我口头汇报过的「① 同屏友方弹峰值 **143 > screenCap 140**」**撤回**：留档输出里不存在这个数（`docs/perf-baseline.md` 7.2 记的是 138 / 140，两臂都没破 140）。该数被裁定 G 与「分裂碎片绕过发射闸」的论证引用过，**以撤回为准**；`screenCap` 是发射闸（`game.js:405`）、分裂碎片不经它（`bullet.js:224-235`）这一点仍成立，但「实测破闸」没有证据，要判得先加同帧直读（`docs/perf-baseline.md` 7.8 R4）。
