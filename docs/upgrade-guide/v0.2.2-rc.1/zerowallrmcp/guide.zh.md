---
kind: upgrade-guide
description: "保留的 R MCP 服务名称及工具前缀改为 zerowallrmcp。"
---

# R MCP 服务名称

[English](guide.md) | 中文

## 变更

保留服务名称为 zerowallrmcp；公共工具前缀从 mcp__rmcp__ 改为 mcp__zerowallrmcp__。历史会话保留原工具记录。启动时迁移 rmcp 和 zerowall-rmcp 配置别名，保留凭据、启用选择及已有会话项目绑定。远程 HTTPS 服务地址保持不变。

## 迁移

1. 重启更新后的应用以迁移保留服务配置；确认 MCP 设置显示 zerowallrmcp，且授权及启用状态与原先一致。
2. 将自定义提示词和 Skills 中的 mcp__rmcp__ 改为 mcp__zerowallrmcp__。软件包拥有的 Skills 自动更新；不要编辑历史会话记录。
3. Claude 中通过 Host 桥接调用，前缀为 mcp__zerowall__mcp__zerowallrmcp__，随后为工具名称。通过同一桥接的 capability_search 按需连接；开始科研任务前确认能力发现及一次只读调用成功。
