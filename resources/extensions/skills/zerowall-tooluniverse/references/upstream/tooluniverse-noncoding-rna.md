# noncoding rna

Non-coding RNA analysis — miRNAs (miRBase, miRDB targets), lncRNAs (LNCipedia, RNAcentral), circRNAs, snoRNAs, and other ncRNA classes. Distinct mechanisms per class — miRNAs repress mRNA; lncRNAs scaffold/decoy/enhance. Use for ncRNA function prediction, miRNA-target prediction, lncRNA functional annotation, and ncRNA-disease association queries.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- Core Tools
- Workflow
- Phase 0: ncRNA Identity & Classification
- Phase 1: Target & Interaction Analysis
- Phase 2: Expression & Tissue Specificity
- Phase 3: Disease Associations
- Phase 4: Functional Interpretation
- Limitations
- Computational Procedure: TargetScan Predicted Targets (Download-and-Process)
- Computational Procedure: miRTarBase Validated Targets (Download-and-Process)
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.ENCORI_get_miRNA_targets`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.LNCipedia_get_lncrna`
- `tooluniverse.tool.LNCipedia_get_lncrna_publications`
- `tooluniverse.tool.LNCipedia_get_lncrna_xrefs`
- `tooluniverse.tool.LNCipedia_search_lncrna`
- `tooluniverse.tool.LNCipedia_search_ncrna_by_type`
- `tooluniverse.tool.MODOMICS_get_modification`
- `tooluniverse.tool.MODOMICS_list_modifications`
- `tooluniverse.tool.MODOMICS_search_modifications`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.RNAcentral_get_by_accession`
- `tooluniverse.tool.RNAcentral_get_genome_locations`
- `tooluniverse.tool.RNAcentral_get_sequence`
- `tooluniverse.tool.RNAcentral_search`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Rfam_get_family`
- `tooluniverse.tool.Rfam_search_sequence`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.miRBase_get_mirna`
- `tooluniverse.tool.miRBase_get_mirna_xrefs`
- `tooluniverse.tool.miRBase_search_mirna`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-noncoding-rna/SKILL.md)；Apache-2.0；原文 SHA-256：`fb05fd67d317e0a0ffbed46cdf70a73285710d8970ab17d9368443bb0cfb590e`。
