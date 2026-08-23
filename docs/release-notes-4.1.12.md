# ZeroWall Science 4.1.12

## 修复与改进

- 修复 MCP Python 环境路径错误：统一使用 `bio-tools/python/site-packages`，不再误报 Python 环境不可用。
- 修复 MCP 临时安装目录残留，安装失败时保留旧健康环境并在下次初始化前清理临时目录。
- 新增 `stable-2` MCP 签名密钥轮换，同时保留 `stable-1` 验证旧环境。
- MCP 环境安装继续校验 manifest 签名、压缩包大小、SHA-256、Python 依赖和 MCP 服务健康状态。

本版本仍只提供 Windows x64 安装包。
