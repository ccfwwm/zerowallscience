# natural product dereplication

Dereplicate a putative natural product and assign its chemical taxonomy. Use to answer "is [compound] a known natural product", "what microbe/organism produces [compound]", "what chemical class is [compound]", "dereplicate this metabolite (by formula/exact mass/InChIKey/SMILES)", or "classify this molecule into ChemOnt". Searches NPAtlas for known microbial natural products (producing organism + literature reference), assigns the ChemOnt kingdom→superclass→class→subclass hierarchy via ClassyFire, resolves systematic IUPAC names to structure via OPSIN, and cross-references identity in PubChem. NOT for general drug/compound identity or ADMET (use tooluniverse-chemical-compound-retrieval / tooluniverse-small-molecule-discovery) and NOT for metabolomics pathway/enrichment analysis (use tooluniverse-metabolomics skills).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Backing Tools (all keyless; verify before quoting)
- Workflow
- Phase 0 — Classify the input
- Phase 1 — Obtain an InChIKey
- Phase 2 — Dereplicate against NPAtlas
- Phase 3 — Assign ChemOnt chemical class
- Phase 5 — Report
- Interpretation Guidance (dereplication logic)
- Worked Example — Staurosporine (trivial name in)
- Worked Example — Acetylsalicylic acid (systematic name in)
- Limitations (be honest in every report)
- Out of Scope → route elsewhere
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.ClassyFire_classify_by_inchikey`
- `tooluniverse.tool.LOTUS_get_compound`
- `tooluniverse.tool.LOTUS_search_by_inchikey`
- `tooluniverse.tool.LOTUS_search_natural_products`
- `tooluniverse.tool.MIBiG_get_stats`
- `tooluniverse.tool.MIBiG_list_clusters`
- `tooluniverse.tool.NPAtlas_get_compound`
- `tooluniverse.tool.NPAtlas_search_compounds`
- `tooluniverse.tool.OPSIN_name_to_structure`
- `tooluniverse.tool.PubChem_get_CID_by_compound_name`
- `tooluniverse.tool.PubChem_get_compound_properties_by_CID`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-natural-product-dereplication/SKILL.md)；Apache-2.0；原文 SHA-256：`4f2def972362b13e24154499d7aaf0ddfb5af9929603e81c16a102bee5f967c4`。
