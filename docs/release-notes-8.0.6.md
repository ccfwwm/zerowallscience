# ZeroWall Science 8.0.6

## Python 单目录运行时

- 桌面安装包不内置 Python 归档；首次启动按签名 bootstrap 清单联网下载 CPython 3.12.10 与 pip，不携带 42 个核心依赖或科研依赖归档。
- 首次启动在后台联网检查并逐包安装签名核心清单中的 42 个依赖；桌面启动不被安装任务阻塞。
- Python、pip、核心依赖和科研依赖统一使用 `%LOCALAPPDATA%\\ZeroWall Science\\Python`，任务、日志、计划和回滚记录位于该目录下的 `.zerowall`。
- 核心层要求 42 个包全部核验通过；科研层允许部分成功，已安装的包不会因为单包失败被整体回滚。
- 网络中断、镜像缺包、版本冲突和构建失败都会保留逐包结果，支持重试、指定版本安装和重启后恢复。
- Python 命令行直接进入统一运行时，可使用 `zws python shell`、`--powershell` 或 `--cmd` 执行 `python` 与 `pip`。

## 科研依赖与兼容性

- 科研清单升级为 `3.12.10-r16`，核心清单为 `3.12.10-r16-core`。
- 将 Windows 环境中的 `vedo` 固定到 `2025.5.4`，与 `brainrender`、`morphapi` 和 `vtk` 的依赖约束保持兼容。
- `pip check` 结果按具体依赖关系展示；缺少的包可以单独安装，不会隐藏已经成功安装的包。

## RMCP

- RMCP 默认地址统一为 `https://rmcp.chengxunkeji.cn/r-platform/mcp`。
- 旧的受管 RMCP profile 会在启动时归一化到 HTTPS 地址；用户自定义 MCP 记录保持不变。

## 版本与升级

- 桌面版本为 `8.0.6`，DSH 继续固定在 `0.2.0-rc.2` 的 ZeroWall fork。
- 保留账户、模型、项目、Skills、MCP 配置、第三方插件和用户环境变量引用；旧 Python 目录不读取、不迁移、不删除。
- 启动检查和每日清单检查只验证状态，不自动安装科研层、插件、Skills 或 MCP 资源。
- 基础依赖安装失败、部分完成或中断后，可以从 Python 设置页重试核心层；重试跳过已验证成功的包，并恢复失败或缺失包。
- CLI 的 `zws python shell` 与 Python 设置页命令行入口都显式使用统一 Python 解释器，并清理外部 `PYTHONHOME` / `PYTHONPATH`。
- 独立插件资源同步版本为 `plugin-base 0.1.7`、`plugin-mcp 0.2.4`、`plugin-environment 0.1.3`、`plugin-images 0.2.2` 和 `dsh-bundle-science 0.1.4`，避免覆盖已发布的旧版本内容。
- 新插件的发布依赖从当前源码读取，避免旧暂存 manifest 将更新重新锁定到旧插件；更新后的图片插件与科研组合包要求桌面 8.0.6。
