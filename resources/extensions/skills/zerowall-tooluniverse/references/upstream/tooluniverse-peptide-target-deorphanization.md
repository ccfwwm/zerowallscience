# peptide target deorphanization

Find the real protein target(s) of a peptide from its sequence — peptide target deorphanization / off-target identification, for ANY target class (GPCR, ion channel, protease, cytokine/growth-factor receptor, enzyme, integrin), not only GPCRs. Use when a peptide has a phenotype but does not bind its hypothesized target, when a peptide binds a target in one species or assay but not another, or to screen candidate targets for an orphan peptide. A target-class router steers a multi-route keyless pipeline (PROSITE/ELM motif, BLAST homology, HGNC/InterPro/GPCRdb/GtoPdb target-family enumeration, OpenTargets phenotype anchor, EnsemblCompara/Alliance cross-species reconciliation) plus optional NVIDIA-NIM co-folding (Boltz2, AlphaFold2-Multimer, OpenFold3) for structural confirmation.

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Core reasoning: LOOK UP, DON'T GUESS
- Automated pipeline (scripts) — the fast path
- `deorphanize_peptide.py` — keyless candidate generation + ranking (Phases 1–4)
- `cofold_screen.py` — structural confirmation (Phase 5, key-gated)
- The pipeline at a glance
- Output format — ranked shortlist report (return inline, no extra files)
- Peptide Bioactivity Property Databases (supplementary characterization)
- Validation & test set

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.AMPSphere_get_amp_distributions`
- `tooluniverse.tool.AMPSphere_get_amp_features`
- `tooluniverse.tool.AMPSphere_get_family`
- `tooluniverse.tool.AMPSphere_search_amps`
- `tooluniverse.tool.CancerPPD2_search_peptides`
- `tooluniverse.tool.ClusPro_submit_peptide_docking`
- `tooluniverse.tool.ConoServer_get_conopeptide`
- `tooluniverse.tool.ConoServer_search_conopeptides`
- `tooluniverse.tool.DBAASP_get_peptide`
- `tooluniverse.tool.DBAASP_search_peptides`
- `tooluniverse.tool.EBI_msa_align`
- `tooluniverse.tool.Hemolytik2_search_peptides`
- `tooluniverse.tool.NVIDIA_API_KEY`
- `tooluniverse.tool.Norine_get_peptide`
- `tooluniverse.tool.NvidiaNIM_boltz2`
- `tooluniverse.tool.PDBeSIFTS_get_best_structures`
- `tooluniverse.tool.PEPlife2_search_peptides`
- `tooluniverse.tool.PROSITE_get_entry`
- `tooluniverse.tool.TumorHope2_search_peptides`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-peptide-target-deorphanization/SKILL.md)；Apache-2.0；原文 SHA-256：`7f4c6cf7d7c9c5811c32e51d01f4fe76a38212007c32d4c0c6434e12125f9802`。
