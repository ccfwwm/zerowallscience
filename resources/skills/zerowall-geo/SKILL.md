---
name: zerowall-geo
description: GEO 公共数据检索、下载、bulk 与单细胞分析。
allowed-tools: tool_search tool_dispatch read
---

# GEO 公共数据检索、下载、bulk 与单细胞分析。

公共表达数据发现和现有 R 分析优先本模块。需要 OmicVerse 方法时先确认完整下载，再传共享数据引用。

## 功能地图

accession 与文件检索；缓存、下载和日志；表达矩阵检查；bulk QC/归一化/批次/差异；富集与 GSEA；单细胞 QC 到注释；图表、计划和报告。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.geo`。真实计算前核对物种、基因 ID、raw counts、样本分组、生物学重复与批次。排除 .partial/.aria2。dry_run 只估算下载，不能当成数据已就绪。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "r.geo",
    "operation": "r.geo.catalog"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "r.geo",
    "parameters": {
      "operation": "r.geo.catalog",
      "arguments": {}
    }
  }
}
```

确认实际输入和范围后，以下执行示例可提交至专用演示项目。这里 dry_run=true 只展示下载估算；需要下载时描述实际文件选择并按 confirm_large 契约另行提交。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "r.geo",
    "parameters": {
      "operation": "r.geo.download",
      "arguments": {
        "project_id": "rmcp-demo",
        "accession": "GSE1000",
        "dry_run": true
      },
      "request_id": "demo-r-geo-1"
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

下载使用 confirm_large 而非 confirm；GEO 返回 job_id，但状态接口参数名是 download_job_id。工作流按目录映射，不能调用普通 R job 查询。

估算范围确认后，真实下载表达矩阵使用新的提交标识：

```json
{"name":"research_workflow","arguments":{"action":"run","workflow_id":"r.geo","parameters":{"operation":"r.geo.download","arguments":{"project_id":"rmcp-demo","accession":"GSE1000","profile":"expression","include_suppl":false,"dry_run":false},"request_id":"demo-geo-expression-download-1"}}}
```

对返回的本地 `run_id` 查询 `status`，直到终态；再用 `r.geo.get.status` 和 `r.geo.list.files` 核对 accession 的完整文件。若超出大文件阈值，按返回的大小和范围填写 `confirm_large`；若下载失败，查看 `r.geo.get.download.log`，保留下载 ID，不能拿 `.partial` 开始分析。需要 OmicVerse 时使用返回的完整共享路径，格式与 counts 类型必须再次核对。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
