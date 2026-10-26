# clinical guidelines

Search and retrieve clinical practice guidelines from 12+ authoritative sources — NICE, WHO, NCCN, AHA, ADA, SIGN, USPSTF, IDSA, NIH consensus, ESMO/ESC/EASL European societies, and US specialty associations. Use for evidence-graded treatment recommendations, dosing protocols, screening guidance, and authoritative-source-prioritized clinical guidance (NICE/WHO ranked above society guidelines).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Guideline Hierarchy
- COMPUTE, DON'T DESCRIBE
- Search Strategy
- Step 1: Start Narrow, Then Broaden
- Step 2: Search at Least 3 Sources
- Step 3: Retrieve Full Text When Available
- Diagnostic Test Selection Reasoning
- Step 1: What Is the Clinical Question Actually Asking?
- Step 2: Match the Test to the Diagnostic Gap
- Step 3: Sensitivity vs Specificity Decision Matrix
- Step 4: Common Test Selection Pitfalls
- Lab Test Interpretation Strategy
- Surgical Decision Making
- Applying Guidelines to Patients
- Tool Workflow
- General Guideline Search (Parallel Calls)
- Society-Specific Tools
- Pharmacogenomics (CPIC)
- Personalized Prevention Recommendations (ODPHP MyHealthfinder)
- Full-Text Retrieval
- Fallback Strategy
- Synthesis Template
- Known Limitations
- Clinical MCQ Reasoning Framework

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ACC_list_guidelines`
- `tooluniverse.tool.ADA_get_standards_section`
- `tooluniverse.tool.ADA_list_standards_sections`
- `tooluniverse.tool.ADA_search_standards`
- `tooluniverse.tool.AHA_ACC_get_guideline`
- `tooluniverse.tool.AHA_ACC_search_guidelines`
- `tooluniverse.tool.AHA_list_guidelines`
- `tooluniverse.tool.CMA_Guidelines_Search`
- `tooluniverse.tool.CPIC_get_alleles`
- `tooluniverse.tool.CPIC_get_gene_drug_pairs`
- `tooluniverse.tool.CPIC_get_gene_info`
- `tooluniverse.tool.CPIC_get_recommendations`
- `tooluniverse.tool.CPIC_list_guidelines`
- `tooluniverse.tool.CPIC_search_gene_drug_pairs`
- `tooluniverse.tool.CTFPHC_search_guidelines`
- `tooluniverse.tool.EuropePMC_Guidelines_Search`
- `tooluniverse.tool.MAGICapp_get_guideline`
- `tooluniverse.tool.MAGICapp_get_recommendations`
- `tooluniverse.tool.MAGICapp_get_sections`
- `tooluniverse.tool.MAGICapp_list_guidelines`
- `tooluniverse.tool.NCBI_API_KEY`
- `tooluniverse.tool.NCCN_get_patient_guideline`
- `tooluniverse.tool.NCCN_list_patient_guidelines`
- `tooluniverse.tool.NCCN_search_guidelines`
- `tooluniverse.tool.NICE_Clinical_Guidelines_Search`
- `tooluniverse.tool.NICE_Guideline_Full_Text`
- `tooluniverse.tool.OpenAlex_Guidelines_Search`
- `tooluniverse.tool.PubMed_Guidelines_Search`
- `tooluniverse.tool.SIGN_search_guidelines`
- `tooluniverse.tool.TRIP_Database_Guidelines_Search`
- `tooluniverse.tool.WHO_Guideline_Full_Text`
- `tooluniverse.tool.WHO_Guidelines_Search`
- `tooluniverse.tool.odphp_itemlist`
- `tooluniverse.tool.odphp_myhealthfinder`
- `tooluniverse.tool.odphp_outlink_fetch`
- `tooluniverse.tool.odphp_topicsearch`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-clinical-guidelines/SKILL.md)；Apache-2.0；原文 SHA-256：`4ccb7a3a0d4ddd2bb235b041f8e20644b46d6015654fbdcfee303eb54400c170`。
