# ZeroWall Science 7.3.0 发布说明

## Harness 与插件

- 内置 DSH Harness 升级至 `dsh-v0.1.7-rc.2`。
- Better Sidebar 升级至 `0.22.1`，GenUI 升级至 `0.11.2-preview.1`，Free Search 升级至 `0.5.0`。
- 保留定制的 `dsh-file-review` 审阅流程、科研工具和现有界面行为。

## 运行时与打包

- 使用 Electron `43.0.0`、Node.js `24.9.0` 和 pnpm `11.7.0`。
- 安装包内置签名的 Python 基础环境。检测到旧 Python profile 时，直接从内置基础包重建共享环境；运行路径可在设置中修改。
- 安装包移除 Claude Code 运行时，同时保留 Anthropic API 和 Claude Science 模型路由。
- Harness 原生文件底层能力继续服务于定制侧边栏和文件审阅。
