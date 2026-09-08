# ZeroWall Science 5.9.0

本版本适配 Academic Research Skills v3.21.2，并将 Stable 更新检查周期调整为每小时一次。

## Academic Research Skills

- 新增 `deep-research`、`academic-paper`、`academic-paper-reviewer`、`academic-pipeline` 四个模型可调用技能。
- 新增 16 个 `/ars-*` 用户命令，命令包装由上游 v3.21.2 可重复生成。
- 保留 DSH 文件沙箱和资源目录解析；Claude Code 专属 hooks 不移植。
- 确定性 Python 脚本和依赖继续从上游仓库按需获取，不随安装包分发。

## 更新策略

- Stable 桌面版每 1 小时检查一次更新。
- 发现新版本后自动打开更新窗口，下载和重启安装仍由用户确认。

## 许可与来源

ARS 内容及 DSH 适配层遵循 CC-BY-NC-4.0，来源为 `Imbad0202/academic-research-skills` v3.21.2，经 `nullptr-DZF/dsh-academic-research-skills` 适配。详见 `docs/academic-research-skills-NOTICE.md` 和随包许可证文件。
