---
name: zerowall-rplatform
description: 远程 R 项目、脚本、图表报告和论文复现。
allowed-tools: tool_search tool_dispatch read
---

# 远程 R 项目、脚本、图表报告和论文复现。

用 R 处理统计、调查权重和现有 RDS 数据。单细胞原生 Python/AnnData 流程转 OmicVerse；现成绘图模板转 FigureYa。

## 功能地图

环境与依赖检查；项目和工作目录；异步 R 脚本；图表、表格和报告；论文复现记录、比较和打包。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`r.compute`。R 脚本输出使用项目相对路径；保存 sessionInfo、随机种子和代码。包缺失先查询 zerowall-r-packages，不在脚本里自动安装。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "r.compute",
    "operation": "r.runtime.capabilities"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "r.compute",
    "parameters": {
      "operation": "r.runtime.capabilities",
      "arguments": {}
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
    "workflow_id": "r.compute",
    "parameters": {
      "operation": "r.submit.script",
      "arguments": {
        "project_id": "rmcp-demo",
        "code": "out <- Sys.getenv('R_PLATFORM_RESULT_DIR'); write.csv(data.frame(x=1:3,y=c(2,4,7)), file.path(out,'result.csv'), row.names=FALSE); capture.output(sessionInfo(), file=file.path(out,'session-info.txt'))",
        "confirm": true
      },
      "request_id": "demo-r-compute-1"
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

R 作业的 job_id 与本地 run_id 不同；普通跟踪始终传本地 run_id。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
