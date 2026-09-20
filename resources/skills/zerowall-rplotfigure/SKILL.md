---
name: zerowall-rplotfigure
description: FigureYa 模板、输入引用、绘图计划、图表与报告。
allowed-tools: tool_search tool_dispatch read
---

# FigureYa 模板、输入引用、绘图计划、图表与报告。

有已安装模板时先选模板；自定义绘图按验证后的计划执行。普通统计准备可用 R；不要重复从 GitHub 下载服务器已有模板源。

## 功能地图

模板搜索和依赖；服务器源码与示例；输入引用验证；计划创建；执行与日志；图像、表格、报告、比较和下载。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`figureya`。input_refs 引用现有文件及 SHA-256，不能放 content/base64。模板自带 demo 可省 input_refs；选择 template_id 时先查看模块具体输入。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "figureya",
    "operation": "figureya.search"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "figureya",
    "parameters": {
      "operation": "figureya.search",
      "arguments": {
        "q": "volcano"
      }
    }
  }
}
```

确认实际输入和范围后，以下执行示例可提交至专用演示项目。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "figureya",
    "parameters": {
      "operation": "figureya.create.plan",
      "arguments": {
        "project_id": "rmcp-demo",
        "action": "plan",
        "mode": "custom_r",
        "code": "png(\"plot.png\"); plot(1:3, c(2,4,7)); dev.off()",
        "confirm": true
      },
      "request_id": "demo-figureya-1"
    }
  }
}
```

返回本地 `run_id` 后替换下面的 `<run_id>`：

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "status",
    "run_id": "<run_id>"
  }
}
```

## 返回与恢复

plan_id 表示已保存计划，不表示绘图完成；figureya.generate.report 当前只创建报告计划，也须运行。run.plan 返回 run_id 后工作流跟踪到 Manifest。

从创建结果的 `result` 中取实际 `plan_id`，再执行：

```json
{"name":"research_workflow","arguments":{"action":"run","workflow_id":"figureya","parameters":{"operation":"figureya.run.plan","arguments":{"project_id":"rmcp-demo","plan_id":"<创建结果中的 plan_id>","confirm":true},"request_id":"demo-figureya-render-1"}}}
```

跟踪本次返回的本地 `run_id`。完成后从 Manifest 取图像路径，经 Host `r_files` 的 `download_workspace` 下载到工作区；需要模型看图时再调用 `figureya.read.image`。若提示输入引用不存在，检查文件属于当前项目且 SHA-256 一致；若模板缺包，先查询模板依赖和包目录，不能把创建计划成功视为绘图成功。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
