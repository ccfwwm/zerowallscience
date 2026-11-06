# 系统提示词与任务导航

ZeroWall Science 的助手同时处理科研与通用任务。Electron 提供桌面和运行环境，DSH 提供对话、权限与工具执行；插件提供工具，Skill 指导流程，MCP 提供外部服务连接。

## 单一导航来源

`plugins/base/src/host/task-routing.ts` 维护任务词、推荐 Skill、工具名称与简短指引。系统提示词从这些指引生成常驻导航；Base 提供的 `zerowallTaskRouting` 服务供 Skills 搜索与自动候选推荐使用。工具检索也复用同一组规则。

导航是建议，不是可用性声明。检索结果只来自当时的工具/技能注册表，不会安装资源、启用被禁用的 Skill、连接 MCP 或提交计算。MCP 的连接、工具暴露与权限策略仍由 MCP 插件管理。

`skill_search` 检索元数据，`skill` 按名称加载正文；`capability_search` 查找工具，显式 enable 后暴露真实 Schema。工具已经可见时直接调用。外部服务可用 `mcp_search` 发现，`mcp_connect` 查询状态或刷新；标准模式和 Claude SDK 模式均沿用各自实际暴露的名称。

## 默认方向

| 交付物或操作 | 首选路径 |
| --- | --- |
| 图片、海报、改图 | `gpt-image-generator`，Images 的 `generate_image` / `edit_image` |
| 完整 PPT/PPTX | `zerowall-presentation` / `ppt-maker`，演示工作流与 `ppt_*` |
| 附件阅读 | 复用附件解析预览、`read_uploaded_file` |
| PDF、OCR、公式与复杂版面 | `mineru-document-parser`，复用 MinerU 任务和解析产物 |
| Excel、CSV 与数据整理 | `zerowall-spreadsheet`、`excel_*`；复杂计算用托管 Python |
| 真实数据图表 | 统计/绘图 Skill 与 Python/R，不用生图替代数据结果 |
| 文献检索、综述、深度研究 | `pubmed-literature`、`literature-review`；明确深度研究才使用 `deep-research` |
| 指定论文精读、比较、审稿、写作 | 对应专项 Skill；明确完整研究到论文才使用 `academic-pipeline` |
| R、GEO、NHANES、FAERS、单细胞等 | `zerowall-rmcp` 与专项 Skill，`research_workflow` / `r_files` |
| 视频、音乐、宣传片 | `media-create` 与 Videos 工具 |
| 编程、浏览器、SSH、归档等 | 原生工具、已安装插件与实时技能检索 |

PPT 默认分层可编辑，保留风格选择、内容与代表页确认。单张 PPT 配图直接走生图；普通图片不建立媒体项目。混合任务逐阶段加载能力，共用来源、解析产物与素材。

## 检索和续接

中英文分别分词，保留混合句中的 PPT/PPTX/PDF/Excel/CSV/GEO 等标识，降低泛化请求词的影响。明确的技能/工具名称优先，其次是任务导航，再是普通名称、提供方和描述匹配。新技能及第三方插件仍可由通用检索发现。

“继续”“再试一次”“查看进度”等短消息沿用最近的实际用户任务。恢复依据会话历史，不依赖进程内缓存；工具输出、技能目录不能选择新任务。没有历史时不凭空推荐任务。

模型、协议、质量、尺寸、推理强度、权限和预算沿用现有配置。失败先查询原任务并复用成功结果，不静默切换环境或重复计费。导航排序不等于模型实际遵循；真实模型、服务和文件交付需要独立验收。

## 版本与验证

提示词独立版本在 Base 的 `SCIENCE_SYSTEM_PROMPT_VERSION`；插件各自提升 semver，不联动提升桌面或 Skills 内容版本。常驻提示词不超过 3,000 字符，详细步骤留在 Skill 和实时 Schema 中。

针对性回归覆盖真实本地 Skill 目录、中英文表达、组合任务、误触发、禁用资源、元数据检索与续接，以及现有按需工具加载和 SDK 桥接。生成的提示词正文、命令日志、校验摘要与验证报告放在 `artifacts/verification/<version>/`，不作为安装器或已发布运行时验收证据。
