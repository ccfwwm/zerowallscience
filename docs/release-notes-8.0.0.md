# ZeroWall Science 8.0.0

- 桌面应用与插件版本分离，ZeroWall 插件首次独立版本为 0.1.0。
- 构建、缓存、验证和安装包统一进入根 artifacts 目录。
- 保留自定义 DSH 0.2.0-rc.2 核心，插件独立提供 Host、Client 和 remote 入口。
- 提供 dsh 与 zws 命令，以及独立资源 catalog 和签名验证。
- 默认 Windows 安装包不携带完整 Python 环境，支持按需安装及独立离线资源。
- 精简版首次启动只检查 Python 更新；环境下载和中断任务继续由用户操作触发。

此版本为本地架构迁移验证版，未向七牛云或 GitHub Release 发布。
