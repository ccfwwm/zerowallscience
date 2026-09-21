---
name: zerowall-mr
description: ZeroWall Science 7.0.0 mr workflow; use only when the corresponding research or viewer task is requested.
---

# mr

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

MR requires matched exposure/outcome definitions, ancestry, genome build, sample overlap and instrument strength. Do not run MR-Egger for a single SNP; stop when harmonization or LD assumptions are unavailable.

在提交任何 MR、coloc、SuSiE-coloc、MVMR 或两步 MR Runner 前，调用 `research_study` 的 `action=validate_genetic_contract`。它会区分 `usable`、`pending` 和 `not-applicable`，检查完整区域、lead SNP 限制、匹配 LD、条件工具强度和中介估计目标。契约通过不等于数值结果或因果结论通过，Runner 仍需登记版本化输入、参考文件、Manifest 与证据范围。

