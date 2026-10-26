# medical imaging radiology

Discover and characterize cancer radiology imaging cohorts from The Cancer Imaging Archive (TCIA) — list public collections (e.g. LIDC-IDRI, TCGA-GBM, TCGA-LUAD, TCGA-BRCA), enumerate patients/subjects and studies within a collection, browse DICOM series by modality (CT, MR, PT, CR, DX, US, NM) or body part (CHEST, BRAIN, ABDOMEN, ...), pull series-level DICOM metadata and scanner manufacturer, estimate download size before pulling data, and enumerate individual DICOM instance (slice) UIDs within a series. Use when someone asks to "find a CT/MRI/PET imaging cohort for [cancer type]", "how many patients/studies/series are in [TCIA collection]", "what imaging modalities/body parts/scanners does [collection] have", "look up DICOM series metadata for [SeriesInstanceUID]", "estimate the size of this TCIA series before downloading", or "build a radiology imaging research cohort". NOT for microscopy/cell imaging quantification (use tooluniverse-image-analysis), NOT for actual DICOM pixel data analysis, segmentation, or diagnosis (TCIA tools here return metadata only — no pixel access), NOT for tumor genomic/omics data (use tooluniverse-cancer-genomics-tcga).

这是上游科学工作流的远程导航摘要。先用 research_workflow 的 tooluniverse 模块 search，再 describe 精确能力；SDK、安装及管理命令不在此处执行。目录中的候选工具需逐个核对 schema、availability 和 verification。专项分析仍使用对应 RMCP 模块。

上游研究阶段（仅作为任务拆解线索，实际方法条件需另行核对）：

- Scope: what this skill can and cannot do
- When to Use This Skill
- Workflow
- Notes

上游引用且固定 SDK 中存在的工具候选：

- `tooluniverse.tool.TCIA_get_body_part_values`
- `tooluniverse.tool.TCIA_get_manufacturer_values`
- `tooluniverse.tool.TCIA_get_modality_values`
- `tooluniverse.tool.TCIA_get_patient_studies`
- `tooluniverse.tool.TCIA_get_patients`
- `tooluniverse.tool.TCIA_get_series`
- `tooluniverse.tool.TCIA_get_series_metadata`
- `tooluniverse.tool.TCIA_get_series_size`
- `tooluniverse.tool.TCIA_get_sop_instance_uids`
- `tooluniverse.tool.TCIA_list_collections`

提交参数放入 tool_arguments，复用幂等键并跟踪本地 run_id；成功后核对记录身份、来源、查询时间、版本及 Manifest，使用 Host r_files 下载并验证 SHA-256。

固定来源：[上游工作流](https://github.com/mims-harvard/ToolUniverse/blob/169d065deeb3e289b3ff36d665529a123bdad791/plugin/skills/tooluniverse-medical-imaging-radiology/SKILL.md)；Apache-2.0；原文 SHA-256：`700ffed1df28dc6b15e5cb0e524044376061847eb1988ead054371a835edfa0e`。
