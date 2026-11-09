# @zerowall/dsh-plugin-mcp

[English](README.md) | 中文

## 摘要

管理 MCP 连接与凭据引用。databasePath 可指定 SQLite；默认使用 ZEROWALL_RESEARCH_DB，未设置时使用 DSH home 下的 zerowall/research.sqlite。连接中新发现的工具从后续模型步骤开始可用；Host 拒绝对话直接执行远程 R 项目管理。

## 使用

ZeroWall Desktop 根据安装清单选择此包。在插件页检查状态和插件提供的配置。验证基线为 DSH 0.2.2-rc.1 和 Node.js 24.9 或更新版本。更新时保留已有配置与数据。

Python MCP 连接等待 Python 依赖服务准备完成后再启动。解释器、环境和依赖路径使用 `ZEROWALL_PYTHON_EXECUTABLE`、`ZEROWALL_PYTHON_ENV_ROOT` 和 `ZEROWALL_PYTHON_SITE_PACKAGES`。Node 与 HTTP 连接不等待 Python。依赖失败会显示在连接状态中；先重试 Python 准备，再重新连接。

Bio Tools 和 Ketcher 资源随本 npm 包提供；SciMaster 服务从锁定的官方 npm 依赖原样复制，并附带许可证。桌面安装包将资源树保留在 ASAR 外。绝对路径环境变量 `ZEROWALL_BIO_TOOLS_ROOT`、`ZEROWALL_KETCHER_ROOT` 和 `ZEROWALL_SCI_ROOT` 可选择其他资源目录；`ZEROWALL_SCIMASTER_ENTRY` 可选择其他 SciMaster 入口。Node 使用 `DSH_DESKTOP_NODE_EXECUTABLE` 或当前 Host 可执行文件。资源查找不检查旧 Python 安装。

科研工作流模块仅在保留相应 Skill 时声明关联。遗传学使用 `zerowall-mr`，OmicVerse 使用 `zerowall-omicverse`；计算、文件传输和包管理直接提供操作参数。

详细工作流及历史平台要求见[保留的迁移参考](migration-reference.md)。当前依赖版本以包清单为准。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

再发行时保留包内 LICENSE 及第三方声明。

保留的 R 服务名称为 zerowallrmcp，工具前缀为 mcp__zerowallrmcp__。启动时迁移 rmcp 和 zerowall-rmcp 配置，保留凭据及用户配置。远程服务地址与已有会话项目绑定保持原身份。
