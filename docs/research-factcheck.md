# 检索文档事实核验（阶段 2 前置）

> 核验对象：`docs/research-arcade-danmaku.md`（OpenCode，338 行）、`docs/research-mobile-shmup.md`（Trae IDE，197 行）。
> 任务来源：主持人 Codebuddy 指派——对**将进入最终方案的高影响断言**做交叉核验。
> **只写本文档，不改两位作者的原文。**
> 硬纪律遵守情况：**未发起长链检索**。核验方式是把文档自带引用链接的原文抓下来做逐字比对（Wikipedia 走 `action=raw` 取 wikitext 后 grep，中文站走一次 curl 抓取），每次断言最多一次取源。另按要求对 Mushihimesama hyper 做**一次**检索尝试。

## 核验规则

| 结论标记 | 含义 | 处置规则 |
|---|---|---|
| ✅ 核实 | 来源原文逐字支持该断言（含数字） | 可直接进入方案，标注来源等级 |
| ✅ 核实（需精确化） | 断言方向正确但表述比原文宽/窄 | 进入方案时按本文给的精确表述改写 |
| ⚠️ 降级 | 仅有社区/攻略站来源，权威来源不覆盖该细节 | 范式可用，**具体数字不得写入设计参数** |
| ❌ 引文不实 | 所引来源并不包含该断言 | 撤回该来源；想法可保留，但须另找出处 |
| ◻ 未复核 | 未取源（影响低或取不到） | 保留缺口声明 |

---

## 1. 街机/弹幕象限（`research-arcade-danmaku.md`）

| # | 断言（原文位置） | 核验结论 | 原文逐字依据 | 处置 |
|---|---|---|---|---|
| A1 | Ikaruga：连续击破 3 同色形成 chain，继续同色使奖励翻倍，**最高 25,600**，错色重置（`:136`、`:191`、摘要 `:28`） | ✅ 核实（需精确化） | "Destroying three enemy fighters of the same color in a row will earn the player a chain bonus. The player will earn 100 points for their first chain bonus, and double the amount for each bonus thereafter. These bonuses can be multiplied up to a maximum of 25,600, but **if interrupted by destroying an enemy out of order**, the bonus will be reset." | 数字与递增全部成立。但重置条件原文是"**按错误顺序击破**（out of order）"，比"击破错色"更宽（包含连锁序列被打断的其他情形）。方案里应写"错序即重置"，不要写成仅"错色" |
| A2 | Ikaruga：每吸收 10 发同色子弹 homing laser +1 级，上限 12 级；**无道具拾取**（`:103`、`:137`） | ✅ 核实（可补强） | "_Ikaruga_ does not feature any pick-ups or power-ups ... The power of the attack increases one level for every 10 enemy bullets absorbed. Each level is equal to one laser, with a maximum of 12 which can be stored." | 两条均核实。补一条原文同段的量化事实可强化设计参照：**"A homing laser is 10 times more powerful than a standard shot."** ——这是"吸收转化为可量化输出"的现成换算比 |
| A3 | Touhou：中弹后约 **0.3 秒**内放弹可免掉命（deathbomb）（`:99`） | ✅ 核实 | "The player can use one during a short period (about 0.3 seconds) after being hit by a bullet to avoid losing a life, which is known as a deathbomb." | 可直接引用。注意这是**补救型**保命键，与文档 §2 小结的"预判型/补救型"分派自洽 |
| A4 | Touhou：graze 统计"进入贴图但未进入判定"的子弹并给分（`:122`）；4 难度 × 6 关、Extra 需禁续关（`:21`、`:20`） | ✅ 核实 | "graze counter tracks how many bullets entered the character sprite but avoided its hitbox, rewarding the player with a score bonus." ／ "four difficulty levels ... Regardless of the difficulty choice, there are six stages in each game" ／ "there is an extra stage typically unlocked by completing the game without using any Continue" | 擦弹的定义式表述准确（"进贴图不进判定"是原文直译）。**这是本项目最便宜的迁移项，来源可靠性没有问题** |
| A5 | Battle Garegga：rank 随开火/火力提升/拾取上升，死亡下降且**剩余命越少降得越多**（`:174`）；奖章 100→10,000、掉出屏幕则重置（`:164`）；小型炸弹 token 合成大炸弹、威力按百分比、**最多 5 枚**（`:153`） | ✅ 核实 | "Firing and powering up the main weapon, as well as picking up various items, will increase the difficulty ... Losing a life will decrease the difficulty (rank) ... The fewer lives a player has when they die, the more rank is decreased" ／ "from 100 to 10,000 points, but if a medal falls off the bottom of the screen, the next one to spawn [resets]" ／ "Up to **five** Large Bombers can be in stock" | 三条数字全核实。可**升 A 级** |
| A6 | Garegga：玩家会主动压火力、甚至故意送命来降 rank（原文标 **B 级**，`:175`） | ✅ 核实（**可升 A**，且语义需补完） | "Players are thus 'forced' to keep themselves powered down, conserve shots, and **lose lives on purpose** in order to keep the last few stages of the game playable" | 升为 A。更重要的是原文给出**动机**：这么做是为了"让最后几关仍然可打"——即 rank 系统会把玩家逼向"自废武功"。**这正是本项目 `SCORE_AXIS` 必须警惕的反面教材**，建议把这条写进评审发言 |
| A7 | Strikers 1945：普通弹/蓄力弹/炸弹三套攻击、炸弹清弹清兵（`:95`、`:96`）；金条 + 按用时/金条/击坠数评银牌金牌（`:105` 相关）；日版整局不掉命解锁隐藏片尾（`:69`） | ✅ 核实 | "charged shot, and a bomb that clears the screen of minor enemies and bullets. Both normal and charged shot can be strengthened by grabbing power-[ups]" ／ "the player's time, number of gold bars, and number of enemies killed are added up for each level and, if high enough, marked with a silver or gold medal" ／ "a hidden post-credits bonus can be unlocked if the player beat the entire game without losing a life" | 全部核实。结算评级（用时/收集/击坠三维度）与本项目"关卡 schema 扩元数据"完全同构，可直接引用 |
| A8 | 缺口表：**"Mushihimesama 的 hyper 具体规则：未检索到可靠来源"**（`:55`、`:126`、`:306`） | ✅ 缺口成立（**阴性证据可加强**） | ① 该 Wikipedia 条目全文 `hyper`/`graze` **0 次出现**（本地 grep 可复核）；② 一次检索尝试的结果：bilibili《STG 原理导论·第二资源篇》明确"Hyper 系统...出场于《怒首领蜂大往生》《大复活》《最大往生》"，萌娘百科"hyper"条目的典型游戏列表为 大往生/大复活/最大往生/东方神灵庙/红莲四羽，**均未列虫姬** | 缺口不必再留空等：建议改写为"**Hyper 是怒首领蜂大往生系列的机制，虫姬未见记载**"，证据等级 B（多源阴性一致 + 归属明确，非官方说明书）。**评审时不要把 hyper 当作"虫姬可借鉴项"** |
| A9 | `:51` "Mushihimesama 的 Wikipedia 条目 **Gameplay 段为空**，只确认了平台、版本与移植模式" | ❌ **不实（更正）** | 该段确有玩法内容，并正是 `:70`/`:105` 所引规则的出处："Maniac mode where the player starts out with much more firepower but no continues. Also, if the player makes contact with a bullet or an enemy while holding at least one bomb, the player does not die and releases a bomb instead." | 文档内部自相矛盾（一边说该段为空，一边引同一来源当 A 级）。处置：更正为"Gameplay 段描述了模式差异与受击自动放弹，**但没有 hyper/擦弹记载**"。**注意：这一更正不影响 `:70` 断言本身——那条是对的** |
| A10 | `:52` "Futari 的可核验计分是宝石计数与颜色切换，不是擦弹" | ✅ 方向核实（辅证补充） | 虫姬条目的资源语言确为宝石/吸收类；另取到一份 C 级中文玩法描述（快游网《虫姬》）：「空中琥珀自机吸收范围大，地面琥珀吸收范围小」「放 BOMB...会导致当前分数倍率减少」「按住 A 键低速移动时子机会聚拢」 | 补一条 C 级辅证：**虫姬系用"琥珀/宝石收集 + 倍率"而非擦弹做风险计分**，且其炸弹会**扣减分数倍率**（风险-收益互斥的另一实现）。仅可作范式参考，不作数字依据 |

**本象限净结论**：文档整体可靠度高（10 条抽查中 8 条逐字核实），两处需改：A9 为事实性错误（且是文档内部矛盾），A1 需精确化；A8 的缺口可用阴性证据收口。**A6 的升格对评审最有价值**：它给出"动态 rank"的失败模式，而不是只有机制描述。

---

## 2. 移动端/网页象限（`research-mobile-shmup.md`）

| # | 断言（原文位置） | 核验结论 | 原文逐字依据 | 处置 |
|---|---|---|---|---|
| M1 | Sky Force：**4 星关卡评级**（收集星星/全歼/救单位/无伤）（`:22`） | ⚠️ 降级 | 所引为 TapTap 玩家评价页。Wikipedia《Sky Force》只支持"在关卡中获得星星"（"earn stars in levels by destroying enemies and bosses"），且 `Sky Force Reloaded` **重定向到 `Sky Force`**，条目内**无 `card` 相关内容** | 「多维关卡评级」范式可用；**"4 星 / 四条判定标准"不得作为设计参数引用**，标 C 级（玩家评价来源） |
| M2 | Sky Force：**30 张奖励卡（6 张限时 / 24 张永久）**（`:24`） | ⚠️ 降级 | 所引为波兰语成就/奖杯攻略站（graczpospolita.pl），属玩家攻略；权威来源未覆盖 30/6/24 三个数字 | 想法（掉落式永久强化 + 限时加成）可保留，**三个数字必须撤出方案文本**，或标"未核实的社区口径" |
| M3 | 小鸡舰队出击：**每日随机 1 个正向 BUFF + 1 个反向 DEBUFF**，被本文称为"mutator 词条系统的完美原型"（`:85`，并影响 `:144`、`:155` 的 Top5/M3 排序理由） | ❌ **引文不实（撤回来源）** | 已抓取所引 163 产品分析原文。全文**无**「减益 / DEBUFF / 每日随机一正一负」表述。该文实际写的是：① 「每日活动里面包括黄金矿洞、**每日挑战**和活动玩法（目前是古代遗迹）三个子玩法」；② 「点击金羽毛后，玩家会从**三个随机出的 BUFF** 中选择一个，作为本局游戏的局内强化。BUFF 分为两种：英雄和装备」 | **必须撤回**这条"完美原型"归因。① 该文佐证的是"**局内三选一随机 BUFF**"——与本项目**已有的升级三选一同构**，不构成 mutator 先例；② 每日挑战的存在可佐证"日常内容轮换"，但"一正一负词条"未证实。M3（突变词条）作为想法仍可评审，但**"来源=成熟产品已验证"这一论据不成立**，需另找出处或改为自研设计。**这条会直接影响主持人对 M3 的成本/风险判断，建议优先处置** |
| M4 | Galaga：tractor beam 捕获 → 击落携带者救回 → 双机合并"双倍火力但双倍受击面"（`:134`） | ✅ 核实（后半句降级） | "which can be rescued by another ship to give the player a 'dual fighter' with additional firepower" | 「捕获→救回→双机额外火力」A 级成立；**"双倍受击面"该来源未提及**（社区共识，B 级）。方案里把"风险"写成"受击面/操作难度上升"时必须标为待核实，或改为可自控的设计参数（我们自己定义代价） |
| M5 | 雷霆战机：**体力消耗 6/12/20/25 随难度递增**（`:70`） | ✅ 来源可靠 / ◻ 数字未逐条复核 | 所引为腾讯官方站的关卡消耗公告（`lt.qq.com` 官方 news 域），来源等级高；本次未展开逐值比对 | 体力制对本项目**不在候选**（单机零后端下它是纯摩擦设计，且 Top5 已被主持人列为可延后）。故标记为低影响、保留缺口即可 |

**本象限净结论**：文档的"强后端/可单机化/半可"三分法是**可直接使用的结构资产**，产品覆盖与链接完整性无问题。但三处数字型断言（4 星/30 卡/一正一负词条）证据强度不足，其中 M3 属**引文不实**，必须撤回归因。

---

## 3. 对阶段 3「各自出方案」的直接影响

1. **可放心引用的机制事实**（A 级，写方案不需再加免责声明）：Ikaruga chain 数值与递增、吸收 10 发→激光 1 级/上限 12/激光 10 倍于普弹、Touhou graze 定义、deathbomb 0.3s 窗口、Garegga rank 双向调节与"故意送命保持后期可玩"、奖章 100→10,000 与掉屏重置、Strikers 三套攻击 + 三维度金银牌 + 无伤隐藏片尾、Mushihimesama PS2 Arrange 无续关与持弹受击自动放弹、Galaga 捕获救回双机。
2. **必须改口径后才能进入方案**：
   - 擦弹/风险计分：Ikaruga 的重置是"错序"不是"错色"（A1）。
   - 动态 rank：**必须与 A6 的失败模式一起引用**——单独引用"rank 会变难"会误导，原文证据显示它会把玩家逼向自废武功。这一条与本项目 `SCORE_AXIS`（分数越高难度越高）同构，**是本项目最需要预演的风险**，建议在评审中作为独立议题。
   - Galaga 双机的代价：不要写成"双倍受击面"是既定事实（M4）。
3. **必须撤回/降级**：小鸡舰队"每日 1 正 1 负词条"作为 M3 的成熟产品先例（M3）；Sky Force 的 4/30/6/24 具体数字（M1、M2）。
4. **可用阴性证据收口的缺口**：Mushihimesama 的 hyper/grazing（A8）——改写为"Hyper 属怒首领蜂大往生系列，虫姬未见记载"，不必继续留空。
5. **文档内部错误**：`research-arcade-danmaku.md:51` "Gameplay 段为空"（A9），建议作者自行更正以免与 `:70`/`:105` 冲突。

---

## 4. 本次取源清单（逐字比对用的原始来源）

- [Ikaruga — Wikipedia](https://en.wikipedia.org/wiki/Ikaruga)（Gameplay 段全文）
- [Touhou Project — Wikipedia](https://en.wikipedia.org/wiki/Touhou_Project)（graze / deathbomb / 难度与关卡 / Extra 禁续关）
- [Battle Garegga — Wikipedia](https://en.wikipedia.org/wiki/Battle_Garegga)（rank 调节 / 奖章递增 / 炸弹 token 合成与上限）
- [Strikers 1945 — Wikipedia](https://en.wikipedia.org/wiki/Strikers_1945)（蓄力弹与炸弹 / 金条与金银牌 / 无伤隐藏片尾）
- [Mushihimesama — Wikipedia](https://en.wikipedia.org/wiki/Mushihimesama)（Maniac/Arrange 无续关与受击自动放弹；全文无 hyper/graze）
- [Galaga — Wikipedia](https://en.wikipedia.org/wiki/Galaga)（tractor beam 捕获与 dual fighter）
- [Sky Force — Wikipedia](https://en.wikipedia.org/wiki/Sky_Force)（`Sky Force Reloaded` 重定向至此；仅证实关卡获得星星，无 card 系统）
- [小鸡舰队出击 产品分析 — 网易](https://c.m.163.com/news/a/J22DPGO90526DPBA.html)（每日活动三子玩法；金羽毛→三个随机 BUFF 选其一）
- [STG原理导论——第二资源篇 — 哔哩哔哩](https://www.bilibili.com/read/cv8996565/)（Hyper 系统归属：大往生/大复活/最大往生）
- [hyper（游戏术语） — 萌娘百科](https://zh.moegirl.org.cn/zh/Hyper(%E6%B8%B8%E6%88%8F%E6%9C%AF%E8%AF%AD))（典型游戏列表，未列虫姬）
- [虫姬 — 快游网](http://m.kuai8.com/game/cj/)（C 级辅证：低速移动、BOMB 扣分数倍率、空中/地面琥珀吸收范围）
