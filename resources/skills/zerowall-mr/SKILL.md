---
name: zerowall-mr
description: ZeroWall MR analysis with prepared, harmonized instruments, versioned Wald/IVW/Egger runners, persistent remote jobs and verified result retrieval.
---

# mr

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

MR requires matched exposure/outcome definitions, ancestry, genome build, sample overlap and instrument strength. Do not run MR-Egger for a single SNP; stop when harmonization or LD assumptions are unavailable.

在提交任何 MR、coloc、SuSiE-coloc、MVMR 或两步 MR Runner 前，调用 `research_study` 的 `action=validate_genetic_contract`。它会区分 `usable`、`pending` 和 `not-applicable`，检查完整区域、lead SNP 限制、匹配 LD、条件工具强度和中介估计目标。契约通过不等于数值结果或因果结论通过，Runner 仍需登记版本化输入、参考文件、Manifest 与证据范围。

## 实际执行与恢复

先读取此 Skill 返回的 `resourceBase` 下 `references/genetics-runner.md`，其为当前 MR/coloc 接口与停止规则的唯一执行说明。通过 `research_workflow` 发现 `r.genetics`，检查已连接服务器是否实际提供 `r.genetics.run`；源码有适配器不代表远端已部署。

使用 `research_study action=run_genetic_analysis` 提交已登记 study、plan、contract 和 task；返回持久化 Run 后使用 `action=refresh_genetic_analysis` 取回状态与校验后的产物。重连时从 `action=tasks` 找到任务的 `runId`，不要凭聊天记录新建请求。前端研究计划页提供相同操作。

目前仅支持 prepared MR 的 Wald、IVW、MR-Egger 以及单因果变异假设下的 `coloc.abf`。GWAS 下载、LD clumping、原始等位基因协调、MVMR、两步 MR 和 SuSiE 不在该 Runner 的已实现范围，不能把契约校验通过写成方法已执行。合成验收数据不能登记成用户研究的医学发现。

