# gene enrichment

Gene-set enrichment analysis — GO (Biological Process, Molecular Function, Cellular Component), KEGG, Reactome pathway enrichment via clusterProfiler, gseapy, ORA, GSEA, plus g:Profiler for enrichment/ID conversion/ortholog mapping/SNP-to-gene annotation. Use for interpreting DEG lists, screen hit lists, or any gene-list-to-pathways query. Includes simplify-cutoff handling and union-vs-total denominator conventions for percent-DE questions.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- COMPUTE, DON'T DESCRIBE
- RULE ZERO — Check for pre-computed results FIRST
- PRIMARY SCRIPTS — use these FIRST
- 1. `scripts/gseapy_enrichment_runner.py` — gseapy enrichr / prerank
- 2. `scripts/enrichgo_runner.py` — clusterProfiler::enrichGO + simplify
- 3. `scripts/condition_enrichment_screen.py` — per-condition enrichment
- Why these scripts exist (debugging notes)
- When `# TIES_AT_TOP: n=N` is large (warning sign)
- DEG filter default — use ONLY what the question names
- Domain Reasoning: Background Selection
- When to Use This Skill
- Input Parameters
- Core Principles
- Decision Tree: ORA vs GSEA
- Decision Tree: gseapy vs ToolUniverse Tools
- Evidence Grading
- Supported Organisms
- Common Patterns
- Pattern 1: Standard DEG Enrichment (ORA)
- Pattern 2: Ranked Gene List (GSEA)
- Pattern 3: Targeted Enrichment Question
- Pattern 3b: "Most enriched term" — always paste the top-10 ranked list
- Pattern 4: Multi-Organism Enrichment
- Primary Enrichment Tools

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.Activity_infer_ulm`
- `tooluniverse.tool.Coexpression_modules`
- `tooluniverse.tool.DeepGO_predict_function`
- `tooluniverse.tool.GO_get_term_by_id`
- `tooluniverse.tool.GSEA_prerank`
- `tooluniverse.tool.GSVA_score`
- `tooluniverse.tool.MyGene_batch_query`
- `tooluniverse.tool.OmniPath_get_dorothea_regulon`
- `tooluniverse.tool.PANTHER_enrichment`
- `tooluniverse.tool.QuickGO_get_term_detail`
- `tooluniverse.tool.ReactomeAnalysis_pathway_enrichment`
- `tooluniverse.tool.Reactome_get_pathway`
- `tooluniverse.tool.Reactome_get_pathway_hierarchy`
- `tooluniverse.tool.STRING_functional_enrichment`
- `tooluniverse.tool.STRING_map_identifiers`
- `tooluniverse.tool.STRING_ppi_enrichment`
- `tooluniverse.tool.WikiPathways_get_pathway`
- `tooluniverse.tool.WikiPathways_search`
- `tooluniverse.tool.gProfiler_annotate_snps`
- `tooluniverse.tool.gProfiler_convert_ids`
- `tooluniverse.tool.gProfiler_enrichment`
- `tooluniverse.tool.gProfiler_find_orthologs`
- `tooluniverse.tool.read_executed_notebook`
- `tooluniverse.tool.ssGSEA_score`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-gene-enrichment/SKILL.md)；Apache-2.0；原文 SHA-256：`faa9590abf84549ac61cc85eb27c635dde4f810d8850cf8268c82a8ac5d9b4a2`。
