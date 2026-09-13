# ZeroWall Science 5.20.2

本版本聚焦上下文成本、工具可见性和默认 Python 科研运行时，提供 Windows x64 Stable 安装包。

## 上下文与工具注入

- 修复每轮把完整工具 schema 同时写入请求工具列表和系统提示词的问题，`tools:sdk` 现在只保留紧凑路由说明。
- 默认仅常驻控制面、基础文件/终端工具和 `python`；MCP 服务改为按需通过 `capability_search` 与 `capability_execute` 发现和调用。
- 最终工具列表按名称去重，能力目录指针在重复组装时保持单实例，减少长会话 token 累积和 compaction。
- 保留旧工具配置兼容映射，不删除既有能力或历史会话。

## ZeroWall Python

- 默认环境目录更名为 `%APPDATA%\\zerowall-science\\zerowall-python`。
- 首次启动会从旧的 `mcp-environments` 目录迁移可用内容，并保留旧目录作为回滚源。
- 默认提供可调用的 `python` 工具，使用签名、健康检查通过的 Windows Python 运行时和科研依赖。
- ZeroWall Python 包使用独立 manifest、SHA-256 和 Ed25519 签名，可独立更新。

## 发布与兼容

- 旧的 `ZEROWALL_MCP_ENVIRONMENT_ROOT`、manifest 和发布变量继续兼容；新部署优先使用 `ZEROWALL_PYTHON_ROOT`。
- MCP/ZeroWall Python 仍通过 HTTPS 下载并验证，凭据不会进入提示词、工具描述或会话日志。
