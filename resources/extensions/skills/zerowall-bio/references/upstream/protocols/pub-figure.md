---
name: bio-proto-pub-figure
domain: visualization
inputs: [数据文件(CSV/TSV/Excel)或已有数据]
outputs: [出版级图文件(PDF/SVG/PNG) + 审计结论]
requires_network: false
language: python
---

# 出版级出图协议（执行层配方）

**适用场景**：用户要论文配图/统计图/多面板图。决策层（选什么图、避什么坑）在 `bio-figure` skill；本协议是执行层——**完整闭环：profile → 选图 → setup_style → 绘制 → 自检 → 导出 → 审计 → 回改**。

## 标准流程

```
bio_fig_profile(path="data.csv", group_cols=["group"])   # 1. 剖析 + 建议
bio_fig_qa(lang="zh")                                     # 2. 中文图先查字体
bio_python  →  setup_style + 按配方画图 + audit_layout    # 3-6. 绘制+自检
bio_python  →  export_figure 导出                          # 7. 导出
bio_fig_export(paths=["fig1.pdf"], min_dpi=300, ...)      # 8. 审计，FAIL 回改
```

bio_python 代码里可直接 `import figurelib`（bridge 进程的脚本目录在 sys.path 上）。

## 通用模板（每个配方都套这个骨架）

```python
import matplotlib.pyplot as plt
from figurelib.setup_style import setup_style
from figurelib.layout_tools import finalize_figure, add_panel_labels
from figurelib.visual_qa import audit_layout
from figurelib.export_figure import export_figure

setup_style(journal='nature', lang='en')          # 期刊预设；中文传 lang='zh'
fig, ax = plt.subplots(figsize=(3.5, 2.625))      # 直接定最终尺寸！
# ... 按下方配方画 ...
finalize_figure(fig)                              # 版面兜底（constrained_layout）
issues = audit_layout(fig)                        # 自检：缺字/裁切/刻度重叠
print('QA:', issues if issues else 'PASS')
paths = export_figure(fig, 'figs/fig1', formats=['pdf','svg','png'],
                      size_inches=(3.5, 2.625), dpi=300, grayscale_preview=True)
print('saved:', paths)
result = {'files': paths, 'qa_issues': issues}
```

## 十类配方

### 1. 折线图（时间/剂量，含误差带）

```python
import numpy as np
x = np.linspace(0, 10, 12)
y = np.array([np.sin(x)*2+3]*12)                  # 假装 12 只小鼠
y += np.random.default_rng(1).normal(0, .3, (12, 12))
mu, sem = y.mean(0), y.std(0, ddof=1) / np.sqrt(y.shape[0])
ax.plot(x, mu, color='#0072B2', lw=1.5, label='treated')
ax.fill_between(x, mu-sem, mu+sem, alpha=.25, color='#0072B2')
ax.set_xlabel('Time (h)'); ax.set_ylabel('Response')
# 图注: shaded band = SEM, n = 12 mice per group.
```

### 2. 柱状图（分组 + 误差棒 + 叠加原始点）

```python
import seaborn as sns
import pandas as pd
df = pd.read_csv('data.csv')
sns.barplot(data=df, x='condition', y='response', hue='group',
            errorbar='se', palette='colorblind', alpha=.9, ax=ax)
sns.stripplot(data=df, x='condition', y='response', hue='group',
              dodge=True, size=3, color='black', alpha=.6, ax=ax, legend=False)
# 每组 n<10 时禁用均值柱——见 bio-figure P1，改用配方 4
```

### 3. 散点图（回归 + r/p）

```python
from scipy import stats
r, p = stats.pearsonr(df['x'], df['y'])
ax.scatter(df['x'], df['y'], s=12, alpha=.7)
m, b = np.polyfit(df['x'], df['y'], 1)
ax.plot(df['x'], m*df['x']+b, color='#D55E00', lw=1)
ax.text(.05, .92, f'r = {r:.2f}, p = {p:.2g}', transform=ax.transAxes)
```

### 4. 箱线/小提琴 + stripplot（小样本必须叠点）

```python
import seaborn as sns
sns.violinplot(data=df, x='group', y='value', inner=None, cut=0,
               palette='colorblind', ax=ax)
sns.stripplot(data=df, x='group', y='value', size=3, color='black',
              alpha=.6, ax=ax)
```

### 5. 热力图（感知均匀色图）

```python
import seaborn as sns
sns.heatmap(corr, annot=True, fmt='.2f', cmap='RdBu_r', vmin=-1, vmax=1,
            square=True, ax=ax)
```

### 6. 误差棒图（剂量响应）

```python
# 用 reset_index 把剂量列带回来，避免 unique() 顺序与 groupby 顺序脱节
g = df.groupby('dose')['response'].agg(['mean', 'sem']).reset_index()
ax.errorbar(g['dose'], g['mean'], yerr=g['sem'], fmt='o-',
            capsize=3, color='#0072B2')          # x / y / yerr 三者同长
```

### 7. 分布图（直方图 + KDE + rug）

```python
import seaborn as sns
sns.histplot(df['value'], kde=True, color='#009E73', alpha=.5, ax=ax)
sns.rugplot(df['value'], height=.04, color='black', ax=ax)
```

### 8. 相关性矩阵 / 散点矩阵

```python
import seaborn as sns
# 8a. 相关性热力图（半矩阵）
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, cmap='RdBu_r', vmin=-1, vmax=1, ax=ax)
# 8b. pairplot 独立 Figure（≤8 列）
g = sns.pairplot(df, diag_kind='kde', corner=True, palette='colorblind')
```

### 9. 多面板组合（Figure 1：PCA + 火山 + 热图…）

```python
fig, axes = plt.subplots(2, 2, figsize=(7.2, 5.4))
# 各 panel 独立画，保证字号/配色/同一变量同色一致
axes[0,0].plot(...); axes[0,1].scatter(...)
axes[1,0].bar(...); axes[1,1].plot(...)
finalize_figure(fig)
add_panel_labels(fig, style='nature')   # a b c d 自动横竖对齐；IEEE 用 style='ieee'
# 再 export_figure(fig, 'figs/fig1', size_inches=(7.2, 5.4), ...)
```

### 9b. 不等宽多面板（GridSpec）与共享轴

```python
import matplotlib.pyplot as plt
from figurelib.layout_tools import add_panel_labels
fig = plt.figure(figsize=(7.2, 5.4), constrained_layout=True)  # 别叠用 tight_layout
gs = fig.add_gridspec(2, 3, height_ratios=[1, 1.4], width_ratios=[1.6, 1, 1])
ax_top = fig.add_subplot(gs[0, :])                      # 通栏面板（时间序列/热图）
ax_bl = fig.add_subplot(gs[1, 0])
ax_bc = fig.add_subplot(gs[1, 1], sharey=ax_bl)         # 共享轴：只共刻度，不用重复标签
add_panel_labels(fig, style='nature')
```

**要点**：不等宽用 `gridspec` 的 `width_ratios`/`height_ratios`；**共享轴**（`sharex=`/`sharey=`）
省掉重复轴标签——Science 明确要求「共同轴标签不要重复」；panel 标签统一走 `add_panel_labels`
（手摆 `ax.text` 必错位，见 bio-figure P18）；`constrained_layout=True` 与 `tight_layout()` 不可叠用。

### 10. 显著性标注（配配方 2/4，必须先有检验）

```python
def p_to_stars(p):
    """标准星号约定：ns >0.05 / * ≤0.05 / ** ≤0.01 / *** ≤0.001 / **** ≤0.0001"""
    return 'ns' if p > .05 else '*' if p > .01 else '**' if p > .001 else '***' if p > .0001 else '****'

def bracket(ax, x1, x2, y, text='*', h=None, lw=.8):
    h = h if h is not None else (ax.get_ylim()[1] - ax.get_ylim()[0]) * .02
    ax.plot([x1, x1, x2, x2], [y, y + h, y + h, y], lw=lw, color='black')
    ax.text((x1 + x2) / 2, y + h, text, ha='center', va='bottom')

# pairs = [(x1, x2, p_adj), ...]  ← 先跑检验拿**校正后** p 值（bio_stats_test / bio-proto-statistics）
# 用当前 y 轴**跨度**做 padding，不要硬设下界为 0：全负值 / 以 0 为中心的效应量 / log 轴都会被破坏
ymin, ymax = ax.get_ylim()
span = ymax - ymin
for k, (x1, x2, p) in enumerate(pairs):
    bracket(ax, x1, x2, y=ymax + span * 0.08 * k, text=p_to_stars(p), h=span * 0.02)
ax.set_ylim(ymin, ymax + span * (0.08 * len(pairs) + 0.05))   # 只在原上界之上留白
# log 轴：改用乘法 padding（ymax * 1.3 等），加法 padding 在对数坐标下会被压扁
```

**纪律**：① **每个星号背后必须有一次真实检验**——没检验就没有星号（bio-figure P11）；
② 多重比较用**校正后** p 值（BH-FDR 优先，见 `bio-proto-statistics` §三）；
③ 只标与结论相关的比较（≥3 组全两两会淹没图面；>6 对只标关键对）；
④ 桥逐层抬高 + 先 `set_ylim` ——「标注被 y 轴裁掉」是最高频事故；
⑤ x 坐标对 dodge 后实际位置（seaborn 分组柱需手算偏移）。

## 常见坑

- **图注三件套**：误差类型（SD/SEM/CI）+ n + 检验/校正——任何误差棒/显著性图都不能缺。
- `figsize` 必须 = 最终尺寸；导出后禁止二次缩放（字号是绝对 pt）。
- 中文图：先 `bio_fig_qa`；`setup_style(lang='zh')` 必须在任何中文文本渲染前调用。
- `audit_layout` 要在导出前对 Figure 对象调用（落盘文件无法版面自检）。
- 色盲检查：`export_figure(..., grayscale_preview=True)` 出灰度版，看类别能否区分。
- plotly 交互图不在插件范围——多面板/静态图用 matplotlib 足够。
- 显著性桥的 x 坐标对应 dodge 后实际位置，改了分组要同步改。
- 每张图只讲一个核心结论；>2 个分类维度先查 bio-figure 的拆图标准。

<!-- absorbed (significance-annotation recipe) from jaechang-hits/SciAgent-Skills@fe505cae14d20b6c33be2e49666425be98f005bb (CC-BY-4.0), 2026-09-11.
     改造：只取星号约定表与「校正后 p 值 / 比较选择」纪律，重写为实现配方（含 y 轴留白与 dodge 坐标两个实测坑）；
     多 panel 一节（9b）为自写配方——外部 multipanel skill 为 Proprietary (HITS Inc.)，未使用其任何内容。 -->


## 验收标准

- [ ] 每个配方都能**独立执行**（复制进 bio_python 即用，无未定义变量、无数组形状不匹配）
- [ ] 显著性桥：星号有对应检验 + 用校正后 p 值 + y 轴留白不裁切（负值/ log 轴场景已验证）
- [ ] 误差棒图 x/y/yerr 三者同长（用 `reset_index` 保留分组列，不依赖 `unique()` 顺序）
- [ ] 导出走 `export_figure` + `bio_fig_export` 审计（DPI/尺寸/字体嵌入）
