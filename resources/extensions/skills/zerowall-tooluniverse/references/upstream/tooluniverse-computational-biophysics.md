# computational biophysics

Solve quantitative problems in biophysics — pharmacokinetics (PK volume of distribution, clearance, half-life), epidemiology (R0, attack rate), toxicology (LD50, NOAEL), population genetics (Hardy-Weinberg, Fst), enzyme kinetics (Michaelis-Menten), thermodynamics. Use for first-principles quantitative biology calculations, dose calculations, exposure assessment, and biophysical-property estimation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- 1. Recognize the Physical Process
- 2. Reasoning Patterns by Problem Type
- Conservation / Dilution Problems
- Exponential Decay / Growth Problems
- Saturation / Binding Problems
- Threshold / Crossover Problems
- Ratio / Rate Problems
- Population Comparison Problems
- 3. When to Compute vs. Estimate vs. Look Up
- Template 1: Exponential Decay / Growth
- Template 2: Conservation / Dilution / Mixing
- Template 3: Threshold / Equilibrium Solver
- Template 4: Saturation / Binding Curve
- Template 5: Statistical Comparison
- Template 6: Rate / Dimensional Analysis
- Template 7: Compartmental Models & R0
- 5. Multiple-Choice Strategy
- The Mandatory MC Process
- `mc_analyzer.py` — Automated MC Scaffold
- 6. Bundled Scripts
- `epidemiology.py` — Epidemiology calculations (5 types via `--type`)
- `herd_immunity.py` — Legacy vaccination threshold
- `radioactive_decay.py` — Activity remaining / time to target / parent-daughter
- `env_risk_assessment.py` — Environmental risk (hazard quotient)

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.BindingDB_search_by_target`
- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.EnzymeKinetics_calculate`
- `tooluniverse.tool.Epidemiology_bayesian`
- `tooluniverse.tool.Epidemiology_diagnostic`
- `tooluniverse.tool.Epidemiology_nnt`
- `tooluniverse.tool.Epidemiology_r0_herd`
- `tooluniverse.tool.Epidemiology_vaccine_coverage`
- `tooluniverse.tool.EuropePMC_search_articles`
- `tooluniverse.tool.MyVariant_query_variants`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.gnomad_get_variant`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-computational-biophysics/SKILL.md)；Apache-2.0；原文 SHA-256：`2e9c51d09d8c5d733923bcdc58b27c3d7c818450a196de892ff614e2fc3846b9`。
