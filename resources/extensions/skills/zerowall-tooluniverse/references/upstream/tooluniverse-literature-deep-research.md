# literature deep research

Deep literature review — PubMed, EuropePMC, bioRxiv preprints, citation networks, evidence synthesis. Disambiguates queries, runs collision-aware searches, grades evidence T1-T4, and produces structured reports. Use for systematic literature review, meta-analysis evidence collection, and detailed answer-with-citations workflows.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- Workflow
- Phase 0: Mode Selection
- Factoid Mode (Fast Path)
- Domain Detection
- Cross-Skill Delegation
- Phase 1: Subject Disambiguation + Profile
- 1.1 Biological Target Resolution
- 1.2 Naming Collision Detection
- 1.3 Baseline Profile (Bio Targets)
- 1.5 Drug Disambiguation
- 1.6 Disease Disambiguation
- 1.7 Compound Queries (e.g., "metformin in breast cancer")
- 1.8 General Academic / 1.9 Interdisciplinary
- Phase 2: Literature Search
- 2.1 Query Strategy
- 2.2 Literature Tools — core set + adaptive by domain
- 2.3-2.4 Full-Text & PubMed Zero-Result Fallback
- 2.5 Tool Failure / OA Handling
- Phase 3: Evidence Grading
- Report Output
- Communication

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ArXiv_search_papers`
- `tooluniverse.tool.BGPT_API_KEY`
- `tooluniverse.tool.BGPT_search_paper_evidence`
- `tooluniverse.tool.BioRxiv_get_preprint`
- `tooluniverse.tool.CORE_search_papers`
- `tooluniverse.tool.CTD_get_chemical_diseases`
- `tooluniverse.tool.CTD_get_chemical_gene_interactions`
- `tooluniverse.tool.CTD_get_disease_chemicals`
- `tooluniverse.tool.ChEMBL_get_drug`
- `tooluniverse.tool.ChEMBL_get_drug_mechanisms`
- `tooluniverse.tool.Consensus_search_papers`
- `tooluniverse.tool.Crossref_search_works`
- `tooluniverse.tool.DBLP_search_publications`
- `tooluniverse.tool.DGIdb_get_drug_gene_interactions`
- `tooluniverse.tool.DOAJ_search_articles`
- `tooluniverse.tool.DisGeNET_get_disease_genes`
- `tooluniverse.tool.DisGeNET_search_disease`
- `tooluniverse.tool.EPMC_get_citations`
- `tooluniverse.tool.EPMC_get_references`
- `tooluniverse.tool.EuroPMCAnnot_get_annotations_by_type`
- `tooluniverse.tool.EuroPMCAnnot_get_article_annotations`
- `tooluniverse.tool.EuroPMCAnnot_get_chemicals_from_article`
- `tooluniverse.tool.EuropePMC_get_article_datalinks`
- `tooluniverse.tool.EuropePMC_get_citations`
- `tooluniverse.tool.EuropePMC_get_full_text`
- `tooluniverse.tool.EuropePMC_get_references`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.Fatcat_search_scholar`
- `tooluniverse.tool.Figshare_search_articles`
- `tooluniverse.tool.GO_get_annotations_for_gene`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.HAL_search_archive`
- `tooluniverse.tool.HPA_get_subcellular_location`
- `tooluniverse.tool.InspireHEP_search_papers`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.LitVar_get_variant_details`
- `tooluniverse.tool.LitVar_get_variant_publications`
- `tooluniverse.tool.LitVar_search_variants`
- `tooluniverse.tool.MeSH_get_descriptor`
- `tooluniverse.tool.MeSH_search_descriptors`
- `tooluniverse.tool.MeSH_search_terms`
- `tooluniverse.tool.MedRxiv_get_preprint`
- `tooluniverse.tool.MyGene_get_gene_annotation`
- `tooluniverse.tool.NOODLE_MCP_URL`
- `tooluniverse.tool.OSF_search_preprints`
- `tooluniverse.tool.OpenAIRE_search_publications`
- `tooluniverse.tool.OpenCitations_get_citations`
- `tooluniverse.tool.OpenTargets_get_associated_targets_by_drug_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_adverse_events_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_drug_chembId_by_generic_name`
- `tooluniverse.tool.OpenTargets_get_drug_indications_by_chemblId`
- `tooluniverse.tool.OpenTargets_get_target_tractability_by_ensemblID`
- `tooluniverse.tool.PMC_search_papers`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubMed_Guidelines_Search`
- `tooluniverse.tool.PubMed_convert_article_ids`
- `tooluniverse.tool.PubMed_get_cited_by`
- `tooluniverse.tool.PubMed_get_related`
- `tooluniverse.tool.PubMed_lookup_article_by_citation`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.PubTator3_LiteratureSearch`
- `tooluniverse.tool.Reactome_map_uniprot_to_pathways`
- `tooluniverse.tool.STRING_get_protein_interactions`
- `tooluniverse.tool.SemanticScholar_get_recommendations`
- `tooluniverse.tool.SemanticScholar_search_papers`
- `tooluniverse.tool.UniProt_get_entry_by_accession`
- `tooluniverse.tool.UniProt_get_ptm_processing_by_accession`
- `tooluniverse.tool.UniProt_id_mapping`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.Zenodo_search_records`
- `tooluniverse.tool.advanced_literature_search_agent`
- `tooluniverse.tool.convert_to_markdown`
- `tooluniverse.tool.drugbank_get_drug_basic_info_by_drug_name_or_id`
- `tooluniverse.tool.ensembl_lookup_gene`
- `tooluniverse.tool.iCite_get_publications`
- `tooluniverse.tool.iCite_search_publications`
- `tooluniverse.tool.intact_get_interactions`
- `tooluniverse.tool.openalex_literature_search`
- `tooluniverse.tool.openalex_search_works`
- `tooluniverse.tool.scite_get_tallies`
- `tooluniverse.tool.search_clinical_trials`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-literature-deep-research/SKILL.md)；Apache-2.0；原文 SHA-256：`e7a6618c24ced93bcb222542e472c6fd3bdc4e484bdef5ae65a3e78f0c42911b`。
