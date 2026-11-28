# @zerowall/dsh-claude-coderun

[English](README.md) | 中文

## 摘要

插件内置 Anthropic Claude Agent SDK `0.3.330`。CLI 版本由独立配置管理。

保留定制 Claude CLI、原生会话恢复、权限、Skills 与 MCP 桥接及用量统计。打开插件配置页管理独立运行时、账号与模型；首次启用在后台自动检测和准备 CLI，不依赖 AI 云登录。

## 使用

ZeroWall Desktop 根据安装清单选择此包。打开「插件 → Claude Code 运行器」查看运行时状态、安装或更新 CLI，以及管理插件设置。在会话模式选择器中选择 Claude Code 即可在会话中使用它。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

在 Claude Code 模式下，AI 云模型使用所选分组的 Sub2API Messages 接口（`POST /v1/messages`），也适用于标准模式中使用 OpenAI 或 Gemini 协议的模型。分组是否支持所选模型通过 Messages 调用，由网关决定。使用手动配置的提供方时，请选择 Anthropic Messages 路由。

运行准备使用 Desktop 提供的独立 Node 与 pnpm 路径，不使用个人 Claude 安装。安装脚本的 PATH 优先使用内置 Node 目录；隔离依赖采用扁平目录，缩短 Windows 安装脚本所在的路径。插件 Config 默认 `version: 2.1.309`、`registry: https://registry.npmmirror.com` 和 `autoInstall: true`。数据目录默认为 `DSH_HOME/zerowall/claude-code/runtime`，可通过 `runtimeRoot` 或 `ZEROWALL_CLAUDE_RUNTIME_ROOT` 覆盖。状态刷新只执行限时版本探测，不安装或移动激活指针。自动准备、手动安装和会话启动共享任务；候选失败保留有效版本。退出时取消并等待安装进程树结束；明确卸载会持久化禁止自动安装的状态，手动安装可恢复。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。

Claude 使用当前会话的 Host 工具桥接 MCP，支持按需能力发现。会话插件目录包含启用的 Skills 并保留相对资源，包括从 Desktop ASAR 归档复制给原生 CLI 的资源。外部 MCP 凭据和直接连接配置由 Host 管理。Host 工具 NAME 在 Claude 中调用为 mcp__zerowall__NAME；Skills 中的 MCP 引用也会转成桥接名称。注册变化会刷新会话工具定义；工具操作启用新 Skills 后会同步投影。
