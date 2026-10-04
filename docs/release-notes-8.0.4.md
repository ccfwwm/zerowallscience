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

## 历史会话

- 兼容已知的 `zerowall/reviewer/report` opaque 历史事件。
- 原始 session JSONL 保持不变，迁移只生成新的历史副本。
