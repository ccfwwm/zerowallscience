# clinical terminology lookup

Fast autocomplete/normalization lookups against the NLM Clinical Table Search Service — resolve a partial or informal drug name to its RxTerms display name and RxCUI, autocomplete a health condition or problem-list entry to its formal name and ICD-10-CM/ICD-9-CM codes, normalize a disease mention to a UMLS CUI, look up an HCPCS Level II billing/DME code, autocomplete a pharmacogenomic star allele (e.g. CYP2D6, CYP2C19) to its nucleotide/protein change, or find a US healthcare provider/organization by name via the NPPES NPI registry. Also covers standardized coding-system lookups: search or look up ICD-10-CM diagnosis codes directly by name or code, resolve a drug name to its full RxNorm identity (RXCUI, related brand/generic products, NDC package-level status/properties), browse NCI Thesaurus cancer-concept hierarchy and its cross-vocabulary maps to MedDRA/SNOMED/GDC, and search/resolve LOINC lab-test and clinical-form codes. Also resolves UniProt's own disease and functional-keyword controlled vocabularies (DI-/KW- IDs) for protein-annotation contexts. Use when someone gives a free-text or informal clinical term ("high blood pressure", "metfor...", "Cleveland Clinic") and needs the standardized name/code before a downstream lookup, or explicitly asks to "autocomplete", "look up the RxCUI for", "find the ICD-10 code for", "look up this star allele", "find the NPI for", "what does ICD-10 code X mean", "look up the NDC for this drug package", "find the NCIt code for this cancer concept", "what does this cancer concept map to in MedDRA", or "find the LOINC code for this lab test".

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to Use This Skill
- Tools
- Standardized Coding Systems: ICD-10-CM and RxNorm
- ICD-10-CM (`src/tooluniverse/data/icd_tools.json`)
- RxNorm (`src/tooluniverse/data/rxnorm_extended_tools.json`)
- Cancer Ontology and Lab-Test Coding: NCI Thesaurus and LOINC
- NCI Thesaurus / NCIt (`src/tooluniverse/data/nci_thesaurus_tools.json`)
- LOINC (`src/tooluniverse/data/loinc_tools.json`)
- Protein-Annotation Vocabularies: UniProt Disease and Keywords
- Disease Ontology and Genetic-Condition Terminology: Mondo, DO, MedGen
- Mondo Disease Ontology (`src/tooluniverse/data/mondo_tools.json`)
- Human Disease Ontology / DO (`src/tooluniverse/data/disease_ontology_tools.json`)
- NCBI MedGen (`src/tooluniverse/data/medgen_tools.json`)
- Cross-Ontology Search, Text Annotation, and Specialized Terminologies
- BioPortal (`src/tooluniverse/data/bioportal_tools.json`)
- FHIR Terminology Service (`src/tooluniverse/data/fhir_terminology_tools.json`)
- NCI Drug Dictionary (`src/tooluniverse/data/nci_drugdict_tools.json`)
- NCI EVS — Non-NCIt Terminologies (`src/tooluniverse/data/nci_evs_tools.json`)
- Workflow
- Output

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BioPortal_annotate_text`
- `tooluniverse.tool.BioPortal_get_concept`
- `tooluniverse.tool.BioPortal_get_hierarchy`
- `tooluniverse.tool.BioPortal_search_ontology_terms`
- `tooluniverse.tool.CMSOpenPayments_search_payments`
- `tooluniverse.tool.DiseaseNames_search`
- `tooluniverse.tool.DiseaseOntology_get_parents`
- `tooluniverse.tool.DiseaseOntology_get_term`
- `tooluniverse.tool.FHIRTerminology_expand_valueset`
- `tooluniverse.tool.FHIRTerminology_lookup_code`
- `tooluniverse.tool.HCPCS_search`
- `tooluniverse.tool.HealthConditions_search`
- `tooluniverse.tool.ICD10_get_code_info`
- `tooluniverse.tool.ICD10_search_codes`
- `tooluniverse.tool.ICD11_browse_hierarchy`
- `tooluniverse.tool.ICD11_get_entity`
- `tooluniverse.tool.ICD11_search_diseases`
- `tooluniverse.tool.ICD_CLIENT_ID`
- `tooluniverse.tool.ICD_CLIENT_SECRET`
- `tooluniverse.tool.LOINC_get_answer_list`
- `tooluniverse.tool.LOINC_get_code_details`
- `tooluniverse.tool.LOINC_search_forms`
- `tooluniverse.tool.LOINC_search_tests`
- `tooluniverse.tool.MedGen_get_clinical_features`
- `tooluniverse.tool.MedGen_get_condition`
- `tooluniverse.tool.MedGen_search_conditions`
- `tooluniverse.tool.Mondo_get_disease`
- `tooluniverse.tool.Mondo_get_disease_phenotypes`
- `tooluniverse.tool.Mondo_search_disease`
- `tooluniverse.tool.NCIDrugDict_get_drug`
- `tooluniverse.tool.NCIDrugDict_search`
- `tooluniverse.tool.NCIEVS_get_concept`
- `tooluniverse.tool.NCIEVS_search_terminology`
- `tooluniverse.tool.NCIThesaurus_get_children`
- `tooluniverse.tool.NCIThesaurus_get_concept`
- `tooluniverse.tool.NCIThesaurus_get_concept_maps`
- `tooluniverse.tool.NCIThesaurus_get_parents`
- `tooluniverse.tool.NCIThesaurus_search`
- `tooluniverse.tool.NPIProvider_search`
- `tooluniverse.tool.RxNorm_find_rxcui`
- `tooluniverse.tool.RxNorm_get_drug_info`
- `tooluniverse.tool.RxNorm_get_ndc_properties`
- `tooluniverse.tool.RxNorm_get_ndc_status_history`
- `tooluniverse.tool.RxNorm_get_related_drugs`
- `tooluniverse.tool.RxTerms_search_drugs`
- `tooluniverse.tool.StarAlleles_search`
- `tooluniverse.tool.UniProtRef_get_disease`
- `tooluniverse.tool.UniProtRef_get_keyword`
- `tooluniverse.tool.UniProtRef_search_diseases`
- `tooluniverse.tool.UniProtRef_search_keywords`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-terminology-lookup/SKILL.md)；Apache-2.0；原文 SHA-256：`48dabd4b99b4fa020cafc764a8223e49174f731b0036977e5d7ed4e18f74132b`。
