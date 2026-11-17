---
kind: upgrade-guide
description: ZeroWall 文献插件使用原生会话附件和官方环境初始化。
---

# ZeroWall 文献与环境配置

[English](guide.md) | 中文

## 变更

ZeroWallScience 通过 `@zerowall/dsh-plugin-mineru` 提供 MinerU，通过 `@zerowall/dsh-zotero/pubmed` 提供 PubMed。环境服务启动时自动校验官方签名配置并补全缺失变量。用户明确删除的变量及自定义值继续生效；安全存储错误会阻止依赖服务初始化。MinerU 不接受旧版 `file-sha256:` 附件标识和任意本地文件路径。

## 迁移

1. 使用当前 ZeroWallScience 组合包，或在配置中添加 `@zerowall/dsh-plugin-mineru` 和 `@zerowall/dsh-zotero/pubmed`。独立使用 MinerU 时环境插件可选，通过标准 DSH 凭据或启动环境提供 `MINERU_API_TOKEN`。移除单独注册的旧版 PubMed 或 MinerU，避免重复工具。
2. 通过 DSH 原生会话附件（`sha256:` 标识）提供文件，或选定工作区并使用其中的文件。覆盖标准用户数据目录时设置 `DSH_HOME`，不要把安装路径写入配置。
3. 打开环境设置查看同步状态。重试只补全缺失值；恢复官方默认会明确替换官方变量。在同一页面配置自定义 MinerU 和文献服务凭据。
4. 确认 MinerU 和文献设置可读取，工具只出现一套。已有 MinerU 任务使用原工作区中的任务记录及原任务编号恢复。PubMed 图谱草稿只属于当前对话，不作为持久研究数据迁移。

MinerU 0.1.1 的自动模式在无 Token 时选择远程 Agent API。科研工作流必须显式请求 `mode: "precision", isOcr: true`，缺少 Token 时停止。插件提供 `mineru-document-parser` 技能。长本地 PDF 使用运行编号恢复；现有任务编号继续支持。通过插件管理器将 MinerU 和环境插件更新至 0.1.1、技能和 Science 更新至 0.1.2；无需更新桌面安装包。
