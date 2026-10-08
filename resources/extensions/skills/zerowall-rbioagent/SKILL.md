---
name: zerowall-rbioagent
description: 远程 Biomni 精确生物工具、数据湖、Python 与可选 Agent。
allowed-tools: tool_search tool_dispatch read
---

# 远程 Biomni 精确生物工具、数据湖、Python 与可选 Agent。

明确生物能力优先检索精确工具；开放式复杂任务可用 Agent。AnnData 专项方法选择 OmicVerse；本地数据轻量计算或数据库查询见 zerowall-bio。

## 功能地图

运行时和依赖；22 个领域的动态能力检索；数据湖和基因集；精确工具；Python；可选 Agent；预取、任务和产物。

## 入口与准备

先 `tool_search` 搜索 `research_workflow`，使用返回的真实工具名和 schema。下列 JSON 是交给 `tool_dispatch` 的完整包装；不要把工作流 ID 当工具名。只有一条物理连接 `rmcp`，工作流按需连接。

查询 schema：`action=describe`，精确 ID 放顶层 `operation`。业务调用：`action=query/run`，精确 ID 放 `parameters.operation`，业务参数放 `parameters.arguments`。只读 query 不创建 Run、不需要 request_id；run 必须有唯一 request_id，同一提交重试复用，参数变化换新 ID。`offline=true` 的 describe 仅浏览本地快照，不能证明在线能力可用。

工作流 ID：`biomni`。动态 ID 为 biomni.tool.* 或 biomni.bridge.*。search 找精确 ID，describe 读取嵌套 tool_arguments schema，再 run。工具缺依赖时报告 missing_dependencies，不把注册当成功。

## 首次调用

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "describe",
    "workflow_id": "biomni",
    "operation": "biomni.status"
  }
}
```
```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "query",
    "workflow_id": "biomni",
    "parameters": {
      "operation": "biomni.status",
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
    "workflow_id": "biomni",
    "parameters": {
      "operation": "biomni.run.python",
      "arguments": {
        "project_id": "rmcp-demo",
        "code": "from pathlib import Path\nPath(\"hello.txt\").write_text(\"Biomni remote runtime\")",
        "confirm": true
      },
      "request_id": "demo-biomni-1"
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

provider/model/endpoint/API 类型和凭据由 Host 提供，模型不得填写密钥。仅明确的 LLM 操作需要模型路线。下载 ID、计算 job_id、session_id 不能混用。

异步任务的 queued/running 不是成功。只有终态 succeeded 且所需产物存在才报告完成；使用结果内 Manifest 的 project_id/path/bytes/sha256 下载。连接中断先查 status/历史，不换 request_id 重算。参数错回 describe；数据错核对路径、物种和矩阵；缺依赖查环境；权限错返回明确原因；计算错查看日志。

## 按需参考

Skill 加载结果的 `resourceBase` 是资源根目录；以它解析下列相对路径，兼容安装包，不能硬编码源码路径。

- [操作目录](references/operations.md)：按功能族查看全部精确操作、schema 和生命周期。
- [可执行示例](references/examples.json)：结构化调用与预期结果，用于验证和复用。
- [场景与失败恢复](references/scenarios.md)：提交后如何跟踪、取回产物及处理模块特有错误。
- [数据约定](references/data-formats.md)：输入/输出、ID 和路径边界。
