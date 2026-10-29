# 函数与数据约定

以服务端实际注册和当前 faerskit 源码为依据。先读取 `supported_functions` 和 `r.faerskit.analyze` 的实时 schema，再选入口；不把包的全部导出函数视为 MCP 工具。

| fun | 研究入口 | 主要输入 |
| --- | --- | --- |
| AFun | 药物队列与信号/描述输出 | drug |
| BFun | 目标 PT 队列描述 | ptname |
| CFun | 药物与指定 PT | drug、ptname |
| EFun | 纳入筛选流程数据 | drug 与人群筛选 |
| FFun | 首要怀疑药和伴随用药 | drug_PS、drug_concomitant |
| HFun | 目标药物的伴随用药 | drug |
| IFun | 两药共暴露与单药队列 | drug_A、drug_B |
| KFun | 按人口学条件定义队列 | age、gender 等 |
| DDI | 以 PS 药物与 C/I/SS 伴随药构建联合及单药队列 | drug1、drug2；可选 edrug1、edrug2 |
| DDIALL | 任一目标药暴露的并集分析 | drug1、drug2；可选 edrug1、edrug2 |
| Concomitant_Medication_Analysis | 合并用药交集 | drug1，按研究需要加 drug2～drug4 |
| BFun_upgrade1 | 目标 PT 的药物维度信号 | ptname |
| BFun_upgrade2 | PT 分组信号，可按药物筛选 | ptname，可选 drug |
| disproportionality_analysis_for_top50_drug | 各候选药物对同一目标 PT 的对比 | ptname、drug1～drug10（至少一个药） |

这些是分析选型提示，不额外限制用户明确选择的全人群或探索性分析。遗漏药物/PT 可能扩大队列；先确认研究意图及范围。函数名中的 top50 不代表网关能凭空选择药物或自动获得研究候选集。

## 参数含义

- `year`：可传两个升序报告期编码 `[起始期, 终止期]`，或季度字符串范围（如 `['2014Q1','2024Q4']`），也可只传结束季度（如 `'2026Q1'`），此时服务端以数据库最早覆盖季度补起点。示例编码 `41=2004Q1`、`141=2014Q1`、`261=2026Q1`；公历年份不是整数编码。实际覆盖由服务端查询，覆盖不全是警告，不改变原请求。
- `age` / `weight`：两个升序数值组成的范围；`gender` 例如 `F`、`M`，`country` 为报告者国家代码。
- `agent`：数据中的 `OCCP_COD`，如 `MD`、`PH`、`CN`，不是 physician/consumer 这样的自然语言。
- `drugEffect`：`PS` / `SS` / `C` / `I`；DDI 等函数另有自身队列规则，不能把传入角色推断成每个输出队列的相同暴露定义。
- 药物可使用用户原始名称；只读 `r.faerskit.lookup` 会查找数据库中的 `drugname`/`prod_ai` 和实际 MedDRA Preferred Term。无精确匹配时只自动采用唯一候选；零个或多个候选继续保留原请求并在预检中提示，不静默扩大匹配。
- `unit`：`pair` 或 `case`。当前仅 AFun、CFun、FFun、IFun、DDI、DDIALL、Concomitant_Medication_Analysis 接受；保留实际口径，不将两类计数混合解释。
- `drug_route`：当前仅 BFun 接受。`drugEffect` 不适用于 IFun、Concomitant 或 top50。`drug_exclusion_from_alldata` 可用于 top50，但不适用于 BFun_upgrade1/2。不要把共用 schema 的可选字段全部透传。
- `database` 为可选数据库名称，凭据由服务端注入；省略时使用服务端配置的默认库。不要自行变更数据库或假定数据库名就是数据版本。
- `timeout_ms` 默认 3,600,000，范围 100～14,400,000；不能用短轮询代替作业状态查询。

## 输出与限制

runner 在作业结果根目录的 `faerskit/<fun>/<timestamp>/`（或指定相对目录）执行所选函数并写 `summary.json`，含函数名、耗时、输出目录和文件清单。CSV 文件名、统计指标与层级依赖 Fun 和实际数据，以 Manifest 和 CSV 表头为准，不承诺每个入口都生成同一套指标、图片或 XLSX。

保存原始输出与日志；展示摘要时说明人群、暴露定义、期间、计数口径和信号判据。状态检查只有包/连接信息，不能证明数据库去重质量、MedDRA 版本或药物匹配完整性。多药或大量 PT 扫描需记录多重比较和探索性范围；不得将信号阈值等同于临床诊断或用药建议。
