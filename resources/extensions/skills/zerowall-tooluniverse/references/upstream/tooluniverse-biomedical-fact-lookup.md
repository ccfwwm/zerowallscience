# biomedical fact lookup

Answer biomedical FACTUAL / recall / multiple-choice questions by querying ToolUniverse database tools instead of answering from memory. Triggers on any 'which gene/drug/variant/disease/pathway/miRNA/TF...' lookup, any question phrased 'according to <database>' (DisGeNet, OMIM, MSigDB, miRDB, GTRD, MGI, Ensembl, ClinVar, ChEMBL, OpenTargets, Reactome, GtoPdb, UniProt...), and multiple-choice biology/medicine knowledge questions where one option must be verified against an authoritative source. NOT for analyzing user-supplied data files (CSV/VCF/h5ad → use the data-analysis router) and NOT for open-ended literature synthesis. Use whenever a single correct answer exists in a public biomedical database and could be looked up rather than guessed.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Six traps that produce a confidently wrong answer
- RULE ZERO: Look it up, never guess
- Multiple-choice procedure
- Routing table — question pattern → tool
- Allen Brain Atlas — answer with the specific structure, not its parent
- Human Protein Atlas — report both location fields
- MSigDB set-name conventions (the most common LAB-Bench pattern)
- Gene–disease "in database X but NOT database Y" recipe
- Drug choice for a described patient (clinical vignette)
- Mouse-phenotype matching (MGI) — fallback only
- Computational procedures (when the answer is COMPUTED, not looked up)
- GWAS "highest p-value" means most significant
- Genomic windows — count the anchor base
- Interpretation
- Limitations (honest)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AllenBrain_get_structure`
- `tooluniverse.tool.AllenBrain_search_structures`
- `tooluniverse.tool.ClinVar_search_by_region`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DISGENET_API_KEY`
- `tooluniverse.tool.DisGeNET_get_disease_genes`
- `tooluniverse.tool.DisGeNET_get_gda`
- `tooluniverse.tool.EPMC_get_text_mined_annotations`
- `tooluniverse.tool.FDA_get_active_ingredient_info_by_drug_name`
- `tooluniverse.tool.FDA_get_boxed_warning_info_by_drug_name`
- `tooluniverse.tool.FDA_get_clinical_pharmacology_by_drug_name`
- `tooluniverse.tool.FDA_get_contraindications_by_drug_name`
- `tooluniverse.tool.FDA_get_dosage_and_storage_information_by_drug_name`
- `tooluniverse.tool.FDA_get_drug_interactions_by_drug_name`
- `tooluniverse.tool.FDA_get_geriatric_use_info_by_drug_name`
- `tooluniverse.tool.FDA_get_indications_by_drug_name`
- `tooluniverse.tool.FDA_get_pediatric_use_info_by_drug_name`
- `tooluniverse.tool.FDA_get_pharmacokinetics_by_drug_name`
- `tooluniverse.tool.FDA_get_pregnancy_or_breastfeeding_info_by_drug_name`
- `tooluniverse.tool.FDA_get_teratogenic_effects_by_drug_name`
- `tooluniverse.tool.HPA_get_comprehensive_gene_details_by_ensembl_id`
- `tooluniverse.tool.HPA_get_rna_expression_by_source`
- `tooluniverse.tool.HPA_get_subcellular_location`
- `tooluniverse.tool.MGI_get_phenotypes`
- `tooluniverse.tool.MGI_search_genes`
- `tooluniverse.tool.MSigDB_check_gene_in_set`
- `tooluniverse.tool.MSigDB_get_gene_set_members`
- `tooluniverse.tool.MSigDB_get_geneset`
- `tooluniverse.tool.MSigDB_get_hallmark_geneset`
- `tooluniverse.tool.MyDisease_get_disease`
- `tooluniverse.tool.NCBIDatasets_get_gene_by_symbol`
- `tooluniverse.tool.OMIM_get_gene_map`
- `tooluniverse.tool.OMIM_search`
- `tooluniverse.tool.PubTator3_GetEntityRelations`
- `tooluniverse.tool.PubTator3_LiteratureSearch`
- `tooluniverse.tool.ReMap_list_datasets_for_target`
- `tooluniverse.tool.SCREEN_search_cCREs_by_region`
- `tooluniverse.tool.STRING_get_protein_interactions`
- `tooluniverse.tool.UCSC_get_sequence`
- `tooluniverse.tool.UniProt_get_disease_variants_by_accession`
- `tooluniverse.tool.VEP_predict_pathogenicity`
- `tooluniverse.tool.annotate_variant_multi_source`
- `tooluniverse.tool.gnomad_get_constraint`
- `tooluniverse.tool.umls_search_concepts`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-biomedical-fact-lookup/SKILL.md)；Apache-2.0；原文 SHA-256：`4dc59c5d12b2ecabb1861908123a11cee1c053f1dfd7273336ee7a668fdc960b`。
