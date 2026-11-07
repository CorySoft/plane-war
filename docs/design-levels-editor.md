# 弹幕模式库 + 关卡数据化方案

- 调研日期：2026-11-07
- 范围：弹幕图案的参数化描述与开源实现、关卡数据化 schema、关卡编辑器档位评估
- 方法：全网检索 + 本地代码考古（`js/game.js`、`js/wave.js`、`js/enemy.js`、`js/bullet.js`、`js/player.js`、`js/config.js`）
- 标注约定：**【来源事实】**= 检索到的资料原文明确描述；**【本项目建议】**= 面向 plane_war 的待验证设计；**【推算】**= 按现有代码结构估算、非实测。所有行号以当前工作区（P6 拆分后）为准。
- 本文只做调研与方案，**不改任何 `js/**`，不 commit、不部署**。现状数值见 `docs/design-current-state.md`，业界节奏/难度方法论见 `docs/design-research.md`，性能边界见 `docs/perf-baseline.md`。

> 来源核验说明：文中链接均为实际抓取确认的规范域名。检索过程中出现的 `github.org` / `guthub.com` / `github.cc` / `ghub.com` 等疑似镜像域名**未采用**，也不作为结论依据。文末列全量来源。

---

## 结论摘要

| 主题 | 可核验观察 | 对 plane_war 的启示 |
|---|---|---|
| 图案参数化 | 弹幕图案普遍用极坐标 `(角度, 速度)` + 参数函数描述，而非逐弹写死 x/y；环形 `n` 弹 = `for i in 0..n: angle = base + i*2π/n`，螺旋 = 每次发射累加一个角度偏移。[2][3][12] | `getShootPattern` 已经是「参数 → pattern 数组」的函数，可作编码范式；但它是**玩家侧**。敌方弹幕的扩展缝在 `bossFire` 的 `phase.pattern` 分支与 `spawnEnemyBullet` 系列。[本地代码] |
| 声明式图案语言 | BulletML（Kenta Cho / ABA Games）用 XML 描述弹幕，含 `aim/absolute/relative/sequence` 四种方向类型、`fire/repeat/wait/changeDirection/changeSpeed/accel/vanish` 动作原语、`$rand/$rank` 表达式与 `bulletRef/actionRef` 参数化复用。[1][4] | 不必引入 XML 运行时；借其**词汇表与「图案即数据」思路**，做一个极小的 JSON 图案注册表即可覆盖扇形/环/螺旋/花瓣。 |
| 关卡数据化 | 主流为「波次驱动的 JSON」[5][6]、「cue/时间轴列表」[7]、「task 脚本 + 触发等待」[8][9]；时间轴 vs 触发（`all-dead`）vs 混合各有取舍。[6] | 现状是**纯时间/分数驱动的周期事件 + 均匀随机生成**，无任何数据文件；schema 应同时补结构、编排、节拍、双曲线四处缺位。 |
| 难度与节拍 | 业界用 beat / rest / teach-test-twist 编排节奏、用密度预算曲线留出 Boss 前喘息、用 seeded RNG 保证可复现。[6][10][11] | 与 `docs/design-research.md` 的三轴难度、短波次建议一致；schema 需把「曲线」与「节奏」都变成一等字段。 |
| 编辑器 | 表单式生成器产出 JSON [6]、可视化编辑器导出 JSON + 类型化实体属性 [13]、时间轴拖拽 + 回放预览 [6]。 | 推荐**档位 1（纯 JSON + Schema 校验 + 静态测试）起步**，档位 2 只做只读可视化，档位 3 暂缓。 |

---

## 一、弹幕模式检索

### 1.1 参数化描述：极坐标 + 参数函数（来源事实）

- **【来源事实】** 密集图案中的每颗弹，用 `(angle, speed)` 描述而非分离的 `dx/dy`；`n` 发环形 = 从 0 到 2π 以 `2π/n` 步进循环；螺旋 = 同一循环在每个发射 tick 累加角度偏移；旋转环 = 对发射器整体施加角速度。回到笛卡尔只在 spawn 时做一次：`vx=cos(a)*spd, vy=sin(a)*spd`。[2][12]
- **【来源事实】** 推荐把图案写成「接受数值参数、返回一串发射事件」的函数；核心旋钮是速度、弹数、扩散角、旋转率、齐射延迟、发射器偏移。把图案写死成发射列表被明确列为早期原型最常见的错误——难度要调 15% 或做 easy 版时得逐个改值；参数化后难度曲线只是传入的一张乘数表。[2]
  ```text
  ring_burst(count, speed, spread=TWO_PI, base_angle=0, rotation=0):
      step = spread / count
      for i in range(count):
          spawn_bullet(base_angle + step*i + rotation, speed)
  ```
- **【来源事实】** 另一套等价词表是 Ring / Spread / Stack 三种基础「Group」：`n-ring` 的种子角可取 fixed / random / changing / aimed 四种模式；每环把角度固定递增一个量就形成螺旋；`n-way spread` 是「一段弧内的 n 发」，弧被压窄到无处可穿时成为 wall；stack 是同角不同速的一组弹。[3] 注意让递增量**不要整除 360°**，否则子弹长期走同一路径形成死角。[3]
- **【来源事实】** 图案可按视觉/功能归为 15 类：放射、螺旋、扇形、瞄准、波/幕、网格、花瓣、环、星形、交叉、雨、粒子、追踪/变轨、激光、复合；实现参数集中在发射位置、发射角、弹数、发射间隔、弹速、加速度、角速度、寿命、分裂条件、颜色/尺寸。[14] 设计要点是「设计缝隙而非密度」「规律性 + 少量扰动」「用颜色区分弹种职能」「给强攻击加预警」「设计周期」。[14]

### 1.2 常见图案 × 参数化字段（本项目建议的归一化）

下表把 1.1 的词表收敛成一组可写进 JSON 的字段；**【本项目建议】**，不是行业标准，字段命名需实测调参。

| 图案 | 关键参数 | 生成方式（一句） | plane_war 低成本可行性 |
|---|---|---|---|
| 扇形 / n-way | `count, spreadDeg, aim` | 以 `aim`（自机方向或固定角）为中心按 `spreadDeg/(count-1)` 铺开 | **高**：`spawnEnemyBullet` 已是单发自机瞄准，改成一次性 n 发即可 |
| 环 / n-ring | `count, baseAngle, aim` | `angle = base + i*2π/count` | **高**：`js/player.js` 的 madHunt 分支已是 360° 环的实现范例（8+scatter×2 方向） |
| 螺旋 | `count, baseAngle, deltaPerShot, shots` | 每齐射 `base += deltaPerShot` | **中**：需给发射器加一个跨 tick 累加的状态位（`e.t` 已存在可用） |
| 花瓣 | `petals, pointsPerPetal, speedFn` | 环 + `speed = base + amp*sin(k*angle)` | **中**：`fireBullet` 支持 `spd` 入参 |
| 弹丸雨 | `columns, jitter, speedRange` | 顶部按列/抖动随机 x 下落 | **高**：`spawnSwarm(level,diff,enemyLevel)` 已有按 x 批量生成敌机的写法可复用 |
| Stack（同角异速） | `count, angle, speed[]` | 同角不同速 | **中** |
| 激光 / 网格 | `telegraphSec, angle, sweep` | 预警线 → 实体激光/网格 | **低**：现有 `spawnLaserVolley` 是「3 发平行快弹」，不是持续激光；需要新弹种与预警渲染 |
| 追踪 / 变轨 | `turnRate, retargetAfter` | 弹体按角速度偏转 | **中**：`bullets` 已有 `homing` 字段与 `game.js` 的 madHunt 转向逻辑 |
| 复合 | `layers[]` | 两个以上发射器叠加 | **低**：见 1.5 的可读性风险 |

### 1.3 三种实现范式（来源事实）

1. **声明式图案语言（BulletML）** — **【来源事实】** XML-based，作者 Kenta Cho（ABA Games），用于 Progear / Psyvariar / Gigawing2 / G DARIUS / XEVIOUS 等；有 RELAX 语法与 DTD 定义，官方明确优点是「数据可移植、可复用」，并附带可即时预览的 demo applet。[1] 参考手册 v0.21 定义：`<direction type="aim|absolute|relative|sequence">`（`aim`=相对自机方向、`sequence`=相对上一次发射方向）、`<action>` 内可组合 `fire/repeat/wait/changeSpeed/changeDirection/accel/vanish`，数值支持表达式与变量（`$rand` 随机、`$rank` 难度 0~1、`$1..` 参数），并用 `bulletRef/actionRef/fireRef + param` 复用带参定义；时间单位为帧（1 帧 = 1/60s）。[4]
2. **JS 运行时 + 宿主回调** — **【来源事实】** `bulletml.js-es` 是 bulletml.js 的 ES module 版本，本项目同为纯 ESM、零构建，参考价值最高：`bulletml.buildXML(...)` 得到 pattern，`bml.createRunner({ target, createNewBullet })` 由**宿主**提供造弹回调，每帧 `runner.update()` 推进；另有等价的 DSL（`d.repeat / d.fire / d.direction / d.wait`）。[9] npm 上的 `@ishikawa-masashi/bulletml`（TypeScript）提供同构的 Runner + DSL。[15] C# 生态的 BulletMLLib 同样支持全部 BulletML 元素、`$rank` 与自定义回调、慢动作/缩放，说明这套词汇表可跨引擎迁移。[16]
3. **脚本 / 微线程（东方 Danmakufu ph3）** — **【来源事实】** 用 `task` + `yield` 实现微线程，`wait(n)` 常写成 `loop(n){yield;}`；图案集中在 `MainTask` 里用 `loop` + 角度累加发射（`CreateShotA1`），可用 `GetAngleToPlayer` 做自机瞄准。[17] `ObjMove_AddPattern` 系列提供「N 帧后改变弹体属性」的预设（4 个 angle/speed 变体 + 3 个 xspeed/yspeed 变体），shotsheet 把子弹图形参数（id/rect/delay_color/collision/angular_velocity）与逻辑分离；教程明确警告「有角速度但无加速度的子弹会绕圈返回发射点」。[18] 官方教程把这种 `yield` 中断/恢复称为 microthread，用于让跨帧变量保持作用域。[19]

> **【本项目建议】** 三者的取舍：BulletML 的词汇表与「图案即数据」最值得借（见第七节），但**不引入 XML 解析与表达式求值器**——本项目零依赖零构建，一个 `patterns/*.json` + 约百行的发射器/解释器即可。Danmakufu 的 task/微线程功能强大，但要复刻协程调度成本过高，只需借其「每帧推进 + 跨帧状态」思路。

### 1.4 对照 plane_war 现有架构（本地代码事实）

| 现有缝 | 位置 | 现状 |
|---|---|---|
| 玩家射击图案 | `js/player.js:266` `getShootPattern(player)` | 返回 `patterns[]`（`angle/dmg/homing/x/y/spd`），已经是「参数 → 数组」的参数函数；含 madHunt 的 360° 环分支；受 `BULLET.waveCap=16` 裁剪（`config.js:66`） |
| Boss 弹幕分支 | `js/game.js:915` `bossFire(e)` | `switch (phase.pattern)`：`spread / homing / burst / laser` 四种硬编码分支（`:920-950`） |
| Boss 相位数据 | `js/wave.js:87-112` `BOSS_TYPES` | **已经是小型数据表**：`phases[]` 含 `hpPct / fireInterval / spawnInterval / teleportInterval / pattern`，只是 `pattern` 值是硬编码字符串 |
| 敌方单发/齐射 | `js/bullet.js:231/242/193` | `spawnEnemyBullet`（自机瞄准单发）、`spawnLaserVolley`（3 发平行）、`spawnSplitBurst`（分裂） |
| 生成入口 | `js/enemy.js:57` `spawnEnemy(level,diff,enemyLevel,atX,atY)` | **已支持显式坐标** `atX/atY`，编队成本低；类型由 `getEnemyTypePool(level)`（`:45-55`）按等级复制条目加权后 `pick()` |
| 波次驱动 | `js/wave.js:28` `updateWaves` + `js/game.js:436-458` | 三个计时器（精英 12s / Boss 每 5 级 / 虫群 30s）返回字符串事件；常规生成是 `Math.random() < spawnRate*dt` 的**均匀随机**，无任何数据文件 |
| 难度曲线 | `js/wave.js:12` + `js/game.js:428-433` | 玩家等级 `min(14, 1+score/4500)`、敌方等级 `min(99, 1+score/6000)`，**两条独立曲线**（codearts 已证实脱钩） |

**低成本扩展路径（【本项目建议】+【推算】）**
1. 新建 `js/patterns.js`（或 `patterns/*.json`）：导出 `emit(name, ctx) → [{angle, spd, dmg, homing, x, y}]`，实现 1.2 表中「高」的四种（扇形/环/雨/单发瞄准）与「中」的螺旋、stack；`ctx` 提供 `originX/originY/aimAngle/tick/difficulty/rng`。
2. `BOSS_TYPES[].phases[].pattern` 从硬编码字符串扩成「`patternRef` + 参数覆盖」；`bossFire` 的 switch 改为查注册表 + 默认回退到现有分支 → 行为可逐步迁移，可回滚。
3. `spawnEnemyBullet(e, ...)` 保留为「单发自机瞄准」的特例，内部走 `emit("aimed-single", ...)`，避免两套逻辑。
4. **风险点（代码事实）**：`screenCap=140`（`config.js:67`）只约束**友方**子弹，`js/bullet.js` 中敌方子弹无同款硬上限；引入密集图案前必须补一个敌方同屏弹数预算，否则低端机会重演 `docs/perf-baseline.md` 记录的分配/帧率问题。多层图案还可能堵死所有可通行缝隙——资料建议慢放逐帧验证「任意时刻至少存在一条可通行走廊」，且不要同时拉满弹速、弹数、旋转三个轴。[2][12]

### 1.5 可读性与预告窗口（来源事实，注意不可直接照抄数值）

- **【来源事实】** 预告窗口（发射器激活到首弹出膛）的经验值：熟练玩家对已知图案约 400ms 为下限，首次遭遇 600–700ms 较舒适；高密度或非常规几何需更长，Boss 相位切换应更长。[2] 另一份资料按难度给出「单波最大弹数 / 最小弹间距 / 预告窗口」表（Easy 12 / 28px / 700ms → Lunatic 48 / 8px / 380ms），但**明确声明该表基于 480×640 竖屏场**。[2]
- **【来源事实】** plane_war 逻辑分辨率为 480×720 基准、竖屏按窗口比例缩窄（`js/config.js:7-31`，冒烟实测 409×720），与上述 480×640 假设**不完全一致**；且 BulletML 时间单位是 1/60 秒的帧、本项目 `dt` 是秒。因此这些数值只能当**调参起点**，不能当标准或承诺——与 `docs/design-research.md`「区分来源事实与待验证建议」的口径一致。
- **【来源事实】** 预告的具体做法：激光先显示细线、分裂弹先停顿、强攻击让敌机发光；颜色按弹速/危险度区分职能。[14]

---

## 二、关卡数据化

### 2.1 主流做法（来源事实）

| 范式 | 代表 | 关键字段 / 机制 |
|---|---|---|
| 波次驱动 JSON + Schema | SoR 引擎：`game_stage.json` + `stage_schema.json` | `wave_id`、 `enemy[]`、 `spawn_time`、 `enemy_type`、 `is_boss`；配套 JSON Schema Draft 7 用 `enum` 限制敌种、`required` 保证必填，在加载期拦截脏数据。[5] |
| JSON 配置 + 代码生成波次 | R-Type StageLoader | `numero / background_path / music_path / time / seed / mobs_types`；`loadConfig → genWaves（生成时长/数量/类型）→ genMobsEntities`；另有表单式 **Level File Generator**（填名称、时长、难度即产出关卡文件）。[6] |
| 剧院舞台 / cue 列表 | Armoured Engines | 「所有入场物都是 actor，由 cue 引入」；关卡文件就是一条 JSON `cues[]`，每条带 `type / resourceName / startTime / exitTime / loop / position / speed / layer / order / prewarm / scale` 等元数据，由 cue 类型自行解释。[7] |
| 时间轴 JSON 波次 + 触发 | Flukz shmup 系列 | `{waves:[{time, type, enemy, count, spawnX[], spawnY, pattern}, {time, type:"trigger", condition:"all-dead", action:"boss-enter"}]}`；明确区分**纯时间驱动**（快/慢玩家会错位、出现死区）、**触发驱动**（`all-dead` 等，节奏随玩家表现自适应）、**混合**（时间兜底 + 触发奖励）。[10] |
| 脚本 / 触发等待 | Danmakufu stage script | `Wait(120)` 时间等待 + `WaitForZeroEnemy`（等待清场）+ `CreateEnemyFromFile` / `CreateEnemyBossFromFile` + `Clear`，即「时间 + 触发」混排的关卡脚本。[8] |
| 微线程脚本 | Danmakufu ph3 task/yield | 用 `task` + `yield` 把跨帧时序写成顺序代码，避免长串 `if/else` 帧判断与全局变量扩散。[17][19] |
| 密度预算 / 可复现 | Flukz 程序化生成 | 波次描述符（编队、入场侧、首发延迟、图案索引、弹数、难度权重）；用**密度预算曲线**在章节峰值后安排 Boss 前喘息；用**单一 seed 的显式 RNG 对象**保证同种子可复现、可分享、可调试；并给出护栏（连续同侧上限、活动弹数上限、图案冷却、最小安全走廊）。[11] |

### 2.2 schema 必须表达的「现状缺位」（吸收前两路调研）

依据 `docs/design-current-state.md`（codearts，均带 `文件:行号`）与 `docs/design-research.md`（Copilot）：

| 缺位 | 现状证据 | schema 对应字段 |
|---|---|---|
| **无关卡结构**，只有无限波次 + 3 类周期事件 | `js/wave.js:28-68`：精英 12s / Boss 每 5 级 / 虫群 30s；`enemy.js:59` 均匀随机敌种 | `chapters[] → stages[] → beats[]` 三层；`advance` 支持 time / allCleared / hybrid |
| **双难度曲线不同步** | 玩家 `min(14,1+score/4500)`（`wave.js:12`）58,500 分封顶；敌方 `min(99,1+score/6000)`（`game.js:428`）到 588,000 分 | `difficulty` 单一真源：一条 `scoreAxis` 同时派生 `playerLevel` 与 `enemyLevel`，或显式两条曲线并列由同一 `budget` 表约束——**让脱钩在设计期可见、可校验** |
| **敌机类型均匀随机** | `getEnemyTypePool(level)`（`enemy.js:45-55`）按等级复制条目后 `pick()` | `beats[].waves[].spawns[]` 显式声明 `type/count/formation/spawnX/entry`；随机只作为**可选、带权重**的 `pool` 且需声明 seed |
| **无节拍 / 教学曲线** | 生成率单调递增（`config.js:290`），无喘息、无 teach→test→twist | `beats[].role` 枚举 `teach / test / twist / rest / elite / boss`，配 `telegraphSec` 与 `reward`；`intensity` 可选字段用于画节拍图 |

### 2.3 最小 schema 草案（【本项目建议】，字段级）

设计原则：**只引入能表达上述四处缺位的最小字段集**；不引入表达式引擎（BulletML `$rand/$rank` 的复杂度不搬）、不引入新运行时依赖；用 JSON Schema Draft 7 做加载期校验（照 SoR 做法 [5]）；`patternRef` 指向第一部分的图案注册表，把两块方案连起来。

**顶层 `stage`（必填字段加 `*`）**

| 字段 | 类型 | 含义 |
|---|---|---|
| `schemaVersion*` | int | 便于后续演进与迁移 |
| `id*` / `title` | string | 章节化标识（现状缺位 1） |
| `seed` | int | 单一 seed，保证同种子可复现 [11] |
| `durationSec` | number | 单关目标时长；**待测假设**，不是标准（`docs/design-research.md` 已声明 3–5 分钟仅作假设） |
| `difficulty*` | object | 见下；**双曲线单一真源**（缺位 2） |
| `patterns` | map | 本关内联的具名图案（覆盖 1.2 的字段），键供 `patternRef` 引用 |
| `formations` | map | 具名编队（相对坐标列表），供 `spawns[].formation` 引用 |
| `beats*` | array | 有序节拍序列（缺位 1、4） |

**`difficulty`**：`axes`（`bulletSpeed / density / grace` 三轴乘数，呼应 `docs/design-research.md` 的三轴难度与 DDA 建议）、`scoreAxis`（`[{at, playerLevel, enemyLevel}]` 分段表，两条曲线**写在同一张表里**）、可选 `dda`（`enabled / min / max / maxStepPerBeat`，明确标注为实验开关并允许关闭）。校验规则：两条 `Level` 序列必须单调不减且长度一致 → 加载期即可拦住「玩家封顶、敌方继续涨」的脱钩回归。

**`beat`**：`id*`、`role*`（枚举见 2.2）、`advance*`（`{type:"time", atSec}` / `{type:"allCleared", timeoutSec}` / `{type:"hybrid", atSec, timeoutSec}` [10]）、`telegraphSec`、`waves[]`、`reward`（`{type:"choice", options:3}` 等，呼应波间构筑建议）、可选 `intensity`（0–1，仅用于画节拍图，不参与运行时数值）。

**`wave` / `spawn`**：`waves[]` 内每条 `spawn` 含 `type*`（`ENEMY_TYPES` 键：`small/mid/big/laser/shield/split`，由 Schema `enum` 限制）、`count`、`formation`（引用 `formations`：`v / line / column / pincer`）、`entry`（`top/left/right`）、`spawnX`（归一化 0–1 或像素数组）、`spawnY`、`patternRef`、`telegraphSec`；可选 `pool`（`[{type, weight}]`，显式加权随机，替代均匀随机）。触发类波次用 `action: "boss-enter"` + `boss`（引用现有 `BOSS_TYPES` 键与 `phases` 覆盖）。

**示例关卡片段**（演示 teach→test→twist→rest→boss，以及双曲线同表、显式编队、图案引用；数值均为**占位示例、非平衡结论**）

```jsonc
{
  "schemaVersion": 1,
  "id": "ch1-s1",
  "title": "第一章 · 教学空域",
  "seed": 20261107,
  "durationSec": 180,
  "difficulty": {
    "axes": { "bulletSpeed": 1.0, "density": 1.0, "grace": 1.0 },
    "scoreAxis": [
      { "at": 0,     "playerLevel": 1, "enemyLevel": 1 },
      { "at": 20000, "playerLevel": 5, "enemyLevel": 4 },
      { "at": 58500, "playerLevel": 14, "enemyLevel": 10 }
    ],
    "dda": { "enabled": false, "min": 0, "max": 1, "maxStepPerBeat": 0.05 }
  },
  "patterns": {
    "aimed3":  { "shape": "fan",   "count": 3,  "spreadDeg": 24, "aim": "player", "speed": 3.0 },
    "ring12":  { "shape": "ring",  "count": 12, "baseAngle": 0,  "speed": 2.4 },
    "spiral6": { "shape": "spiral","count": 6,  "deltaPerShot": 17, "shots": 8, "speed": 2.2 }
  },
  "formations": {
    "v5":  { "type": "v", "points": [[0.2,0],[0.35,0.1],[0.5,0.2],[0.65,0.1],[0.8,0]] }
  },
  "beats": [
    {
      "id": "b1", "role": "teach", "intensity": 0.2,
      "advance": { "type": "time", "atSec": 0 }, "telegraphSec": 0.7,
      "waves": [{ "spawns": [
        { "type": "small", "count": 5, "formation": "v5", "entry": "top", "patternRef": "aimed3" }
      ]}]
    },
    {
      "id": "b2", "role": "test", "intensity": 0.4,
      "advance": { "type": "allCleared", "timeoutSec": 25 },
      "waves": [{ "spawns": [
        { "type": "small", "count": 8, "formation": "v5", "entry": "top", "patternRef": "aimed3" },
        { "type": "mid",   "count": 1, "spawnX": [0.5], "entry": "top", "patternRef": "ring12" }
      ]}]
    },
    {
      "id": "b3", "role": "twist", "intensity": 0.65,
      "advance": { "type": "hybrid", "atSec": 60, "timeoutSec": 30 }, "telegraphSec": 0.9,
      "waves": [{ "spawns": [
        { "type": "laser", "count": 2, "spawnX": [0.3, 0.7], "entry": "top", "patternRef": "spiral6" }
      ]}]
    },
    { "id": "b4", "role": "rest", "intensity": 0.1,
      "advance": { "type": "time", "atSec": 95 },
      "reward": { "type": "choice", "options": 3 }, "waves": [] },
    { "id": "b5", "role": "boss", "intensity": 0.9,
      "advance": { "type": "time", "atSec": 110 }, "telegraphSec": 3.0,
      "waves": [{ "action": "boss-enter", "boss": "mothership" }] }
  ]
}
```

> `telegraphSec` 的示例值参照 1.5 的舒适区间，且 `b5` 用 3.0s 对齐现有 `js/wave.js:46` 的 3s Boss 预警；全部需经真机调参，不作为标准。

### 2.4 从硬编码迁移的工作量估算与风险（【推算】，非实测）

| 改动点 | 现状 | 估算 | 主要风险 |
|---|---|---|---|
| 新增 `js/level.js`：加载 + Schema 校验 + 节拍解释器（`advance` 三态、spawn 派发、patternRef 解析） | 无 | 本包最大项，约 200–300 行 + 一份 `stage.schema.json` | 解释器与现有 `updateWaves` 并存期的行为一致性；需保证「无关卡文件时完全回退到现有无限模式」 |
| `js/wave.js` `updateWaves` | 三计时器返回字符串事件（`:28-68`） | 小：改为适配层，或保留为 endless 模式 | 现有 300 项测试里 `wave.test.mjs` 直接断言计时器行为，改造会触发用例调整 |
| `js/game.js:436-458` | `updateWaves` 调用 + `Math.random()<spawnRate*dt` 随机生成 | 中：把生成入口换成 level runner 的事件 | `game.js` 是全仓最大模块（约 1.8k 行），改动面需严格用现有集成测试兜底 |
| `js/game.js:428-433` 敌方等级 | 独立 `score/6000` 公式 | 小：改读 `difficulty.scoreAxis` | 与 codearts 证实的「负开火乘数」「双曲线脱钩」是同一处，建议与数值改版一起做，避免改两次（主持人已定「并入数值改版」） |
| `js/game.js:915` `bossFire` | `switch(phase.pattern)` 四分支 | 中：改为注册表 + 默认回退 | 需保证旧 `BOSS_TYPES` 的 `pattern` 字符串全部有等价实现 |
| `js/enemy.js:57` `spawnEnemy` | 已支持 `atX/atY` | **几乎为零**：编队只需传入坐标 | 同屏 60 敌上限（`:58`）与 `powerupCap` 需纳入密度预算 |
| 敌方弹幕密度上限 | **当前无**（只有友方 `screenCap=140`） | 小但必需 | 不补会重演性能问题；见 1.4 |
| 部署链路 | P6 后 `deploy.sh` 已递归版本化 `js/` 子树（27 模块）[本地代码] | 需确认 | 关卡 JSON 若放 `js/levels/`，会被「只处理 `*.js`」的版本化逻辑跳过；**建议放 `assets/levels/`**（`assets/` 随 mirror 上传且不在排除项），并在部署后复核文件确实上线 |
| 测试 | 300 项 | 需新增：Schema 校验用例、解释器三态 advance 用例、「双曲线同表」断言、patternRef 全量可解析断言 | 可沿用 `test/modules.test.mjs` 的静态解析风格，成本低 |

**总体判断（【推算】）**：这是**跨 6+ 文件、涉及主循环的中型重构**，与 P6 ui 拆分同量级；不建议与「三个已证实数值缺陷修复」同批上线（主持人已决定数值缺陷并入数值改版）。建议路径：先只加 `stage.schema.json` + `js/level.js` 的**只读加载与校验**（不改生成逻辑、现有测试零改动）→ 再用一个可选关卡做端到端开关 → 最后才替换 `game.js` 生成入口。每一步都能被现有 300 项测试与 `tools/dev/smoke.mjs` 兜住。

---

## 三、关卡编辑器三档评估

| 档位 | 形态 | 业界实例（来源事实） | 成本（【推算】） | 收益 | 风险 |
|---|---|---|---|---|---|
| **1. 纯 JSON + Schema 校验** | 手写 `assets/levels/*.json`，加载期 JSON Schema Draft 7 校验 + 静态测试 | SoR 的 `game_stage.json` + `stage_schema.json` 用 `enum`/`required` 在加载期拦截脏数据 [5]；Flukz 指出即使没有图形编辑器，「波数据与引擎分离 + 热重载」也能把调参循环从 edit-compile-run 变成 edit-save-see [10] | 最低：一份 Schema + 一个校验用例 | **最高性价比**：立即可用、可 diff、可评审、可进版本库；为档位 2/3 打地基 | 手写坐标/时间易错；靠 Schema 与 lint 弥补 |
| **2. 浏览器内可视化编辑器** | 表单/画布填节拍、敌种、编队，导出同一份 JSON | R-Type 的 **Level File Generator**（表单填名称/时长/难度即产出关卡文件）[6]；LDtk 的可视化编辑 + 类型化实体属性 + JSON 导出 + 备份 [13]；PvZ GE Level Editor 的多标签表单生成 JSON [20] | 中：~1 个独立页面 + 序列化/反序列化；本项目纯静态托管，可作为 `tools/` 下的独立 HTML（注意 `deploy.sh` 已排除 `tools/`） | 降低坐标/时间手写错误；非程序成员可参与 | 需与 Schema 双向同步，字段漂移时要维护两套；宜做成**只读/受控写入** |
| **3. 时间轴回放调参** | 纵轴=时间、横轴=归一化位置，拖拽事件块，实时回放预览 | Flukz 描述「把波事件显示为沿轴排列的块、拖拽重定位、点击编辑」的时间轴视图，并称其首版即带编辑器、社区产出的波文件比原团队更复杂 [10] | 最高：需确定性 seed + 可暂停/快进的回放器 + 与运行时同一套解释器，否则预览与实机不一致 | 最快的可读性反馈；适合大量关卡 | 与「编辑器即第二套解释器」的重复实现风险；`docs/design-research.md` 也提醒短局时长仍待验证，此时投入可视化工具过早 |

**推荐：档位 1 起步，档位 2 只做「只读可视化」子集，档位 3 暂缓。** 理由：① 本项目当前**连关卡数据都还不存在**，先把 schema 与解释器做对是前置条件，任何编辑器都依赖它；② 档位 3 的回放可信度依赖单一 seed 的显式 RNG [11]，而现状 `Math.random()` 散布在生成/掉落等多处，需先收敛随机源，属于数值改版范畴；③ 档位 2 若做成只读的「节拍/强度时间轴预览」，成本远低于完整编辑器，却已能覆盖 teach→test→twist 与喘息节拍的设计评审需求 [10][21]；④ 与主持人「本阶段只调研、下一轮起草改版提案」的节奏一致，避免工具先行。

---

## 四、未检索到可靠数据 / 证据边界

- 未检索到「某类弹幕图案必须多少发 / 预告必须多少毫秒」的可迁移行业标准。1.5 的数值来自单一开发者 devlog、且明确绑定 480×640 竖屏假设 [2]，与本项目 480×720/409×720 不一致，只能作调参起点。
- 未检索到「关卡数据化 / 关卡编辑器能带来多少留存或开发效率提升」的同类可比因果数据；档位成本均为按本项目代码结构的**推算**，非实测工时。
- 未检索到 plane_war 同类「零构建、纯 ESM、静态托管」网页弹幕游戏直接采用 BulletML XML 运行时的公开案例；`bulletml.js-es` 是同构（ESM + 宿主回调）的最近参考 [9]，但「引入 vs 自建极简解释器」的取舍是本项目判断，无外部结论可依。
- 15 类图案词表 [14] 与 Ring/Spread/Stack 词表 [3] 是设计者分类，不是互斥标准；1.2 的归一化表是本项目整合，字段命名需在实现时定稿。
- 检索中出现的若干疑似镜像域名未采用，也不作为任何结论的依据。

---

## 五、最值得借鉴的 1 个方案及理由

**BulletML 的「图案即数据 + 参数化复用」词汇表，落地为 plane_war 的 `patterns` 注册表（不引入其 XML 运行时）。**

理由：
1. **恰好命中现状最便宜的缝**——`BOSS_TYPES[].phases[].pattern`（`js/wave.js:87-112`）已是一个半成品数据表，`bossFire` 已按 `pattern` 字符串分支（`js/game.js:920`），`spawnEnemyBullet`/`spawnLaserVolley`/`spawnSplitBurst` 已提供造弹原语。把「字符串枚举」升级成「具名图案 + 参数覆盖」是几行注册表的事，不需要新引擎；相比之下引入完整关卡解释器（第二节）是跨 6 文件的主循环改造。
2. **一次性解决「硬编码图案」这个被反复点名的坑**——资料明确把「把图案写成固定发射列表」列为早期原型最常见错误，参数化后难度调参只是乘数表 [2]；且 `$rank`（难度 0~1）内置于 BulletML [4]，天然对应 `docs/design-research.md` 的三轴难度 D 与 codearts 证实的「双曲线脱钩」——图案难度从同一个 D 派生，不会再各写一套。
3. **可复用、可校验、可渐进迁移**——`bulletRef/actionRef/param` 的参数化复用 [4] 映射到 JSON 就是「一个 pattern 定义被多个 beat 引用」；配合 JSON Schema 的 `enum`/`required` [5] 可在加载期拦住脏图案；旧 `BOSS_TYPES` 字符串保留为默认回退，逐块迁移、随时可停。
4. **生态与本仓库技术栈同构**——`bulletml.js-es` 就是 ESM + 宿主 `createNewBullet` 回调 [9]，与本项目 `fireBullet/spawnEnemyBullet` 的造弹职责一一对应，若要进一步扩展可直接照其 Runner 结构，零构建约束不被破坏。

**明确不借的部分**：XML 解析、表达式求值（`$rand/$rank` 的算术/变量）、1/60 帧时序、微线程调度——本项目 `dt` 是秒、无依赖、已有 300 项测试，引入这些会显著抬高复杂度而收益有限。

---

## 六、来源

1. [BulletML 官方站（Kenta Cho / ABA Games）](https://www.asahi-net.or.jp/~cs8k-cyu/bulletml/index_e.html)：XML-based 弹幕标记语言、RELAX/DTD 定义、数据可移植与可复用、demo applet、所列应用游戏。
2. [Flukz — Bullet Pattern Design in Shmups: Parametric Scripting and Spatial Choreography](https://flukz.org/devlog/bullet-pattern-design-shmup)：极坐标、`ring_burst` 参数函数、预告窗口与分难度密度表（注明 480×640 竖屏假设）、多层图案的可通行走廊检查。
3. [Sparen's Danmaku Design Studio — Guide A3: The Ring, The Spread, and The Stack](https://sparen.github.io/ph3tutorials/ddsga3.html)：n-ring、fixed/random/changing/aimed 四种种子角、螺旋、spread/wall/stack、角度增量避免整除 360。
4. [BulletML Reference ver.0.21](https://allstar.jhuapl.edu/repo/p2/amd64/libbulletml-dev/doc/doc/bulletml_ref_e.html)（官方参考手册镜像）：`aim/absolute/relative/sequence` 方向类型；`fire/repeat/wait/changeDirection/changeSpeed/accel/vanish`；`$rand/$rank/$1..` 表达式与 `*Ref + param` 复用；帧=1/60s。
5. [SoR 引擎 — Configuration and Data Management (DeepWiki)](https://deepwiki.com/saito-ypg/SoR/5-configuration-and-data-management)：`game_stage.json` 的 wave 字段、`stage_schema.json` 的 JSON Schema Draft 7 校验（`enum` / `required`）。
6. [R-Type Developer Documentation — Stage Loader / Level File Generator](https://das-datum.github.io/R-Type/md_docs_2dev__docs.html)：JSON 关卡配置字段、`loadConfig/genWaves/genMobsEntities`、表单式关卡生成器。
7. [Armoured Engines Dev Blog — Level System (Game Developer)](https://www.gamedeveloper.com/business/armoured-engines-dev-blog-level-system)：剧院舞台 / cue 隐喻，JSON `cues[]` 的 `startTime/exitTime/type/loop/position` 等字段。
8. [Danmakufu Intermediate Tutorial (Shrine Maiden 论坛)](https://www.shrinemaiden.org/forum/index.php?topic=865.20)：stage script 的 `Wait / WaitForZeroEnemy / CreateEnemyFromFile / CreateEnemyBossFromFile / Clear`，以及 `angle += 360/n` 的环形发射。
9. [bulletml.js-es — JavaScript BulletML 库 ES module 版](https://github.com/taisukef/bulletml.js-es)：`buildXML` + `createRunner({target, createNewBullet})` + 每帧 `runner.update()`，以及等价 DSL。
10. [Flukz — Spawning Systems and Wave Design in Shmups](https://flukz.org/devlog/spawning-systems-wave-design)：JSON 波次定义、时间/触发/混合三种推进、编队职能、parse 期难度修饰、时间轴编辑器与热重载。
11. [Flukz — Procedural Enemy Wave Generation in Shmups](https://flukz.org/devlog/procedural-wave-generation-shmup)：波次描述符、密度预算曲线、seeded RNG、四类护栏。
12. [Sparen's Danmakufu ph3 Tutorials — Lesson 7 Code Sample 2](https://sparen.github.io/ph3tutorials/ph3u1l7code2.html)：`task MainTask` + `wait(n)=loop(n){yield}` + `CreateShotA1` 角度累加循环、`GetAngleToPlayer` 自机瞄准。
13. [LDtk 官网](https://ldtk.io/)：可视化 2D 关卡编辑器、类型化实体属性、JSON 导出、Super Simple Export、备份。
14. [A Summary of 15 Beautiful Bullet Hell Patterns in Danmaku Shooters (npaka)](https://note.com/npaka/n/n5d38b7d84173?hl=en)：15 类图案词表、实现参数清单、缝隙/预警/周期/配色设计要点。
15. [@ishikawa-masashi/bulletml (npm)](https://www.npmjs.com/package/@ishikawa-masashi/bulletml)：TypeScript BulletML 库，Runner 与 DSL 同构示例。
16. [BulletMLLib（C# / MonoGame）](https://github.com/dmanning23/BulletMLLib)：全部 BulletML 元素（fire/direction/speed/acceleration/repeat/vanish/changeDirection/changeSpeed）、`$rank/$rand` 与自定义回调、慢动作/缩放、参数化引用；说明词汇表可跨引擎迁移。
17. [The Level Design Book — Pacing](https://book.leveldesignbook.com/process/preproduction/pacing)：beat / rest / variation、teach-test-twist、intensity plot、beat sheet / flowchart / graph、pile of beats。
18. [Sparen's Danmakufu ph3 Tutorials — Lesson 8: Shotsheets and Bullet Properties](https://sparen.github.io/ph3tutorials/ph3u1l8.html)：`ObjMove_AddPattern` 变体、shotsheet 的图形/碰撞参数、角速度无加速度会绕圈的警告。
19. [Touhou Wiki — Touhou Danmakufu / Official Tutorial, Lesson 11](https://en.touhouwiki.net/index.php?title=Touhou_Danmakufu%2FOfficial_Tutorial)：microthread（task + yield）——`yield` 处中断、下一帧恢复，任务内变量不会因中断而失效。
20. [GE Level Editor (GitHub)](https://github.com/VuVietDung-bk/pvz-ge-level-editor)：表单式可视化编辑器（Information / Level Definition / Objects 多标签页）生成 JSON/JSON5 关卡。
21. `docs/design-research.md`（本项目，Copilot）：短波次 + 波间构筑、teach→test→twist 节拍、三轴难度与 DDA 边界、元进程留存数据缺口。
22. `docs/design-current-state.md`（本项目，codearts）：无关卡结构、双难度曲线脱钩、敌机均匀随机、数值孤岛、配置漂移，全部带 `文件:行号`。
