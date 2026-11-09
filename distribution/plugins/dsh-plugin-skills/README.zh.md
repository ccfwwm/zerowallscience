---
kind: package-reference
description: "通过 DSH 共享注册表管理整理后的科研工作流与导入的 Skills。"
---

# @zerowall/dsh-plugin-skills

[English](README.md) | 中文

## 使用

在设置中的 Skills 或本插件配置页打开管理器。初始启用 12 个独立核心工作流。其他允许模型调用的内置工作流可按需使用：`skills_manage` 根据任务搜索，在当前会话工作区临时启用匹配工作流，再由 Skill 工具读取完整指令。临时启用只作用于当前工作区。开关默认管理所有工作区；用户也可以为单个 Skill 或专题设置全局状态或所选工作区状态。手工关闭优先于自动启用。可选 Python 依赖准备成功后才能启用或按需调用。加载指令只解析已有依赖环境，不安装包。

文件夹、ZIP、Markdown 和公开 GitHub 来源均先预览。GitHub 来源固定到解析出的提交，同名冲突须明确选择替换。导入项保持停用，直到用户开启，并保留 frontmatter 中的 `disable-model-invocation` 与 `user-invocable` 调用控制。只有允许模型调用的内置工作流支持自动启用；仅手工调用的指令和用户导入项仍需手动开启。预览和导入期间不会运行脚本或安装器。移除导入项时取消注册，同时保留文件和备份元数据。

## 来源与状态

插件说明显示在所属插件详情的“使用说明”中，开关仅控制向模型提供的说明，与插件启停独立。内置条目通过 `metadata.ownerPackage` 声明归属，`providerOwners` 映射官方 provider，无需修改官方包。没有组合包页面的所属包，会根据注册表生成以包名标识的详情入口；已有组合包页面不会重复显示。入口随插件管理变更刷新，并随客户端作用域释放。项目和用户覆盖项仍按实际来源显示在 Skills 中。注册表继续向 Skill 工具、PPT 按需工具和 Claude 投影提供已启用的说明。`resources/plugin-instructions.json` 记录已整理的重复副本，活动说明与第三方声明由所属包维护。

共享注册表提供插件、项目和用户来源、同名胜出选择及启停策略。停用和被覆盖的条目仍可查看。标准 DSH 和 Claude 消费方采用相同策略。插件使用说明由所属插件提供，整理包不提供重复的导航 Skill。

组合配置停用 profile 的 `skill` 行，并将本包的 `./registry` 入口挂载为唯一活动注册表。标准文件系统提供方与 Skill 工具保持启用。扩展后的注册表随 ZeroWall 包发行，并保留 DSH 的 MIT 许可；不重复发行修改过的官方版本。

`resources/audit.json` 记录全部 287 份旧指令：保留 202 个入口、18 项由插件替代、34 项合并、32 项排除、1 项作为共享资源。`catalog.json` 维护描述、专题、许可证及依赖能力标识；`capabilities.json` 列出 Python 依赖。固定版本的 Academic Research 脚本和共享资源保留许可证及声明，上游 CLI hooks 不启用。

状态原子写入所选 DSH 主目录下的 `zerowall-skills`。`home` 和 `resources` 可覆盖存储目录与资源目录。安装位置从包位置解析；发行指令不嵌入开发机的用户或项目路径。Desktop 通过本包的 `zerowall.asarUnpack` 声明将清单、指令及配套脚本解包为物理文件。

## 限制

本地导入拒绝符号链接。压缩包上限为压缩后 64 MiB、展开后 256 MiB、10,000 个成员；解压前拒绝越界路径。操作失败时保留原有注册表策略。远程能力、GPU 模型权重及外部账户以实际可用性为准；启用指令不会创建这些资源。

随包科研工作流使用 zerowallrmcp 服务名称及 mcp__zerowallrmcp__ 工具前缀；历史导入清单保留原来源名称。
