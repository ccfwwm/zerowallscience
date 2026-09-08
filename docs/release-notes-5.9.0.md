# ZeroWall Science 5.9.0

本版本适配 Academic Research Skills v3.21.2，并将 Stable 更新检查周期调整为每小时一次。

## Academic Research Skills

- 新增 `deep-research`、`academic-paper`、`academic-paper-reviewer`、`academic-pipeline` 四个模型可调用技能。
- 系统提示词会按深度研究、论文写作、同行评审和完整学术流水线意图自动选择并加载对应核心技能，无需用户输入 `/ars-*` 命令。
- 新增 16 个 `/ars-*` 用户命令，命令包装由上游 v3.21.2 可重复生成。
- 保留 DSH 文件沙箱和资源目录解析；Claude Code 专属 hooks 不移植。
- 确定性 Python 脚本和依赖继续从上游仓库按需获取，不随安装包分发。

## 更新策略

- Stable 桌面版每 1 小时检查一次更新。
- 发现新版本后自动打开更新窗口，下载和重启安装仍由用户确认。

## 模型检测

- 修复 provider 目录定时刷新、凭据更新和设置更新会重复触发全量模型探测的问题。
- 每次 Host 启动最多自动探测一次；后续真实模型请求只由“检测全部模型”或单模型检测按钮触发。
- “同步模型”和后台目录更新只刷新模型元数据，不发送推理请求。

## 桌面交互与系统提示词

- 修复消息复制按钮在 Electron 中无响应的问题，桌面版优先使用主进程剪贴板，并保留浏览器降级路径。
- 将 ARS 自动技能路由直接融合到 ZeroWall Science 主系统提示词，移除技能插件追加的独立提示词段落。

## 许可与来源

ARS 内容及 DSH 适配层遵循 CC-BY-NC-4.0，来源为 `Imbad0202/academic-research-skills` v3.21.2，经 `nullptr-DZF/dsh-academic-research-skills` 适配。详见 `docs/academic-research-skills-NOTICE.md` 和随包许可证文件。
