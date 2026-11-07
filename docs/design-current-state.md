# plane_war 现状数值全盘点（设计讨论地基）

- 盘点日期：2026-11-07
- 范围：`js/config.js`、`js/enemy.js`、`js/wave.js`、`js/bullet.js`、`js/powerup.js`、`js/player.js`、`js/skill.js`、`js/game.js`、`js/meta.js`
- 方法：逐文件读取数值定义与消费点，行号以**当前工作区**为准（含 P6 重构与 P5b 性能优化后的偏移）
- 标注约定：**「推算」**= 按代码公式手算、非运行时采样；其余数字均为代码字面量

> 本文只陈述代码事实与推导，不做业界对标。业界方案见 `docs/design-research.md`，关卡/弹幕专题见 `docs/design-levels-editor.md`。

---

## 一、玩家侧数值

### 1.1 基础属性

| 参数 | 值 | 位置 | 设计意图 / 推测 |
|---|---|---|---|
| 移动速度 | 6.2 | `config.js:45` | 基准 6.2 px/帧；实际 `× (1 + 0.12×move) × (speed buff ? 1.5 : 1)`（`player.js:101-103`） |
| 碰撞半径（渲染/逻辑） | 18 | `config.js:46` | 机身尺寸参考 |
| **受击判定半径** | **20** | `config.js:352` | 比机身略宽，便于「贴身擦弹」；与 18 并存，属近似重复定义 |
| 机体宽/高 | 44 / 52 | `config.js:47-48` | 贴图与枪口锚点基准 |
| 基础射击间隔 | 0.16 | `config.js:49` | **注释称基础间隔 0.56**（`config.js:146-147`），此字段实际未被 `calcFireRate` 读取（见「数值孤岛」） |
| 受伤无敌时间 | 2.2s | `config.js:50` | 与死亡动画 2s 配合，避免「死了还被打」（`game.js:1041`） |
| 护盾上限 | 3 | `config.js:51` | 可叠天赋 +1、商店 +2 → 最高 6 |
| 起始生命 | 3 | `config.js:52` | 各机型可覆盖（2~5） |
| 初始火力等级 | 1 | `player.js:72` | 天赋「起始武器等级+1」可 +1 |
| 火力等级硬上限 | 4 | `powerup.js:83` | `power` 道具封顶 4；对应 4 条主弹道 |
| 火力道具持续 | 15s | `powerup.js:84` | 到期回落 1 级（`player.js:133-136`） |
| 升级回血 | +1 生命 | `game.js:1014` | 每次升级必回 1，满级技能时改为 +1 护盾（`game.js:1017-1018`） |

### 1.2 射击间隔真源 `calcFireRate`

位置 `config.js:148-154`：

```
普通：(0.56 - (power-1)×0.04) × (1 - 0.08×rate) × fireRateMul
急速：0.055 × fireRateMul
疯狂追击：0.045 × fireRateMul
```

| 状态 | 间隔 | 推导 |
|---|---|---|
| 1 级、无技能 | 0.56s | ≈1.79 波/秒 |
| power=4、rate=6 | 0.2288s | (0.56-0.12)×0.52 |
| 再叠天赋 0.9 + 商店 0.8 | 0.1647s | ×0.72 |
| 急速射击 | 0.055s | 固定值，不看 power/rate |
| 疯狂追击 | 0.045s | 固定值，同上 |

**再射闸门** `refireGateDistance`（`config.js:135-140`）：`min(250, max(20, 3×60×fireRate))`。射速越快波间距越小，下限 20px 防抖。

### 1.3 输出能力（推算）

| 阶段 | 假设 | 单波子弹 | 单波伤害 | DPS（推算） |
|---|---|---|---|---|
| 开局 | dmg=0、power=1 | 1 | 1 | **1.79** |
| 中期 | dmg=10、rate=6、power=4、无 volley/scatter/副武器 | 4（主弹×4 通道） | 44 | **192** |
| 满常规 | dmg=10、rate=6、power=4、volley6、scatter6、dual4、side4 | 16（受 `waveCap`） | ≈228 | **≈996** |
| 满常规+暴击 | 再叠 crit6（72%）+critdmg6（×4.5） | 16 | 期望 ×3.52 | **≈3506** |
| 疯狂追击 | dmg=10、scatter6、volley6 | **140** | **3300** | 实际受 `screenCap` 限速 → **≈2640** |

> 推算口径：单目标全命中、无天赋/商店/飞机加成、不含爆炸/分裂/穿透的额外命中；暴击期望倍率 `0.28×1 + 0.72×4.5 = 3.52`（基础倍率 1.5 + critdmg6×0.5 = 4.5）。
> 满常规单波 16 发中，主弹只占 4 发，其余被 dual/sideBullets 挤占（`player.js:347-349` 的 `mainCap` 计算）——这是「副武器先占额度」策略的直接后果。

### 1.4 护体弹（guard）

| 参数 | 值 | 位置 |
|---|---|---|
| 轨道半径 | 46px | `player.js:159` |
| 角速度 | 2.2 rad/s | `player.js:160` |
| 击毁后重生 | 2.5s，每级 -0.24s，下限 1.3s | `player.js:161,238` |
| 无技能增长间隔 | 30s | `player.js:162` |
| 每级缩短 | -4s，下限 4s | `player.js:206` |
| 数量上限 | `(guard>0?1:0) + guard×1` → 1 级 2 颗、满级 6 颗 | `player.js:197` |
| 单颗伤害 | `max(2, round(power) + round(dmgLv×0.5))` | `player.js:170-174` |

---

## 二、子弹与武器数值

### 2.1 `BULLET` 配置（`config.js:56-105`）

| 参数 | 值 | 位置 | 消费点 / 意图 |
|---|---|---|---|
| baseSpeed | 3 | :57 | 玩家主弹初速，60fps 下 180px/s |
| baseRange | 250 | :58 | 起始射程 10m（1m=25px） |
| rangePerLevel | 50 | :59 | 射程技能每级 +2m |
| levelRangePerLevel | 2.5 | :60 | 玩家每级 +0.1m（线性） |
| rangeCapMargin | 80 | :61 | 射程上限 = 屏高 + 80 |
| refireDist | 250 | :62 | 再射闸门上限 10m |
| waveCap | **16** | :66 | 单波子弹总量上限（副武器与主弹共享） |
| screenCap | **140** | :67 | 同屏友弹硬上限 |
| baseRadius / critRadius | 4 / 5.5 | :68-69 | 弹体判定半径 |
| critChance | 0.12 | :71 | 每级暴击率 |
| critMulti | 1.5 | :72 | **代码值 1.5**，但 `bullet.js:93-94` 注释写「基础 2.5」；实现为 `1.5 + 0.5×critdmg + 0.5×buff`，满级 = 4.5 |
| knockbackPerLevel | 0.30 | :74 | 击退力 = 伤害 × 0.3/级 |
| splitDmgRatio | 0.30 | :76 | 分裂碎片伤害比例（`BCFG.splitDmgRatio` 被引用 1 次） |
| splitCountPerLevel | 1 | :77 | 分裂片数 = 1 + lv（满级 6） |
| splitFragBaseRange | 25 | :80 | 碎片基础射程 1m |
| splitFragRangePerLevel | 60 | :81 | 分裂距离技能每级 +60px |
| volleyAngleGap | 0.04 | :83 | 连射角间距 |
| scatterSpread | 0.06 | :84 | 散射角间距 |
| explosionBaseRadius | 40 | :85 | 爆炸基础半径 |
| explosionRadiusPerLevel | 12 | :86 | 冲击扩域每级 +12px |
| explosionBaseChance | 0.10 | :88 | 爆炸基础触发率 |
| explosionChancePerLevel | 0.10 | :89 | 爆破掌握每级 +10% |
| explosionBaseDmgRatio | 0.45 | :91 | 爆炸伤害比例 |
| explosionDmgRatioPerLevel | 0.15 | :92 | 爆裂强化每级 +15% |
| explosionMaxRadius | 250 | :94 | AOE 半径硬上限 |
| explosionMaxChainDepth | 2 | :95 | 连锁爆炸深度 |
| explosionParticlesPerHit | 8 | :96 | 每次爆炸粒子数 |
| fxRingsCap / fxBlastsCap | 48 / 24 | :97,100 | 特效池上限 |
| orbitalAccel | 0.035 | :102 | 天基武器每帧加速基数 |
| orbitalAccelPerLevel | 0.015 | :103 | 每级额外加速 |
| orbitalMaxSpeed | 22 | :104 | 加速上限 |

### 2.2 敌方子弹

| 参数 | 值 | 位置 |
|---|---|---|
| 普通敌弹速度 | `(3 + rand(0,1.5)) × enemyFireScale` | `bullet.js:235` |
| 普通敌弹半径 / 射程 / 寿命 | 5 / 600 / 6s | `bullet.js:237` |
| 激光弹速度 | `(8.5 + rand(0,1.2)) × enemyFireScale` | `bullet.js:248` |
| 激光弹（三发平行） | 半径 3.5、射程 720、寿命 2.4s、间距 11px | `bullet.js:251-255` |
| 分裂碎片数量上限 | 12 | `bullet.js:195` |
| 分裂扇形张角 | `min(1.2, n×0.2)` rad（±34°） | `bullet.js:197` |
| 碎片半径 | `max(2, parentR×0.45)` | `bullet.js:161` |

### 2.3 疯狂追击与常规模式的关系

- 常规：`waveCap=16` 限制单波总量，`screenCap=140` 限制同屏。
- 疯狂追击：绕过 `waveCap`，单波 = `(8 + scatter×2) × (1 + volley)`；满技能 = **20 × 7 = 140**，恰好等于 `screenCap`（`game.js` 的 `expectedMadHuntPatterns` 与 `player.js:277-293` 同步）。
- 伤害权重：madHunt 主弹 `×3`、连射 `×2`（`player.js:283,288`），而常规主弹 `×1`、散射 `×0.5`、连射 `×0.6`（`player.js:313-314`）。
- 结论：madHunt 是**数量与伤害双高**的 8 秒爆发道具，实际输出被 `screenCap` 从理论 22.2 波/秒压到约 0.8 波/秒（P5b 基线实测 48 波/60s）。

---

## 三、敌机数值

### 3.1 六种敌机（`config.js:172-179`）

| 类型 | 半径 | HP | 得分 | 经验 | 速度 | 开火间隔配置 | 特殊 |
|---|---|---|---|---|---|---|---|
| small | 16 | 1 | 100 | 8 | 2.4 | [4, 6] | 基础型 |
| mid | 24 | 3 | 300 | 20 | 1.6 | [3.2, 3.2] | 中型 |
| big | 36 | 8 | 800 | 45 | 1.0 | [2.2, 2.2] | 高血量 |
| laser | 22 | 4 | 400 | 25 | 1.4 | [2.5, 3.5] | 三发平行激光 |
| shield | 28 | 6 | 500 | 30 | 1.2 | [3, 4] | 护盾 3 层 |
| split | 20 | 3 | 250 | 15 | 1.8 | [3.5, 5] | 死亡分裂 2 子代 |

### 3.2 敌机成长公式（`enemy.js:57-95`）

| 项 | 公式 | 位置 |
|---|---|---|
| 敌方等级成长系数 | `scale = (min(E,30)-1) + max(0,E-30)×0.5` | `config.js:123-128` |
| HP | `round(cfg.hp × hpScale × (1 + scale×0.10))` | `enemy.js:64-66` |
| 得分/经验 | `cfg.score × (1 + scale×0.10)` | `enemy.js:73-74` |
| 下落速度 | `cfg.speed × speedScale × rand(0.8,1.25) × (1 + 玩家难度等级×0.045)` | `enemy.js:79` |
| 初始开火冷却 | `rand(cfg.fireCd) × fireCdScale × (1 + scale×(-0.03))` | `enemy.js:81` |
| 护盾层数 | 固定 3 | `enemy.js:85` |
| 分裂子代数 | 固定 2 | `enemy.js:86` |
| 激光首发延迟 | `rand(1,2)` s | `enemy.js:87` |

### 3.3 敌方等级与难度等级的双轨

| 曲线 | 公式 | 位置 | 封顶所需分数 |
|---|---|---|---|
| 玩家难度等级 L | `min(14, 1+floor(score/4500))` | `config.js:288-289`、`wave.js:12-14` | 14 级 = **58,500 分** |
| 敌方等级 E | `min(99, 1+floor(score/6000))` | `config.js:108-116`、`game.js:429` | 99 级 = **588,000 分** |

- **断点**：L 在 58,500 分封顶后不再增长，E 继续涨到 99。代码注释也承认「后期只剩敌方等级在涨」。
- E=99 时 `scale=63.5` → 敌机 HP ×7.35、速度 ×1.63（L=14）、开火乘数 `1-1.905 = -0.905`（见「配置漂移」）。

---

## 四、波次 / 关卡节奏

### 4.1 生成与波次（`config.js:287-300`、`wave.js`）

| 参数 | 值 | 位置 | 意图 |
|---|---|---|---|
| 生成率 | `min(1.6 + 0.18×L, 4.0)` 次/秒 | `config.js:291-293`、`wave.js:16-18` | 每秒判定 `random < rate×dt`（`game.js:458`） |
| 同屏敌机上限 | 60 | `enemy.js:58` | 防爆量 |
| 精英波间隔 | 12s | `config.js:290` | L≥2 触发，数量 `2+min(L,5)` = 3~7（`wave.js:31-35`） |
| Boss 间隔 | 每 5 个难度等级 | `config.js:295` | L=5/10 两次（L 封顶 14），类型 3 选 1 随机（`game.js:437-440`） |
| Boss 预警 | 3s | `wave.js:46` | 旧 2s 太短 |
| 虫群间隔 | 30s | `config.js:296` | L≥2，预警 3s |
| 虫群数量 | `8 + min(L×2, 16)` = 10~24 | `wave.js:71` | 纵向编队 `-30 - i×25` |
| 敌机类型解锁 | L≥2 mid、L≥3 mid×2、L≥4 laser、L≥5 big+shield、L≥6 split、L≥7 big、L≥8 shield+laser | `enemy.js:45-55` | 权重靠 `push` 次数实现 |

### 4.2 关卡结构现状

- **没有关卡/章节数据结构**：只有「无限波次 + 难度等级 + 周期性 Boss/精英/虫群」三类事件（`wave.js:28-68`）。
- 敌机类型池由难度等级决定，但**同等级内是均匀随机**（`enemy.js:59` `pick(...)`），没有波次编队/主题/教学曲线。
- Boss 类型随机，与进度无关（`game.js:438-440`），不存在「第 1 章母舰 → 第 2 章堡垒」的编排。

---

## 五、Boss 数值

`wave.js:87-112`：

| Boss | 半径 | HP | 一阶段 | 二阶段（≤50%） | 三阶段（≤25%） |
|---|---|---|---|---|---|
| 母舰 mothership | 70 | 200 | 召唤 3s / 不开枪 | 开火 2s spread | 召唤 4s + 开火 1.5s laser |
| 堡垒 fortress | 60 | 150 | 护盾 4 层 / 开火 4s homing | 护盾 2 层 / 3s | 护盾 0 / 1.5s burst |
| 幻影 phantom | 40 | 100 | 开火 2s + 瞬移 4s burst | 1.5s + 2.5s | 0.8s + 1.5s |

- 血量成长：`hp × (1 + 0.15×max(0, L-5))`（`wave.js:118-119`）；L=10 时 ×1.75。
- 奖励固定基数：score 2000、xp 100（`wave.js:129-130`），同样乘 `lvlScale`。
- 护盾层数直接复用 `shieldHp`，但 Boss 的护盾只是数值，没有独立护盾发生器实体（`shieldGens` 字段仅在配置里，未在 `spawnBoss` 中落地）。

---

## 六、道具数值

### 6.1 掉落（`config.js:201-220`、`game.js:982-989`）

| 参数 | 值 | 位置 |
|---|---|---|
| 基础掉落率 | 0.18 | `config.js:202` |
| 爆率技能每级 | +0.05（满级 +0.30） | `config.js:203` |
| 幸运爆率 buff | +0.10 | `config.js:204` |
| 天赋掉落 | +0.05 | `config.js:379` |
| 商店掉落满级 | +0.20 | `config.js:231` |
| **理论最高掉落率** | **0.83** | 0.18+0.30+0.10+0.05+0.20 |
| 同屏道具上限 | 30 | `config.js:299` |
| 道具下落速度 | 1.8 px/帧 | `powerup.js:46` |
| 拾取半径 | 32px | `powerup.js:70` |
| 磁铁范围 | 120px（buff 期间 200px） | `powerup.js:60` |

### 6.2 权重（早期 L=1 / 后期 L≥2）

| 道具 | 早期 | 后期 | 变化 |
|---|---|---|---|
| power | 16 | 20 | ↑ |
| life | 30 | 16 | ↓（早期保命） |
| shield | 14 | 14 | = |
| magnet | 12 | 11 | ≈ |
| xppack | 12 | 10 | ↓ |
| rapid | 7 | 9 | ↑ |
| drop | 7 | 6 | ↓ |
| freeze | 6 | 7 | ↑ |
| knockback | 6 | 6 | = |
| critboost | 5 | 7 | ↑ |
| speed | 5 | 5 | = |
| double | 5 | 6 | ↑ |
| skillup | 4 | 6 | ↑ |
| madHunt | **3** | **4** | 最稀有常规道具 |
| randomSkill | — | — | 仅 Boss 掉落（`powerup.js:41`） |

> 权重总和：早期 **132**、后期 **128**。`madHunt` 早期命中率 3/132 ≈ 2.3%。

### 6.3 效果时长

| 道具 | 效果 | 位置 |
|---|---|---|
| power | 火力 +1（上限 4），持续 15s | `powerup.js:82-84` |
| life | 生命 +1 | :85-86 |
| shield | 护盾 +1（上限 maxShield） | :87-88 |
| madHunt / rapid / speed / magnet / double / drop / critboost / knockback | buff 计时 **8s** | :89-108 |
| freeze | 全体冰冻 | :95-96 |
| xppack | `max(50, 当前升级需求×20%)` | `powerup.js:16-22` |
| skillup / randomSkill | 随机技能 +1（含前置校验） | :109-135 |

---

## 七、养成与元进程数值

### 7.1 局内技能（`config.js:241-270`）

| 技能 | 每级 | 上限 | 满级总效果 |
|---|---|---|---|
| dmg | 伤害 +1 | 10 | +10 |
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
| lifesteal | 每级 6% 击杀回血（触发后 5 秒冷却） | 4 | 24% |
| xpboost | 经验 +15% | 6 | +90% |
| magnet | 永久吸道具 | 1 | — |
| score | 得分 +10% | 6 | +60% |
| drop | 掉落 +5% | 6 | +30% |
| knockback | 击退 +30% | 6 | +180% |
| bulletSpeed | 弹速 +15% | 6 | +90% |
| orbital | 加速 | 5 | — |

### 7.2 升级经验曲线

| 项 | 值 | 位置 |
|---|---|---|
| 1→2 级经验 | 60 | `config.js:348` |
| 增长系数 | 1.32 | `config.js:350` |
| 公式 | `xpNeed = round(60 × 1.32^(L-1))` | `game.js:1000` |
| 10 级所需 | 60×1.32⁹ ≈ **730** | 推算 |
| 20 级所需 | 60×1.32¹⁹ ≈ **11,723** | 推算 |
| 30 级所需 | 60×1.32²⁹ ≈ **188,276** | 推算 |

> 经验来源：敌机 xp（8~45）× 敌方等级奖励倍率；经验包按当前需求的 20% 兜底。20 级之后单级需求进入万级，纯靠击杀推进明显变慢。

### 7.3 星尘经济

| 项 | 值 | 位置 |
|---|---|---|
| 星尘产出 | `floor(score/400)` | `meta.js:220` |
| 一局 2 万分 | 50 星尘 | 推算 |
| 复活成本 | 40 星尘/局（限 1 次） | `config.js:360`、`game.js:255` |
| 商店成本增长 | `baseCost × 1.6^owned` | `config.js:236-238` |
| 单件满级（5 级） | 150+240+384+614+983 = **2,371** | 推算 |
| 9 件商店全满 | **14,198** | 推算（逐件按 `round(baseCost×1.6^n)` 求和） |
| 全成就奖励 | **2,950** 星尘 | `config.js:388-401` 求和 |
| 每日任务全清 | **20**/天 | `config.js:404-410` 求和 |
| 飞机售价 | 500 / 500 / 800 / 1000 / 1200 | `config.js:361-368` |
| 天赋总成本 | 100+200+150+200+100+200+250+150+100+150+300+200 = **2,100** | `config.js:369-382` 求和 |

> 经济断点：按一局 2 万分 ≈ 50 星尘，商店 9 件全满约需 **260~300 局**（不含飞机与天赋），元进程满级周期极长。

---

## 八、成长曲线断点（基于数据可证实）

| # | 断点 | 证据 |
|---|---|---|
| 1 | **玩家难度等级 14 级封顶，敌方等级可到 99** | `config.js:289` vs `:113`；58,500 分后玩家侧停止成长，敌方继续变强 |
| 2 | **敌方开火加速在高等级变负** | `enemy.js:81` 乘数 `1 + scale×(-0.03)`；scale>33.3（E≈34，约 198,000 分）后为负 → 新敌机首射延迟 ≤0 |
| 3 | **敌方等级 HP 在 30 级后减半成长** | `config.js:114` `softCapFactor=0.5`；E>30 后每级只算 0.5 |
| 4 | **经验需求指数增长 vs 经验来源线性** | `XP_GROWTH=1.32`（`config.js:350`）指数；敌机 xp 只随 scale 线性（`enemy.js:74`）→ 20 级后升级骤慢 |
| 5 | **元进程经济陡峭** | 商店满级 14,198 星尘 vs 一局 ≈50 星尘，需 ~284 局 |
| 6 | **madHunt 理论 22.2 波/秒被 `screenCap` 压到 0.8 波/秒** | `config.js:151` vs `:67`；P5b 实测 48 波/60s |
| 7 | **常规满配单波 16 发中主弹仅 4 发** | `player.js:347-349`，副武器 `reserve` 先占 12 发 |
| 8 | **Boss 只出现 2 次（L=5、10），且类型随机** | `DIFFICULTY.bossInterval=5`（`config.js:295`）+ L 封顶 14 |

---

## 九、数值孤岛与配置/实现漂移（可证实）

### 9.1 数值孤岛（定义但无消费点）

| 字段 | 位置 | 证据 |
|---|---|---|
| `BULLET.baseDmg = 1` | `config.js:70` | `BULLET.baseDmg` / `BCFG.baseDmg` 全仓引用 **0 次**；玩家伤害从 `player.js:269` 的硬编码 `1 + dmgLv` 起算 |
| `PLAYER_BASE.fireInterval = 0.16` | `config.js:49` | `calcFireRate` 用 0.56 字面量（`config.js:153`），此字段无人读取 |
| `ENEMY_LEVEL.softCapLevel/softCapFactor` 的外部键 | `config.js:114-115` | 仅 `config.js:123-128` 内部裸名使用，属内部实现，非孤岛（列此说明已核对） |
| `Boss.phases[].shieldGens` | `wave.js:99-101` | 只在 `spawnBoss` 映射成 `shieldHp` 数值（`wave.js:141`），无独立护盾发生器实体 |
| `player.js` 的 `ORBIT_GROW_INTERVAL=30 / ORBIT_MAX_BASE=0` | `player.js:162-163` | 注释称「无技能时每 30 秒增长一颗」，但 `maxOrbit = (guard>0?1:0) + guard`，无技能时恒为 0，该增长路径永不执行（死配置） |
| `power` 道具上限 `4` | `powerup.js:83` | `Math.min(4, ...)` 硬编码，未读 `SKILLS` 或配置；天赋「起始武器等级+1」也无法突破 |

### 9.2 配置与实现漂移

| 问题 | 配置 | 实现 | 位置 |
|---|---|---|---|
| **飞机 fireRate 语义与描述相反** | blaze「高射速」`fireRate:1.3` | `fireRateMul *= 1.3` 使射击**间隔** +30%（更慢）；ironwall「高血量」`fireRate:0.8` 反而更快 | `config.js:363-364`、`player.js:24`、`config.js:148-154` |
| **敌机 fireCd 部分失效** | laser [2.5,3.5]、shield [3,4]、split [3.5,5] | `getEnemyShooters` 对 shield 硬编码 3.5、split 走 else 的 `rand(4,6)`、laser 走独立 `rand(2.4,3.6)` | `enemy.js:183,190`、`config.js:176-178` |
| **暴击基础倍率注释与配置不符** | `critMulti: 1.5` | `bullet.js:93-94` 注释写「基础 2.5 + 每级 0.5」 | `config.js:72`、`bullet.js:93-96` |
| **敌方等级注释过时** | `scorePerLevel=6000`、`maxLevel=99` | 注释写「每 8000 分升 1 级，上限 30」 | `game.js:428`、`config.js:109,113` |
| **`power` 道具上限 4 与 `PLAYER.power` 初始值** | 上限 4 | 天赋「起始武器等级+1」可让初始 power=2，但道具仍按 `min(4, +1)` 封顶，天赋不会突破 4 | `powerup.js:83`、`player.js:72` |

---

## 十、现状设计短板清单（仅基于上述数字）

1. **无关卡结构**：只有无限波次 + 三类周期事件；敌机类型由难度等级决定，同等级内均匀随机（`enemy.js:59`），没有编队、主题、教学或阶段目标。
2. **两条难度曲线不同步**：玩家难度等级 14 级封顶（58,500 分），敌方等级通向 99 级（588,000 分）；后期只剩敌人在变强。
3. **敌机成长公式存在负数区间**：`1 + scale×(-0.03)` 在 E≈34 后为负，开火冷却变成负值（`enemy.js:81`）。
4. **Boss 数量与编排严重不足**：全程只有 L=5、10 两次，类型随机，没有章节化的 Boss 梯度（`game.js:437-440`）。
5. **常规满配的弹道被副武器挤占**：`waveCap=16` 下主弹只剩 4 发，玩家的「主武器成长」在高配时反而被副武器稀释（`player.js:347-349`）。
6. **madHunt 与常规模式量级不可比**：单波 140 发 / 总伤 3300，是常规满配（16 发 / 228 伤）的 ~14 倍，但被 `screenCap` 限速到 0.8 波/秒（`config.js:67,151`）。
7. **道具强度断层**：`madHunt` 权重最低（3/132）却是量级最高的爆发；`power` 权重最高但只到 4 级；缺乏中间档位的稀有度分层（`config.js:211-220`）。
8. **经验曲线 20 级后陡峭**：需求 ×1.32^n 指数增长，而经验来源线性；升级节奏在中期断崖式放缓（`config.js:350`、`game.js:1000`）。
9. **元进程回收周期过长**：商店满级 14,198 星尘 vs 一局 ≈50，需 ~284 局（`config.js:236-238`、`meta.js:220`）。
10. **配置字段与实现脱钩**：`BULLET.baseDmg`、`PLAYER_BASE.fireInterval` 无人读取；敌机 `fireCd` 三型被硬编码覆盖；飞机 `fireRate` 语义与描述相反（见 9.1/9.2）。
11. **玩家判定半径双份定义**：`PLAYER_BASE.radius=18` 与 `PLAYER.hitRadius=20` 并存，改一处不改另一处会产生「看起来擦过却被击中」的错觉（`config.js:46,352`）。
12. **护体弹/副武器等系统缺少统一的「值」抽象**：轨道半径、重生时间、增长间隔等散落在 `player.js:159-164`，未进 `config.js`，与主配置体系割裂。

---

## 附：本次盘点中新增的可复现证据

- madHunt 满技能单波 140 发、名义 22.2 波/秒、实测 0.8 波/秒：见 `docs/perf-baseline.md` 与 `tools/perf/bench.mjs`。
- 敌机开火乘数负数：`enemy.js:81` 的 `1 + scale * ENEMY_LEVEL.fireCdPerLevel`，`scale` 最大 63.5。
- 飞机 fireRate 语义：`player.js:24` 把 `fireRate` 直接乘进「间隔倍率」，与 `blaze.desc="高射速"` 矛盾。