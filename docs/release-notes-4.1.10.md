# ZeroWall Science 4.1.10

## 修复与改进

- 默认权限改为完全权限，Windows 工具不再对已经处于完全权限的会话重复发起无效升级。
- MCP 环境切换支持自动刷新，环境准备完成后会自动重新连接 Bio Tools、Ketcher 和 SciMaster。
- 新增原生 `python` 工具，复用已签名且健康的 MCP Python 环境，可直接使用 `mcp`、`numpy`、`pandas` 和 `httpx`。
- 提问请求在传输层统一兼容 `multi_select` 和 `multiSelect`，真实提问帧会显示可选择的交互卡片。
- MCP Python 状态和版本显示在 MCP 面板中，环境异常时提供明确的重试提示。
- 修复打包目录下 ripgrep 的解析路径，减少 Windows 安装包中的搜索启动失败。

本版本仍只提供 Windows x64 安装包。MCP 环境安装会校验签名、压缩包大小和 SHA-256，失败时保留已有健康环境。
