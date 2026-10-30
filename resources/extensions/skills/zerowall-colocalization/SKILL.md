---
name: zerowall-colocalization
description: ZeroWall complete-region coloc.abf analysis with explicit priors, persisted study plans, durable jobs and verified posterior artifacts.
---

# colocalization

Use the current Host/Runner schemas and preserve source, version, unit, applicability, manifests, logs, failures, conflicts, and limitations. Gate 1/2 are non-blocking diagnostics: continue the requested run and report warnings. Record the actual plan/input version and hashes for each run; mark unreviewed claims as unverified in reports.


## Domain constraints

Colocalization requires a complete region and method-appropriate summary fields. A lead SNP alone is a stop condition; colocalization is not mediation or clinical proof. Single-signal coloc.abf does not require an LD matrix; SuSiE/multiple-signal methods require matching LD and are not implemented by this runner.

## 执行与边界

加载 `zerowall-mr` Skill，再使用其返回的 `resourceBase` 读取 `references/genetics-runner.md`。MR 与 coloc 共用该版本化说明、Host 提交/刷新接口及产物验证逻辑，避免复制接口后漂移。

提交前核对完整区域、两性状定义/祖源/基因组版本、样本量与单位。实际远端 schema 若接受 `geneticInput`，提供 trait1、trait2、variants、region、complete_region 与 single_causal_variant_assumption；定量性状需要 sdY，二分类性状需要 case_fraction。按 schema 显式设置 coloc 方法及 p1、p2、p12 priors。只提供 lead SNP、区域字段不足或依赖缺失时停止，不能输出假后验概率。软件不创建 Project、Study 或分析计划记录。

只使用服务器实时 schema 中存在的 genetics/coloc 操作提交，并用 `research_workflow` 跟踪本地 Run。只有原始文件、字节数、SHA-256 和数值校验通过才在本次工作记录中注明结果已核验。H0–H4 后验必须来自取回的结果；H4 不能自动升级为中介、临床机制或疗效。若远端未部署该能力，明确报告不可用。
