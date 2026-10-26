# regulatory variant analysis

Non-coding/regulatory variant interpretation — GWAS association lookup, eQTL evidence (GTEx), chromatin state (ENCODE), regulatory variant scoring (RegulomeDB, CADD), TF-binding disruption, and sequence-based deep-learning prediction (AlphaGenome/AlphaGenome Atlas) for when annotation databases are silent. Use for non-coding GWAS hit interpretation, eQTL-based gene assignment, and regulatory mechanism reasoning. Distinct from coding-variant tools.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- When to Use
- Non-Coding Variant Impact Reasoning
- Workflow Overview
- Phase 0: Variant/Trait Resolution
- Phase 0.5: Sequence-Based Triage (AlphaGenome Atlas)
- Phase 1: GWAS Association Lookup
- Phase 2: eQTL Analysis
- Phase 3: Regulatory Element Annotation
- Phase 4: OpenTargets GWAS Integration
- Phase 4.5: Sequence-Based Deep-Dive (conditional)
- Phase 5: Functional Impact Synthesis
- Fallback Strategies
- Example Workflows
- GWAS Variant Functional Annotation (rs429358 / APOE)
- Non-Coding Variant Assessment (Intronic/UTR Variant)
- Annotation-Silent Variant Resolved via Sequence Prediction
- Triaging Many Candidates at a GWAS Locus
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ALPHA_GENOME_API_KEY`
- `tooluniverse.tool.AlphaGenome_atlas_lookup_variant`
- `tooluniverse.tool.AlphaGenome_atlas_scan_interval`
- `tooluniverse.tool.AlphaGenome_predict_interval`
- `tooluniverse.tool.AlphaGenome_score_ism_variants`
- `tooluniverse.tool.AlphaGenome_score_variant`
- `tooluniverse.tool.ENCODE_search_histone_experiments`
- `tooluniverse.tool.EnsemblVEP_annotate_rsid`
- `tooluniverse.tool.FAVOR_annotate_variant`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.GTEx_query_eqtl`
- `tooluniverse.tool.OpenTargets_get_disease_id_description_by_name`
- `tooluniverse.tool.OpenTargets_multi_entity_search_by_query_string`
- `tooluniverse.tool.OpenTargets_search_gwas_studies_by_disease`
- `tooluniverse.tool.RegulomeDB_query_variant`
- `tooluniverse.tool.gwas_get_snps_for_gene`
- `tooluniverse.tool.gwas_get_variants_for_trait`
- `tooluniverse.tool.gwas_search_associations`
- `tooluniverse.tool.ols_search_terms`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-regulatory-variant-analysis/SKILL.md)；Apache-2.0；原文 SHA-256：`74eb9fcc0315a7be5b3c2638cf521907094dc0d2de1232fdab4087edd9f2ce9d`。
