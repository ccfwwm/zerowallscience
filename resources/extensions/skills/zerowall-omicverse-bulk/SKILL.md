---
name: zerowall-omicverse-bulk
description: 通过现有 rmcp 使用远程 OmicVerse 完成bulk RNA-seq 差异表达与富集。
allowed-tools: tool_search tool_dispatch read
---

# bulk RNA-seq 差异表达与富集

counts CSV 行为样本列为基因，metadata CSV 索引与样本严格一致。每组至少两个生物学重复；factor/test/reference 明确。

使用同一物理 rmcp 连接、同一工作流 omicverse。先 tool_search 发现 research_workflow，再 tool_dispatch：

```json
{"name":"research_workflow","arguments":{"action":"describe","workflow_id":"omicverse","operation":"omicverse.run.bulk"}}
```

按返回的 schema 填充 run 的 parameters.operation 和 parameters.arguments，parameters.request_id 同一提交重试固定。status 使用返回的本地 run_id；只有 succeeded 且检查必要 Manifest 后报告完成。远程输入使用项目相对路径或已完成的 data:OmicVerse/ 引用，上传/下载使用 Host r_files。

专项之外的入口、真实数据示例、完整目录和会话恢复约定见 zerowall-omicverse。加载该 Skill 后，用它返回的 resourceBase 读取 references/operations.md 和 references/scenarios.md，不能把本 Skill 的 resourceBase 当成主 Skill 目录。

## 差异表达提交与结果取回

先使用 Host r_files.upload_workspace 将本地 inputs/counts.csv 和 inputs/metadata.csv 上传到项目 rmcp-demo 的同名路径。CSV 首列为样本索引；counts 每行一个样本、每列一个基因，值为非负整数。metadata 的样本及顺序完全一致，condition 包含 treated/control，每组至少两个生物学重复。输出表含 log2FoldChange、pvalue、padj；正值表示 treated 相对 control 升高。此入口执行差异表达，富集需另选经过目录确认的方法。样本顺序错误时修正两个输入后使用新 request_id。

```json
{
  "name": "research_workflow",
  "arguments": {
    "action": "run",
    "workflow_id": "omicverse",
    "parameters": {
      "operation": "omicverse.run.bulk",
      "arguments": {
        "project_id": "rmcp-demo",
        "request_id": "bulk-example-1",
        "input_path": "inputs/counts.csv",
        "metadata_path": "inputs/metadata.csv",
        "factor": "condition",
        "test": "treated",
        "reference": "control",
        "confirm": true
      },
      "request_id": "bulk-example-1"
    }
  }
}
```

首次运行使用新的 request_id，同一提交重试保持参数及 request_id 不变。保留提交返回的本地 run_id 和远程 remote_id，查询本地任务：

```json
{"name":"research_workflow","arguments":{"action":"status","run_id":"<提交返回的本地 run_id>"}}
```

queued/running 表示尚未完成；failed/timed_out 时保留原任务并读取错误及日志。succeeded 后检查 artifacts 中的 differential-expression.csv，使用 Manifest 的完整项目相对路径取回文件，不拼接本地 run_id：

```json
{"name":"r_files","arguments":{"action":"download_workspace","project_id":"rmcp-demo","remote_path":"<Manifest 中的完整项目相对路径>","local_path":"results/differential-expression.csv"}}
```
