---
name: bio-proto-statistics
domain: statistics
inputs: [两组/多组数值数据, 或设计问题描述]
outputs: [检验选择建议 + 统计结果(p 值/效应量/功效)]
requires_network: false
language: python
---

# 统计分析协议

**适用场景**：组间比较、相关性检验、多重校正、样本量与功效规划、实验设计、结果显著性标注的数据基础。

**执行路径（先看这条）**：
1. **CSV + 两/多组比较** → 优先语义化工具 `bio_stats_test`（自动选 t/Mann-Whitney/ANOVA/卡方，返回 p 值 + Cohen's d + 各组描述统计）。
2. **它覆盖不到的场景**（配对设计、多组事后检验、相关/回归、非参数多组、列联表残差、功效与样本量）→ 用本协议的 scipy / statsmodels 配方。
3. 数据在内存/非 CSV → `bio_python` 直接跑本协议模板。

> 依赖说明：`scipy`、`statsmodels`（≥0.14）、`pandas` 均为**第一层内置依赖**（python/requirements.txt），可直接 import，无需补装。

## 一、检验选择决策树

```
问题类型？
├─ 两组连续数据比均值
│   ├─ 配对（同一样本前后测）   → scipy.stats.ttest_rel
│   ├─ 独立且正态、方差齐       → ttest_ind（Welch equal_var=False 更稳，默认推荐）
│   └─ 非正态 / 小样本 / 有离群 → mannwhitneyu；配对非参数 → wilcoxon
├─ 多组（≥3）连续数据
│   ├─ 独立、正态、方差齐       → f_oneway（单因素 ANOVA）
│   ├─ 独立、非正态             → kruskal + Dunn 事后（scikit-posthocs）
│   ├─ 同一批样本多次测量        → 重复测量 ANOVA（statsmodels AnovaRM）
│   ├─ 配对/区组（非参数）       → friedmanchisquare + Nemenyi 事后
│   └─ 两因素/交互              → statsmodels OLS/GLM + anova_lm（已内置）
├─ 分类变量关联（列联表）       → chi2_contingency；小格期望<5 → fisher_exact
├─ 两连续变量相关性
│   ├─ 线性（正态）             → pearsonr
│   └─ 单调（非正态/有离群）     → spearmanr（次序） / kendalltau（小样本、多结）
├─ 计数数据（事件数/单位时间）   → Poisson GLM；过离散 → Negative Binomial
├─ 生存数据（时间-事件）        → 见 bio-survival-analysis（lifelines）
└─ 非劣效/等效设计             → 单侧检验 + 预设非劣效界值（不可事后选界值）
```

**假设检验前必做**：正态性（`shapiro`，n<5000；n>5000 用 Anderson-Darling）与方差齐性（`levene`，对非正态稳健；`bartlett` 仅正态时用）。
n 很小（<10/组）时正态检验没意义——直接上非参数检验。

## 二、代码模板（bio_python）

```python
from scipy import stats
import numpy as np

# 两组独立（Welch，不假设方差齐）/ 非参数 / 配对
t, p = stats.ttest_ind(ctrl, treat, equal_var=False)
u, p = stats.mannwhitneyu(ctrl, treat, alternative='two-sided')
t, p = stats.ttest_rel(before, after)
# 多组：独立 / 非参数 / 配对
f, p = stats.f_oneway(g1, g2, g3)
h, p = stats.kruskal(g1, g2, g3)
chi2f, p = stats.friedmanchisquare(g1, g2, g3)   # 同一批样本 ≥3 次测量
# 相关性 / 列联表
r, p = stats.pearsonr(x, y)
rho, p = stats.spearmanr(x, y)
chi2, p, dof, expected = stats.chi2_contingency(table)
```

**事后检验**（ANOVA/Kruskal 显著后才有意义，不可跳过多重校正）：

```python
# 参数式：statsmodels Tukey HSD（第一层内置）
from statsmodels.stats.multicomp import pairwise_tukeyhsd
print(pairwise_tukeyhsd(df['value'], df['group']))   # 已含校正
```

## 三、多重比较校正（比较 >1 次就必须做）

```python
from statsmodels.stats.multitest import multipletests   # 已内置
rej, q, _, _ = multipletests(pvals, alpha=0.05, method='fdr_bh')  # BH-FDR，默认推荐
```

- 全组探索性比较（如转录组 2 万基因）→ **BH-FDR**；只比较 3-5 个预设计检验 → Bonferroni（`method='bonferroni'`）可接受。
- 报告：校正方法 + 校正后 p 值（q 值）；图注写清（如 `** q < 0.01, BH-FDR`）。
- **只校正真正做了的比较**；选择性报告（只展示显著者）本身就是 p-hacking。

## 四、效应量对照表（p 值之外必须报告）

| 设计 | 效应量 | 小/中/大（Cohen 惯例） | 备注 |
|---|---|---|---|
| 两组均值差 | Cohen's d | 0.2 / 0.5 / 0.8 | n<20 用 Hedges' g（偏差校正版） |
| 两组（方差不齐/对照基准） | Glass's Δ | 同上 | 只用对照组 SD 标准化 |
| 多组 ANOVA | η² / partial η² | 0.01 / 0.06 / 0.14 | 被试内设计用 partial η² |
| 多组（小样本校正） | ω² | — | 比 η² 保守，n 小时优先 |
| ANOVA 功效输入 | Cohen's f | 0.1 / 0.25 / 0.4 | f = √(η²/(1-η²)) |
| 相关 | r / ρ | 0.1 / 0.3 / 0.5 | r² = 解释方差 |
| 回归整体 | R² / adj. R² | — | 多预测因子必报 adj. R² |
| 回归单因子 | f² | 0.02 / 0.15 / 0.35 | f² = ΔR²/(1-R²) |
| 列联表 | Cramér's V | 0.1 / 0.3 / 0.5 | 表越大 V 越稳定；φ 仅 2×2 |
| 二分类结局 | OR / RR | — | 报告 95% CI，不只点估计 |

- p 值只回答"是否有差异"，效应量回答"差异多大"；**两样都要报**。
- 报告范式：`d = 0.92 (95% CI 0.08–1.76)`，或 OR `1.85 (1.12–3.05)`。

## 五、样本量与功效规划（实验前，先想清楚；数据已收齐则用 MDE）

**规划姿态五档（先定姿态，再算数）**：

| 姿态 | 何时用 |
|---|---|
| 正式估算 | 假设有文献/预试验支撑 |
| 区间估算 | 效应量不确定，给乐观/保守区间 |
| 事件驱动 | 生存/罕见事件：算**需要多少事件**，不是多少人 |
| 固定 N 可行性评估 | 样本已定死（临床现存样本/菌株数），改为算**可检出的最小效应 MDE** |
| 预试验定位 | 只做信号探索，**不得**按确证性结论报告 |

**假设质量分级（先分类再计算，防伪精度）**：已知/提供 → 文献支持但不确定 → 本机构估计 → 纯猜测 → 缺失。
**纯猜测的效应量不得作为唯一规划依据**；缺失关键输入时先要输入，不要硬算一个数。

```python
from statsmodels.stats.power import TTestIndPower, TTestPower, FTestAnovaPower, NormalIndPower
import numpy as np

ind = TTestIndPower()
# 1) 两组独立 t：d=0.5、power=0.8 → 每组样本量（实测 63.77 → 取 64）
n = ind.solve_power(effect_size=0.5, alpha=0.05, power=0.8, ratio=1.0)
# 2) 固定 N 求可检出最小效应 MDE（n=15/组 → 实测 1.06，说明只能测到大效应）
mde = ind.solve_power(nobs1=15, alpha=0.05, power=0.8, ratio=1.0, effect_size=None)
# 3) 已有数据的实际功效（n=20/组、d=0.8 → 实测 0.6934）
pw = ind.power(effect_size=0.8, nobs1=20, alpha=0.05, ratio=1.0)
# 4) 配对 t（实测 d=0.5、power=0.8 → 33.37 对）
n_paired = TTestPower().solve_power(effect_size=0.5, alpha=0.05, power=0.8, alternative='two-sided')
# 5) 多组 ANOVA —— 注意：solve_power 返回的是**总样本量 N，不是每组 n**
#    （f=0.25、k=4、power=0.8 → 实测总 N=178.4；均衡 4 组时每组 ceil(178.4/4)=45）
n_anova_total = FTestAnovaPower().solve_power(effect_size=0.25, alpha=0.05, power=0.8, k_groups=4)
n_anova_per_group = int(np.ceil(n_anova_total / 4))
print(f"ANOVA 总 N={n_anova_total:.1f} → 每组 {n_anova_per_group}")
# 6) 比例：先算 Cohen's h，再求 n（p1=.30→p2=.50 时 h=0.4115，双侧 power=0.8 → 92.75/组）
h = 2*np.arcsin(np.sqrt(0.50)) - 2*np.arcsin(np.sqrt(0.30))
n_prop = NormalIndPower().solve_power(effect_size=h, alpha=0.05, power=0.8, ratio=1.0)

# 7) 失访/损耗膨胀：最终需招募 N = n / (1 - 损耗率)（n=26、损耗 20% → 33）
n_final = int(np.ceil(n / (1 - 0.20)))
```

**规划硬规则**：

- **生物学重复 ≠ 技术重复**：n 是生物学单元（不同菌株/不同批次/不同个体）；同一孔测 3 次是技术重复，不能当 n=3。
- **功效 <80% 时"p>0.05"不能解读为"无差异"**——只能说"未检出"。
- **事后功效（post-hoc power）** 争议大：已收数据时优先报**置信区间**与 MDE，而不是事后功效。
- **回归/分类模型看 EPV**：每变量事件数 ≥10（EPV≥10，PMID 8970487）是底线惯例；预测因子数超过 事件数/10 时别做高参数模型。
- **亚组分析默认无功效**：总体样本够 ≠ 亚组够。
- **多终点**：只有预先声明的主要终点驱动样本量；次要/探索性终点不得反过来定 N。

## 六、实验设计要点（实验前就该想）

1. **对照**：阴性/阳性/空白对照至少一个；"没对照"的结果原则上不可下结论。
2. **随机化 + 盲法**：分组随机、测量盲法，防选择偏倚。
3. **重复**：见上（生物学 vs 技术重复）；独立重复（不同批次）才能谈可重复性。
4. **混杂变量**：批次/性别/年龄/板位——设计时分块（blocking），分析时入模型或分层。
5. **预注册**：主要终点、检验方法、校正方案在收数据前定死，防 p-hacking。

## 七、报告规范（APA 风格示例）

> "处理组（M = 3.42, SD = 0.61, n = 12）显著高于对照组（M = 2.87, SD = 0.58, n = 12），Welch's t(21.4) = 2.28, p = .034, Cohen's d = 0.92（95% CI [0.08, 1.76]）。多组比较 p 值经 BH-FDR 校正。"

要点：均值+SD+n、检验名+统计量+自由度、p 值（校正注明）、效应量+置信区间。

## 八、统计陷阱清单（自审用，逐条对照）

| 陷阱 | 说明 |
|---|---|
| p 值 = 假设为真的概率 | 错。p 是"若 H0 为真观察到该数据的概率" |
| 不显著 = 无效应 | 错。可能功效不足；报告 CI 与 MDE |
| 显著 = 重要 | 错。n 大时微小差异也显著，看效应量 |
| 事后功效 | 争议大，别当证据 |
| 多重比较不校正 | 3 组两两 t 做 3 次 → 假阳性率 14%+ |
| 亚组钓鱼 | 亚组"发现"多为假阳性；报预先声明的亚组 |
| 结局交换（outcome switching） | 换主要终点/换切点直到显著 = p-hacking |
| 小样本谬误 | n 小 → 效应量极不稳定，别过度解读方向 |
| 删失点/阈值试错 | 生存分析试切点直到显著（应用 maxstat 等预设方法） |
| 辛普森悖论 | 分层后趋势反转；报告分层结果 |
| 生态学谬误 | 群体层面关联 ≠ 个体层面关联 |
| 共线性掩盖 | 相关预测因子同入模型 → 都不显著（查 VIF） |
| 不显著协变量 ≠ 无混杂 | 去掉它可能引入偏倚；按设计而非 p 值选协变量 |
| 外推超出数据范围 | 回归预测落在观测范围外 = 假设未知 |
| 过拟合 | 变量数逼近样本量、无交叉验证的模型不可信 |
| SEM 当 SD 画图 | SEM = SD/√n，视觉上"更紧"，图注必须写清 |
| 相关 ≠ 因果 | 横断面只能报告关联 |

## 验收标准

- [ ] 检验选择与数据结构匹配（对照 §一决策树），假设前提已检查并报告
- [ ] 比较 >1 次时报告校正方法（BH-FDR 优先）
- [ ] p 值 + **效应量** + 置信区间三件套齐全（对照 §四表选对效应量口径）
- [ ] 样本量/功效规划标明了**规划姿态**与假设质量档位；纯猜测的输入已显式标注
- [ ] n 是生物学重复；技术重复未被当作独立样本
- [ ] 措辞与功效一致（"未检出"而非"无差异"）

<!-- absorbed (power/sample-size planning + effect-size table + pitfalls list) from
     aipoch/medical-research-skills@f5ef65b9bea79b6dd9553f52f95b0d08f7d64d26 (MIT), 2026-09-11.
     改造：临床「患者/招募」口径 → 生物学重复口径；新增规划姿态五档与假设质量分级；
     修正旧结论「插件未内置 statsmodels」（实测 statsmodels 0.15.0 已在第一层依赖，BH-FDR 改用 multipletests）；
     全部配方在本机插件 venv 实测通过（数值见 §五 注释）。 -->
