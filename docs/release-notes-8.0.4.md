# ZeroWall Science 8.0.4

## Python 运行环境

- 默认使用 `%LOCALAPPDATA%\\ZeroWall Science\\Python`，不再迁移旧 Roaming Python 路径。
- 安装包只初始化轻量基础运行层；科研和生信依赖改为显式按需安装。
- 启动时只检查清单和本地环境，不自动安装完整科研依赖。
- Python 页面显示稳定路径、核心层、科研层和可选能力层状态。

## RMCP

- 启动后后台自动连接 RMCP。
- 区分缺少凭据、连接中、工具发现中、连接成功但工具为 0 和连接失败。
- 工具列表在 `tools/list` 完成后重新注册，避免界面错误显示空工具。
- 修正 DSH 吞掉启动异常后被误报为“已连接但无工具”的情况；仅迁移内置 RMCP 和 Bio Tools 的启动错误策略，保留第三方 MCP 配置。
- 核心 Python 层包含 42 个固定版本依赖，可实际启动 Bio Tools；529 个科研依赖仍单独按需安装。旧 pip-only 环境会显示“修复核心运行环境”，确认后用签名离线包建立新 generation，保留旧环境。
- 重新打包的 Windows 候选包使用构建 ID `20261005-rmcp-core-v8`。本次不发布线上更新。
- 最终打包 Host 和 MCP 设置页验证 Bio Tools 正常连接并注册 8 个工具、Ketcher 7 个工具；缺少 RMCP 凭据时明确显示等待凭据。

## 生产服务验证限制

- 本次从开发机访问 `103.217.185.141` 的 SSH 22、历史 SSH 50537 和 MCP 8099 均连接超时，尚未连接生产机或更改服务。
- 客户端错误投影与本地 Bio Tools 已分别修复；这不代表远端 RMCP 服务已恢复。待生产地址可达后，仍须执行带凭据的 initialize、tools/list 和最小健康调用。
- 该候选 EXE 未作 Authenticode 签名；签名 Python 清单仍使用正式 stable-3 信任根。完整构建来源、哈希、跳过项和生产限制见 `docs/rmcp-8.0.4-repair.zh-CN.md`。

## 历史会话

- 兼容已知的 `zerowall/reviewer/report` opaque 历史事件。
- 原始 session JSONL 保持不变，迁移只生成新的历史副本。
