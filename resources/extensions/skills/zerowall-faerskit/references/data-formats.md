# 输入与输出约定

## 输入

- 药物名可为单值或候选名称向量。服务端按大小写与空白规范化精确匹配，无精确项且数据库候选唯一时自动采用；零或多个候选保留原词并提示。使用 `r.faerskit.lookup` 查询实际名称，不要求用户另交核验材料。
- 目标事件使用 MedDRA Preferred Term（PT），并确认数据库使用的 MedDRA 版本。
- `year` 支持报告季度表达式或 FAERS 编码，例如 `["2014Q1", "2024Q4"]` 或 `[141, 244]`。单值 `"2026Q1"` 表示从实际数据起期截至 2026Q1。覆盖不足或中间缺季自动提示，不阻止分析。
- `age` 和 `weight` 各为升序的两个数值边界；`gender`、`country`、`agent` 应使用数据库中的编码或值。`agent` 对应 `OCCP_COD`，如 `CN`、`MD`、`PH`。
- `drugEffect` 使用 `PS`、`SS`、`C`、`I`。`unit` 使用 `pair` 或 `case`，仅在函数 schema 列出的入口传入。
- 可选参数因 Fun 而异。先用 `r.faerskit.analyze` 的实时 describe；不要把完整公共 schema 全部透传。

## 输出

- 作业结果写入 Manifest 所列的相对路径；常见布局为 `faerskit/<fun>/<timestamp>/`。
- runner 写入 `summary.json`、`faerskit_preflight.json`、统一结果快照、HTML、Excel、适用统计表及 PNG/SVG/图表数据。具体产物与缺失原因见 Manifest 和 `artifacts.json`。
- 重绘或重生成报告使用 `source_job_id`，产生独立新任务，从原结果快照读取统计值。
- 使用共享 R 作业操作查询状态、日志和 Manifest，再通过 Host `r_files` 下载并核对大小与 SHA-256。

## 解释限制

FAERS 是自发报告数据。比例失衡信号是需要进一步研究的统计线索，不能推断发生率、相对风险或因果关系。药名匹配、重复报告、报告偏倚、混杂因素、病例数和多重比较均会影响解释。
