# ZeroWall Science 5.1.12

## Biomni MCP 凭据透传

- AI Cloud 当前模型和 API Key 会由 Host 仅注入 `r_biomni_run_agent` 与 `r_biomni_call_tool`。
- Python Worker 只在任务内存中使用 Key，任务 JSON、日志、Manifest 和结果接口均做脱敏。
- 增加 Key 透传、只读工具不注入以及 Python Worker 脱敏回归测试。

## MCP 集成

- rdatalinux Biomni 默认连接纳入 ZeroWall MCP 管理列表。
- 同步更新 DeepSeek Harness 子模块到包含 Biomni 凭据注入的版本。

## 兼容性

- 保留现有 R、GEO、NHANES 和 MCP 工具名称与调用方式。
- 本版本仅生成本地 Windows x64 安装包，不自动发布研究数据或凭据。
