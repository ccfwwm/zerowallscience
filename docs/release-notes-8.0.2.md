# ZeroWall Science 8.0.2

## 本地候选版本

8.0.2 增加了 ZeroWall 扩展中心和桌面资源桥接，用于统一查看和手动管理插件、Skills 与 MCP 资源。

- 启动检查和每日检查只读取签名 catalog，不自动下载、安装或重启。
- 插件更新继续使用 candidate profile、健康检查和事务回滚。
- Skills 支持独立目录更新与热刷新；MCP 支持连接配置和 Server 资源分离管理。
- 更新任务保存在用户数据目录，桌面重启后会保留结果和失败原因。
- `dsh` 命令语义保持官方兼容；`zws extensions check/status`、资源检查和按资源回滚接口已加入。
- Python 环境仍按 generation 和 snapshot 管理，不随桌面包重新打入完整环境。

本版本只生成本地 Windows x64 候选安装包，不上传七牛云、不更新桌面 `latest` 指针、不创建 GitHub Release 或公开插件仓库。独立插件、Skills、MCP 包和签名 catalog 等待本地安装验证完成后再发布。
