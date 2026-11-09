# ZeroWall Science 9.0

[English](README.md) | 中文

连接模型、文献、Skills、MCP 工具及本地与远程计算的科研桌面工作空间。基于 DeepSeek Harness 与 Cordis，使用 ZeroWall 业务插件组织科研工作。

[官方网站](https://zerowallscience.org/) · [使用文档](https://zerowallscience.org/docs/) · [Windows 下载](https://github.com/ccfwwm/zerowallscience/releases) · [问题反馈](https://github.com/ccfwwm/zerowallscience/issues)

## 一个工作区，连接科研步骤

通过会话组织问题、文件、执行过程与结果。连接 Zotero 和文献工具，在配置的 Python 或 SSH 环境中开展分析，收集图表、报告和可编辑演示文稿。

| 能力 | 可以完成的工作 |
|---|---|
| 模型与账户 | 登录、刷新余额和模型，或配置自定义提供方 |
| 原生 Gemini | Gemini 聊天分组使用 Google Generative Language 原生协议 |
| 图片与媒体 | 通过对应业务插件生成图片、演示文稿或视频 |
| 文献 | 连接 Zotero、检索论文，并通过 MinerU 处理文档 |
| Skills 与 MCP | 按当前工作流程启用需要的指令与工具 |
| 计算 | 配置 Python、本地执行和 SSH 资源 |
| 更新 | 桌面通过七牛更新，自有功能插件通过 npm 更新 |

名称包含**生图**的分组按图像生成处理，不注册为 Gemini 聊天模型。

## 安装与升级

从 [Releases](https://github.com/ccfwwm/zerowallscience/releases) 下载 Windows x64 安装包。Windows 发行目标为 Windows 10/11，正式应用沿用 8.x 安装身份与稳定更新渠道。

1. 关闭旧版应用，安装 9.0。
2. 查看自动导入结果，原会话、设置与凭据源文件仍保留。迁移失败不会阻止启动，可用项目先导入，未完成项在下次启动重试。
3. 打开导入会话并检查模型；Windows 无法解锁保存凭据时重新登录。
4. 打开**设置 → 更新**刷新桌面和插件版本。点击后下载，桌面安装需单独确认重启。

Windows 9.0 沿用已批准的 8.x 未签名分发方式。SHA-256 与 Ed25519 资源签名校验产物，不等同于 Windows Authenticode。无更新源的 newui 预览安装需手动安装一次。

移除旧数据前，请阅读 [9.0 迁移指南](docs/upgrade-guide/v0.2.2-rc.1/zerowall-v9/guide.zh.md)。

## 数据与凭据

Windows 正式应用使用 `%APPDATA%/zerowall-science/harness-v9`。首次启动导入默认 newui 配置和正式 8.x 会话、设置、Skills 与研究数据库。会话目录保留原始日志代际，冲突副本保留在迁移目录中。

记住的 ZeroWall 凭据使用 Windows 加密机制保存在 `credentials/vault-v9.json`，通过桌面私有 IPC 访问。导入失败时保留源文件并提示重新登录。显式设置 `DSH_HOME` 时跳过自动导入。

更换电脑前备份应用数据、外部项目与远程数据。会话记录并不包含所有外部产物。

<a id="run"></a> <a id="run-from-source"></a>

## 开发

使用 Node.js 24.9 或更新版本，以及 `package.json` 声明的 pnpm 版本。

```sh
git clone https://github.com/ccfwwm/zerowallscience.git
cd zerowallscience
pnpm install
pnpm run build:artifacts
pnpm run build:check
pnpm run start:desktop
```

桌面产品版本为 9.0.0，内置 DSH 保持 0.2.2-rc.1。不要将定制核心覆盖发布到上游同版本 npm 包。业务包位于 `@zerowall/`，采用独立版本。

从 [ZeroWall 开发指南](docs/developer/zerowall/README.zh.md)、[架构](docs/architecture.zh.md)、[桌面参考](apps/desktop/README.zh.md)和[开发说明](docs/development.zh.md)开始。Agent 指令见 [AGENTS.md](AGENTS.md)。

## 适用范围与许可证

模型输出与计算预测需要结合原始文献、方法和数据核查。对不可信代码配置适当隔离，并明确选择执行环境。

保留的 DSH 核心使用 [MIT](LICENSE)。ZeroWall 插件保留各自许可证，其中包含 AGPL-3.0-only 包，重新分发前请检查对应清单。内置依赖适用[第三方许可说明](THIRD_PARTY_NOTICES.md)，源代码和关于页面保留上游署名。
