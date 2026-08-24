# ZeroWall Science 4.1.13

## 本次同版本修订

- 修复 Windows 打包启动时文件搜索插件缺少 `sampleOverCapGlobResults` 配置导致 Host 退出、页面显示插件加载失败的问题。
- Reviewer 默认启用并始终跟随当前对话模型，不再使用失效的固定模型配置；旧设置会自动清理，同时保留用户明确关闭自动审核的选择。
- Windows 工作流增加 PowerShell、Windows 路径和窄范围 `glob` 搜索提示，文件搜索超时预算调整为 60 秒，并提供缩小搜索范围的错误提示。
- 修复 SciMaster `search_papers` 返回字符串年份导致 MCP `-32602` 校验失败的问题；年份会规范化为四位整数，无效年份会安全省略。
- MCP 环境增加内容修订号和归档哈希，同一版本内容变化时会并行安装、验签、健康检查后原子切换，不再复用损坏的旧 ZIP。

## 修复内容

- 修复 Reviewer 子 Agent 因错误限制 `structured_output` 全局工具而无法启动的问题。
- Reviewer 现在只使用运行时注入的结构化输出工具，不会错误暴露普通全局工具。
- 改进 Reviewer 错误处理，避免显示 `unknown global tool structured_output`。
- 修复 SciMaster MCP 因未配置 API Key 导致的 `[no_api_key]` 启动错误。
- 在 MCP 设置中增加 SciMaster API Key 的安全配置、清除和状态显示，并提供官方获取地址：<https://scimaster.bohrium.com/vibe-write/home>。
- API Key 仅保存到 ZeroWall 凭据服务，启动 SciMaster 时通过临时配置注入，不写入 manifest、MCP 压缩包、日志或 Git。
- 修复 MCP 环境启动器和 Python site-packages 路径契约，Bio Tools、Ketcher 和 SciMaster 可独立恢复；缺少 SciMaster Key 不再阻塞其它 MCP。
- 修复 SciMaster API Key 保存时的凭据命名空间错误，使用合法的 `zerowall.mcp.scimaster_api_key` key。
