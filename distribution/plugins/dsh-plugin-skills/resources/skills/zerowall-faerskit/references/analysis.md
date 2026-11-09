# 工作流选择与参数

- `faers_analyze_drug`：药物完整分析；必需 drug；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug, primaryid, drug_exclusion, unit, role_comparisons。
- `faers_analyze_pt_cohort`：目标 PT 人群分析；必需 ptname；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, ptname, drug_route。
- `faers_analyze_drugs_for_pt`：目标 PT 药物信号；必需 ptname；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, ptname, unit。
- `faers_test_drug_pt_group`：药物与 PT 集合检验；必需 drug, ptname；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, ptname, drug, unit。
- `faers_analyze_drug_target_pt`：药物与目标 PT 完整分析；必需 drug, ptname；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug, ptname, primaryid, unit, role_comparisons。
- `faers_analyze_interaction_target_pt`：目标 PT 双药相互作用；必需 drug1, drug2, ptname；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug1, drug2, ptname, edrug1, edrug2, unit。
- `faers_analyze_interaction_all_pts`：全部 PT 双药相互作用；必需 drug1, drug2；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug1, drug2, edrug1, edrug2, unit。
- `faers_compare_drugs_for_pt`：候选药物与 PT 比较；必需 ptname；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drug_exclusion_from_alldata, ptname, unit, drug1, drug2, drug3, drug4, drug5, drug6, drug7, drug8, drug9, drug10。
- `faers_summarize_analysis_flow`：筛选流程统计；必需 ；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug。
- `faers_analyze_concomitant_exposure`：怀疑药与伴随药分析；必需 drug_PS, drug_concomitant；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug_PS, drug_concomitant, unit。
- `faers_rank_concomitant_drugs`：伴随药排名；必需 drug；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata, drug。
- `faers_compare_two_drug_exposures`：双药暴露比较；必需 drug_A, drug_B；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drug_exclusion_from_alldata, drug_A, drug_B, unit。
- `faers_describe_population`：特定人群描述；必需 ；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drugEffect, drug_exclusion_from_alldata。
- `faers_analyze_multi_drug_exposure`：多药共同暴露分析；必需 drug1；允许字段 age, gender, weight, agent, country, year, illnesses, illnesses_exclusion, pregnancy, pregnancy_exclusion, database, drug_exclusion_from_alldata, unit, drug1, drug2, drug3, drug4。

同一药物参数名称向量按集合匹配，不同共同暴露参数按报告交集。pair/case 不自动替换。联合与单药互斥；比较人群仅由被比较的两组构成。缺失可选字典不应生成零评分。
