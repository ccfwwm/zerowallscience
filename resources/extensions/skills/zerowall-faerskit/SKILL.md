---
name: zerowall-faerskit
description: 对 FAERS 药物不良事件报告执行远程信号筛查，并在下载后完成跨分析比较、校验、图表和文档交付。
allowed-tools: read python
---

# FAERS 分析与本地交付

使用 Host `research_workflow`，工作流 ID 为 `r.faerskit`，并按实时 `describe` 的 schema 执行。无需预先调用 `mcp_connect`：Host 会在首次远端操作时按需连接并刷新 RMCP 工具；只在操作需要远端项目时自动创建或绑定项目，遇到明确的项目不存在错误会修复绑定并重试一次。不要直接调用原始 `mcp__rmcp__*` 工具，不要要求用户创建项目、提供项目 ID 或处理连接状态。若自动连接或修复后仍失败，再报告实际服务错误，不静默切换数据源。FAERS 是去标识自发报告的群体信号筛查，不用于个体诊断或治疗建议。

远程作业和文件由 Host 自动绑定到当前对话的 R 项目；不要让用户查找或填写项目 ID。

## 分析与敏感性作业

1. 用 `r.faerskit.status` 检查 ClickHouse 连接、表结构和报告期覆盖。药物或 PT 不确定时，用只读 `r.faerskit.lookup` 检查真实名称和汇总匹配数；优先精确匹配，不擅自替换用户输入。
2. 阅读 `r.faerskit.analyze` 的实时输入 schema，按问题选择规范工作流、队列、计数单位和筛选条件。提交前读取预检中的名称解析、候选数、角色计数、期覆盖和警告。零匹配、低计数或覆盖不足要如实保留，不把警告改写成肯定结果。
3. 收到用户明确的运行请求后，用 `action=run` 提交，每个分析提供稳定且唯一的 `request_id`，并按 schema 设置 `confirm=true`。在药物和目标 PT 均明确的情况下，优先让主分析和互补敏感性分析围绕同一问题设计；例如在支持的工作流中单独改变 `PS`/`PS+SS`、`case`/`pair` 或报告期。每个敏感性作业只改变一个主要维度，避免机械运行全部工作流，也不推断用户未提供的比较药。
4. 中断后先用已有本地 `run_id` 查询 `research_workflow action=status`，再用已有远端 `job_id` 查询 `r.get.job`、日志和 Manifest。作业仍在运行时继续等待；不要因断线或回复中断重复提交。只有用户调整分析条件或原作业确实失败并修正了参数，才用新 `request_id` 重算。

```json
{
  "action": "run",
  "workflow_id": "r.faerskit",
  "parameters": {
    "operation": "r.faerskit.analyze",
    "arguments": {
      "fun": "faers_analyze_drug_target_pt",
      "drug": "Citalopram",
      "ptname": "Torsade de pointes",
      "drugEffect": "PS",
      "year": "2026Q1",
      "unit": "pair",
      "path": "faerskit/citalopram-primary",
      "confirm": true
    },
    "request_id": "faers-citalopram-torsade-2026q1-primary"
  }
}
```

`year` 可用 `YYYYQn`，例如 `2026Q1`；也可用服务端支持的 FAERS `getdatayear` 编码。保留用户指定的 `case`/`pair` 和 `PS`/`SS`/`C`/`I`。预检警告不会授权更改筛选条件。

## 下载、比较与报告

1. 对所有准备纳入比较的成功分析作业，使用 Host `r_files action=download_job_manifest` 完整下载到工作区默认目录 `downloads/faerskit/<job_id>/`。确认 `result.local_delivery.status=complete` 且已校验文件数等于 Manifest 文件数。遇到 `partial` 时，对原 job 和同一本地目录重试续传；不要重跑分析。
2. 将这些**分析作业**的远端 `job_id` 提交给 `r.faerskit.synthesize`，同一远端 R 项目内可选 1 至 20 个。传 `confirm=true`。一个来源也要合成，以便生成统一的质量核查和报告；不能把 report、plot 或 synthesis 作业 ID 当作来源。
3. 合成作业从成功分析的受保护 RDS 快照读取统计，不重新查 ClickHouse。它会逐对识别 workflow、分析参数、`case`/`pair`、角色、报告期、人群筛选的差异；只对预先声明且口径兼容的配对做信号一致性比较。不同计数单位、不同核心队列或多个同时变化维度标记为不可直接比较，不合并、不做平均。根据实际输入给出方法信号一致性、低计数和零命中检查、可用的角色/人群/时间敏感性、队列流程图及 ROR/PRR 对照；缺少数据的维度不补造。
4. 等待 synthesis 作业完成并完整下载它的 Manifest 到 `downloads/faerskit/<synthesis_job_id>/`。同样核对完整性；不把远端临时报告当最终交付。
5. 阅读 `synthesis.json`、`sources.csv`、`compatibility.csv`、`signal_agreement.csv`、`methods.csv`、`cross_analysis.csv`、`data_quality.csv` 和图表 CSV，先对照检查来源、分母、兼容状态、缺失/零命中与稀疏计数，再撰写中文 `interpretation.json`。说明研究问题、队列和计数口径、主要跨分析结果、敏感性方向、限制与科学审查状态；每条发现都必须带可在实际 CSV 中定位的行条件、列名和实际值。不得只复述远端报告文字，也不得补算不存在的指标。

```json
{
  "format": "faerskit-narrative/1",
  "research_question": "本次分析要回答的问题",
  "executive_summary": "依据已核验聚合结果撰写的综合判断，并说明尚未独立科学审查",
  "findings": [
    {
      "title": "来源记录概况",
      "text": "仅陈述所引用行和列支持的结果，不把信号解释为发生率或因果作用。",
      "evidence": [
        {
          "table": "sources",
          "where": {"source_job_id": "实际 job ID"},
          "column": "signal_rows",
          "value": "实际单元格值"
        }
      ]
    }
  ],
  "limitations": ["仅写入真实适用的限制、缺失或不可比情形"]
}
```

6. 使用工作区 `python` 工具运行下载包内的 `faerskit_postprocess.py`，并传入该 JSON，例如 `--narrative-json downloads/faerskit/<synthesis_job_id>/interpretation.json`，同时传 `--bundle-dir downloads/faerskit/<synthesis_job_id>` 和 `--download-root downloads/faerskit`。脚本会重验合成包与每个源作业的 SHA-256 Manifest、RDS 哈希、参数与预检 JSON、比较表计数、Excel/CSV 值、报告链接和 PNG/SVG/图表 CSV，再把逐条证据核验结果、中文解释及来源队列/配对摘要放在报告前部，生成 DOCX、PDF、本地校验报告和最终交付 Manifest。DOCX/PDF 依赖本机 Pandoc、LibreOffice；运行时缺失或失败必须报告，不能标为已交付。
7. 只从 `deliverables/` 汇总交付。检查 `local_validation.json` 的全部检查状态和 `deliverables-manifest.json`；任一失败时先修复或重试下载/本地处理，不要把不完整产物说成最终报告。交付 Markdown、HTML、Excel、DOCX、PDF、PNG/SVG/图表 CSV、逐项校验和来源 job/哈希清单。报告正文采用带行证据的中文解释和限量摘要，完整分析表保留在 Excel/CSV。来源 RDS 和原始下载包留在各自作业目录，不复制到交付包、不上传回远端。

若本地 Python、Pandoc 或 LibreOffice 不可用，保留已下载结果并明确报告未完成的校验或格式；不得退化成只下载后放置文件。不得在对话中展开病例级数据、原始记录、Base64 或凭据。

## 分析边界

- `r.faerskit` 只开放 ClickHouse 上的 14 个规范工作流。`faers_signal`/`faers_describe` 等 DuckDB 专用函数不能直接当作远端分析动作；`action=describe` 用于查询当前接口定义。
- 原始预检、报告参数、覆盖、队列分母、RDS 和所有产物哈希应能追溯到来源 job。校验通过只证明文件与结构一致，不代表临床或科学结论已经验证。
- 比例失衡受报告偏倚、混杂、缺失、重复报告处理、暴露角色与多重比较影响；信号不是发生率、相对风险或因果证据。
- 不把数据库凭据写入参数、提示词、脚本输出或报告。数据库导入、安装和切换服务不属于普通分析流程。

按问题读取[分析场景](references/scenarios.md)和[数据约定](references/data-formats.md)。结构化调用示例见 [examples.json](references/examples.json)；完整输入与作业生命周期见[生成操作目录](references/operations.md)，实时 `describe` 优先。
