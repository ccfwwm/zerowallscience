---
name: zerowall-flow
description: 在 ZeroWall 导入并查看 FCS 流式细胞数据，通过 Host 执行有界补偿、变换、门控与结果导出。
---

# 流式细胞查看与分析

## 7.0.5 查看入口

选择 FCS 并导入当前项目；外部文件导入上限 20 GiB，具体事件/内存限制由 FCS Host 再校验。调用 `flow_open` 查看通道和散点；未选择资产提示“请先选择资产”，解析失败提示“打开失败”并保留 Host 原因。默认查看器只保留通道切换、缩放和刷新，补偿、门控、批量提交与导出通过本 skill 调用。分析用 `science_workbench(tool=flow, skill_id=zerowall-flow, action_id=flow_analyze, viewer_id=..., request_id=...)`；批量动作使用实际 Host schema。核对返回的事件计数、Run 状态、产物 URI 与 SHA-256，不把图形预览当成定量结论。

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

The current local adapter accepts bounded FCS 3.0 files with integer or 32-bit floating events, validates byte order and parameter metadata, optionally applies a declared spillover matrix, and supports explicit none/arcsinh transforms plus ordered rectangular gates. It exports deterministic event counts and a validated rectangular GatingML subset. Preserve manual gate revisions and event counts. Do not claim polygon gates, FlowJo compatibility, compensation correctness, or one-million-event performance until matching fixtures and independent references are present.
