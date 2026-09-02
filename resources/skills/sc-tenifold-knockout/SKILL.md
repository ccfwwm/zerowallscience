---
name: sc-tenifold-knockout
description: 用中文编排非肿瘤单细胞 scTenifoldKnk 虚拟敲除全流程：基因建议、公开数据发现、QC、远程 R MCP 分析、机制解释、图表、报告和实验验证方案。结果是计算假设，不是真实基因敲除。
license: GPL-3.0-or-later
allowed-tools: read write edit search grep shell python search_mcp_tools run_in_context get_run monitor_run cancel_run r_upload_workspace_file
metadata:
  method: scTenifoldKnk
  method_version: "1.0.3"
  source: https://github.com/cailab-tamu/scTenifoldKnk
---

# 单细胞虚拟敲除科研全流程

本 Skill 面向非肿瘤单细胞研究。用户可以只提供目标基因、参考基因或研究主题，不要求用户先准备表达矩阵。Skill 负责编排，实际统计计算必须在配置的 rdatalinux R MCP 中完成。

## 重要边界

- scTenifoldKnk 产生的是 scGRN 网络扰动和可检验假设，不等同于真实基因敲除、因果证明或湿实验结果。
- 不能凭模型常识编造敲除后的变化或机制。每个定量结论必须引用 R MCP 输出文件；机制解释必须有 Bio Tools/公开文献证据。
- 生产流程禁止调用本地 R。R MCP 缺失、未安装 `scTenifoldKnk` 或运行失败时返回 `missing_runtime`/失败状态，不伪造成功。
- 不控制实验设备；只生成供研究人员审核的 CRISPRi、siRNA、药理抑制和读出方案。

## 用户输入

```text
虚拟敲除 HSPA1A，分析非肿瘤肺泡巨噬细胞。
参考基因 HSPA1A、STAT1，推荐适合的敲除候选。
研究主题：非肿瘤肺组织中的应激调控基因，自动选择数据并完成研究。
```

先调用 `sc_tenifold_knockout_intake`。目标基因必须保留原始输入并标准化；参考基因或主题只能生成带证据和置信度的候选，不得使用硬编码生物学候选冒充数据库结果。

## 标准流程

1. 创建或复用受控项目，建立 `data/raw`、`data/public`、`figures`、`tables`、`reports`、`runs`、`protocols` 和 `provenance`。
2. 并行检索 CELLxGENE Census 与 GEO/ENA。即使只有基因也进行宽范围检索，再按物种、非肿瘤证据、细胞群、目标基因覆盖、raw layer、donor/sample 重复和下载规模评分。
3. 小于 2GB 的公开处理矩阵可自动获取；FASTQ/SRA、大文件、远程长任务和可能产生费用的任务先生成计划并请求确认。记录 accession、来源、版本、文件大小和 checksum。
4. 通过 `sc_tenifold_knockout_validate_dataset` 和远程运行时验证 raw counts、目标基因、维度、基因唯一性及元数据。normalized/X 矩阵不得作为 raw counts。
5. 通过 `sc_tenifold_knockout_qc` 在 R MCP 执行每样本 QC、doublet/环境 RNA 风险、非肿瘤筛选和 `cell_type × condition` 分层。缺少生物学重复时可继续，但结果必须标记为探索性。
6. 调用 `sc_tenifold_knockout_plan` 和 `sc_tenifold_knockout_run`。默认 `execution: r-mcp`、`seeds: [123,456]`、`nc_nNet: 10`、`nc_nCells: 500`、`fdr: 0.05`；每个目标、细胞群、种子和子采样独立运行。
7. 运行前调用远程 `r_validate_sc_tenifold_runtime`，确认 `R.version.string`、`scTenifoldKnk` 版本和 `sessionInfo()`。使用 `r_register_project`、`r_upload_workspace_file` 和 `r_submit_sc_tenifold_knockout`；用 `r_get_sc_tenifold_run`、`r_get_sc_tenifold_manifest`、`r_cancel_sc_tenifold_run` 管理任务。
8. 运行完成后调用 `sc_tenifold_knockout_collect`、`sc_tenifold_knockout_interpret` 和 `sc_tenifold_knockout_figures`。R MCP 必须输出差异调控、显著基因、WT/KO 网络、manifold alignment、稳定性和阴性对照；缺文件时明确报告缺失。
9. 使用 Bio Tools MCP 查询 GO、Reactome、UniProt 和 PubMed。将结论分为“R 统计观察”“数据库支持的机制证据”“待验证生物学假设”，没有证据就写“无法判断”。
10. 调用 `sc_tenifold_knockout_report`、`sc_tenifold_knockout_review` 和 `sc_tenifold_knockout_experimental_design`，生成中文研究报告、图注、限制、审核结果和人工实验验证包。

## 必备输出

```text
manifest.json / input-fingerprint.json / qc-summary.json / parameters.json
session-info.txt / diff-regulation.tsv / significant-genes.tsv
target-gene-summary.tsv / stability-summary.tsv / negative-control.tsv
wt-network.rds / ko-network.rds / manifold-alignment.tsv
figures/*.pdf / figures/*.png / process-diagram.mmd
reports/study-summary.md / reports/qc-report.md / reports/knockout-results.md
reports/biological-interpretation.md / reports/limitations.md
reports/manuscript.md / reports/review-report.md
protocols/validation-plan.md / protocols/controls.tsv
protocols/replicate-plan.tsv / protocols/readout-plan.md
```

图表至少覆盖 QC、细胞组成、目标基因表达、WT/KO 网络、差异调控、火山图、显著比例、细胞群比较和多次运行稳定性。流程图必须展示输入、数据发现、校验、QC、R MCP、解释、图表、报告和审核阶段。

## 状态与审核

状态按 `intake → gene_candidates_ready → datasets_discovered → acquisition_planned → acquiring → acquired → validating → qc_running → stratifying → ready_for_knockout → queued → running → collecting → interpreting → figures_generating → reporting → review_required → reported` 更新，并记录目标、数据集、细胞群、进度、错误、checksum、远程 job ID 和时间。

最终审核只能是 `pass`、`pass_with_warnings`、`blocked` 或 `requires_human_review`。raw counts 不合格、目标基因缺失、R MCP/包缺失、QC 失败或没有可用重复时，不得继续伪造结论。

详细中文步骤见 [README.zh-CN.md](README.zh-CN.md)、[references/workflow.zh-CN.md](references/workflow.zh-CN.md) 和 [references/result-interpretation.zh-CN.md](references/result-interpretation.zh-CN.md)。算法参数参考 [method-and-parameters.md](references/method-and-parameters.md)，审核前阅读 [review-checklist.md](references/review-checklist.md)。
