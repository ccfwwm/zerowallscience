---
kind: upgrade-guide
description: "ZeroWall Skills 使用统一整理目录和共享启停策略，替代重复的旧导航入口。"
---

# ZeroWall Skills 管理

[English](guide.md) | 中文

## 变更

`@zerowall/dsh-plugin-skills` 管理共享 Skill 目录。初始启用 12 个核心工作流，其他允许模型调用的内置工作流通过 `skills_manage` 搜索与启用操作按需使用。开关默认作用于所有工作区，明确的工作区覆盖优先于全局选择。手工停用项和新导入项不会自动启用。整理目录移除已有插件覆盖的旧导航 Skill、合并同类工作流，并排除缺少支持的旧 GUI 集成。已有项目与用户目录保持完整。注册表对发现和直接加载应用管理策略，Claude 投影也采用该策略。

`registerEnablementPolicy()` 返回异步释放函数。直接调用方必须等待完成；Cordis effect 在释放插件时等待该函数。

## 迁移

1. 修改 profile 前备份已有 Skill 目录。从 profile 的 `dsh-skill-filesystem` 配置中移除重复的旧内置目录，保留用户和项目目录。
2. 打开“设置 → Skills”，通过已安装包中的 `resources/audit.json` 查看新旧映射。导航替代项使用所属插件，合并项使用记录的目标入口。
3. 保持可选工作流按需可用，或按单项、专题设置开关。仅设置工作区覆盖时需要选择目录。手工或自动启用前均须完成 Python 依赖准备，失败时保留原状态。自动选择仅作用于当前进程与工作区，手工选择持久保存。导入期间不执行导入的脚本。
4. 分别在标准会话和 Claude 会话检查目录。停用项在管理器中可见，但不能加载；停用胜出定义不会激活被覆盖的副本。
