# plane_war 性能基线报告（P5 / P5b）

- 测量日期：2026-11-07
- 环境：Node v24.22.2 / V8、Linux x86_64、`--expose-gc`
- 脚本：`tools/perf/bench.mjs`（可重复执行，见文末命令）
- 状态：**P5b 两项优化已落地**，本文同时保留「优化前」与「优化后」数字
- 原则：只优化 `js/game.js`，未触碰 `js/ui.js` 等其他渲染文件

> 注意：本基线是**逻辑层**（纯 JS 更新循环）的微基准。Canvas 实际绘制（`drawBullets` 的 `shadowBlur`/渐变、敌机绘制、UI 面板）无法在 Node 的 Proxy 桩上可信测量，未纳入本文数字，见「测量边界」。

---

## 一、结论先行

| 结论 | 判定 |
|---|---|
| `setf` 每帧正则匹配是热点 | **误报**：0.36 µs/次，每帧 10 次仅 0.0036 ms（帧预算 0.02%） |
| `hexToRgba` 字符串拼接是热点 | **误报**：0.16 µs/次，每帧 10 次仅 0.0016 ms（帧预算 0.01%） |
| `madHunt` 可绕过子弹上限 | **不成立**：`screenCap` 严格生效，稳态 p50/p95 恒为 140 发 |
| `madHunt` 满技能存在空转分配 | **成立，已修复**：96% 波次「先生成 140 对象再丢弃」，分配 11.4 MB/60s → **0.5 MB/60s（-95.9%）** |
| 追踪弹 `homing` 二次遍历是实测热点 | **成立，已修复**：122 µs/帧 @20 敌 → **21 µs/帧（-81.4%）**；敌机 80 时 -86% |
| `updateBullets` 逐帧重建数组 | 非瓶颈：140 弹 13.6~17.7 µs/帧 |
| 两项优化是行为等价重构 | **已验证**：`emittedWaves` / `droppedWaves` / `emittedBullets` / `peak` / `p50` / `p95` 六项与旧逻辑完全一致 |

---

## 二、微基准数字

### 2.1 UI 热路径（每帧调用）

| 项目 | 单次耗时 | 吞吐 | 每帧 10 次占 16.67ms 预算 |
|---|---|---|---|
| `setf(ctx, fontStr)`（4 种真实字体串轮换） | 0.362 µs | 2.76M ops/s | 0.0036 ms（0.022%） |
| `hexToRgba("#5ee6ff", .8)` | 0.163 µs | 6.12M ops/s | 0.0016 ms（0.010%） |
| `hexToRgba("#abc", .8)`（三位简写，走 `split/map/join`） | 0.355 µs | 2.82M ops/s | — |
| `hexToRgba("rgba(...)")`（非 hex 直通） | 0.008 µs | 128M ops/s | — |

**判定**：即使把每帧 `setf` + `hexToRgba` 的调用次数放大到 10 次，合计仅 **0.0054 ms/帧 = 帧预算的 0.03%**。这两项不是瓶颈，**未做任何改动**。

> `hud.js` 每帧实际 `setf` 约 4~6 次，`hexToRgba` 约 4~6 次；UI 面板只在菜单/升级等非战斗帧绘制，频次更低。

### 2.2 射击与子弹更新（优化前 → 优化后）

| 项目 | 优化前 | 优化后 | 变化 |
|---|---|---|---|
| `getShootPattern(player)`（madHunt 满技能） | 2.1 µs/次，140 对象 | 2.1 µs/次，140 对象 | 函数本身未改；调用次数降 96% |
| `updateBullets(dt)` @ 140 发 | 13.6~17.7 µs/帧 | 13.6~17.7 µs/帧 | 未改动 |
| `homing` @ 140 弹 × 20 敌 | **111.4~122.1 µs/帧** | **21.3 µs/帧** | **-81.4%** |
| `updateBullets + homing` 合计 | ~0.130 ms/帧（0.8% 预算） | **~0.036 ms/帧（0.2% 预算）** | **-72%** |

### 2.3 敌机规模敏感性（140 发追踪弹）

| 敌机数 | 优化前（`Math.hypot`） | 优化后（`dx²+dy²`） | 削减 |
|---|---|---|---|
| 10 | 63.9 µs | 15.7 µs | 75% |
| 20 | 111.4 µs | 21.3 µs | 81% |
| 40 | 200.6 µs | 31.6 µs | 84% |
| 80 | **382.6 µs** | **52.6 µs** | **86%** |

- 增长线性于敌机数（子弹数固定 140），整体 `O(B × E)`；优化后常数因子降到约 1/5~1/7。
- 敌机越多，收益越大。

---

## 三、`madHunt` 60 秒峰值模拟（优化前 vs 优化后）

模拟口径：`calcFireRate` → `madHunt` 取 **0.045s**；`refireGateDistance(0.045) = 20px`；每帧 60fps 调用真实的 `markMainBulletsTriggered` / `getShootPattern` / `countFriendlyBullets` / `fireBullet` / `updateBullets`；优化后版本直接调用 `js/game.js` 导出的 `canBuildShootPattern`。先用 5s 预热，再统计 60s。

| 指标 | 优化前（生成后判） | 优化后（生成前预判） | 是否等价 |
|---|---|---|---|
| 模拟帧数 | 3600 | 3600 | — |
| 发射尝试 | 1184 | 1184 | ✅ |
| 实际发出波数 | 48 | 48 | ✅ |
| 被 `screenCap` 丢弃 | 1136（96.0%） | 1136（96.0%） | ✅ |
| 实际发出子弹 | 6720 | 6720 | ✅ |
| 生成的 pattern 对象 | 165,760 | **6,720** | **-95.9%** |
| 其中被丢弃的对象 | 159,040 | **0** | **-100%** |
| 同屏友弹 峰值 / p50 / p95 | 140 / 140 / 140 | 140 / 140 / 140 | ✅ |
| 均值 | 136.34 | 136.34 | ✅ |
| 60s 分配垃圾（≈72.2 B/对象） | 11.4 MB | **0.5 MB** | **-95.9%** |
| 平均分配速率 | 2763 obj/s | 112 obj/s | -95.9% |

**读法**：

1. **上限一直有效**：`p50 = p95 = 140`，`screenCap` 从未被绕过。
2. **真正的问题是白分配**：`patterns.length === 140` 恰好等于上限，只有屏上友弹为 0 时才发得出去；其余 96% 的尝试把整波对象造完直接扔掉。优化后这些波次在生成前就返回，不再产生对象。
3. **优化是精确等价的**：预判数量 `(8 + scatter*2) * (1 + volley)` 由 `player.js` 的 madHunt 分支唯一决定，无 `waveCap` / `perCh` 裁剪、无副作用；因此「预判跳过」与「生成后丢弃」逐值等价（`test/perf-gate.test.mjs` 对 0..140 全量断言）。
4. **常规分支不动**：非 madHunt 的 pattern 数受 `waveCap=16` 与 `perCh` 裁剪，无法提前精确推导；若用上界预判会误伤本可发射的波次，所以仍保留「先生成后判」。
5. 理论 22 波/秒被 `screenCap` 压到 0.8 波/秒，是设计取舍（满屏可读性优先），本轮不改玩法。

---

## 四、优化实施记录（P5b）

### 4.1 madHunt 空转分配

- 位置：`js/game.js` 发射段（原 `getShootPattern()` 之后判 `screenCap`）。
- 改动：新增导出函数 `expectedMadHuntPatterns(player)` 与 `canBuildShootPattern(player, friendlyCount, cap)`；发射段改为 `canBuild ? getShootPattern(player) : null`，原 `friendly + patterns.length <= screenCap` 判定保留为最终闸门。
- 等价性：仅 madHunt 分支走预判（其数量可精确推导）；常规分支恒返回 `true`，行为完全不变。`markMainBulletsTriggered()` 与 `fireCd` 赋值顺序未动。
- 测试：`test/perf-gate.test.mjs` 6 项（预判长度一致性、非 madHunt 不预判、满屏 false、0..140 全量等价、满屏一帧不新增、空屏一帧正常发 140）。

### 4.2 homing 二次遍历

- 位置：`js/game.js:279-299` 追踪弹转向段。
- 改动：距离比较 `Math.hypot(dx,dy)` → `dx*dx + dy*dy`；速度模长 `Math.hypot(vx,vy)` → `Math.sqrt(vx*vx + vy*vy)`。转向角度公式未动。
- 等价性：距离非负，平方比较与距离比较同序；速度量级 <100，`sqrt` 与 `hypot` 在浮点精度内一致。弹道与命中判定不变。
- 预期 vs 实测：预期 -82%，实测 **-81.4% @20 敌**，与预期吻合。

### 4.3 未采纳项

| 项目 | 原因 |
|---|---|
| `setf` 缓存字体串 | 实测 0.02% 预算，收益小于回归面 |
| `hexToRgba` 加 Map 缓存 | 实测 0.01% 预算；缓存还会引入无界增长风险 |
| `updateBullets` 改原地压缩 | 13.6~17.7 µs/帧，收益在噪声内；改动会碰命中索引语义 |
| 常规分支提前预判 | 数量无法精确推导，会误伤可发射波次（行为不等价） |

---

## 五、测量边界（必须知道）

1. **未测 Canvas 绘制**：`drawBullets` 在子弹多时是否开 `shadowBlur`、渐变创建次数、`drawImage` 贴图开销，都依赖真实 GPU/Canvas 实现，Node Proxy 桩测不出可信数字。下一步应在真实 Chromium（Playwright）里用 `PerformanceObserver` + `requestAnimationFrame` 帧间隔直方图量测。
2. **未测低端移动端**：本报告是桌面 x86 数字。低端手机 JS 执行慢 5~10 倍，homing 优化前会从 0.13 ms/帧放大到 0.6~1.3 ms/帧；优化后相应降到 0.1~0.2 ms/帧。
3. **模拟未含敌弹、敌机、粒子、BGM**：只隔离「友方子弹 + 追踪」链路，不代表整帧总量。
4. **`getShootPattern` 计时包含 140 次对象字面量分配**，不含后续 `fireBullet`。
5. **bench 现在会动态导入 `js/game.js`** 以使用真实的 `canBuildShootPattern`，因此需要 `test/_env.mjs` + 一套最小 DOM 桩；不覆盖 `performance`，不影响计时。

---

## 六、复现方式

```bash
cd plane_war
node --expose-gc tools/perf/bench.mjs
```

- 去掉 `--expose-gc` 也能跑，只是「每对象字节数 / 垃圾总量」几行会缺失。
- 数字有 ±10% 抖动（CPU 频率、JIT 状态），表内为 7 次 median。
- 脚本只读 `js/**` 的导出函数；`homingPassLegacy` 是本地对照实现，不代表线上代码。