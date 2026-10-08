---
name: zerowall-colocalization
description: ZeroWall complete-region coloc.abf analysis with explicit priors, persisted study plans, durable jobs and verified posterior artifacts.
---

# colocalization

Use the persisted ZeroWall research objects and the current Host/Runner schemas. Keep source, version, unit, applicability, and access state explicit; unknown values remain unknown. Register inputs and parameters before execution, use deterministic runners for numeric outputs, and retain manifests, logs, failures, conflicts, and limitations. Do not claim a professional workflow is available unless the executable adapter and validation artifact are present. A frozen question, plan, or candidate set is immutable: propose an amendment and new version. Escalate only the two research gates: freeze the primary question and validation plan, then approve the final claims.


## Domain constraints

Colocalization requires a complete region and method-appropriate summary fields. A lead SNP alone is a stop condition; colocalization is not mediation or clinical proof. Single-signal coloc.abf does not require an LD matrix; SuSiE/multiple-signal methods require matching LD and are not implemented by this runner.

## 执行与边界

加载 `zerowall-mr` Skill，再使用其返回的 `resourceBase` 读取 `references/genetics-runner.md`。MR 与 coloc 共用该版本化说明、Host 提交/刷新接口及产物验证逻辑，避免复制接口后漂移。

先执行 `research_study action=validate_genetic_contract`，明确完整区域、两性状定义/祖源/基因组版本、样本量与单位。`geneticInput` 提供 trait1、trait2、variants、region、complete_region 与 single_causal_variant_assumption；定量性状需要 sdY，二分类性状需要 case_fraction。计划显式设置 `genetics.analysis=coloc` 和 p1、p2、p12 priors。只提供 lead SNP、区域字段不足、依赖缺失时保留 blocked，不能输出假后验概率。

实际提交使用 `research_study action=run_genetic_analysis`；从持久任务取得 runId 后用 `action=refresh_genetic_analysis`。只有原始文件、字节数、SHA-256、输入快照和数值校验通过才登记待复核证据。H0–H4 后验必须来自取回的结果；H4 不能自动升级为中介、临床机制或疗效。

