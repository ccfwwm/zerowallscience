# acmg variant classification

Systematic ACMG/AMP germline variant classification with all 28 criteria (PVS1, PS1-4, PM1-6, PP1-5, BA1, BS1-4, BP1-7) for clinical significance. Produces 5-tier verdict (Pathogenic / Likely Pathogenic / VUS / Likely Benign / Benign) with cited evidence per criterion. Use for variant interpretation, VUS resolution, and pathogenicity assessment. Combines ClinVar, gnomAD, computational predictors, and gene-mechanism context.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- ACMG Reasoning
- LOOK UP, DON'T GUESS
- When to Use
- Phase 0: Variant Validation and Normalization
- Phase 1: Population Frequency (BA1, BS1, BS2, PM2)
- Phase 2: Computational Predictions (PP3, BP4)
- Phase 3: Clinical Database Evidence (PS1, PM5, PP5, BP6)
- Phase 4: Functional Domain and Protein Analysis (PM1, PP2, BP1)
- Phase 5: Splice Impact Assessment (PVS1)
- Phase 6: Literature and Functional Evidence (PS3, BS3, PP1, PP4)
- Automated Cross-Check (InterVar)
- Classification Algorithm
- Output Format
- Common Patterns

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinVar_get_variant_details`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.ESM_API_KEY`
- `tooluniverse.tool.ESM_explain_variant_mechanism`
- `tooluniverse.tool.EnsemblVEP_annotate_hgvs`
- `tooluniverse.tool.InterPro_get_entries_for_protein`
- `tooluniverse.tool.InterVar_classify_variant`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.Tark_get_mane_transcripts`
- `tooluniverse.tool.Tark_get_transcript`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.VariantValidator_gene2transcripts`
- `tooluniverse.tool.VariantValidator_validate_variant`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.civic_get_variants_by_gene`
- `tooluniverse.tool.gnomad_get_gene_constraints`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-acmg-variant-classification/SKILL.md)；Apache-2.0；原文 SHA-256：`7b4921e7ef07ba2627e46a427726cf869836e7576b3d3258410ddecbc96aa148`。
