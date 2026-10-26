# rnaseq deseq2

RNA-seq differential expression analysis with DESeq2, edgeR, and limma-voom — DEG lists, fold changes, dispersion estimation, design formulas including covariates, multi-condition contrasts, and Venn-set operations across groups. Routes across DESeq2 (default), edgeR (QL-F / exact test for small replicate counts), and limma-voom (large n / complex designs). Use when you have a count matrix + metadata, want to find DEGs, or need dispersion/PCA/clustering analysis. Includes RULE ZERO precedence (read executed.ipynb if present).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- PRIMARY SCRIPTS — use these FIRST before writing custom code
- `scripts/r_deseq2_wrapper.py` — R DESeq2, multi-contrast Venn, per-gene LFC
- edgeR / limma-voom alternative DE routes
- Choosing DESeq2 vs edgeR vs limma-voom
- `scripts/multi_strain_venn.py` — Venn from existing DEG CSVs
- `scripts/gene_length_correlation.py` — protein-coding length-vs-expression
- `scripts/pca_variance.py` — % variance for PC1 across all PCA variants
- `scripts/one_way_anova_f.py` — ANOVA F-statistic AND p-value
- CRITICAL — Read before writing any code
- Workspace isolation (CRITICAL)
- Domain Reasoning
- LOOK UP DON'T GUESS
- Core Principles
- When to Use
- Required Packages
- Analysis Workflow
- Step 1: Parse the Question
- Step 2: Load & Validate Data
- Step 2.5: Inspect Metadata (REQUIRED)
- Step 3: Run PyDESeq2
- Step 4: Filter Results
- Step 5: Dispersion Analysis (if asked)
- Step 6: Enrichment (optional)
- Step 7: Gene Annotation (optional)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.RNAseq_edger_limma_de`
- `tooluniverse.tool.read_executed_notebook`
- `tooluniverse.tool.run_deseq2_analysis`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-rnaseq-deseq2/SKILL.md)；Apache-2.0；原文 SHA-256：`776cd9bd8c73ce036e568728ace0c36f4045b6e20a3f3110b7be939b85536644`。
