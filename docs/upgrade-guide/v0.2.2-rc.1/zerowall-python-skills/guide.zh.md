---
kind: upgrade-guide
description: ZeroWall Python 依赖和精选 Skills 使用新的环境位置及统一启停管理。
---

# ZeroWall Python 与 Skills

[English](guide.md) | 中文

## 变更

ZeroWallScience 通过 uv 依赖环境复用 DSH 内置解释器，不再读取或迁移旧 ZeroWall Python 目录、环境指针及更新进程。集成 Python 包的应用需要提供 `DSH_PYTHON_EXECUTABLE`，或允许 uv 下载资源清单指定的准确解释器版本。`ZEROWALL_PYTHON_DEPENDENCIES_ROOT` 指定依赖存储位置。验证成功后，管理服务发布 `ZEROWALL_PYTHON_ENV_ROOT`、`ZEROWALL_PYTHON_EXECUTABLE` 和 `ZEROWALL_PYTHON_SITE_PACKAGES`。可选 Skills 解析各自已经准备好的环境；自定义消费者不能根据目录名拼接解释器路径。

`@zerowall/dsh-plugin-skills` 统一管理模型加载、斜杠命令和 Claude 投影的发现与启停。12 个核心工作流默认开启；可选专题及导入内容在选择前保持停用。插件自带的使用说明替代重复的独立 Skills。远程科研模块仅在对应 Skill 存在时返回名称；`r.files`、`r.packages` 和 `r.compute` 返回 `skill: null`，使用 MCP 插件帮助。

Desktop 不再内置扩展 wheel 和 OCR 模型二进制，首次启动需联网自动准备；准备失败不阻塞应用启动。Python 默认使用清华镜像，设置提供阿里云和官方 PyPI；OCR 从 RapidAI 官方 ModelScope 国内地址下载锁定模型。部署者可设置 `ZEROWALL_OCR_MODELS_ROOT` 和 `ZEROWALL_OCR_MODEL_MIRROR`。已验证环境可以复用，不导入旧 Python 安装。

## 迁移

1. 安装当前 Science 组合包及选择的插件依赖，保持 Python、环境和 Skills 管理启用。保留旧目录作为备份，不要将旧环境复制到新依赖存储位置。
2. Desktop 正常启动后，在 Python 设置中查看核心依赖准备状态。其他载体通过文档说明的环境变量或 profile 字段提供绝对资源位置，避免指向旧环境或系统 Python 安装。
3. 打开 Skills 设置，查看精选清单、来源及依赖声明，明确启用所需可选专题。文件夹、ZIP、Markdown 和 GitHub 导入先提供预览，导入后保持停用；启用前选择项目或全局范围。
4. Python 消费者等待 `zerowallPythonManagement.ready()` 或 `resolveCapability(id)`，并使用返回的解释器。`python` 工具可通过 `capability_id` 选择已经准备好的可选专题。刷新设置不安装依赖，准备失败时明确点击重试。
5. 确认 PPT 资源可加载、核心依赖就绪后 Bio MCP 能连接、停用 Skill 从发现及直接加载中消失、导入资源仍可读取。通过随包 Skills 审计查看合并与排除条目。
