# 全流程操作细则

## 数据发现

默认并行查询 CELLxGENE Census 与 GEO/ENA，固定记录 Census 版本。候选按 raw counts、目标基因覆盖、非肿瘤证据、cell type、donor/sample 重复、元数据完整性和下载成本评分。保存前五名候选及淘汰原因。

## 数据质量

优先读取 raw layer 或原始 counts assay，拒绝归一化矩阵。每个样本分别计算 library size、检测基因数、线粒体比例、doublet 和环境 RNA 风险，记录过滤前后细胞数和阈值理由。按 `cell_type × condition` 分层，缺少重复时只做探索性分析。

## R MCP

运行前检查版本、包和 `sessionInfo()`。将输入上传到受控 R 项目，使用结构化 scTenifoldKnk 工具提交异步任务。任务状态、日志、结果 manifest 和取消操作必须可恢复。生产路由不调用本地 R。

## 多次运行

默认使用两个随机种子和独立子采样。每个目标基因和细胞群分别运行，汇总显著基因重叠、方向一致性、排名稳定性和阴性对照。单次运行不能自动作为最终结论。

## 输出

R MCP 生成 TSV、RDS、PDF、PNG 和 `session-info.txt`；Host 将它们登记为 Artifact。额外生成中文统计解释、机制证据、流程图、报告和实验设计文件。
