# 遗传 Runner 接口：7.0.0-genetics.1

本文件对应 Host `GeneticAnalysisService` 和远端 `r.genetics.run`。先发现服务器实际 schema，再按保存的数据执行。所有 ID 来自真实研究记录，不复制下方说明中的占位符。

## 数据与计划

DatasetContract 的来源、祖源、基因组版本、性状定义、样本重叠、效应单位、协调状态等仍由 `validate_genetic_contract` 检查。来源必须 supported，适用性必须 usable，未知元数据不得猜测。

- MR 的 `geneticInput` 包含 exposure、outcome、instruments、ld_independent、ld_source、sample_overlap、sample_overlap_source、harmonization_source。每个工具包含 snp、beta_exposure、se_exposure、beta_outcome、se_outcome、双方 effect/other allele 和 harmonization_status。当前 Runner 要求明确无样本重叠、已对齐等位基因和独立工具。弱工具、回文工具及不匹配工具保留排除原因。
- coloc 的 `geneticInput` 包含 trait1、trait2、variants、region、complete_region、single_causal_variant_assumption。完整区域至少 2 个变异，但此最低技术要求不代表科学充分性。定量性状须有 sdY，二分类性状须有 case_fraction。汇总数据字段以发现的 Runner schema 为准。
- AnalysisPlan 的 `inputs` 唯一引用该契约，`taskIds` 或 `researchTaskIds` 绑定任务。任务与计划的 exploratory 必须一致，另登记停止条件。正式验证必须与门禁一批准的冻结 plan 和 contract 完全一致。
- `payload.genetics` 只接受 analysis、methods、min_f、egger_min_i2gx、priors。MR 的 analysis 为 mr，methods 可为 wald、ivw、egger；coloc 的 analysis 为 coloc，priors 显式包含 p1、p2、p12。不能把输入行塞进分析设置。
- `payload.geneticRuntime` 可设置 threads（1–8）和 timeout_ms（1,000–14,400,000），默认 1 线程、30 分钟。

Wald 仅单工具；IVW 至少两个工具，使用残差比例不小于 1 的 multiplicative random effects；Egger 至少三个工具、显式 egger_min_i2gx≥0.9，使用 n−2 自由度。部分方法不满足前提时保留 partial 和 stopped_methods，不筛选到显著为止。

## Host 提交与恢复

`research_study` 提交参数：action=run_genetic_analysis、study_id、plan_id、contract_id、task_id、request_id、expected_revision（当前计划版本）。同一操作重试保留相同 request_id；同一 ID 携带不同输入会发生幂等冲突，不能通过换 ID 隐藏问题。

得到 Run 后，调用 action=refresh_genetic_analysis，参数 study_id、run_id。刷新不重新提交任务，断线后从 action=tasks 的持久任务 runId 恢复。即使主方案修订，仍允许取回历史产物；Host 会阻止把过期输入结果登记为当前证据。

底层继续使用 `research_workflow` 的 r.genetics 和现有 `r_files`。不要绕过 Host 直接把 Agent 解释登记成数值结果。项目文件位置由 Host 确定，不能硬编码开发机路径。

## 完成判据

Run 终态与方法终态分开记录。Host 检查远端 job manifest 的字节数、SHA-256，以及方法 manifest、input.json、result.json 的一致性、Runner 版本及源文件哈希，再检查效应/SE/CI/P 或 H0–H4 概率。仅计算成功、方法完整、原始输入匹配且研究状态仍有效时登记 needsReview=true 的证据。

partial、blocked、failed 保留已校验产物和失败原因，不登记成功证据。下载或校验失败保留 Run，可刷新重试取回；禁止伪造结果或宣称已完成。人工核心主张认可仍由门禁二完成。Runner 成功不意味着所用研究假设已得到证实。

## 当前未覆盖

数据检索/合法获取、LD clumping、原始等位基因协调、MVMR、两步 MR、SuSiE 和外部医学验证尚不属于本 Runner。源码、局部测试和隔离 Windows R 库不代表 Linux 生产环境已部署；以当前连接的能力与原始运行产物为准。
