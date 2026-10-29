# 输入与输出约定

## 输入

- 药物名使用目标数据库中的 `DRUGNAME` 或 `prod_ai` 实际写法；该接口不提供药名规范化或搜索。
- 目标事件使用 MedDRA Preferred Term（PT），并确认数据库使用的 MedDRA 版本。
- `year` 是升序的两个 FAERS `getdatayear` 报告期编码，例如 `[141, 244]` 表示 2014Q1 至 2024Q4，不能传公历年份。先确认数据库的实际覆盖期。
- `age` 和 `weight` 各为升序的两个数值边界；`gender`、`country`、`agent` 应使用数据库中的编码或值。`agent` 对应 `OCCP_COD`，如 `CN`、`MD`、`PH`。
- `drugEffect` 使用 `PS`、`SS`、`C`、`I`。`unit` 使用 `pair` 或 `case`，仅在函数 schema 列出的入口传入。
- 可选参数因 Fun 而异。先用 `r.faerskit.analyze` 的实时 describe；不要把完整公共 schema 全部透传。

## 输出

- 作业结果写入 Manifest 所列的相对路径；常见布局为 `faerskit/<fun>/<timestamp>/`。
- runner 会写 `summary.json` 和所选函数的 CSV/其他文件。文件名、字段、统计层级依函数及数据而定，以实际 Manifest 和 CSV 表头为准。
- 使用共享 R 作业操作查询状态、日志和 Manifest，再通过 Host `r_files` 下载并核对大小与 SHA-256。

## 解释限制

FAERS 是自发报告数据。比例失衡信号是需要进一步研究的统计线索，不能推断发生率、相对风险或因果关系。药名匹配、重复报告、报告偏倚、混杂因素、病例数和多重比较均会影响解释。
