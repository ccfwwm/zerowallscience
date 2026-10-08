---
name: zerowall-omicverse-agent
description: 通过现有 rmcp 使用远程 OmicVerse 完成可选 OmicVerse Agent 与当前模型调用。
allowed-tools: tool_search tool_dispatch read
---

# 可选 OmicVerse Agent 与当前模型调用

仅明确选择 Agent 时调用。当前 provider/model/endpoint/api/key 由 Host 注入，密钥不能出现在提示词或任务文件；协议不支持时明确失败，不静默换模型。

使用同一物理 rmcp 连接、同一工作流 omicverse。先 tool_search 发现 research_workflow，再 tool_dispatch：

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"omicverse","operation":"omicverse.run.agent"}}
```

按返回的 schema 填充 run 的 parameters.operation 和 parameters.arguments，parameters.request_id 同一提交重试固定。status 使用返回的本地 run_id；只有 succeeded 且检查必要 Manifest 后报告完成。远程输入使用项目相对路径或已完成的 data:OmicVerse/ 引用，上传/下载使用 Host r_files。

专项之外的入口、真实数据示例、完整目录和会话恢复约定见 zerowall-omicverse。加载该 Skill 后，用它返回的 resourceBase 读取 references/operations.md 和 references/scenarios.md，不能把本 Skill 的 resourceBase 当成主 Skill 目录。

## 当前模型的最小真实请求

下面示例不需要分析数据。Host 从当前设置和凭据库注入完整模型路由，调用参数中不填写密钥。任务完成后必须下载 model-check.txt 并验证内容为 OMICVERSE_AGENT_OK；只有文字回复、没有文件时验收失败。MODEL_ROUTE_REQUIRED 或协议错误时检查当前模型设置，不能自行切换模型。正式分析时补充 input_path、具体目标和输出要求，并核验生成代码与产物。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "omicverse",
    "parameters": {
      "operation": "omicverse.run.agent",
      "arguments": {
        "project_id": "rmcp-demo",
        "request_id": "agent-example-1",
        "prompt": "Run Python to write a text file named model-check.txt containing the exact text OMICVERSE_AGENT_OK. Do not access other files or download data. Report the filename.",
        "confirm": true
      },
      "request_id": "agent-example-1"
    }
  }
}
```

首次运行使用新的 request_id，同一提交重试保持参数及 request_id 不变。保留提交返回的本地 run_id 和远程 remote_id，查询本地任务：

```json
{"name":"research_workflow","arguments":{"action":"status","run_id":"<提交返回的本地 run_id>"}}
```

queued/running 表示尚未完成；failed/timed_out 时保留原任务并读取错误及日志。succeeded 后检查 artifacts 中的 model-check.txt，使用 Manifest 的完整项目相对路径取回文件，不拼接本地 run_id：

```json
{"name":"r_files","arguments":{"action":"download_workspace","project_id":"rmcp-demo","remote_path":"<Manifest 中的完整项目相对路径>","local_path":"results/model-check.txt"}}
```
