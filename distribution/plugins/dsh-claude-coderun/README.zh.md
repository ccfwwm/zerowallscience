# @zerowall/dsh-claude-coderun

[English](README.md) | 中文

## 摘要

保留定制 Claude CLI、原生会话恢复、权限、Skills 与 MCP 桥接及用量统计。打开插件配置页管理独立运行时、账号与模型；首次启用在后台自动检测和准备 CLI，不依赖 AI 云登录。

## 使用

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

运行准备使用 Desktop 提供的独立 Node 与 pnpm 路径，不使用个人 Claude 安装。安装脚本的 PATH 优先使用内置 Node 目录；隔离依赖采用扁平目录，缩短 Windows 安装脚本所在的路径。插件 Config 默认 `version: 2.1.309`、`registry: https://registry.npmmirror.com` 和 `autoInstall: true`。数据目录默认为 `DSH_HOME/zerowall/claude-code/runtime`，可通过 `runtimeRoot` 或 `ZEROWALL_CLAUDE_RUNTIME_ROOT` 覆盖。状态刷新只执行限时版本探测，不安装或移动激活指针。自动准备、手动安装和会话启动共享任务；候选失败保留有效版本。退出时取消并等待安装进程树结束；明确卸载会持久化禁止自动安装的状态，手动安装可恢复。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。

Claude 使用当前会话的 Host 工具桥接 MCP，支持按需能力发现。会话插件目录包含启用的 Skills 并保留相对资源；外部 MCP 凭据和直接连接配置由 Host 管理。Host 工具 NAME 在 Claude 中调用为 mcp__zerowall__NAME；Skills 中的 MCP 引用也会转成桥接名称。注册变化会刷新会话工具定义；工具操作启用新 Skills 后会同步投影。
