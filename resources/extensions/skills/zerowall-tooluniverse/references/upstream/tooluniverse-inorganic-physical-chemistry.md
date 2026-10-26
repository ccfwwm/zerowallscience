# inorganic physical chemistry

Inorganic chemistry, physical chemistry, and materials science — crystal structures, coordination chemistry, lattice parameters, thermodynamic properties, electronic structure. Use for unit cell volume calculations, coordination geometry, materials property estimation, and inorganic-mechanism reasoning. Complementary to tooluniverse-organic-chemistry.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Reasoning Strategy
- 1. Crystal Structure Questions
- Looking up real crystal structures (COD)
- 2. Bonding & Covalency Questions
- 3. Noble Gas Chemistry
- 4. Symmetry & Point Groups
- 5. Thermodynamics & Kinetics
- 6. Solubility & Equilibrium Calculations
- 7. Spectroscopy Interpretation
- Available Tools
- LOOK UP DON'T GUESS

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.COD_get_structure`
- `tooluniverse.tool.COD_search_structures`
- `tooluniverse.tool.ChEMBL_search_molecules`
- `tooluniverse.tool.CrystalStructure_validate`
- `tooluniverse.tool.EquilibriumSolver_calculate`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`
- `tooluniverse.tool.PubMed_search_articles`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-inorganic-physical-chemistry/SKILL.md)；Apache-2.0；原文 SHA-256：`ac098cc2d336ad62ba9916ce00e2bde5c37203996abef9732e7942914de4ad6c`。
