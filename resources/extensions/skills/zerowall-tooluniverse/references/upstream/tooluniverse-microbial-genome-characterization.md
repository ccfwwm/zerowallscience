# microbial genome characterization

Genome-ASSEMBLY discovery, QC, and replicon mapping for any organism (bacteria, archaea, fungi, and beyond) using NCBI Datasets. Resolves an organism name or taxid to assemblies, picks the reference/representative or best-quality assembly, pulls assembly QC metrics (total length, contig/scaffold N50, contig count, GC%, assembly level, RefSeq category), enumerates chromosomes and plasmids via per-replicon sequence reports, and compares candidate assemblies on quality. Use for "what genomes are available for [organism]", "assembly stats / N50 / GC content for [GCF_/GCA_ accession]", "how many plasmids does [strain] have", "compare assemblies for [species]", "find the reference genome for [taxon]", "is this assembly Complete Genome or just contigs". NOT for gene-level orthology/synteny (use tooluniverse-comparative-genomics), plant gene structure (use tooluniverse-plant-genomics), de novo assembly from raw reads (no tool exists), or taxonomy-only name/lineage lookups.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- LOOK UP, DON'T GUESS
- COMPUTE, DON'T DESCRIBE
- When to Use This Skill
- Tools (all keyless, verified live)
- Workflow
- Phase 0 — Resolve the organism (skip if you already have an accession)
- Phase 1 — Inventory the assemblies
- Phase 2 — Select the assembly
- Phase 3 — Pull assembly QC metrics
- Phase 4 — Map the replicons (chromosomes + plasmids)
- Phase 5 — Compare candidates (optional)
- Interpretation Table
- Worked Example 2 — "How many plasmids does *E. coli* O157:H7 Sakai have?"
- Worked Example 3 — Inventory scale (large taxon)
- Limitations
- Completeness Checklist

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.NCBIDatasets_get_genome_assembly`
- `tooluniverse.tool.NCBIDatasets_get_sequence_reports`
- `tooluniverse.tool.NCBIDatasets_get_taxonomy`
- `tooluniverse.tool.NCBIDatasets_list_genomes_by_taxon`
- `tooluniverse.tool.NCBIDatasets_suggest_taxonomy`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-microbial-genome-characterization/SKILL.md)；Apache-2.0；原文 SHA-256：`75eefeda1f3b89da0b35fb955ed53f454f3ab584fd7a742b5015650b2b898241`。
