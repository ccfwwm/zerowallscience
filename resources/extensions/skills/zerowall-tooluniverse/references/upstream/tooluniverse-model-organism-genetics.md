# model organism genetics

Cross-species genetic analysis using model organism databases (MGI mouse, IMPC systematic knockout phenotyping, ZFIN zebrafish, FlyBase fruit fly, WormBase worm, SGD budding yeast plus protein-domain/PTM/literature detail, PomBase fission yeast, RGD rat, GeneNetwork systems-genetics/eQTL panels, HumanMine/MouseMine cross-species data-warehouse search, GBIF taxonomy) plus VEuPathDB for eukaryotic pathogens (Plasmodium, Toxoplasma, fungi, vectors). Maps human genes to orthologs, retrieves phenotype/expression/functional data, assesses gene function conservation, and identifies the best animal model for studying a human gene or disease.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- Reasoning Principles
- Ortholog Reasoning
- Model Organism Selection
- Phenotype Transfer Reasoning
- Pipeline
- Phase 0: Human Gene Disambiguation (ALWAYS FIRST)
- Phase 1: Ortholog Mapping
- Phase 2: Mouse Phenotypes (MGI)
- Phase 2b: Systematic Knockout Phenotyping (IMPC) — statistically-powered, complements MGI's curated calls
- Phase 2c: Broader Data-Warehouse Search (HumanMine / MouseMine) — free-text fallback when structured lookups come up thin
- Phase 2d: Systems Genetics / eQTL Across Recombinant Inbred Panels (GeneNetwork)
- Phase 3: Invertebrate Models
- Fly (FlyBase)
- Worm (WormBase)
- Phase 4: Vertebrate Non-Mammalian Models
- Zebrafish (ZFIN)
- Frog (Xenbase)
- Phase 4b: Rat (RGD) — physiology & disease-model strains
- Phase 5: Yeast (SGD)
- Phase 5b: Fission Yeast (PomBase) — S. pombe, distinct from SGD's S. cerevisiae
- Phase 3b: Eukaryotic Pathogens (VEuPathDB) — malaria, toxoplasmosis, fungi, vectors
- Phase 6: Cross-Species Synthesis (CRITICAL)
- Phase 7: Human Disease Connection (Optional)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClinGen_search_gene_validity`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.EnsemblCompara_get_orthologues`
- `tooluniverse.tool.FlyBase_get_gene`
- `tooluniverse.tool.FlyBase_get_gene_alleles`
- `tooluniverse.tool.FlyBase_get_gene_disease_models`
- `tooluniverse.tool.FlyBase_get_gene_expression`
- `tooluniverse.tool.FlyBase_get_gene_interactions`
- `tooluniverse.tool.FlyBase_get_gene_orthologs`
- `tooluniverse.tool.FlyMine_search`
- `tooluniverse.tool.GBIF_get_species`
- `tooluniverse.tool.GBIF_search_species`
- `tooluniverse.tool.GeneNetwork_get_dataset_info`
- `tooluniverse.tool.GeneNetwork_get_sample_data`
- `tooluniverse.tool.GeneNetwork_get_trait_info`
- `tooluniverse.tool.GeneNetwork_list_datasets`
- `tooluniverse.tool.GeneNetwork_list_groups`
- `tooluniverse.tool.GeneNetwork_list_species`
- `tooluniverse.tool.HPO_search_terms`
- `tooluniverse.tool.HumanMine_search`
- `tooluniverse.tool.HumanMine_search_genes`
- `tooluniverse.tool.HumanMine_search_pathways`
- `tooluniverse.tool.IMPC_get_gene_phenotype_hits`
- `tooluniverse.tool.IMPC_get_gene_summary`
- `tooluniverse.tool.IMPC_get_phenotypes_by_gene`
- `tooluniverse.tool.IMPC_search_genes`
- `tooluniverse.tool.InterMine_run_pathquery`
- `tooluniverse.tool.MGI_get_gene`
- `tooluniverse.tool.MGI_get_phenotypes`
- `tooluniverse.tool.MGI_search_genes`
- `tooluniverse.tool.MPD_get_phenotype_data`
- `tooluniverse.tool.MonarchV3_get_associations`
- `tooluniverse.tool.MonarchV3_phenotype_similarity_search`
- `tooluniverse.tool.Monarch_search_gene`
- `tooluniverse.tool.MouseMine_search`
- `tooluniverse.tool.MouseMine_search_alleles`
- `tooluniverse.tool.MouseMine_search_genes`
- `tooluniverse.tool.MyGene_query_genes`
- `tooluniverse.tool.NCBIDatasets_get_orthologs`
- `tooluniverse.tool.OMIM_search`
- `tooluniverse.tool.PANTHER_ortholog`
- `tooluniverse.tool.PomBase_get_gene`
- `tooluniverse.tool.PomBase_get_gene_phenotypes`
- `tooluniverse.tool.PomBase_get_go_annotations`
- `tooluniverse.tool.PomBase_get_interactions`
- `tooluniverse.tool.PomBase_get_orthologs`
- `tooluniverse.tool.PomBase_search_genes`
- `tooluniverse.tool.RGD_get_annotations`
- `tooluniverse.tool.RGD_get_gene`
- `tooluniverse.tool.RGD_get_orthologs`
- `tooluniverse.tool.RGD_get_qtls_in_region`
- `tooluniverse.tool.RGD_get_strain`
- `tooluniverse.tool.RGD_get_strain_annotations`
- `tooluniverse.tool.RGD_search_genes`
- `tooluniverse.tool.RGD_search_strains`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.SGD_get_gene`
- `tooluniverse.tool.SGD_get_go_annotations`
- `tooluniverse.tool.SGD_get_interactions`
- `tooluniverse.tool.SGD_get_literature`
- `tooluniverse.tool.SGD_get_phenotypes`
- `tooluniverse.tool.SGD_get_protein_domains`
- `tooluniverse.tool.SGD_get_ptm_sites`
- `tooluniverse.tool.SGD_search`
- `tooluniverse.tool.STRING_get_network`
- `tooluniverse.tool.UniProt_search`
- `tooluniverse.tool.VEuPathDB_get_gene_record`
- `tooluniverse.tool.VEuPathDB_list_gene_searches`
- `tooluniverse.tool.VEuPathDB_list_organism_searches`
- `tooluniverse.tool.VEuPathDB_list_record_types`
- `tooluniverse.tool.VEuPathDB_search_genes_by_organism`
- `tooluniverse.tool.WormBase_get_expression`
- `tooluniverse.tool.WormBase_get_gene`
- `tooluniverse.tool.WormBase_get_phenotypes`
- `tooluniverse.tool.Xenbase_get_gene`
- `tooluniverse.tool.Xenbase_search_genes`
- `tooluniverse.tool.ZFIN_get_gene`
- `tooluniverse.tool.ZFIN_get_gene_expression`
- `tooluniverse.tool.ZFIN_get_gene_phenotypes`
- `tooluniverse.tool.ensembl_lookup_gene`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-model-organism-genetics/SKILL.md)；Apache-2.0；原文 SHA-256：`12863e5270753b59810bdde7f816aa147455126bf2f68ae1472c43d23d9dc6c3`。
