---
name: zerowall-data-contract
description: 核验研究数据的来源、表型、变量、供者、权限与方法适用范围，并形成数据契约；用于研究前的数据侦察和错配审查。
metadata:
  zerowall:
    schema_version: 1
    version: 7.0.0-1
    source: bundled
---

检索命中、可下载和科学适用是不同状态。逐项记录真实来源、版本、变量定义与单位、观察单位、供者/配对关系、祖源、组织、缺失码、访问条件与独立性；未知信息保持 null 或未登记，不由模型填补。同一供者的不同 accession 不是独立验证。

把契约作为当前分析的工作记录，放在用户指定的文件或报告中；软件不再创建 Study 或持久化 dataset-contract。sourceStatus 使用 supported/conflict/unknown；applicability 使用 usable/pending/not-applicable/restricted。只有核验来源和方法前提后才能写 usable 与 supported，下载完成不能自动改变适用性。

NHANES 核验周期、组件、代码本、年龄范围、权重及 domain 设计；GWAS 核验暴露结局定义、性别、祖源、构建版本、单位和样本重叠；组学核验生物学重复与供者映射。用 `method_check_evaluate` 检查已提取的设计字段，保存缺口而非假装通过。

对 NHANES 分析，调用 `research_workflow` 发现实时 `r.nhanes` schema，并把 datasets、strata、psu、weight、cycleStrategy、domainDesign、isolatedPsuHandling 等作为分析参数传入实际支持的操作。契约字段完整不代表数值结果或科学结论通过。预览行数和正式分析行数分开记录，2013–2014 DXX_H 的年龄范围按代码本核对。
