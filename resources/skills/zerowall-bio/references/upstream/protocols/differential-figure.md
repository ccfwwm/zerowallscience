---
name: bio-proto-differential-figure
domain: visualization
inputs: [差异分析结果表(CSV/TSV/DataFrame)：effect/p/padj/baseMean 列]
outputs: [出版级 volcano 或 MA 图(PDF/PNG) + meta 统计/配色/caption_fragments]
requires_network: false
language: python
---

# 差异分析出版配方：volcano / MA（bio-proto-differential）

> 协议库配方（随 bio-figure skill 使用）。库：`figurelib.differential_recipes`
> （本插件自研，MIT——视觉规则源自 Nature figure guide 精神 + GPT 评审意见，
> 经本地实现与实拍验证）。
> 配方登记：src/skills.js PROTOCOL rugs 决策树已含 bio-proto-pub-figure；
> 本协议补差异分析专用层。

## 一图流（agent 照抄）

```python
from figurelib.setup_style import setup_style
from figurelib.differential_recipes import differential_plot   # volcano/MA 双模
setup_style(journal='nature', lang='en')     # 或 lang='zh'（中文期刊）

fig, ax, meta = differential_plot(
    df,                                       # 真实 DESeq2/edgeR/limma 输出
    effect_col='log2FC', p_col='pvalue', padj_col='padj',
    base_mean_col='baseMean', label_col='gene',
    mode='volcano',                           # 或 'ma'（需 baseMean 列）
    alpha=0.05, effect_threshold=1.0,
    user_labels=['TP53','MYC'],               # 用户点名 genes（受预算控制）
    out_file='figures/volcano.pdf')
print(meta)   # n_sig_up/n_sig_down/sig_basis/thresholds/labeled/caption_fragments
```

数据契约（**数字必须来自真实计算**，本配方不算统计）：
- effect：log2FC 或任何方向性效应（必填）
- pvalue/padj：显者判定（默认用 padj；只给 p 时 use_padj=False）
- baseMean：MA 模式的表达量底座（**MA 模式必填**）

## 视觉语义（内置，agent 不另造）

- **三层视觉角色**：上下文（NS 全体，浅灰 #BDBDBD）→ 支持（显著基因 up/down 彩色）→
  **焦点（label 受预算控制，黑）**
- NS 永远 #BDBDBD；up=#D55E00 vermillion；down=#0072B2 blue，全篇一致——相同语义不同图不许换色
- 阈值线（alpha 与 effect_threshold）必须进图（数据解释结构）
- 标注预算：自动 top effect（正/负各 up to top_k）+ top significance + 用户点名；
  **绝不 Top-N 全标**——annotation budget 是 Nature 审稿人的隐形红线

## 图注（caption）必填

meta['caption_fragments'] 已给出可拼接句子：
- 显著性定义（Sig. = padj<0.05 and |log2FC|>1）
- 色语义（NS: grey; up: vermillion; down: blue）
- 加上：误差/检验全名（two-sided Welch's t-test + BH correction，来自真实计算）、
  exact n（生物学重复数）、重复类型

## 陷阱（主动拦截）

| # | 陷阱 | 处置 |
|---|---|---|
| D1 | 用 p 而非 padj、或无 use_padj 开关 | 默认 padj；没算 padj 时显式 use_padj=False 并提示跑 bio_deseq2 |
| D2 | 标 Top 30 genes 一大片 | 标注预算：top effects + top sig + 用户点名（<20） |
| D3 | 上色 NS 基因 | NS 必须灰（Tier C），不许抢焦点 |
| D4 | 阈值线不画 | effect_threshold / alpha 线必须画（拚图=透明） |
| D5 | y 上界让 p=0 极端值压缩主体 | 配方内部已做 quantile 截断（自动） |
| D6 | diverging effect 色带 center≠0 | 配方无色带；若上下文需要 diverging 热图？改 heat：center=0 |
| D7 | 审稿人要出图代码时现写 | **不必现写**：导出时 `meta.repro_script`（`<图名>_reproduce.py`）已自动落盘，直接交付 |

## 验收标准

- [ ] 显著性判定依据来自上游工具真实输出，非绘制时重算
- [ ] 图中 up/down 计数与 meta.n_sig_up/down 一致（同心）
- [ ] caption 引用 meta.caption_fragments 补齐统计谱系（不能只贴「有星号」）
- [ ] 图输出后 bio_fig_lint(colors_used=..., n_categorical=3) PASS
