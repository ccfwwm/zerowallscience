# 输入与输出约定

## 输入

- 普通药物分析先用 `r.faerskit.resolve`完成发现、分页、审核、冻结，以 `name_resolution={mode:"reviewed_aliases",groups:[{field:"drug",resolution_id:"实际返回值"}]}`引用记录级范围；其他药物字段同理。候选不依赖 PT。缺失或冲突的成分、品牌、厂家、缩写等需要实际确认，不能因模糊匹配唯一而自动替换。
- 用户明确选择固定名称时使用 explicit_exact；直接 R 名称向量仍按大小写及空白规范化精确匹配。R 的范围对象支持自动剂量/剂型解析及已确认记录级条件，不能转换为普通向量后声称保留了审核限制。
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
