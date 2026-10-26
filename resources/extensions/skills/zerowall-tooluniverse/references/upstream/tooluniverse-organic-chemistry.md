# organic chemistry

Organic chemistry reasoning guide for reaction product prediction, mechanism analysis (electrophilic/nucleophilic substitution, addition, elimination, pericyclic, radical), and spectroscopy interpretation (1H/13C NMR, IR, MS). Reasons from first principles (electron flow, kinetic vs thermodynamic) rather than pattern-matching named reactions. Use for organic synthesis problems and mechanism explanations.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- 1. Predicting Reaction Products — A Reasoning Process
- Step 1 — Find the most reactive sites
- Step 2 — What kind of bond-making/breaking is this?
- Step 3 — Where do the electrons flow?
- Step 4 — What is the driving force?
- Step 5 — Sanity-check your product
- Named Reaction Decision Tree
- Retrosynthetic Analysis
- ML-Based Reaction/Retrosynthesis Prediction (Cross-Check, Not a Replacement)
- Product Prediction Strategy (Stepwise)
- Structure Determination from Reactions
- Combustion Analysis Strategy
- 2. Spectroscopy Interpretation — A Problem-Solving Strategy
- Start with molecular formula
- IR: Look for the obvious peaks first
- 1H NMR: Three pieces of information per signal
- 13C NMR: Count the symmetry
- The combination strategy
- 3. Stereochemistry — How to Think in 3D
- Finding stereocenters
- Assigning R/S
- Predicting stereochemical outcomes of reactions
- Relationship between stereoisomers
- 4. Bundled Scripts

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ChEMBL_get_molecule`
- `tooluniverse.tool.ChEMBL_search_molecules`
- `tooluniverse.tool.CrystalStructure_validate`
- `tooluniverse.tool.DegreesOfUnsaturation_calculate`
- `tooluniverse.tool.HMDB_get_metabolite`
- `tooluniverse.tool.MolecularFormula_analyze`
- `tooluniverse.tool.OPSIN_name_to_structure`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.RXN4CHEMISTRY_API_KEY`
- `tooluniverse.tool.RXNChemistry_predict_reaction`
- `tooluniverse.tool.RXNChemistry_predict_retrosynthesis`
- `tooluniverse.tool.SMILES_verify`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-organic-chemistry/SKILL.md)；Apache-2.0；原文 SHA-256：`f60cbf50a64bdf68fff9789fa3e63f2987adf0993c8460061bff4e7baeef0ff5`。
