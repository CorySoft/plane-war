# 街机与弹幕射击：成熟产品的玩法要素调研

调研日期：2026-11-10。范围：纵向/横向卷轴射击（含弹幕/“manic shooter”）的街机原作与家用移植版。目的：为 plane_war 枚举可核验的玩法要素，区分「来源直接描述的事实」与「面向本项目的建议」。

方法与证据分级：

- **A 级**：条目明确列出模式/功能/数值，或给出可核对的移植版差异。本文的具体数字只来自这一级。
- **B 级**：条目转述玩法循环，能证明机制存在，但不能证明参数或效果。
- **C 级**：玩家社区惯例与口述。本次**未采用**；凡找不到 A/B 级来源的，直接标注「未检索到可靠来源」。

> 说明：本文主要使用 Wikipedia 条目作为二手来源。它能证明“产品提供了哪些机制”，不能证明“这些机制带来多少留存或收入”。因此下文不做留存因果推断，也不把百科描述当成平衡数值依据。
>
> 本文只写文档，不修改 `js/**`。

## 结论摘要

| # | 可核验观察 | 代表产品 | 对 plane_war 的启示 |
|---|---|---|---|
| 1 | 本次覆盖的街机主线多为 5–8 关，通关后进入难度更高的二周目；家用移植再补练习、Boss Rush、回放、图鉴。 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game))、[DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi)、[DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | 主线长度不是深度来源；复玩层可以独立于关卡数量。 |
| 2 | 续关是街机收入机制；「禁续关通关」被用来解锁 Extra/隐藏内容，把 1CC 变成目标。 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game))、[Touhou](https://en.wikipedia.org/wiki/Touhou_Project)、[Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945)、[Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama) | 可以用“是否续关”做分层记录，而不必禁止续关。 |
| 3 | 难度分层普遍存在：4 档 × 6 关（Touhou）、Original/Maniac/Ultra（Futari）、Novice/Arrange（移植版）。 | [Touhou](https://en.wikipedia.org/wiki/Touhou_Project)、[Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama)、[Mushihimesama Futari](https://en.wikipedia.org/wiki/Mushihimesama_Futari) | 难度应是模式/规则组合，不只是血量和弹速倍率。 |
| 4 | 慢速精确移动是弹幕游戏的通用解：按住 Shift 或攻击键降速，并显示/聚焦判定。 | [Touhou](https://en.wikipedia.org/wiki/Touhou_Project)、[Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 现有 480×720 触屏/键鼠都适合加“按住降速”。 |
| 5 | 锁定不是自动瞄准：Zero Gunner 的 lock-on 让机体自由机动，同时持续攻击同一目标。 | [Zero Gunner](https://en.wikipedia.org/wiki/Zero_Gunner) | 可作为“走位不中断输出”的操作轴，而不是数值外挂。 |
| 6 | 风险计分有两条成熟路线：擦弹计数（Touhou）与离弹距离倍率（Shikigami no Shiro）。 | [Touhou](https://en.wikipedia.org/wiki/Touhou_Project)、[Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 最便宜、最契合现有弹幕密度的深度增量。 |
| 7 | 极性切换把“同色子弹”从威胁变成资源：吸收同色、异色击杀、吸收充能追踪激光。 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 需要一整套颜色语言与美术/UI，成本高，不宜先做。 |
| 8 | Hyper 是“连段产出资源、资源再反哺连段”的闭环，并带全屏消弹。 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | 与现有技能/能量系统可对接，但要防滚雪球。 |
| 9 | 动态 rank 会让“变强”同时“变难”，并用死亡降 rank 作为容错。 | [Battle Garegga](https://en.wikipedia.org/wiki/Battle_Garegga) | 与现有 `SCORE_AXIS` 可能冲突，需明确单一真源。 |
| 10 | 结算评级（金银牌、NO MISS、连锁等级）与回放/排行榜是移植版标配。 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945)、[DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi)、[Ikaruga](https://en.wikipedia.org/wiki/Ikaruga)、[Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 无后端时先做本地最佳、本地回放与结算评级。 |

---

## 0. 先校正三个范围问题

### 0.1 「1945」不是 Capcom 的 1942 续作

- **1942** 是 Capcom 1984 年的纵向卷轴射击，特征是翻滚回避、双机编队僚机、以及独立的“击坠率”百分比最高分。[1942](https://en.wikipedia.org/wiki/1942_(video_game))
- **Strikers 1945** 是 Psikyo 1995 年的作品，特征是普通弹/蓄力弹/炸弹三套攻击、金条、关卡金银牌评级。[Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945)
- Capcom 的 194X 系列实际是 1942 → 1943 → 1943 Kai → 1941 → 19XX → 1944，没有名为《1945》的正作。[1942](https://en.wikipedia.org/wiki/1942_(video_game))

**结论**：把两者当同一产品线会混淆“翻滚回避”和“蓄力弹/炸弹”两套完全不同的操作。本文分开处理。**Capcom《1945》：未检索到可靠来源。**

### 0.2 Raiden 系列的关卡数并不统一

初代与 II 为 8 关，III 为 7 关，IV 为 5 关，V 改为按表现分支的路线。[Raiden (series)](https://en.wikipedia.org/wiki/Raiden_(series))

**结论**：引用“Raiden 是 8 关”时只能指初代/II，不能当系列通例。

### 0.3 Mushihimesama 的「hyper / grazing」需要分开核实

- **Hyper** 在 DoDonPachi DaiOuJou 条目中被明确描述为“本作引入并延续到后续作品”的系统。[DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) 但该句不能证明 Mushihimesama 一定有 hyper。
- **Mushihimesama** 的 Wikipedia 条目 Gameplay 段为空，只确认了平台、版本与移植模式。[Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama)
- **Mushihimesama Futari** 的可核验计分是宝石计数与颜色切换，不是擦弹。[Mushihimesama Futari](https://en.wikipedia.org/wiki/Mushihimesama_Futari)

**结论**：
- 「Mushihimesama 的 hyper 具体规则」：**未检索到可靠来源**。
- 「Mushihimesama 的 grazing 计分」：**未检索到可靠来源**；可核验的擦弹/近接计分在 Touhou 与 Shikigami no Shiro。后文不把这两项写成 Mushi 的事实。

---

## 1. 模式轴：街机流程、续关、练习与 Boss Rush

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 8 关主线 + 通关循环 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game)) | 8 个难度递增关卡；通关第 8 关后回到第 1 关，难度提高。 | A |
| 续关从检查点开始 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game)) | 生命耗尽即 Game Over；投币续关后从最后到达的检查点继续，而不是重开整关。 | A |
| 二周目门槛 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 进入第二周目有复合条件（掉命数、被弹数、得分、蜜蜂收集等），并通向真 Boss。 | A |
| 4 档难度 × 6 关 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | Easy/Normal/Hard/Lunatic；每作 6 关，逐关变难。 | A |
| Extra 关与禁续关 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | Extra 通常要求不使用续关通关；部分作品要求 Normal 及以上 1CC。 | A |
| 无伤通关隐藏奖励 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945) | 日版街机在整局不掉命通关后解锁隐藏片尾奖励。 | A |
| 移植版禁续关 Arrange | [Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama) | PS2 Arrange 模式开局火力更高，但**不能续关**；持有至少一枚炸弹时撞弹/撞机不会死亡，而是自动放出一枚炸弹；可切换三种武器。 | A |
| 版本即模式 | [Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama) / [Mushihimesama Futari](https://en.wikipedia.org/wiki/Mushihimesama_Futari) | 后续移植收录 Novice / Original / Arrange / Version 1.5；Futari 为 Original / Maniac / 可解锁 Ultra，1.5 调整了宝石计数阈值与弹幕。 | A |
| 练习模式 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 家用移植加入关卡练习，可选择普通速度或慢速。 | A |
| 练习 + 回放 + 图鉴 | [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | Xbox 版加 Practice、Gallery、Replay；PS2 版加 Practice、Gallery、Side Story；Windows 版含 I.R. mode 与竖屏布局。 | A |
| 训练 + 回放 + 无弹模式 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | PS2 版加入 Death Label、No bullets mode、带回放的 Simulation（训练）模式、Gallery，以及四名二周目通关者的高分 DVD。 | A |
| Boss Rush | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | Death Label 为连续 Boss 战：全程最大火力、每场 Boss 前给满 Hyper；最终战同时打两只 Hibachi。 | A |
| Boss Rush（系列外） | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | 17.5《Sunken Fossil World》被条目描述为格斗游戏兼 Boss Rush。 | B |
| 慢弹/等待控制 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) / [Mushihimesama Futari](https://en.wikipedia.org/wiki/Mushihimesama_Futari) | PS 移植提供 wait control；Futari iOS 可在子弹很多时让子弹变慢。 | A |

**模式轴观察**：

1. 街机原作的“内容量”主要靠**二周目与真 Boss**，不是靠关卡数堆叠。DoDonPachi 的二周目甚至用多项条件把“是否够格”变成筛选。[DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi)
2. 家用移植普遍把“练习”和“回放”当成正式功能，而不是附加菜单。Ikaruga 的慢速练习、DaiOuJou 的带回放训练、Shikigami 的 Replay 都是 A 级证据。
3. Boss Rush 在 Cave 系里不是简单连战，而是**改写资源规则**（满火力、每场满 Hyper），让玩家专注学 Boss。[DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) 这比“把 Boss 血量乘 5”更有设计含量。

---

## 2. 操作轴：慢速、锁定、蓄力与保命键

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 8 方向移动 + 双人 | [Zero Gunner](https://en.wikipedia.org/wiki/Zero_Gunner) | 摇杆八方向移动；街机支持最多 2 人；三架直升机，各自有普通射击与全屏声波。 | A |
| 锁定后自由机动 | [Zero Gunner](https://en.wikipedia.org/wiki/Zero_Gunner) | Lock-on 后可在屏幕内自由移动，同时持续射击同一目标。 | A |
| 按住降速 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | 按住 Shift 进入 focus：移动变慢、判定点可见（Perfect Cherry Blossom 起）、攻击聚焦。 | A |
| 按住攻击降速 + 自动回收 | [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 按住攻击键时移动变慢，且屏幕上的道具全部自动回收。 | A |
| 蓄力弹 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945) | 每架飞机有普通射击、蓄力射击、炸弹三套攻击；普通与蓄力都可靠道具强化。 | A |
| 炸弹清弹 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945) | 炸弹清掉屏幕上的杂兵与子弹。 | A |
| 炸弹消弹 + 广域伤害 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game)) | 炸弹可抵消敌方火力，并在大范围内造成伤害。 | A |
| 炸弹无敌 + 清弹 + 全屏伤害 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | 使用炸弹后短暂无敌、清除大量子弹、对所有敌人造成高伤害。 | A |
| 死亡炸弹窗口 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | 中弹后约 0.3 秒内放炸弹可避免掉命，称为 deathbomb。 | A |
| 翻滚回避 | [1942](https://en.wikipedia.org/wiki/1942_(video_game)) | 专用翻滚键让飞机暂时“翻出”战场，躲开危险。 | A |
| 双机编队僚机 | [1942](https://en.wikipedia.org/wiki/1942_(video_game)) | 一种道具让飞机以 Tip Tow 编队获得两架小型僚机。 | A |
| 同色吸收 / 异色击杀 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 机体可切黑白极性；同色子弹被吸收，异色子弹造成伤害；对异色敌人双倍伤害。 | A |
| 吸收充能追踪激光 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 每吸收 10 发同色子弹提升一级追踪激光，最高 12 级；没有道具拾取。 | A |
| 双人协作射击 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game)) | 双人合作时，射击另一名玩家的飞机可产生伤害敌人的特殊弹。 | A |
| 受击自动放炸弹 | [Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama) / [Mushihimesama Futari](https://en.wikipedia.org/wiki/Mushihimesama_Futari) | PS2 Arrange：持有至少一枚炸弹时撞弹或撞机不会死亡，而是自动放出一枚炸弹；Futari Xbox 360 Arrange 同样在受击时自动放炸弹（没有炸弹则照常死亡）。 | A |
| 角色切换 + 残影护盾 | [Mushihimesama Futari](https://en.wikipedia.org/wiki/Mushihimesama_Futari) | Xbox 360 Arrange 可在 Reco/Palm 间切换，非活跃角色以残影随行射击，切换时给短暂护盾。 | A |

**操作轴观察**：

1. “慢速”不是降低难度，而是**把移动精度换成输出/回收效率**。Touhou 的 focus 同时改移速、判定可视、攻击形态；Shikigami 的按住攻击同时改移速与道具回收。[Touhou](https://en.wikipedia.org/wiki/Touhou_Project) / [Shikigami](https://en.wikipedia.org/wiki/Shikigami_no_Shiro)
2. Zero Gunner 的 lock-on 值得单独注意：它解决的是“躲的时候不能打”的矛盾，而不是给玩家自动瞄准。**其是否影响得分：未检索到可靠来源。**
3. 保命键的设计分成两派：**预判型**（炸弹，事前资源）与**补救型**（deathbomb / 自动炸弹，事后窗口）。两者对新手宽容度完全不同。

---

## 3. 系统轴：风险计分、极性、资源与 rank

### 3.1 擦弹与近接倍率

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 擦弹计数 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | Graze 计数器统计“进入角色贴图但未进入判定点”的子弹数量，并给予得分奖励。 | A |
| 离弹距离倍率 | [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 角色中心离敌弹越近，击破敌人与拾取道具的得分倍率越高；倍率按距离计算。 | A |
| 擦弹模式加成掉落 | [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 在 shikigami 模式击破敌人时，倍率也作用于掉落物数量，且掉落物全部自动回收。 | A |
| 吸收而非擦弹 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 同色子弹被直接吸收，转化为激光能量；没有“擦过”判定。 | A |
| 擦弹计分的 Mushi 版本 | — | **未检索到可靠来源**（见 0.3）。 | — |

**为什么这条轴重要**：它把“弹幕密度”从纯威胁变成可消费资源。Touhou 的 graze 只要求“贴身”，Shikigami 的倍率则明确按距离连续缩放，后者更容易做出“越危险、收益越高”的平滑曲线，也更适合网页端的即时反馈。

### 3.2 极性 / 属性切换

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 双极性切换 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 黑白两极性；同色吸收、异色伤害；对异色敌人双倍伤害。 | A |
| 无道具成长 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 游戏没有道具/火力升级拾取；成长来自吸收同色子弹。 | A |
| 连锁同色击破 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 连续击破 3 个同色敌人形成 chain；继续同色使奖励翻倍，最高 25,600；击破错色则重置。 | A |
| 吸收→激光等级 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 每吸收 10 发同色子弹提升一级 homing laser，最高 12 级。 | A |
| 挑战/限制玩法 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 原型含有限弹药模式；移植版含不射击的 “Bullet Eater” 玩法、挑战模式排行。 | A |

**判断**：极性是“规则级”机制，不是数值级。它要求敌人子弹、敌机、UI、音效、教学全部围绕两种颜色重建。对 plane_war 来说，收益高但**成本与误读风险都最高**，不建议作为第一项移植。

### 3.3 资源转换：Hyper、炸弹与 MAXIMUM

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| Hyper 槽 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | 大连段、近身攻击、在连段中吃蜜蜂都会积攒 Hyper 槽；槽满后从屏幕下方掉落 Hyper 道具。 | A |
| Hyper 效果 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | 激活时取消屏幕全部子弹，提升射击/激光火力，并提高连段累积效率（小兵给更多 hit，大敌与 Boss 连段更快）。 | A |
| Boss 战消弹转分 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | Boss 战中槽满时，屏幕子弹被取消并转化为得分奖励。 | A |
| 炸弹超量→MAXIMUM | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 炸弹数量超过上限后进入 MAXIMUM 模式，按多余炸弹提升得分倍率。 | A |
| 掉命→炸弹上限提升 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 炸弹槽随掉命从 3 扩到 6，作为落后补偿。 | A |
| 炸弹类型随射击模式 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 两种炸弹取决于当前是 Shot 还是 Laser 模式；炸弹均能清弹。 | A |
| 蓄力激光的取舍 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 按住射击把 options 收束成光束，同时降低自机速度；近距离激光有额外伤害。 | A |
| 数量型资源 | [Battle Garegga](https://en.wikipedia.org/wiki/Battle_Garegga) | 小型炸弹 token 可合成大炸弹；炸弹威力按百分比保留；最多 5 枚大炸弹。 | A |

**闭环结构**：DoDonPachi DaiOuJou 的 Hyper 形成“打得好 → 资源多 → 消弹/连段更稳 → 打得更好”的正反馈。来源明确的是“槽满后掉落道具、需要主动激活、激活后消弹并提升火力与连段效率”；**这套结构是否足以避免滚雪球，来源没有给出平衡性结论**，属于需要本项目实测的设计判断。[DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou)

### 3.4 连锁、奖章与金条

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 连段槽 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | Get Point System：击破敌人填充连段槽，槽会持续衰减；用激光压住大敌可维持连段。 | A |
| 蜜蜂奖章 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 13 只金色蜜蜂，价值随收集递增；掉命后重置。 | A |
| 星形/巨型星/五角星道具 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 不同掉落物对应不同得分/效果。 | B |
| 奖章递增与掉落重置 | [Battle Garegga](https://en.wikipedia.org/wiki/Battle_Garegga) | 奖章从 100 递增到 10,000；若掉出屏幕则重置。 | A |
| 金条 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945) | 击破特定建筑/敌人出现金条，拾取加分。 | A |
| 连段同色加成 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 连续同色击破使 chain 奖励翻倍；错色重置。 | A |

**共同点**：这些系统都在回答同一个问题——“玩家是否愿意为了更高的分，承担更高的风险/更严的路线”。奖章要求“不能漏”，连段要求“不能断”，蜜蜂要求“记住位置”。它们比“击杀 +10 分”更能塑造路线记忆。

### 3.5 动态难度 / Rank

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 可调 rank | [Battle Garegga](https://en.wikipedia.org/wiki/Battle_Garegga) | Rank 随开火、火力提升、拾取道具上升；死亡时下降，剩余命越少降得越多。 | A |
| Rank 的战术后果 | [Battle Garegga](https://en.wikipedia.org/wiki/Battle_Garegga) | 玩家会主动压火力、甚至故意送命来降 rank；形成“变强即变难”的反直觉循环。 | B |
| 弹幕伪装 | [Battle Garegga](https://en.wikipedia.org/wiki/Battle_Garegga) | 真实配色子弹与碎片会与背景混淆；Type 2 可改为黄色圆点提高可读性。 | A |
| 分数驱动难度 | plane_war 现状（非外部产品） | 得分直接映射玩家等级/敌方等级，且封顶 18 级。 | 项目内代码 |
| 二周目筛选 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 用掉命数、被弹数、得分、蜜蜂收集等条件决定能否进二周目。 | A |
| Raiden/Strikers 的隐藏 rank | — | **未检索到可靠来源**。 | — |

**风险提示**：Battle Garegga 的 rank 与 plane_war 的 `SCORE_AXIS` 是两种不同的“单一真源”。如果同时存在“得分越高敌人越强”和“开火越多 rank 越高”，玩家会遇到双重惩罚，且难以归因。若要做，必须二选一，或明确 rank 只影响局部参数（如敌弹速度），不影响等级轴。

### 3.6 结算与评级

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 关卡金银牌 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945) | 通关后按每关用时、金条数、击坠数结算，达到阈值给银牌/金牌。 | A |
| NO MISS 奖励 | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) | 不掉命通关有 NO MISS 奖励。 | A |
| Spell card 分阶段 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | Boss 战按攻击阶段（spell card）推进，每阶段有独立弹幕与血量/时间条件。 | A |
| Spell card 奖励公式 | — | **未检索到可靠来源**（本次未取得逐条规则）。 | — |
| 连锁等级 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) | 同色连锁的奖励随连续数翻倍，最高 25,600。 | A |
| 高分录像 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | PS2 版附四名二周目通关者的高分 DVD。 | A |

---

## 4. 元进程轴：续关、1CC、回放与排行榜

| 要素 | 来源产品（链接） | 具体做法 | 证据 |
|---|---|---|---|
| 投币续关 | [Raiden](https://en.wikipedia.org/wiki/Raiden_(video_game)) | 生命耗尽后投币续关，从最后检查点继续。 | A |
| 1CC 作为解锁条件 | [Touhou Project](https://en.wikipedia.org/wiki/Touhou_Project) | Extra 关通常要求不续关通关；部分作品要求 Normal 以上 1CC。 | A |
| 禁续关模式 | [Mushihimesama](https://en.wikipedia.org/wiki/Mushihimesama) | PS2 Arrange 无续关，逼玩家在单局内完成。 | A |
| 无伤隐藏奖励 | [Strikers 1945](https://en.wikipedia.org/wiki/Strikers_1945) | 整局不掉命通关解锁隐藏片尾。 | A |
| 本地/在线排行 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) / [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | Ikaruga 移植含挑战模式排行，Xbox 360 版加排行榜/成就/回放；DaiOuJou Xbox 360 版含在线得分排名与回放保存。 | A |
| 回放模式 | [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | Xbox 版含 Replay；PS2 版含 Side Story。 | A |
| 训练回放 | [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | PS2 Simulation（训练）模式带回放功能。 | A |
| 图鉴/画廊 | [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) / [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | 两作移植版均含 Gallery。 | A |
| 成就 | [Ikaruga](https://en.wikipedia.org/wiki/Ikaruga) / [DoDonPachi DaiOuJou](https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou) | Xbox 360 版含成就系统。 | A |
| 竖屏/TATE | [DoDonPachi](https://en.wikipedia.org/wiki/DoDonPachi) / [Shikigami no Shiro](https://en.wikipedia.org/wiki/Shikigami_no_Shiro) | 提供 TATE/YOKO 显示选项；Shikigami Windows 版含竖屏布局。 | A |

**对无后端项目的含义**：

- 在线排行榜、跨玩家回放、云存档都需要服务端；plane_war 目前是纯静态 + FTP 部署，不应把这些当近期目标。
- 可先做**本地**：最佳分、最佳连段、单局回放（记录输入/seed，而不是视频）、结算评级、图鉴解锁。
- 1CC/禁续关可以作为**本地徽章**，不需要服务器验证；但要接受“可被本地篡改”，不要把它当竞技排名。

---

## 5. 对 plane_war 的迁移评估

现状基线（读码核对）：

- 480×720 纵向弹幕，Canvas 2D，零构建、无后端。
- 无限模式 + 6 关战役（数据驱动）；Boss Rush 原型在 `?bossrush=1`。
- 28 个技能、15 种道具；`POWERUP_DURATION` 是道具时长单一真源。
- 8 种参数化弹幕；3 类 Boss + 阶段系统。
- `SCORE_AXIS` 把得分映射为玩家/敌方等级；`levelFromScore` 是唯一换算入口。
- 玩家判定为 `PLAYER.hitRadius = 20`，注释明确“略宽于贴图便于弹幕贴身擦过”。[`js/config.js`](../js/config.js)

| 机制 | 与现有系统的关系 | 成本 | 风险 | 建议 |
|---|---|---|---|---|
| 擦弹计数 + 风险倍率 | 只需在现有“敌弹 vs 玩家”循环里加一个外环；可复用 `addScore`、HUD、成就 | S | 低；需防刷分与难度螺旋 | **P0，首选** |
| 离弹距离连续倍率 | 同上，但需每帧按距离算倍率，开销略高 | S–M | 中；触屏上“贴身”可读性差 | P0 的备选实现 |
| Hyper 槽（消弹 + 火力） | 可复用技能/能量/炸弹；需新资源条与激活键 | M | 中；正反馈滚雪球 | P1 |
| Boss Rush 独立规则（满资源/每场重置） | 已有 `js/modes/bossrush.js`，只需改资源初始化与结算 | S | 低 | P1 |
| 关卡评级（时间/击坠/无伤） | 复用关卡统计与结算 UI | S | 低 | P1 |
| 奖章/蜜蜂路线 | 需要固定掉落点与“漏掉重置”规则 | S–M | 中；与随机掉落冲突 | P2 |
| 慢速精确移动 | 输入层加“按住降速”，不改弹幕 | S | 低；触屏需虚拟键 | P2 |
| 锁定后自由机动 | 需要目标选择与持续伤害重算 | M | 中；会改变输出模型 | P3 |
| 极性切换 | 需要颜色语言、敌弹/敌机/UI/教学全改 | L | 高；误读成本大 | P3，暂缓 |
| 动态 rank | 与 `SCORE_AXIS` 冲突，需拆单一真源 | M | 高；双重惩罚 | 暂不做 |
| 在线排行榜/云回放 | 无后端 | L | 高 | 不做；先本地 |
| Wait control | 浏览器已有敌弹预算与帧率保护 | — | 低 | 不需要 |

### 5.1 为什么首选“擦弹风险倍率”

1. **它把已有内容变成深度**：弹幕密度、8 种弹型、Boss 阶段都已经存在；擦弹只是给“躲得好”一个即时价格，不需要新关卡、新美术、新后端。
2. **它补的是“操作表达”而不是“数值成长”**：现有 28 技能/15 道具主要解决构筑，擦弹解决“这一秒怎么走”。
3. **它天然适配 `SCORE_AXIS`，但必须加护栏**：如果擦弹分直接进 `score`，高手会被自己的得分推高难度，形成“越强越难”的隐形惩罚。建议把擦弹奖励与战斗得分分开记账，或只按很低比例计入等级轴。
4. **它有两条可核验的成熟范式**：Touhou 的离散计数适合做“命中次数”，Shikigami 的连续距离倍率适合做“危险度”。两者都能在 480×720 上手感明确。

---

## 6. 首选方案草案：擦弹风险倍率（仅设计，不改代码）

### 6.1 规则

- 判定环：`GRAZE.radius = PLAYER.hitRadius * 1.7`（约 34px）。不改变现有 20px 命中判定，只在命中判定之外加一圈。
- 每颗敌弹**只计一次**：子弹对象加 `grazeSeen`，进环时置位；对象池回收时重置。
- 危险度 `G`：每次擦弹 `+GRAZE.gain`，每秒自然衰减 `GRAZE.decay`，上限 `GRAZE.cap`。
- 得分倍率：`M = 1 + floor(G / GRAZE.step) * GRAZE.stepMult`，封顶 `GRAZE.maxMult`。
- 擦弹分：`grazePoint = GRAZE.point * M`，通过独立的 `addGrazeScore` 记账，不直接调用 `addScore`。
- HUD：自机外圈细环 + 一条危险度条；擦弹时环闪一下、播放轻音效；倍率≥1.2 时数字变色。

### 6.2 建议初值（待实测，不是行业标准）

| 参数 | 初值 | 理由 |
|---|---|---|
| `radius` | `hitRadius * 1.7` ≈ 34px | 比命中圈大约 14px，手指/机身仍能感到“贴身” |
| `gain` | 1 | 一次擦弹=1 点危险度，便于理解 |
| `decay` | 4 / 秒 | 不擦就掉，鼓励持续前压 |
| `cap` | 120 | 满槽约需 120 次擦弹，避免一瞬爆表 |
| `step` | 20 | 每 20 点一档，最多 6 档 |
| `stepMult` | 0.1 | 每档 +10%，满档 1.6× |
| `maxMult` | 1.6 | 与现有 `double` 道具的 2× 区分开 |
| `point` | 10 | 100 次擦弹约 1,000–1,600 分，相对首个轴点 8,000 分不喧宾夺主 |

### 6.3 接入点（按现有代码结构）

- `js/config.js`：新增 `GRAZE` 常量块；`PLAYER.hitRadius` 不动。
- `js/bullet.js`：`allocBullet()` 初始化 `grazeSeen: false`；`freeBullet()` 重置。对象池会复用，漏重置会导致“同一颗子弹第二次经过时不再计分”。
- `js/game.js`：在敌弹 vs 玩家循环（当前 `if (dist < PLAYER.hitRadius)` 处）加 `else if (dist < GRAZE.radius && !b.grazeSeen)` 分支；`grazeSeen = true`，累加 `G`，播反馈。**不要**在这一支里 `removeBullet`。
- `js/player.js`：新增 `grazeGauge` / `grazeScore` 等运行时字段，开局清零；`grazeSeen` 属于子弹对象，放在 `js/bullet.js`。
- `js/hud.js`：画危险度条/倍率；复用现有 HUD 字体与配色。
- `js/game.js` 结算：`totalScore = combatScore + grazeScore`；`getBest()`/星尘按总分；`levelFromScore` 只用 `combatScore`（或按 30% 权重计入），避免难度螺旋。
- `js/meta.js`：新增本地成就“单局擦弹 N 次”“危险度满槽维持 X 秒”。
- `test/`：新增 `graze.test.mjs`，覆盖“每弹只计一次”“对象池复用后重置”“倍率封顶”“擦弹分不进等级轴”四条。

### 6.4 需要先验证的假设

1. 触屏玩家能否稳定感到 34px 环？如果不行，改为“距离倍率”而不是“进环计数”。
2. 擦弹分占比是否 ≤25%？超过会让“躲”压过“打”，改变游戏身份。
3. 高压 Boss 战中 `G` 是否会长期满槽？如果满槽是常态，倍率就失去区分度，应提高 `decay` 或降低 `cap`。
4. 与 `double` 道具、得分技能、商城得分加成叠加后是否出现异常高分？需要单独跑一轮数值对照。

---

## 7. 来源缺口（明确未检索到可靠来源）

以下项目在本次可访问的来源中没有足够证据，**不应写成事实**：

| 项目 | 状态 | 说明 |
|---|---|---|
| Capcom《1945》 | **未检索到可靠来源** | 194X 系列无此正作；1945 指 Psikyo 的 Strikers 1945。 |
| Mushihimesama 的 hyper 规则 | **未检索到可靠来源** | Wikipedia 条目 Gameplay 段为空；Hyper 的明确描述在 DaiOuJou。 |
| Mushihimesama 的 grazing 计分 | **未检索到可靠来源** | 可核验的擦弹在 Touhou；Mushi Futari 的计分是宝石颜色/连锁。 |
| Touhou spell card bonus 的具体公式 | **未检索到可靠来源** | 只确认了 spell card 分阶段与 graze 计数。 |
| Raiden / Strikers 1945 的隐藏 rank | **未检索到可靠来源** | 只确认 Battle Garegga 的可调 rank。 |
| Zero Gunner 的 lock-on 是否影响得分 | **未检索到可靠来源** | 只确认“锁定后可自由机动并持续射击同一目标”。 |
| 各作具体销量/留存/收入因果 | **未检索到可靠且同类可比的公开数据** | 百科的销量数字不能推出玩法与留存的因果关系。 |
| 街机框体的实际投币率与难度设置 | **未检索到可靠来源** | 不同机房 DIP 设置不同，本文不引用。 |

---

## 8. 参考资料

1. *Raiden* (video game) — https://en.wikipedia.org/wiki/Raiden_(video_game)
2. *Raiden* (series) — https://en.wikipedia.org/wiki/Raiden_(series)
3. *1942* (video game) — https://en.wikipedia.org/wiki/1942_(video_game)
4. *Strikers 1945* — https://en.wikipedia.org/wiki/Strikers_1945
5. *Ikaruga* — https://en.wikipedia.org/wiki/Ikaruga
6. *DoDonPachi* — https://en.wikipedia.org/wiki/DoDonPachi
7. *DoDonPachi DaiOuJou* — https://en.wikipedia.org/wiki/DoDonPachi_DaiOuJou
8. *Mushihimesama* — https://en.wikipedia.org/wiki/Mushihimesama
9. *Mushihimesama Futari* — https://en.wikipedia.org/wiki/Mushihimesama_Futari
10. *Touhou Project* — https://en.wikipedia.org/wiki/Touhou_Project
11. *Shikigami no Shiro* — https://en.wikipedia.org/wiki/Shikigami_no_Shiro
12. *Zero Gunner* — https://en.wikipedia.org/wiki/Zero_Gunner
13. *Battle Garegga* — https://en.wikipedia.org/wiki/Battle_Garegga

项目内参考：

- `js/config.js`：`PLAYER.hitRadius`、`POWERUP_DURATION`、`SKILLS`、`SCORE_AXIS`、`levelFromScore`、`COMBO`。
- `js/game.js`：敌弹 vs 玩家判定循环、`addScore`、结算与 `getBest()`。
- `js/bullet.js`：敌弹对象池与 `freeBullet` 重置字段。
- `js/modes/bossrush.js`：现有 Boss Rush 原型。
- `docs/design-research.md`：既有 Brotato / Vampire Survivors / Raiden IV 调研，本文不重复其结论。
- `docs/gameplay-modes-proposal.md`、`docs/gameplay-depth-proposal.md`：模式轴与构筑轴提案，本文只补“操作表达/风险计分”的空白。
