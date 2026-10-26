# gene regulatory networks

Gene regulatory network analysis — TF-target inference (JASPAR motifs, ChIP-seq), motif scanning, eQTL integration, perturbation evidence (knockout/overexpression). Use for 'which TF regulates gene X', 'which genes does TF Y target', regulatory pathway reconstruction. Distinguishes direct (binding) vs indirect (co-expression) regulatory evidence.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use
- COMPUTE, DON'T DESCRIBE
- Workflow
- Phase 0: Input Disambiguation
- Phase 1: TF Motif Lookup (JASPAR)
- Phase 2: TF Target Genes (Enrichr)
- Phase 3: Regulatory Element Context
- 3a: Histone Modifications (ENCODE)
- 3b: Expression QTLs (GTEx)
- 3c: Regulatory Variant Annotation (RegulomeDB)
- Phase 4: Protein Interaction Network
- 4a: STRING Database
- 4b: IntAct Interactions
- 4c: BioGRID Interactions
- Phase 5: Literature Context
- Phase 6: Ontology Annotation (Optional)
- Phase 7: Functional Enrichment of Network
- Common Mistakes
- Common Use Patterns
- Pattern 1: "What does TF X regulate?"
- Pattern 2: "What regulates gene Y?"
- Pattern 3: "Build a regulatory network around gene set Z"
- Pattern 4: "Tissue-specific regulation of gene X"
- Pattern 5: "Is variant rs##### regulatory?"

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioGRID_get_interactions`
- `tooluniverse.tool.ENCODE_search_histone_experiments`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.GTEx_query_eqtl`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.RegulomeDB_query_variant`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_interaction_partners`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.enrichr_gene_enrichment_analysis`
- `tooluniverse.tool.intact_get_interaction_network`
- `tooluniverse.tool.jaspar_get_matrix`
- `tooluniverse.tool.jaspar_search_matrices`
- `tooluniverse.tool.ols_search_terms`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gene-regulatory-networks/SKILL.md)；Apache-2.0；原文 SHA-256：`dd1ef084041409e6136aca8efc3a815e6ce6c55acaedffad0d578062379f3fbe`。
