# residue functional mechanism interpretation

Given a set of residues in a protein, explain WHY they are functionally critical by combining structural context (binding interface, ligand pocket, core, secondary structure), UniProt features (active sites, binding sites, PTM sites, disulfides), optional SAE feature evidence, and optional DMS data. Accepts residues from any source: DMS hotspots (top-K by max effect), ClinVar recurrent variants, literature-reported hot regions, evolutionarily conserved positions, or user-curated lists. Returns a per-cluster mechanism call: catalytic / ligand-binding / interface / structural-core / PTM / regulatory / unknown.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- When to use this skill
- Required inputs (choose one entry path)
- Workflow
- Step 0 (MANDATORY if user names specific positions): Premise check
- Step 1 (Path B only): Detect hotspots from the DMS matrix
- Step 2: Gather structural evidence per cluster
- Step 3: Gather UniProt feature evidence per cluster
- Step 4 (optional): Per-cluster SAE feature ranking
- Step 4-alt: permutation-test the SAE features (optional, more rigorous)
- Step 5: Synthesize the mechanism call
- Step 6: Report
- Step 7: Visualize — annotated DMS heatmap with hotspot callouts
- Interpretation table — what the mechanism call means downstream
- Honest limitations

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ESM_describe_sae_feature`
- `tooluniverse.tool.ESM_get_region_sae_features`
- `tooluniverse.tool.ESM_get_sae_features`
- `tooluniverse.tool.MaveDB_get_effect_matrix`
- `tooluniverse.tool.Structure_annotate_per_residue`
- `tooluniverse.tool.UniProt_get_function_by_accession`
- `tooluniverse.tool.alphafold_get_prediction`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-residue-functional-mechanism-interpretation/SKILL.md)；Apache-2.0；原文 SHA-256：`e78672ba0249432f4ab6552e894d77c316c0bfd4f98f671d708b118a638ea51c`。
