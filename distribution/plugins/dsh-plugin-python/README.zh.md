# @zerowall/dsh-plugin-python

[English](README.md) | 中文

## 摘要

ZeroWallScience 复用 DSH 内置 CPython 3.12.14 和 uv 0.13.7。首次启动在后台准备哈希锁定的科学计算、MCP 和 OCR 依赖；扩展 wheel 与 OCR 模型使用下载方式，不内置于 Desktop。设置页显示 Python 与 OCR 状态、进度和重试入口；应用启动和普通 PPT 编辑不等待网络。

依赖使用新的不可变环境代际，验证后原子切换；运行中的消费者继续使用原代际。明确添加依赖和回滚不修改 DSH 解释器。可选 Skill 主题仅在启用时准备独立环境，依赖版本与核心分开。

回滚通过一次指针提交恢复保存的前一代际。重复回滚会保留已经恢复的代际；下一次安装成功时记录新的回滚目标。

安装失败时丢弃未完成的代际，保留当前环境；写锁保证不同 Host 不会同时修改。读取 Skill 依赖路径不会安装或重试缺失依赖。停用插件时先取消并等待依赖命令退出，再完成释放。

## 使用

Desktop 通过 `DSH_PYTHON_EXECUTABLE` 提供基础解释器。npm 包携带 uv、哈希锁、清单和许可证，不携带扩展 wheel 或模型二进制。首次准备需要网络，已验证环境与模型可离线复用。独立 npm 载体未提供 DSH Python 时通过 uv 获取指定版本；不查找或迁移系统 Python、Conda 及旧 ZeroWall 环境。

路径由环境变量或 profile 提供：

| 环境变量 | 用途 |
| --- | --- |
| `DSH_PYTHON_EXECUTABLE` | DSH 基础解释器的绝对路径 |
| `DSH_HOME` | DSH 用户数据目录，包含默认依赖存储 |
| `ZEROWALL_PYTHON_DEPENDENCIES_ROOT` | 依赖代际和记录的目录 |
| `ZEROWALL_PYTHON_ASSETS_ROOT` | 对应目标平台的清单、uv 和哈希锁 |
| `ZEROWALL_PYTHON_WHEELHOUSE` | 可选绝对目录，包含清单锁定的核心 wheel |
| `ZEROWALL_UV_EXECUTABLE` | 可选 uv 路径，版本必须与资源一致 |
| `ZEROWALL_PYTHON_INDEX_URL` | 核心与专题使用的 HTTPS 索引；默认清华，设置提供阿里云和官方 PyPI 选项 |

在 Python 设置中确认的软件包索引原子保存到依赖存储的 `settings.json`，下次启动时优先于 profile 或环境变量提供的初始值。索引 URL 不得包含凭据、查询参数或片段。保存失败时保留当前配置；诊断不返回命令错误输出，子进程不继承令牌、密钥、secret 或密码变量。

核心安装按 `core.lock` 执行强制哈希校验，并只使用二进制 wheel。仅显式配置 `ZEROWALL_PYTHON_WHEELHOUSE` 时启用离线来源，不自动选择源码检出的旧 wheel 目录。明确指定目录无效时停止准备；可选专题独立于自动准备的核心环境。

准备后向消费者发布 `ZEROWALL_PYTHON_ENV_ROOT`、`ZEROWALL_PYTHON_EXECUTABLE` 和 `ZEROWALL_PYTHON_SITE_PACKAGES`；消费者先等待就绪再启动进程。子进程环境移除外部 Python 和 Conda 覆盖变量，不写死安装目录、用户名和旧环境路径。

当前目标元数据覆盖 Windows x64，其他平台交付前须准备匹配资源。OCR V5 使用 RapidAI 官方 ModelScope 国内固定版本地址，并锁定大小和 SHA-256。模型默认保存在 `DSH_HOME` 下的可写目录；`ZEROWALL_OCR_MODELS_ROOT` 可覆盖目录，`ZEROWALL_OCR_MODEL_MIRROR` 可指定兼容的 HTTPS 镜像目录。半成品不会成为可用模型；下载最多尝试 `downloadAttempts` 次（默认 3），每次由 `timeoutMs` 限时。停用插件会取消并等待准备结束。

## 开发

在仓库根目录构建并检查压缩包：

```sh
pnpm run zerowall:build
pnpm run zerowall:pack
```

使用 `node distribution/scripts/prepare-python-runtime.mjs --python <absolute-target-interpreter> --target win-x64 --refresh-lock` 重新生成平台资源。省略 `--refresh-lock` 时保留已提交的锁文件。`--download-wheels` 将可选验收文件写到发布资源之外的 `.artifacts/python-downloads`。再发行时保留 uv 与 OCR 的许可证。

Python 设置展示实际 uv 版本，通过 catalogIndexUrl 搜索包名，并支持模糊筛选包名和版本。包目录默认使用阿里云 Simple 索引，与控制依赖安装的 indexUrl 相互独立。选择准确版本后先预览兼容依赖计划，再明确应用。查询失败不改变当前环境。
