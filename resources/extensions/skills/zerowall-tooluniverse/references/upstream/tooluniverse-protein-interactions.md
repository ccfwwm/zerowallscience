# protein interactions

Protein-protein interaction (PPI) network analysis — STRING (predicted + experimental), BioGRID (curated), SASBDB (small-angle scattering), Complex Portal (curated complex membership and stoichiometry, includes CORUM data). Distinguishes physical interactions (binding) from functional associations (co-expression, co-regulation). Use for interactome queries, complex partner identification, curated complex composition lookup, and pathway-level interaction analysis.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning: Interaction Type Clarification
- Databases Used
- 4-Phase Workflow
- Complex Portal: Curated Complex Membership
- Parameters
- Confidence Score Guidelines
- Network Edge Fields (STRING)
- Extended Analysis Tools
- SIGNOR: Causal Signaling Interactions
- Tool-Specific Notes
- IntAct Interaction Data
- BioGRID Chemical Interactions
- IntAct `protein_name` Alias
- EBI Proteins-Gateway IntAct Access
- Domain Reasoning: Multimeric Assemblies & Binding Valency
- Calculating Multimer Valency from Binding Data
- Statistical Factors in Multimeric Binding
- When to Use Binding Curve Analysis vs Stoichiometry
- Domain Reasoning: Coiled-Coil Oligomeric State Prediction
- Domain Reasoning: Detergent Effects on Membrane Proteins
- Protein Identification Questions

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioGRID_get_chemical_interactions`
- `tooluniverse.tool.BioGRID_get_interactions`
- `tooluniverse.tool.ComplexPortal_get_complex`
- `tooluniverse.tool.ComplexPortal_search_complexes`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DGIdb_get_gene_druggability`
- `tooluniverse.tool.EBIProteins_get_interaction_details`
- `tooluniverse.tool.EBIProteins_get_interactions`
- `tooluniverse.tool.OmniPath_get_signaling_interactions`
- `tooluniverse.tool.RCSBAdvSearch_search_structures`
- `tooluniverse.tool.RCSBData_get_entry`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.SASBDB_search_entries`
- `tooluniverse.tool.SIGNOR_connect_proteins`
- `tooluniverse.tool.SIGNOR_get_interactions`
- `tooluniverse.tool.SIGNOR_get_pathway`
- `tooluniverse.tool.SIGNOR_list_pathways`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.STRING_map_identifiers`
- `tooluniverse.tool.STRING_ppi_enrichment`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.gnomad_get_gene_constraints`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-protein-interactions/SKILL.md)；Apache-2.0；原文 SHA-256：`283d58efaf2d3233de713b539ee7c3e566f45de2963e4db7098e4a46be9e7a97`。
