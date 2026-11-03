---
name: zerowall-faerskit
description: 对 FAERS 药物不良事件报告执行远程信号筛查，并在下载后完成跨分析比较、校验、图表和文档交付。
allowed-tools: read python research_workflow r_files
---

# FAERS 分析与本地交付

使用 Host `research_workflow`，工作流 ID 为 `r.faerskit`，并按实时 `describe` 的 schema 执行。提示组装前，Host 会自动连接已启用 MCP 并动态发现工具；完整传入所有可用服务的实时 schema，不设工具数量上限；可用 `mcp_search` 按能力检索和刷新。无需预先调用 `mcp_connect`，也不要要求用户管理连接。若 RMCP 未公布通用 `r_runtime`，Host 会使用版本化操作契约完成目录/说明发现，并将 FAERS 查询和作业直接路由到实时 `r_faerskit` / `r_jobs` 工具；仍以工具在线状态和返回结果判断可用性。Host 自动创建或绑定当前对话所需的远端项目，遇到明确的项目不存在错误会修复绑定并重试一次。不要直接调用原始 `mcp__rmcp__*` 工具，也不要调用 FigureYa 的旧 catalog 工具；文件下载统一使用 Host `r_files`，由 Host 自动处理远端工具版本差异。不要要求用户创建项目或提供项目 ID。若自动连接或修复后仍失败，再报告实际服务错误，不静默切换数据源。FAERS 是去标识自发报告的群体信号筛查，不用于个体诊断或治疗建议。

远程作业和文件由 Host 自动绑定到当前对话的 R 项目；不要让用户查找或填写项目 ID。

## 分析与敏感性作业

1. 用 `r.faerskit.status` 检查 ClickHouse 连接、表结构和报告期覆盖。药物分析默认先完成别名发现，即使标准名精确命中也要调用 `r.faerskit.lookup`，设置 `discover_aliases=true`，并按 `next_offset` 读取全部候选页。候选来自同条 DRUG 记录的 DRUGNAME—PROD_AI 关系和词边界检索，不把同报告合并药或包含字符串当作同药证据。药名大小写、首尾和连续空白自动归并；品牌、复方、盐型与模糊项由 AI 展示同记录成分证据、冲突及建议，等用户确认纳入范围。可用已确认品牌作新的 seed 继续查询，但不得无限沿不确定关系扩散，也不能把 Escitalopram 自动纳入 Citalopram。数据库没有证据的 AI 猜测必须先回查。
2. 先确定药物范围，再查询目标 PT 的结果；不能按目标事件计数高低选择别名。将已确认集合写入所有相应药物字段，包括比较、联合及排除字段，同时传 `name_resolution`：`mode=reviewed_aliases`，每个 group 包含 `field`、`requested`、`accepted`、`reason`、`confirmed=true`，`decisions` 逐项记载 `name/decision/reason/evidence`。大小写和空白变体、明确同成分且无冲突的成分名称可按规则归并；品牌、复方和模糊候选的确认必须来自用户。若用户明确要求只分析固定精确名称集合，才用 `mode=explicit_exact`；不得为了绕过别名审核自行选择该模式。品牌确认后，以该品牌为种子补查含错拼药名、成分缺失的数据库名称，再审核新增候选；不以模糊匹配直接纳入。无可用别名时说明精确范围并取得确认。多个药物字段分别记录范围，不能混为一个集合。
3. 阅读 `r.faerskit.analyze` 的实时输入 schema，按问题选择规范工作流、队列、计数单位和筛选条件。提交前读取预检中的名称解析、候选数、角色计数、期覆盖和警告。零匹配、低计数或覆盖不足要如实保留，不把警告改写成肯定结果。
4. 用户明确要求进行 FAERS 分析即视为授权提交分析、绘图、报告和综合作业。已完成药名范围确认后，用 `action=run` 执行，无需再次询问运行授权；Host 会为这些 FAERS 操作自动补入后端所需的 `confirm=true`。每个分析提供稳定且唯一的 `request_id`。在药物和目标 PT 均明确的情况下，优先让主分析和互补敏感性分析围绕同一问题设计；例如在支持的工作流中单独改变 `PS`/`PS+SS`、`case`/`pair` 或报告期。每个敏感性作业只改变一个主要维度，避免机械运行全部工作流，也不推断用户未提供的比较药。
5. 中断后先用已有本地 `run_id` 查询 `research_workflow action=status`，再用已有远端 `job_id` 查询 `r.get.job`、日志和 Manifest。作业仍在运行时继续等待；不要因断线或回复中断重复提交。只有用户调整分析条件或原作业确实失败并修正了参数，才用新 `request_id` 重算。

```json
{
  "action": "run",
  "workflow_id": "r.faerskit",
  "parameters": {
    "operation": "r.faerskit.analyze",
    "arguments": {
      "fun": "faers_analyze_drug_target_pt",
      "drug": ["数据库查询且经确认的名称"],
      "name_resolution": {
        "mode": "reviewed_aliases",
        "groups": [{"field": "drug", "requested": ["用户输入药名"], "accepted": ["数据库查询且经确认的名称"], "reason": "用户确认此药物范围", "confirmed": true,
          "decisions": [{"name": "数据库查询且经确认的名称", "decision": "include", "reason": "已确认同药", "evidence": "真实lookup返回的同记录药名与成分关系"}]}]
      },
      "ptname": "Torsade de pointes",
      "drugEffect": "PS",
      "year": "2026Q1",
      "unit": "pair",
      "path": "faerskit/citalopram-primary"
    },
    "request_id": "faers-citalopram-torsade-2026q1-primary"
  }
}
```

`year` 可用 `YYYYQn`，例如 `2026Q1`；也可用服务端支持的 FAERS `getdatayear` 编码。保留用户指定的 `case`/`pair` 和 `PS`/`SS`/`C`/`I`。预检警告不会授权更改筛选条件。

## 下载、比较与报告

1. 对所有准备纳入比较的成功分析作业，使用 Host `r_files action=download_job_manifest` 完整下载到工作区默认目录 `downloads/faerskit/<job_id>/`。确认 `result.local_delivery.status=complete` 且已校验文件数等于 Manifest 文件数。遇到 `partial` 时，对原 job 和同一本地目录重试续传；不要重跑分析。
2. 将这些**分析作业**的远端 `job_id` 提交给 `r.faerskit.synthesize`，同一远端 R 项目内可选 1 至 20 个。无需询问或传入确认字段。一个来源也要合成，以便生成统一的质量核查和报告；不能把 report、plot 或 synthesis 作业 ID 当作来源。
3. 合成作业从成功分析的受保护 RDS 快照读取统计，不重新查 ClickHouse。它会逐对识别 workflow、分析参数、`case`/`pair`、角色、报告期、人群筛选的差异；只对预先声明且口径兼容的配对做信号一致性比较。不同计数单位、不同核心队列或多个同时变化维度标记为不可直接比较，不合并、不做平均。根据实际输入给出方法信号一致性、低计数和零命中检查、可用的角色/人群/时间敏感性、队列流程图及 ROR/PRR 对照；缺少数据的维度不补造。
4. 等待 synthesis 作业完成并完整下载它的 Manifest 到 `downloads/faerskit/<synthesis_job_id>/`。同样核对完整性；保留主分析原生中文业务报告和表格作为正式交付主体；综合报告作为附加分析，不能替换主分析报告。
5. 阅读 `synthesis.json`、`table_registry.json` 中 sources、compatibility、signal_agreement、methods、cross_analysis、data_quality 对应的中文 CSV 和图表 CSV，先对照检查来源、分母、兼容状态、缺失/零命中与稀疏计数，再撰写中文 `interpretation.json`。说明研究问题、队列和计数口径、主要跨分析结果、敏感性方向、限制与科学审查状态；每条发现都必须带可在实际 CSV 中定位的行条件、列名和实际值。不得只复述远端报告文字，也不得补算不存在的指标。

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
7. 使用 `table_registry.json` 的稳定表 ID、中文文件名和工作表映射做校验，不能假设 CSV stem 等于工作表名。保留中文业务文件、原版变量顺序及 `NO_target_PT/target_PT/Overall` 列顺序（Overall 最后）；年度、季度按真实粒度分别输出。不要自行用 PowerShell 或简化 Excel 重新制作报告；中文解读是附加章节。单来源综合报告不展示无比较数据的模板图。仅下载聚合数据时，原生主分析 report.html/report.xlsx、全部中文业务汇总和图表也必须保留；RDS不下载的校验范围须如实说明。
8. 只从 `deliverables/` 汇总交付。检查 `local_validation.json` 的全部检查状态和 `deliverables-manifest.json`；任一失败时先修复或重试下载/本地处理，不要把不完整产物说成最终报告。交付 Markdown、HTML、Excel、DOCX、PDF、PNG/SVG/图表 CSV、逐项校验和来源 job/哈希清单。报告正文采用带行证据的中文解释和限量摘要，完整分析表保留在 Excel/CSV。来源 RDS 和原始下载包留在各自作业目录，不复制到交付包、不上传回远端。

若本地 Python、Pandoc 或 LibreOffice 不可用，保留已下载结果并明确报告未完成的校验或格式；不得退化成只下载后放置文件。不得在对话中展开病例级数据、原始记录、Base64 或凭据。

## 分析边界

- `r.faerskit` 只开放 ClickHouse 上的 14 个规范工作流。`faers_signal`/`faers_describe` 等 DuckDB 专用函数不能直接当作远端分析动作；`action=describe` 用于查询当前接口定义。
- 原始预检、报告参数、覆盖、队列分母、RDS 和所有产物哈希应能追溯到来源 job。校验通过只证明文件与结构一致，不代表临床或科学结论已经验证。
- 比例失衡受报告偏倚、混杂、缺失、重复报告处理、暴露角色与多重比较影响；信号不是发生率、相对风险或因果证据。
- 不把数据库凭据写入参数、提示词、脚本输出或报告。数据库导入、安装和切换服务不属于普通分析流程。

按问题读取[分析场景](references/scenarios.md)和[数据约定](references/data-formats.md)。结构化调用示例见 [examples.json](references/examples.json)；完整输入与作业生命周期见[生成操作目录](references/operations.md)，实时 `describe` 优先。
