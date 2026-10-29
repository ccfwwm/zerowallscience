---
name: zerowall-flow
description: 在 ZeroWall 导入并查看 FCS 流式细胞数据，通过 Host 执行有界补偿、变换、门控与结果导出。
---

# 流式细胞查看与分析

## 7.0.5 查看入口

选择 FCS 并导入当前项目；外部文件导入上限 20 GiB，具体事件/内存限制由 FCS Host 再校验。用户在对话请求查看时调用 `science_viewer_panel(action="open", tool="flow", asset_id=..., request_id=...)` 查看通道和散点；未选择资产提示“请先选择资产”，解析失败提示“打开失败”并保留 Host 原因。补偿、门控、批量提交、分析和导出直接在对话中调用 `science_viewer` 的 `flow_analyze`、`flow_import`、`flow_batch_submit`、`flow_export` 等真实 action，并使用实际 Host schema。核对返回的事件计数、Run 状态、产物 URI 与 SHA-256，不把图形预览当成定量结论；需要查看结果时再按需打开或聚焦查看器。

Use the current Host/Runner schemas and preserve source, version, unit, applicability, manifests, logs, failures, conflicts, and limitations. Gate 1/2 are non-blocking diagnostics: continue the requested run and report warnings. Record the actual plan/input version and hashes for each run; mark unreviewed claims as unverified in reports.


## Domain constraints

The current local adapter accepts bounded FCS 3.0 files with integer or 32-bit floating events, validates byte order and parameter metadata, optionally applies a declared spillover matrix, and supports explicit none/arcsinh transforms plus ordered rectangular gates. It exports deterministic event counts and a validated rectangular GatingML subset. Preserve manual gate revisions and event counts. Do not claim polygon gates, FlowJo compatibility, compensation correctness, or one-million-event performance until matching fixtures and independent references are present.
