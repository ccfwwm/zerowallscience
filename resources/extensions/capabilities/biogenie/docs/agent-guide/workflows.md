---
language: mixed
---

# 端到端工作流（14 个场景）

> 每个场景：用户愿望 → 工具调用序列 → 产出 → 注意点。命中场景按序列执行，不要跳步、不要发明步骤。**全部场景走 Python 引擎**（差异表达/GSEA 用语义化工具 bio_deseq2 / bio_gsea）。
>
> **⚠️ 所有场景执行前必须通过数据质量门控（见 rigor 指南 §0），每个结论必须标注证据级别（见 rigor 指南 §1b）。**

## 1. 序列质控与特征统计

愿望："分析这个文件里所有序列的长度、GC 含量，标记低质量序列。"

```
bio_seq_io_read path="D:/data/genes.fasta" limit=200        # 先看有多少条
→ 若条数少（<50）：逐条 bio_seq_analyze
→ 若条数多：bio_python 批量统计（模板见 bio-proto-seq-qc）
产出：汇总表（id | 长度 | GC% | N 比例）+ 低质量序列清单 + 文件路径
```

## 2. 组合分析（GC + ORF + 酶切）

愿望："这条序列的 GC、最长 ORF、EcoRI 位点都查一下。"

```
bio_seq_analyze sequence="..."          # GC + 六框翻译
bio_seq_find_orf sequence="..."         # 最长 ORF（注意默认 min_len=30nt）
bio_seq_restriction sequence="..." enzymes=["EcoRI","BamHI"]  # 酶切位点
产出：三项结果汇总 + 生物学解读（ORF 是否完整、酶切产物片段预测）
```

## 3. 远程 BLAST 注释

愿望："这段未知序列是什么物种的什么基因？"

```
加载 bio-proto-blast-remote（含 qblast 模板与 E-value 解读）
bio_python：Bio.Blast.NCBIWWW.qblast 提交 → 解析前 10 个 hit
产出：hit 表（accession | identity | E-value | 物种/基因名）
注意：qblast 是网络提交，等待时间数秒~分钟；E-value < 1e-10 才可信
```

## 4. 基因信息查询

愿望："查 TP53 的基本信息。"

```
bio_entrez_search term="TP53[Gene Name] AND human[Organism]" db="gene" retmax=3 email="..."
产出：基因名/染色体位置 17p13.1/别名/功能摘要
进阶：bio_entrez_fetch ids=["NM_000546"] 取 mRNA 序列 → bio_seq_translate 验证 CDS
```

## 5. 通路富集分析

愿望："这组差异表达基因富集到哪些通路？"

```
bio_enrichr genes=["TP53","BRCA1",...] library="GO_Biological_Process_2023" top=10
bio_enrichr genes=[同列表] library="KEGG_2021_Human" top=10
bio_enrichr genes=[同列表] library="Reactome_2022" top=10      # 可选交叉
加载 bio-proto-enrichment-workflow 做解读
产出：按 adjusted_p_value 排序的表 + 功能主题归并（DNA 修复/细胞周期…）
注意：GO 与 KEGG p 值不可互相比较；冗余 term 按基因重叠>70% 去重
```

## 6. 文献调研

愿望："CRISPR prime editing 近年综述。"

```
bio_pubmed_search term='"prime editing"[Title/Abstract] AND review[Publication Type] AND 2023:2026[dp]' retmax=30
bio_pubmed_abstract ids=[挑出的 PMID]          # 一次 ≤30 个
（可选）bio_python 用 OpenAlex REST 补预印本/引用量（模板见 bio-proto-literature-review）
产出：表格 PMID | 年份 | 期刊 | 核心发现一句话；引用必须带 PMID/DOI
```

## 7. 系统发育树

愿望："这 20 条 16S 序列的亲缘关系。"

```
bio_seq_io_read path="16s.fasta" limit=20
加载 bio-proto-phylo-nj（距离矩阵 + NJ/UPGMA 模板）
bio_python：ClustalOmega/PairwiseAligner 做 MSA → DistanceCalculator → NJ 建树 → 写 .nwk
产出：树文件（Newick）+ 关键分组结论
注意：插件不内置 MAFFT/IQ-TREE（外部二进制）——如实说明用 Bio.Phylo 近似法
```

## 8. 蛋白结构分析

愿望："分析这个 PDB 里活性位点残基间的距离。"

```
（用户提供或 bio_python 下载 PDB 文件）
加载 bio-proto-pdb-analysis（距离/RMSD 模板）
bio_python：Bio.PDB 解析 → 残基对距离计算 → 输出距离矩阵
产出：距离表 + 结构解读；DSSP/ResidueDepth 等外部程序不在环境内（如实说明）
```

## 9. 出版级绘图（完整闭环）

愿望："把这组表达数据画成论文级箱线图（Nature 单栏）。"

```
bio_fig_qa lang="zh"                        # 中文图先查字体
bio_fig_profile path="expr.csv" group_cols=["group"]   # 剖析+图型建议+风险
加载 bio-figure（决策）+ bio-proto-pub-figure（配方）
bio_python：setup_style(journal='nature') → 箱线+stripplot → audit_layout → export_figure
bio_fig_export paths=["figs/fig1.pdf","figs/fig1.png"] min_dpi=300 width_in=3.5 height_in=2.625
→ FAIL 就回改重导，直到 PASS/WARN 合理
产出：PDF/SVG/PNG + 灰度预览 + 审计结论
```

## 10. 统计检验

愿望："两组数据的差异显著吗？"

```
加载 bio-proto-statistics（检验选择树）
bio_python：scipy 检验（ttest_ind/mannwhitneyu）+ 效应量（Cohen's d）+ 校正
产出：检验名 + 统计量 + p 值 + 效应量 + 置信区间 + APA 风格一句话结论
注意：多重比较必须校正（BH-FDR/Bonferroni）；p 值不二分解读
```

## 通用纪律

- 每个场景第一步先想：**语义化工具能覆盖吗**（能就别写代码）。
- 文件路径一律绝对路径；产出文件报告完整路径。
- 网络步骤（BLAST/Entrez/Enrichr）失败时：一次重试 → 仍失败如实报告（限流/网络），不无限重试。
- 每个场景结尾：**生物学解读**一段（结论 + 证据出处 + 局限）。

## 11. 差异表达（Python 语义化工具）

愿望："这两组 RNA-seq counts 哪些基因差异表达？"

```
（文件系统工具确认 counts.csv / meta.csv 列名对齐）
bio_deseq2 counts_file=<raw_counts.csv> meta_file=<meta.csv> contrast=<trt_vs_ctrl> out_csv=<new_run/de_full.csv>
产出：de_results.csv（padj<0.05 且 |log2FC|>1 的上下调基因数 + top10）
后续：火山图（bio_fig_profile → bio_python figurelib）→ 显著基因列表 bio_enrichr 富集
```

## 12. 排序 GSEA（Python 语义化工具）

愿望："差异表达的全基因组排序里，哪些通路整体变化？"

```
（差异表达结果已由 bio_deseq2 产出；只有显著列表没有排序 → 改 bio_enrichr）
bio_gsea de_results_file=<de_full.csv> ranking_column=stat gene_set_file=<matching_species_ids.gmt> species=<species> id_namespace=<ID_type> gene_set_species=<species> gene_set_id_namespace=<ID_type> out_csv=<new_run/gsea_full.csv>
产出：gsea_results.csv + 上/下调显著通路数（padj<0.25，GSEA 阈值）
注意：非内置基因集需用户从 MSigDB 官网下载放入工作区
```

## 13. 微生物组多样性（bio_python）

愿望："两组样本的肠道菌群多样性和结构差异？"

```
（用户提供 otu.csv 丰度表 + meta.csv 分组）
bio_python 跑：pandas 组装 → Shannon/Observed α 多样性 → wilcox 检验 → Bray-Curtis PCoA → PERMANOVA
产出：alpha 表 + pcoa.png + R²/p 值 + 解读（效应方向、每组 n 小时标探索性）
注意：丰度表行列方向（taxa 在行/列）必须先确认；中文图用 figurelib
```

## 14. 干实验 → 湿实验方案（两层生成契约）

愿望："设计一份能直接做的 Gibson/PCR/CRISPR 湿实验方案。"

```
1. 先完成干实验事实层（列出上游工具输出：bio_clone_simulate 组装结果 / bio_primer3_design 引物 /
   bio_crispr_guide 向导 / bio_gene_knockout optknock 敲除清单——缺失时先跑对应工具）
2. bio_wetlab_design protocol_type=对应类型 input_data=<上游输出 dict>
   （选型前提：strain_construction 仅用于敲除增产——input_data 必须含 knockouts/recommended_knockouts，
   否则返回 guidance 引导而非方案；非敲除场景如过表达/异源表达改用 transformation 或 crispr_editing）
3. 读取返回的 generation_contract：
   - assumptions 逐条对照用户现实（浓度/设备/菌株/库存/时间），不成立的提出修正并标 [推断]
   - adapt_points 上结合场景具体化（体积换算、稀释、QC 数量、转化方式）
   - hard_constraints 绝不突破（酶反应温度、同源臂区间、Tm 必须来自实算）
4. 产出：完整 protocol md（事实锚点溯源 → 适应性调整[推断] → 可执行步骤），覆盖反应体系/条件/转化/验证/风险
产出：result/<任务名>-protocol.md
注意：禁止手写 protocol 模板绕过 bio_wetlab_design——事实层必须由代码生成
```
