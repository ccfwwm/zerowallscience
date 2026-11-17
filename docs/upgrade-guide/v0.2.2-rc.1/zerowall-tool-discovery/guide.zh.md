---
kind: upgrade-guide
description: ZeroWall 普通对话按需加载可选工具，托管云请求使用上游默认输出参数。
---

# ZeroWall 工具发现与默认输出参数

[English](guide.md) | 中文

## 变更

MCP 插件在普通对话中展示基础工具，在 `tool_search` 或 `mcp_search` 后加载可选定义。组装提示词不再连接所有启用的 MCP 服务。显式调用 `mcp_connect` 加载一个服务的完整列表。恢复会话时，从成功的发现结果还原选择；自定义和 PTC 预设保留各自的执行器。

AI Cloud 插件将目录中的输出能力作为模型元数据。调用方未指定上限时，省略可选输出限制参数。Anthropic Messages 保留协议要求的模型专属 `max_tokens`。上下文容量独立处理。上游空截断响应改为可重试的失败。

## 迁移

1. 更新 `@zerowall/dsh-plugin-mcp` 和 `@zerowall/dsh-plugin-ai-cloud`，然后重启桌面端。
2. 让模型先使用 `tool_search` 或 `mcp_search`，再调用可选能力。如需全量展示，在当前配置的 `cordis.patch.yml` 中，为 MCP 插件的 `config` 设置 `toolLoading: all`。`alwaysAvailableTools` 替换初始工具名称列表；`toolSearchLimit` 设置搜索匹配数量，范围为 1 至 20。
3. 新建普通对话，确认首次请求只有基础工具定义。搜索能力后，确认下一步只加入匹配定义。没有显式上限的云请求应省略可选输出限制字段。
