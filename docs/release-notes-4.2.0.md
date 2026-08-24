# ZeroWall Science 4.2.0

## 本次更新

- 默认集成 OpenCode 免费模型能力，首次启动无需登录即可直接进入对话界面。
- OpenCode 作为默认启用插件运行；用户仍可登录其他 AI 平台并选择更多模型。
- 增强插件管理能力，支持插件清单、安装状态、启用、停用以及运行日志。
- 插件安装流程支持进度与状态反馈，并兼容 `dsh plugin --profile web add` 安装方式。
- DeepSeek Harness 升级到 `dsh-v0.1.1-rc.2`，完成插件契约、Typert、Files、Images 和运行时兼容适配。
- Windows 环境使用 PowerShell 工具栈，后台任务和组合测试与 POSIX Bash 环境保持一致。
