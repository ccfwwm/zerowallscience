# ZeroWall Science 5.4.0

## 启动与稳定性

- 修复干净安装在缺少 Windows 用户数据目录时的启动错误。
- 生产桌面包禁用开发 HMR，避免运行时配置变化触发重复加载和内存增长。
- 延后微信 iLink 登录和二维码流程，桌面首屏完成后再从设置中连接。
- 首次安装只登记托管 MCP 连接，不自动启动远程工具发现；在环境设置或连接管理中启用后再建立连接。
- 修复 DSH Web 认证地址在输出跨 chunk 到达时无法识别的问题，并增加认证地址兜底公告。

## 能力与预览

- 保留按需能力菜单和 MCP 搜索/启用入口，减少普通会话的工具上下文。
- Better Sidebar Markdown 预览继续支持本地图片、媒体资源、Mermaid 和安全 HTML 处理。
- 保留 OpenCode Zen、ZeroWall AI Cloud、微信和科学工作流插件集成。

本版本为 Windows x64 Electron 安装包。
