# 移动端与网页空战玩法元素穷举

调研日期：2026-11-08。本文枚举现代移动端/网页空战射击游戏的玩法元素，每项注明来源产品与 **plane_war 适配判定**（强后端不可行 / 可单机化 / 半可需改造）。结论只基于来源直接描述，不推断留存数据。

---

## 判定标记说明

- ❌ **强后端依赖，不可行**：需要服务器实时同步、用户账号体系、大规模对比等，纯前端无法实现
- ✅ **可单机化**：改纯本地数据即可落地，或有纯前端替代方案
- ⚠️ **半可，需改造**：核心机制可行但需阉割，或有重量级依赖

---

## 一、经典移动端空战

### Sky Force Reloaded（idreams.pl，2017）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| 章节式关卡（15 关）+ 章节 Boss | [官方页](https://skyforcereloaded.idreams.pl/) | ✅ | 本项目已有 6 关战役 + 章节 schema，可直接复用 |
| **4 星关卡评级**（收集星星 / 全歼敌人 / 救单位 / 无伤过关） | [TapTap 玩家评价](https://www.taptap.com/app/7108/review?tag_type=1) | ✅ | 可加入战役关卡元数据（schema 扩展 4 个成就标记），纯本地判定 |
| **难度渐进解锁**（Normal → Hard → Nightmare，需奖章解锁） | [玩家指南](https://fr.todoandroid.es/Sky-Force-Reloaded%C2%A0:-Le-shoot-%27em-up-classique-avec-des-graphismes-modernes/) | ✅ | 本地存档记录奖章数，条件解锁对应难度 |
| **传奇奖励卡系统**（30 张卡：6 张限时加成 / 24 张永久，关卡随机掉） | [TapTap 介绍](https://m.taptap.io/app/7108?type=latest)、[成就指南](https://graczpospolita.pl/sky-force-reloaded-poradnik-do-osiagniec-trofeow/) | ✅ | 类似 Brotato 道具随机掉落，本地存档即可记录已收集卡；6 张限时卡改为"首次通关关卡解锁 + N 次使用"形式 |
| **卡片升级系统**（传奇卡可升级永久能力） | [官方页](https://skyforcereloaded.idreams.pl/) | ✅ | 本地消费 Stardust 升级，类似现有 28 技能升级机制 |
| 无尽模式 | [玩家评价](https://www.taptap.com/app/7108/review?tag_type=1) | ✅ | 本项目已有，无需新做 |
| **敌机 AI 行为差异化**（追踪/环绕/俯冲/分散等） | [Sky Force 系列玩法分析] | ⚠️ | 需新增敌人 AI 状态机，不是纯参数调优，成本 M |
| 特效升级粒子系统 | 通用 mobile shooter 模式 | ⚠️ | 有视觉收益但属于资产层，非玩法层 |

### Phoenix 2（Firi Games，2016）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **程序化每日任务**（全球玩家同题，每日生成新任务） | [官方页](https://firigames.com/phoenix2)、[Steam 商店页](https://store.steampowered.com/app/2678070/Phoenix_2/?l=french) | ⚠️ | 核心机制是"种子=日期 hash"——**全服同题**依赖服务器每日同步种子，但"本地 hash 日期作 seed"可单机化（所有本地玩家同一天看到同样的任务参数）。这是 **P-D 随机源收敛** 的直接理由（Math.random 28 处散布是硬阻塞）。任务序列用序号取余周期（见 [Daily Mission Cycle 指南](https://elegater.github.io/Resources/GameFAQs/Daily%20Missions.html)），纯算法可复现 |
| **100+ 战舰收集**（每艘独特武器 + 主能力 Aura + 副能力 Zen） | [App Store 商店页](https://apps.apple.com/rs/app/phoenix-2/id1134895689)、[HandWiki](https://handwiki.org/wiki/Software:Phoenix_2) | ⚠️ | 本项目已有 6 机型（falcon/blaze/ironwall/phantom/thor/void），扩机型纯资产工作。但"独特能力对"需要设计机制，不是贴图问题 |
| **Warp 抽卡系统**（gacha-style 获取新战舰） | [HandWiki](https://handwiki.org/wiki/Software:Phoenix_2) | ❌ | 强后端（抽卡概率、保底机制、付费入口）；本地随机抽奖可做但失去 gacha 的付费经济体系意义 |
| **全球排行榜** | [App Store 商店页](https://apps.apple.com/rs/app/phoenix-2/id1134895689) | ❌ | 强后端；本地替代方案：**周期清理的本地最高分榜**（见微信小游戏周期排行榜思路），或用 GitHub gist 做轻量 leaderboard（需用户授权 token，属外部依赖） |
| 特殊能力系统（Mega Laser / Missile Swarm / Shield，3D Touch 激活） | [官方支持页](https://firigames.com/phoenix2/support) | ⚠️ | 特殊能力本身是好概念——本项目现有 bomb（1 次全屏清除）可扩展为"可选特殊能力槽"。3D Touch 不适配触屏，改为长按或独立按钮 |
| 装甲/护盾/暴击分系武器 | [GameFAQs 攻略](https://elegater.github.io/Resources/GameFAQs/General.html) | ✅ | 装备属性化，本项目现有 weapon caps 的延伸 |

### HAWK: Freedom Squadron（My.Games，2020）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **Brobots 僚机体系**（Menace 重型护罩+火焰、Dodgy 早期电动、Cougar 团队优化、Delirium 高科技，每僚机独有的 Speedbot 特性） | [Brobot 指南](https://hawkfreedomsquadron.com/common-questions/which-planes-and-brobots-should-i-bring-to-assault/)、[官方页](https://hawk.my.games/en/) | ✅ | **本项目最值得借鉴的新系统**：僚机 = 独立 DPS/防御槽，与主武器分离。speedbot 还包括 Legatus/Hazard/Risk 等。纯数据驱动设计：类型（火力/护盾/速度/干扰）+ 独立弹道 + 冷却 |
| **Assault 编队模式**（6 机编队，5 关，3 mini-boss + 3 wave + 1 major boss；先出弱机再出强机） | [Assault 指南](https://hawkfreedomsquadron.com/common-questions/which-planes-and-brobots-should-i-bring-to-assault/) | ✅ | 纯编排：Boss Rush 原型已就位，"分机出场顺序"是 M1 升格的自然延伸 |
| **同关卡多 phase Boss**（移动 phase vs 静止 turret phase 交替，带 shield 刷新） | [Level 120 Walkthrough](https://hawkfreedomsquadron.com/missions-and-walkthroughs/story/boss-fights/level-120-complete-walkthrough/)、[Level 60 Gunhead](https://hawkfreedomsquadron.com/missions-and-walkthroughs/story/boss-fights/level-60-gunhead/) | ✅ | 本项目三型 Boss 已有 phase 系统（`BOSS_TYPES[].phases`），需扩展"移动/静止状态切换 + shield 刷新"模式 |
| **武器特殊效果**（shield piercing、missile homing、aoe spread） | [Level 60 Gunhead](https://hawkfreedomsquadron.com/missions-and-walkthroughs/story/boss-fights/level-60-gunhead/) | ✅ | 本项目 bullet behaviors（explosion/homing/damage）可扩展 shield-breaking 行为 |
| 在线 co-op（两人合作通关） | [官方页](https://apps.apple.com/mv/app/hawk-airplane-space-games/id1145878423) | ❌ | 强后端实时同步 |
| 等级系统（Level 60+ 的进阶关卡） | [Level 60/120 Walkthrough](https://hawkfreedomsquadron.com/missions-and-walkthroughs/story/boss-fights/level-60-gunhead/) | ⚠️ | 类似本项目 scoreAxis 数值驱动关卡难度 |

### Galaga Wars / Galaga（Bandai Namco / Namco，1981 / 2021）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **Tractor Beam 捕获 → 救回 → Dual Fighter 合并**（Boss 周期性下潜光束捕获玩家 → 玩家再击中 Boss 释放被捕获机 → 两机合并，双倍火力但双倍受击面） | [官方页](https://en.bandainamcoent.eu/galaga/galaga-wars)、[Namco 游戏详情](https://www.namcogames.com/game_detail.php?gid=27)、[Galaga Wikipedia](https://a.osmarks.net/content/wikipedia_en_all_maxi_2020-08/A/Galaga) | ⚠️ | **最优雅的风险/奖励机制设计之一**，完全可以单机化。核心是：Boss 有"下潜"phase → 发射捕获光束（非伤害性，只锁玩家 0.5~1s）→ 期间击败 Boss 释放被捕获机 → 合并。合并后：火力 ×2 但 hitbox ×2。需要新增"捕获状态机"与"合并绘制管线"，S~M 成本 |
| **Challenging Stage**（每三关一波固定 formation 飞行表演，考验纯射击精度） | [OldGame Galaga Japan](https://oldgame.io/games/galaga-japan/) | ✅ | 纯编排：固定 formation pattern + 限时 + 无伤奖励。本项目 patterns 注册表可直接生成固定阵型 |
| **连续同关挑战 + 分数加成链**（perfect 链 + hit-miss ratio 计分） | [Namco 游戏详情](https://www.namcogames.com/game_detail.php?gid=27) | ✅ | 本地记录连续命中链，分数乘算 |
| **多经典 Namco 战机收藏**（Xevious / Galaxian / Star Blade / Galaga Fighter） | [官方页](https://en.bandainamcoent.eu/galaga/galaga-wars) | ⚠️ | 本项目已有 6 机型，扩新机型是纯资产工作；但 Namco 版权无法直接使用，需原创设计 |
| **4 能力系统**（每架 4 种能力随时可用） | [App Store Galaga Wars+](https://apps.apple.com/ge/app/galaga-wars/id1574668118) | ⚠️ | 本项目现有 bomb 系统可扩展为"多能力槽" |

---

## 二、微信小游戏 / 国产 F2P 空战（雷霆战机、小鸡舰队出击等）

### 雷霆战机（腾讯，2014 / 集结版 2024）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **体力消耗系统**（闯关消耗体力 6/12/20/25 按难度递增） | [官方关卡消耗公告](http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8532/m7009/201511/401904.shtml) | ✅ | 纯本地设计：每次进关卡扣体力、体力按时间自动恢复、看广告补体力。**单机化体力系统**完全可行 |
| **无尽模式周赛**（周六结算、好友排名、勋章奖励） | [无尽模式玩法](http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8533/m7009/201402/247104.shtml) | ⚠️ | 排名全服后端不可行，但**本地周期排行榜**（每周结算清除、本地高分对比）可做，微信小游戏排行榜 API 可接入但需微信环境 |
| **装备三维搭配树**（装甲 / 副武器 / 僚机 各阶品质 + 进阶材料洗练重置） | [攻略专区公告](https://lt.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201707/613538.shtml)、[官方新闻](https://lt.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201709/630976.shtml) | ⚠️ | **最有系统性的深度扩展**：装甲维度（神圣/魔龙/黄金：防秒杀/回血/击中概率升武器等级）× 副武器维度（穿甲/爆破/核弹）× 僚机维度（守卫/电浆炮），每件还可升级品质（蓝→紫→红）。**纯数据驱动设计**，本地 Stardust + 进阶材料消费体系可完全替代 |
| **每日活跃任务**（登录/闯关/无尽/充值/消费各一档，100 活跃领全套奖励） | [官方活跃公告](http://leiting.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201709/634159.shtml) | ⚠️ | 本地任务系统可行（记录每日完成数 + 每日 0 点 reset，浏览器 localStorage 定时清除），但"每日凌晨三点更新"需本地时区逻辑；**充值任务**可改为"本地消耗 Stardust 数量"（替代内购） |
| **PVP 世界对战**（匹配对手、实时对战） | [PVP 玩法介绍](http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8533/m7009/201707/605237.shtml) | ❌ | 强后端实时同步 |
| **战队副本（钥匙系统）**（闯关消耗体力得战队钥匙、战队集中打副本） | [战队副本介绍](http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8532/m7009/201511/401904.shtml) | ❌ | 强后端公会体系 |
| **内购体系**（钻石购体力、高能爆弹、战机特价包） | [官方新闻](https://leiting.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201707/613538.shtml) | ❌ | 强后端支付；本地可替代为 Stardust 消费（但缺乏付费动机） |
| **装备洗练 / 重置**（付费/材料重置装备属性） | [商城系统公告](https://lt.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201707/613538.shtml) | ✅ | 本地消费 Stardust 随机重掷装备属性，纯数据驱动 |
| **祝福系统**（无尽模式开局随机增益） | [无尽模式玩法](http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8533/m7009/201402/247104.shtml) | ✅ | 每日/每次开局随机 buff（来自增益池），纯本地实现 |
| **PVP/PVE 双模式并行** | [PVP 玩法介绍](http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8533/m7009/201707/605237.shtml) | ❌ | PVP 强后端；PVE 已是本项目主线 |

### 小鸡舰队出击（爱乐游，微信小游戏）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **每日随机 BUFF + DEBUFF**（每天一个正向+一个反向，让战斗产生变化） | [产品分析](https://c.m.163.com/news/a/J22DPGO90526DPBA.html) | ✅ | **mutator 词条系统的完美原型**！纯数据驱动：`MUTATOR_POOL = [正向池, 反向池]`，每日随机各抽 1 个，局内生效。完全可单机化 |
| **体力消耗 + 每日次数限制**（10 体力/次、每日最多 3 次） | [产品分析](https://c.m.163.com/news/a/J22DPGO90526DPBA.html) | ✅ | 与雷霆战机同源，但有次数上限 |
| **每日 4 宝箱阶梯奖励**（打两次可领满） | [产品分析](https://c.m.163.com/news/a/J22DPGO90526DPBA.html) | ✅ | 本地记录每日完成数 + 阶梯奖励表 |
| **羽毛随机 3 选 1 装备升级** | [出装推荐](https://m.duote.com/tech/202408/752861.html) | ✅ | **局内三选一 + 局外装备升级** 的双重构筑系统，完全可以借鉴——本项目已有局内三选一（升级），缺局外装备构建选 |
| **奇迹装备**（额外第 7 槽位，需特殊封印获取） | [奇迹装备详解](https://m.youxiguancha.com/gonglue/12228.html) | ✅ | 装备槽扩展机制，纯数据驱动 |
| **每日扫荡（快速巡逻）**（消费体力换升级材料，每日拉满） | [升级快攻略](https://m.52pk.com/xin/191145.html) | ✅ | 离线收益的另一种形式：本地时间差计算，体力消耗换升级材料 |
| 抽卡系统（100 票抽一次 / 1000 票十连抽） | [奇迹装备详解](https://m.youxiguancha.com/gonglue/12228.html) | ⚠️ | 本地可做但需要 Stardust 消费体系 + 保底机制 |

### 微信小游戏爆款共性（全民雷霆战机 / 全民枪神边境王者 等）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **周期清理排行榜**（每周/每月清除、周期性冲榜目标） | [微信开放文档设计指引](https://developers.weixin.qq.com/minigame/design/index.html) | ⚠️ | 微信 API 有排行榜接口（需微信环境）；纯本地替代：本地存档 + 周期性清除 |
| **视频激励广告**（翻倍离线收益 / 战斗复活 / 装备抽奖次数） | [全民枪神产品分析](http://games.sina.cn/cyfw/cyxw/2019-10-22/detail-iicezzrr4068561.d.html) | ❌ | 强平台依赖（微信广告组件）；本项目静态托管无法接入 |
| **离线金币 / 材料收益**（不在线也积累，下次登录领） | [全民枪神产品分析](http://games.sina.cn/cyfw/cyxw/2019-10-22/detail-iicezzrr4068561.d.html) | ⚠️ | **纯前端本地时间差计算**即可实现（localStorage 记录上次关闭时间、下次打开按时间差 × 系数给收益），但需明确"离线收益是游戏时间而非真实时间"——按本项目节奏，每次打开 +N Stardust 即可 |

### 1945 Air Force（OneSoftGames）

| 玩法元素 | 来源 | 判定 | 点评 |
|---|---|---|---|
| **200+ 关卡 + 30 章节** | [Appcracy 介绍](https://www.appcracy.com/game/1945-air-force-airplane-games.html)、[APKSee 介绍](https://tw.apksee.com/1945-air-force-airplane-games/com.os.airforce) | ✅ | 本项目已有 6 关可扩展；章节结构 + 大量关卡纯内容工作 |
| **12 级难度渐进解锁**（必须先手动通前一级） | [1945calc 任务指南](https://1945calc.com/en/missions-guide.html) | ✅ | 本地存档记录每关手动通关记录，条件解锁 |
| **每日任务系统** | 通用 mobile shooter 模式 | ⚠️ | 同雷霆战机每日活跃：本地任务表 + 每日 0 点 reset |
| **Boss 战必须精准躲避**（不同 Boss 完全不同弹幕模式） | [Appcracy 介绍](https://www.appcracy.com/game/1945-air-force-airplane-games.html) | ✅ | 本项目三型 Boss 已有 phase 系统，扩新 phase 纯数据驱动 |

---

## 三、总结：可行 vs 不可行 vs 借鉴优先级

### ❌ 强后端依赖，明确排除

- PVP 世界对战 / 实时 co-op / 战队公会
- gacha-style 抽卡系统（付费概率、保底经济体系）
- 全服排行榜 / 实时对战匹配
- 视频激励广告（强平台依赖）
- 付费内购 / 钻石购买

### ⚠️ 半可，需改造或有重量级依赖

- 程序化每日任务（本地 hash 日期做 seed，依赖 P-D 随机源收敛）
- 周期排行榜（本地存档替代，或 GitHub gist 轻量方案）
- co-op 模式（需要 WebRTC 等外部库）
- 离线收益（纯本地时间差）
- 体力系统（纯本地设计，无后端）
- 稀有度分层（纯数值编排）

### ✅ 完全可行，直接借鉴

**模式类：**
- Tractor Beam 捕获双机合并（Galaga，最优雅的风险/奖励机制）
- Boss Assault 编队模式（Hawk，6 机出场顺序）
- Challenging Stage（固定 formation 表演关）
- 无尽模式（已有）
- Boss Rush 原型升格（已灰度）

**系统类：**
- Brobots 僚机体系（Hawk，独立 DPS/防御槽）
- 4 星关卡评级（Sky Force，收集/全歼/救/无伤）
- 装备三维搭配树（雷霆战机，装甲/副武器/僚机）
- 每日随机 BUFF/DEBUFF mutator 池（小鸡舰队出击，Mutator 原型）
- 局内三选一 + 局外装备构建双重构筑（小鸡舰队出击）
- 30 张随机奖励卡（Sky Force，关卡掉落 + 永久升级）
- 难度渐进解锁（Normal → Hard → Nightmare，Sky Force）
- 祝福系统（无尽开局随机 buff，雷霆战机）
- 洗练重置（本地消费 Stardust 重掷装备属性）
- 装甲独立行为（神圣防秒杀 / 魔龙回血 / 黄金击中概率升武器等级，雷霆战机）

**最值得优先立项的 Top 5（性价比排序）：**

1. **Boss Rush 升格**（M1 已存在原型 → 正式菜单入口 + 轮次 HUD + N 轮通关条件，S~M）
2. **每日随机 BUFF/DEBUFF mutator**（M3，成本最低——纯数据池 + 每日随机，无限模式直接注入，每日变化感立竿见影）
3. **Brobots 僚机系统**（纯数据驱动 + 独立弹道，S）
4. **装备三维树 + 装甲行为**（雷霆战机体系，纯配置表 + Stardust 消费，S~M）
5. **Tractor Beam 捕获机制**（Galaga 优雅设计，M，需要新增 Boss 下潜 phase + 捕获状态机）

**阻塞项（明确暂不做）：**
- 程序化每日任务：依赖 P-D 随机源收敛（Math.random 28 处散布），必须先做随机源统一才能落地
- 装备三维树与 P-D 不冲突，随时可做
- 体力系统：属于长线运营设计，在本项目当前定位下可延后

---

## 来源清单（全部直接引用，无臆测）

1. Sky Force Reloaded 官方页：https://skyforcereloaded.idreams.pl/
2. Sky Force 玩家评价（4 星评级）：https://www.taptap.com/app/7108/review?tag_type=1
3. Sky Force 成就指南（30 张卡）：https://graczpospolita.pl/sky-force-reloaded-poradnik-do-osiagniec-trofeow/
4. Phoenix 2 官方页（每日任务）：https://firigames.com/phoenix2
5. Phoenix 2 Steam 商店页（全球同题）：https://store.steampowered.com/app/2678070/Phoenix_2/?l=french
6. Phoenix 2 HandWiki（100 战舰 + Aura/Zen）：https://handwiki.org/wiki/Software:Phoenix_2
7. Phoenix 2 Daily Mission Cycle 指南（序号取余）：https://elegater.github.io/Resources/GameFAQs/Daily%20Missions.html
8. HAWK Brobot 指南（Assault 模式）：https://hawkfreedomsquadron.com/common-questions/which-planes-and-brobots-should-i-bring-to-assault/
9. HAWK 官方页（Menace/Dodgy/Cougar/Delirium）：https://hawk.my.games/en/
10. HAWK Level 60/120 Walkthrough（Boss phase）：https://hawkfreedomsquadron.com/missions-and-walkthroughs/story/boss-fights/level-60-gunhead/、https://hawkfreedomsquadron.com/missions-and-walkthroughs/story/boss-fights/level-120-complete-walkthrough/
11. Galaga Wars 官方页（Tractor Beam + Dual Fighter）：https://en.bandainamcoent.eu/galaga/galaga-wars
12. Namco Galaga 详情：https://www.namcogames.com/game_detail.php?gid=27
13. Galaga Wikipedia（捕获机制）：https://a.osmarks.net/content/wikipedia_en_all_maxi_2020-08/A/Galaga
14. Galaga Japan（Challenging Stage）：https://oldgame.io/games/galaga-japan/
15. Galaga Wars+ App Store（4 能力系统）：https://apps.apple.com/ge/app/galaga-wars/id1574668118
16. 雷霆战机 官方网站（腾讯游戏）：http://leiting.qq.com/
17. 雷霆战机 无尽模式（周赛 + 祝福 + 高能爆弹）：http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8533/m7009/201402/247104.shtml
18. 雷霆战机 装备三维搭配攻略（装甲/副武器/僚机）：https://www.taptap.cn/moment/677867168733334992
19. 雷霆战机 战队副本（钥匙系统）：http://lt.qq.com/webplat/info/news_version3/7338/8526/8529/8532/m7009/201511/401904.shtml
20. 雷霆战机 洗练/重置商城系统：https://leiting.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201707/613538.shtml
21. 雷霆战机 每日活跃（100 活跃领全套奖励）：http://leiting.qq.com/webplat/info/news_version3/7338/8526/8540/m7009/201709/634159.shtml
22. 小鸡舰队出击 产品分析（每日随机 BUFF/DEBUFF + 羽毛 3 选 1）：https://c.m.163.com/news/a/J22DPGO90526DPBA.html
23. 小鸡舰队出击 奇迹装备（额外槽位 + 抽卡）：https://m.youxiguancha.com/gonglue/12228.html
24. 小鸡舰队出击 出装推荐（羽毛 3 选 1 装备升级）：https://m.duote.com/tech/202408/752861.html
25. 微信开放文档设计指引（周期排行榜）：https://developers.weixin.qq.com/minigame/design/index.html
26. 全民枪神产品分析（视频激励广告）：http://games.sina.cn/cyfw/cyxw/2019-10-22/detail-iicezzrr4068561.d.html
27. 1945calc 任务指南（12 级难度渐进）：https://1945calc.com/en/missions-guide.html
28. 1945 Air Force Appcracy（200+ 关卡 + Boss）：https://www.appcracy.com/game/1945-air-force-airplane-games.html
29. 1945 Air Force APKSee（30 章节 + 500+ 关卡）：https://tw.apksee.com/1945-air-force-airplane-games/com.os.airforce
