# metabolomics pathway

Metabolomics pathway analysis — metabolite identification (HMDB, KEGG, ChEBI), pathway mapping (Reactome, KEGG, MetaCyc), disease associations, enzyme/gene linkage. Use for metabolite-to-pathway-to-disease connections, BridgeDb-based ID conversion, and integrating metabolomics with gene-level pathway analyses.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Domain Reasoning
- LOOK UP DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Workflow
- Phase 0: Metabolite Identification & Resolution
- By Name
- By Mass/Formula
- By ID
- ID Cross-Referencing
- Phase 1: Metabolite Characterization
- Phase 2: Pathway Mapping
- MetaCyc
- KEGG
- Reactome
- Phase 3: Enzyme & Gene Linkage
- Phase 4: Disease Associations
- Phase 5: Cross-Database Enrichment
- Common Mistakes to Avoid
- Fallback Strategies
- Evidence Grading
- Limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BridgeDb_attributes`
- `tooluniverse.tool.BridgeDb_search`
- `tooluniverse.tool.BridgeDb_xrefs`
- `tooluniverse.tool.CTD_get_chemical_diseases`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.CTD_get_gene_diseases`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.KEGG_get_compound`
- `tooluniverse.tool.KEGG_get_gene_pathways`
- `tooluniverse.tool.KEGG_get_pathway_genes`
- `tooluniverse.tool.MetaCyc_get_compound`
- `tooluniverse.tool.MetaCyc_get_pathway`
- `tooluniverse.tool.MetaCyc_get_reaction`
- `tooluniverse.tool.MetaCyc_search_pathways`
- `tooluniverse.tool.Metabolite_get_diseases`
- `tooluniverse.tool.Metabolite_get_info`
- `tooluniverse.tool.Metabolite_search`
- `tooluniverse.tool.MetabolomicsWorkbench_get_compound_by_pubchem_cid`
- `tooluniverse.tool.MetabolomicsWorkbench_get_refmet_info`
- `tooluniverse.tool.MetabolomicsWorkbench_get_study`
- `tooluniverse.tool.MetabolomicsWorkbench_search_by_exact_mass`
- `tooluniverse.tool.MetabolomicsWorkbench_search_by_mz`
- `tooluniverse.tool.MetabolomicsWorkbench_search_compound_by_name`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.ReactomeContent_search`
- `tooluniverse.tool.Reactome_get_pathway`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-metabolomics-pathway/SKILL.md)；Apache-2.0；原文 SHA-256：`c492863045dd5547ff028ea4dffda70283b3f429131cffbadbc5ce10e9dabd68`。
