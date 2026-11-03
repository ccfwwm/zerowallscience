# 输入与输出约定

## 输入

- 药物名先通过 `lookup discover_aliases=true` 分页发现，再由 AI 展示证据并由用户确认品牌/不确定候选。正式分析必须带 `name_resolution`，固定名称精确范围须由用户明确选择；不再自动采用唯一包含候选。数据库关联只能来自同条药物记录。
- 目标事件使用 MedDRA Preferred Term（PT），并确认数据库使用的 MedDRA 版本。
- `year` 支持报告季度表达式或 FAERS 编码，例如 `["2014Q1", "2024Q4"]` 或 `[141, 244]`。单值 `"2026Q1"` 表示从实际数据起期截至 2026Q1。覆盖不足或中间缺季自动提示，不阻止分析。
- `age` 和 `weight` 各为升序的两个数值边界；`gender`、`country`、`agent` 应使用数据库中的编码或值。`agent` 对应 `OCCP_COD`，如 `CN`、`MD`、`PH`。
- `drugEffect` 使用 `PS`、`SS`、`C`、`I`。`unit` 使用 `pair` 或 `case`，仅在函数 schema 列出的入口传入。
- 可选参数因 Fun 而异。先用 `r.faerskit.analyze` 的实时 describe；不要把完整公共 schema 全部透传。

## 输出

- 作业结果写入 Manifest 所列的相对路径；常见布局为 `faerskit/<fun>/<timestamp>/`。
- runner 写入 `summary.json`、`faerskit_preflight.json`、统一结果快照、HTML、Excel、适用统计表及 PNG/SVG/图表数据。具体产物与缺失原因见 Manifest 和 `artifacts.json`。
- 跨作业汇总使用 `r.faerskit.synthesize` 和一至二十个已成功的分析 `job_id`，生成来源清单、兼容性矩阵、方法和信号一致性、低计数检查、跨来源比较表及图表。它从原结果快照读取统计值，不重查 ClickHouse。
- 使用共享 R 作业操作查询状态、日志和 Manifest，再通过 Host `r_files` 下载并核对大小与 SHA-256。合成前完整下载纳入比较的来源作业，合成后完整下载合成作业。
- `faerskit_postprocess.py` 位于合成作业目录，读取本地来源目录及合成包；验证 RDS 哈希、参数与预检 JSON、来源/汇总统计、CSV 与 Excel 数值、报告链接和图表文件，并核验 `faerskit-narrative/1` 中每条发现的 CSV 行条件、列和值。报告前部包含中文解释和来源/配对摘要；完整分析表保留在 Excel/CSV。生成本地校验 JSON、DOCX、PDF 和交付清单。运行前先写 `interpretation.json` 并通过 `--narrative-json` 传入；转换工具不可用时应明确报告未完成。
- 正式交付目录为合成包中的 `deliverables/`，包括 Markdown、HTML、Excel、DOCX、PDF、图表 PNG/SVG/CSV、来源 job/RDS 哈希及逐项校验记录。源 RDS 和源作业文件不复制到该目录。
- 单个来源也可以合成，用于质量检查与一致格式的交付；只有一个来源时不得声称做过跨作业比较。

## 解释限制

FAERS 是自发报告数据。比例失衡信号是需要进一步研究的统计线索，不能推断发生率、相对风险或因果关系。药名匹配、重复报告、报告偏倚、混杂因素、病例数和多重比较均会影响解释。

- `table_registry.json` 记录稳定表 ID、中文CSV名和中文工作表名，报告及校验均读取此映射；旧包无映射时兼容历史英文名。业务汇总保留原版字段和Overall最后的顺序。
