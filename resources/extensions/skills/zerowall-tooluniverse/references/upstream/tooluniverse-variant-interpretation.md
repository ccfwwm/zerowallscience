# variant interpretation

Clinical variant interpretation from raw variant calls to ACMG-classified recommendations with structural impact analysis. Use for VUS classification, pathogenicity assessment with cited criteria, structure-based variant impact (AlphaFold/PDB), non-coding/regulatory variant effect prediction with sequence deep-learning models (AlphaGenome, Enformer, Borzoi, ChromBPNet, Evo 2), and producing clinical-grade variant reports for return of results or molecular tumor boards. Use this whenever a user asks about a variant's significance, an intronic/promoter/enhancer/UTR non-coding variant's functional impact, or needs ACMG classification — even if they don't say "ACMG".

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Triggers
- Key Principles
- LOOK UP, DON'T GUESS
- Workflow Overview
- Phase 1: Variant Identity
- Phase 2: Clinical Databases
- Phase 2.5: Regulatory Context (Non-Coding Only)
- Phase 2.9: Short-Circuit Check
- Phase 3: Computational Predictions
- Phase 4: Structural Analysis (VUS/Novel Missense)
- Phase 4.2: Mechanism of Effect (VUS missense, ESMC-6B SAE)
- Phase 4.5: Expression Context
- Phase 5: Literature Evidence
- Phase 6: ACMG Classification
- Gene-Specific Population Frequency Thresholds
- Handling Conflicting Evidence: Functional vs Epidemiological
- Bayesian ACMG Point System (Tavtigian et al. 2018)
- Gene-Specific VCEP Criteria
- Predictor Weighting
- Tool Failure Fallbacks
- Special Scenarios
- Output Structure
- Clinical Recommendations
- Quantified Minimums

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ALPHA_GENOME_API_KEY`
- `tooluniverse.tool.AlphaGenome_atlas_lookup_variant`
- `tooluniverse.tool.AlphaGenome_score_variant`
- `tooluniverse.tool.AlphaMissense_get_variant_score`
- `tooluniverse.tool.BioRxiv_list_recent_preprints`
- `tooluniverse.tool.CADD_get_variant_score`
- `tooluniverse.tool.CELLxGENE_get_cell_metadata`
- `tooluniverse.tool.CELLxGENE_get_expression_data`
- `tooluniverse.tool.COSMIC_get_mutations_by_gene`
- `tooluniverse.tool.COSMIC_search_mutations`
- `tooluniverse.tool.ChIPAtlas_enrichment_analysis`
- `tooluniverse.tool.ChIPAtlas_get_peak_data`
- `tooluniverse.tool.ClinGenAllele_get_allele`
- `tooluniverse.tool.ClinGenAllele_lookup_hgvs`
- `tooluniverse.tool.ClinGen_search_actionability`
- `tooluniverse.tool.ClinGen_search_dosage_sensitivity`
- `tooluniverse.tool.ClinGen_search_gene_validity`
- `tooluniverse.tool.ClinVar_search_variants`
- `tooluniverse.tool.DisGeNET_get_vda`
- `tooluniverse.tool.DisGeNET_search_gene`
- `tooluniverse.tool.ENCODE_get_experiment`
- `tooluniverse.tool.ENCODE_search_experiments`
- `tooluniverse.tool.ESM_API_KEY`
- `tooluniverse.tool.ESM_describe_sae_feature`
- `tooluniverse.tool.ESM_explain_variant_mechanism`
- `tooluniverse.tool.ESM_get_region_sae_features`
- `tooluniverse.tool.ESM_score_variant_sae_batch`
- `tooluniverse.tool.EVE_get_variant_score`
- `tooluniverse.tool.EnsemblVEP_annotate_hgvs`
- `tooluniverse.tool.EnsemblVar_get_variant_consequences`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.Evo2_score_variant`
- `tooluniverse.tool.FOLKLORE_MCP_URL`
- `tooluniverse.tool.GTEx_get_median_gene_expression`
- `tooluniverse.tool.InterPro_get_protein_domains`
- `tooluniverse.tool.MedRxiv_get_preprint`
- `tooluniverse.tool.MyVariant_get_pathogenicity_scores`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.NCBIGene_search`
- `tooluniverse.tool.NVIDIA_API_KEY`
- `tooluniverse.tool.NvidiaNIM_alphafold2`
- `tooluniverse.tool.OMIM_get_entry`
- `tooluniverse.tool.OMIM_search`
- `tooluniverse.tool.ONCOKB_API_TOKEN`
- `tooluniverse.tool.PDBe_get_uniprot_mappings`
- `tooluniverse.tool.PubMed_search_articles`
- `tooluniverse.tool.SemanticScholar_search_papers`
- `tooluniverse.tool.SpliceAI_get_max_delta`
- `tooluniverse.tool.SpliceAI_predict_splice`
- `tooluniverse.tool.Tark_get_mane_transcripts`
- `tooluniverse.tool.Tark_get_transcript`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.VariantValidator_gene2transcripts`
- `tooluniverse.tool.VariantValidator_validate_variant`
- `tooluniverse.tool.alphafold_get_prediction`
- `tooluniverse.tool.civic_get_variants_by_gene`
- `tooluniverse.tool.civic_search_assertions`
- `tooluniverse.tool.civic_search_evidence_items`
- `tooluniverse.tool.civic_search_genes`
- `tooluniverse.tool.gnomad_get_variant`
- `tooluniverse.tool.gnomad_search_variants`
- `tooluniverse.tool.openalex_search_works`
- `tooluniverse.tool.run_borzoi_variant_effect`
- `tooluniverse.tool.run_chrombpnet_variant_effect`
- `tooluniverse.tool.run_enformer_variant_effect`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-variant-interpretation/SKILL.md)；Apache-2.0；原文 SHA-256：`8e0bf88af7fe3a44e020d515cf89a3188d63c943980def9d33efdd9ce96b1cfe`。
