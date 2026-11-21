---
kind: package-reference
description: "通过 DSH 共享注册表管理整理后的科研工作流与导入的 Skills。"
---

# @zerowall/dsh-plugin-skills

[English](README.md) | 中文

## 使用

在设置中的 Skills 或本插件配置页打开管理器。初始启用 12 个独立核心工作流。其他允许模型调用的内置工作流可按需使用：`skills_manage` 根据任务搜索，在当前会话工作区临时启用匹配工作流，再由 Skill 工具读取完整指令。临时启用只作用于当前工作区。开关默认管理所有工作区；用户也可以为单个 Skill 或专题设置全局状态或所选工作区状态。手工关闭优先于自动启用。用户可通过斜杠直接调用可选内置工作流，无需将其加入模型发现目录。加载依赖型工作流会在后台准备声明的 Python 能力，Python 工具在执行前等待环境就绪；隐藏的 Python 工具可通过工具搜索发现。模型明确按名称加载时可以读取可选工作流，初始目录仍保持精简，手动禁用仍优先。加载核心 research-integrity 指令无需 Word 依赖；生成报告时才按需准备文档依赖。

文件夹、ZIP、Markdown 和公开 GitHub 来源均先预览。GitHub 来源固定到解析出的提交，同名冲突须明确选择替换。导入项保持停用，直到用户开启，并保留 frontmatter 中的 `disable-model-invocation` 与 `user-invocable` 调用控制。只有允许模型调用的内置工作流支持自动启用；仅手工调用的指令和用户导入项仍需手动开启。预览和导入期间不会运行脚本或安装器。移除导入项时取消注册，同时保留文件和备份元数据。

## 来源与状态

插件区分别提供“科研诚信”和“DeepMind 科学研究”页面，保留诚信检查、报告工具和维护的检测资源。软件包包含固定版本 DeepMind 来源的全部 40 个带命名空间的 science-research 工作流，以及脚本、来源哈希和许可证声明。其 Python 环境仅在使用时准备。插件 → Skills 独立读取在线目录；新增套装无需升级 Desktop 或其他插件即可安装。

插件说明显示在所属插件详情的“使用说明”中，开关仅控制向模型提供的说明，与插件启停独立。内置条目通过 `metadata.ownerPackage` 声明归属，`providerOwners` 映射官方 provider，无需修改官方包。没有组合包页面的所属包，会根据注册表生成以包名标识的详情入口；已有组合包页面不会重复显示。入口随插件管理变更刷新，并随客户端作用域释放。项目和用户覆盖项仍按实际来源显示在 Skills 中。注册表继续向 Skill 工具、PPT 按需工具和 Claude 投影提供已启用的说明。`resources/plugin-instructions.json` 记录已整理的重复副本，活动说明与第三方声明由所属包维护。

共享注册表提供插件、项目和用户来源、同名胜出选择及启停策略。停用和被覆盖的条目仍可查看。标准 DSH 和 Claude 消费方采用相同策略。插件使用说明由所属插件提供，整理包不提供重复的导航 Skill。

资源整理脚本由 `scripts/curate-sources.json` 驱动，保留本地 Nature 快照的 23 个可调用 Skill、BioNeMo Agent Toolkit 的 47 个 Skill，以及来源哈希、单 Skill 哈希、运行前置条件和上游许可证声明。`nature-shared` 只作为内部资源，不作为独立调用目标。BioNeMo Skill 不会自动安装 CUDA、Docker、模型权重、NIM 容器或凭据；GPU、Docker、联网和凭据要求只作为显式前置检查。

`research_integrity` 的 `start` 只询问缺失的范围选项，记录 `research-integrity/requested` 并返回预检结果。所选 Skill 执行检查并裁决证据；`report`、`resume` 将 schema-1 证据清单编译为不可变修订，提供简明结论、默认 10 条重点、内嵌图片、可编辑数据表和原文摘录。离线 HTML、可编辑 Word 与 PDF 共用一份报告数据；Word 优先展示重点证据，附录保留其他全部发现及证据。`status` 查询最新修订，`export` 通过共享 Office 服务重试 PDF。PDF 失败会保留 Word/HTML 并记录部分完成。工具不写入 `research-integrity/completed`；编译报告不等于运行检测。相似信号与缺失材料不会直接写成已证实造假。

组合配置停用 profile 的 `skill` 行，并将本包的 `./registry` 入口挂载为唯一活动注册表。标准文件系统提供方与 Skill 工具保持启用。扩展后的注册表随 ZeroWall 包发行，并保留 DSH 的 MIT 许可；不重复发行修改过的官方版本。

`resources/audit.json` 记录全部 287 份旧指令：保留 202 个入口、18 项由插件替代、34 项合并、32 项排除、1 项作为共享资源。`catalog.json` 维护描述、专题、许可证及依赖能力标识；`capabilities.json` 列出 Python 依赖。固定版本的 Academic Research 脚本和共享资源保留许可证及声明，上游 CLI hooks 不启用。

状态原子写入所选 DSH 主目录下的 `zerowall-skills`。`home` 和 `resources` 可覆盖存储目录与资源目录。安装位置从包位置解析；发行指令不嵌入开发机的用户或项目路径。Desktop 通过本包的 `zerowall.asarUnpack` 声明将清单、指令及配套脚本解包为物理文件。

## 限制

本地导入拒绝符号链接。压缩包上限为压缩后 64 MiB、展开后 256 MiB、10,000 个成员；解压前拒绝越界路径。操作失败时保留原有注册表策略。远程能力、GPU 模型权重及外部账户以实际可用性为准；启用指令不会创建这些资源。

随包科研工作流使用 zerowallrmcp 服务名称及 mcp__zerowallrmcp__ 工具前缀；历史导入清单保留原来源名称。

MinerU 插件提供可发现的 mineru-document-parser 指令。PDF 流程请求 Precision 与 OCR，并将 parse-manifest.json 交给检测器。图内 OCR 默认使用本地 RapidOCR 和图片哈希缓存；导入的 OCR 回执必须匹配源文件并回流数值审计。显式关闭 OCR 会保留应检查数量和未完成状态。缺少 Token、OCR 失败或材料不完整均明确显示。报告导出需要托管 Python 的 skill-integrity-report 能力，PDF 还需要 officeToPdf。证据路径必须位于工作区，发布前重新核对哈希。整理脚本保留本包维护的图像核验 Skill；research-integrity 指令来自 scripts/templates/research-integrity.md。
