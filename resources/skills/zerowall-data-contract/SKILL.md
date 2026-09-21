---
name: zerowall-data-contract
description: 核验研究数据的来源、表型、变量、供者、权限与方法适用范围，并形成数据契约；用于研究前的数据侦察和错配审查。
---

检索命中、可下载和科学适用是不同状态。逐项记录真实来源、版本、变量定义与单位、观察单位、供者/配对关系、祖源、组织、缺失码、访问条件与独立性；未知信息保持 null 或未登记，不由模型填补。同一供者的不同 accession 不是独立验证。

发现 `research_study`，用 `documents` 读取当前研究记录，再用 `create_document` 登记 dataset-contract。最小待核实示例（替换 study_id 与真实来源）：

```json
{"action":"create_document","study_id":"实际研究ID","kind":"dataset-contract","payload":{"source":"真实数据或代码本地址","sourceStatus":"unknown","applicability":"pending","variables":[],"observationUnit":null,"donor":null,"access":"unknown"}}
```

sourceStatus 使用 supported/conflict/unknown；applicability 使用 usable/pending/not-applicable/restricted。只有核验来源和方法前提后才能写 usable 与 supported，下载完成不能自动改变适用性。

NHANES 核验周期、组件、代码本、年龄范围、权重及 domain 设计；GWAS 核验暴露结局定义、性别、祖源、构建版本、单位和样本重叠；组学核验生物学重复与供者映射。用 `method_check_evaluate` 检查已提取的设计字段，保存缺口而非假装通过。

对 NHANES 研究，在提交远程 R 任务前调用 `research_study` 的 `action=validate_nhanes_contract`，传入 `contract`（datasets、strata、psu、weight、cycleStrategy、domainDesign、isolatedPsuHandling 等）。`usable` 仅表示声明字段完整；`pending` 必须先补契约；`not-applicable` 不得通过模型提示词强行执行。预览行数和正式分析行数分开登记，2013–2014 DXX_H 的年龄范围按检查结果处理。
