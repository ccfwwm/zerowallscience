# 分析场景

按实时输入 schema 提交，服务端自动完成预检；状态查询可用于诊断。下面的入口仅帮助选择分析方向，具体入组规则、分母和输出以所选 Fun 的源码与实际 Manifest 为准。

## 单药信号筛查

使用 `faers_analyze_drug` 研究指定药物与 FAERS 不良事件的比例失衡，按研究方案限定报告期、人群和药物角色。核对数据库实际药名和覆盖期；不要把报告比例解释成发生率或风险大小。

## 药物与目标事件

使用 `faers_analyze_drug_target_pt` 评估指定药物与 MedDRA PT 的比例失衡；使用 `faers_test_drug_pt_group` 可在目标 PT 上进一步限定药物。核对 PT 的准确首选术语，并说明按报告还是药物-事件对计数。

## 联合暴露

`faers_analyze_interaction_target_pt`、`faers_analyze_interaction_all_pts` 与 `faers_analyze_multi_drug_exposure` 使用不同的联合/单药队列定义。先明确首要怀疑药、联用药及 PS/SS/C/I 角色，再据实时 schema 选择入口。不要把不同入口的队列口径合并解释。

## 候选药物对比

`faers_compare_drugs_for_pt` 可在同一目标 PT 上比较最多 10 个明确提供的候选药。使用用户指定的候选集；从数据库目标 PT 人群寻找药物信号使用 `faers_analyze_drugs_for_pt`。

## 主分析和敏感性分析

按同一科学问题先确定主分析，再只运行可解释的敏感性作业。常见维度包括 PS 与 PS+SS、case 与 pair、互不重叠的报告期、以及数据量支持的人群分层。每个敏感性作业尽量只变一个维度，保留药物/PT、背景队列、排除条件和方法不变。`r.faerskit.synthesize` 会逐对输出参数差异；计数单位不同、核心条件不同或同时改变多个维度的结果只并列展示，不直接合并。

药物与目标 PT 都明确且工作流支持时，可通过 `role_comparisons` 在同一作业内得到主 PS 与 PS+SS 对照；另用独立作业改变计数单位或报告期。不能因为缺少候选药物或分层数据而自动创造比较对象。
