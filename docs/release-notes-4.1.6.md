# ZeroWall Science 4.1.6

- 移除带固定本机路径的 `zerowall_filesystem` 默认 MCP。
- 自动注册并管理 Claude Science 的 `bio-tools` 与 `ketcher-chemistry` MCP，启动路径由当前签名环境清单解析。
- 将 Stable/Preview 用户数据目录规范为 `zerowall-science` 与 `zerowall-science-preview`，并迁移旧的 `-3` 目录。
- 修复会话标题生成的模型路由，避免标题回退显示为 `workspace`。
