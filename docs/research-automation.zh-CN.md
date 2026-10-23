# 研究上下文自动化与 RMCP 路由

本次变更消除研究入口要求用户手动注册工作区或创建 Study 的前置步骤。系统自动补齐研究对象；科学校验、来源校验和权限仍由 Host 与 Runner 执行。桌面版本保持 `8.4.7`，DSH 保持现有 pin。

## 自动研究上下文

- Research Host、`research_study`、`research_workflow` 与相关 Runner 使用统一的 `ensureResearchContext`。
- Store 在事务中按规范化工作区、会话和目标指纹建立持久绑定，复用或创建 Project/Study。重复、并发和重启重试不会重复创建同一上下文。
- 有用户原文时，各入口统一使用最近的用户研究请求识别目标；工具摘要只作为无用户文本会话的备用，避免摘要与内部调用分别绑定不同 Study。
- 当前已选且目标适用的 Study 优先复用；空 Study 自动补齐草稿。续接、进度消息复用当前目标。仅未编辑的自动草稿允许原地吸收首次目标或严格追加的目标细化。
- 新目标不修改已冻结、已有任务或用户已编辑的研究对象。不同工作区保持隔离，冻结快照保持不可变。
- 系统生成 question、dataset-contract、analysis-plan 三类草稿。未知来源、变量及分析方法继续标记为 pending/unknown；不会创建虚假的可执行任务或分析结果。

## 自动 Gate 与可继续的工作

公开目录查询、用户目标范围内的检索、下载和草稿整理不等待研究 Gate。Biomni 预取不要求冻结分析计划，但继续保留原有 `confirm` 授权。凭据、受限数据和数据传出仍按已有权限处理。

正式分析前，Host 自动校验问题、结构化研究对象及结局/估计量、计划、来源契约和相关输入。全部通过后自动审批 Gate 1 并冻结；审计记录标记 `system-validation`、`research-gates-2`、文档版本/哈希和冻结快照。界面显示“系统校验通过”，不把系统审批标成人工审批。

Gate 2 每次重新执行确定性的声明、证据和 Run 审计。失败时返回 pending 与阻断项；正式报告请求仍生成可审阅草稿，并显示受影响阶段和恢复条件。报告按钮可直接触发系统校验，不要求先到其他页面手工批准。

来源核验凭据只由 Store 对实际输入执行检查后产生，并绑定契约 ID/版本/内容哈希、资产版本、真实路径、文件哈希和列名。模型填写的 verification/audit/metadata 不构成系统核验凭据。冻结复用时仍重查来源，导入快照不继承来源信任。

### 当前来源核验范围

当前系统来源核验器支持工作区内、最大 64 MiB 的 UTF-8 CSV/TSV 文件及列身份核验。跨工作区、符号链接越界、URI 不匹配、缺少变量、文件变化或不支持的格式会返回可恢复阻断。

NHANES 和遗传正式分析尚无独立的远程来源及变量核验接口。带有 `nhanesSurvey` 或 `genetics` 的正式计划会返回 `CONTRACT_VERIFIER_UNAVAILABLE`，不会用本地小 CSV 的核验结果替代远程数据集证明。检索、下载和探索准备可继续，探索执行仍须通过 Runner 自身的参数、契约和权限检查。

## RMCP 与 GPSAdb

系统提示词及对应 Skill 主动识别 R、统计、生信、GEO、NHANES、遗传、单细胞、空间和多组学任务，并按当前 Host 工具定义调用服务。

| 任务 | 默认 Skill / 服务路径 |
| --- | --- |
| R 计算 | `zerowall-rplatform`，默认 RMCP 远程计算 |
| 文件传输、包状态 | `zerowall-r-files`、`zerowall-r-packages` |
| GEO、NHANES | `zerowall-geo`、`zerowall-nhanes` |
| 基因、蛋白、数据库查询 | `zerowall-rbioagent` |
| AnnData、单细胞、空间、多组学 | `zerowall-omicverse` 与对应专项 Skill |

连接未知时按需调用 `mcp_connect`，再使用实时 Schema。断连或缺凭据时说明远程步骤及恢复条件，继续可独立完成的准备；不静默改成本地 R。附件和检索内容继续视为非可信数据。

GPSAdb 使用独立保留标识 `gpsadb` 与 `https://gpsadb.gzdlab.com/mcp`，不与 RMCP 共用连接身份。首次默认启用，无需凭据；后续启动保留用户禁用或删除的选择。只开放已核对的 12 个只读工具。上游文档：<https://gpsadb.gzdlab.com/help/mcp>。

## MCP / Skills 设置界面

MCP DTO 保留旧的 `tools: string[]`，新增可选 `toolDetails`。Schema 只传递经安全过滤的 JSON 值，并限制深度、节点数和载荷大小。参数卡片支持搜索、折叠，显示类型、必填、枚举、默认值和说明；完整 Schema 可展开，缺失或超限时显示明确提示。

MCP 和 Skills 使用容器宽度响应布局，工作区作为主要滚动区域。窄容器使用选择器，使详情首屏可见；Skills 无有效选择时显示第一条可用项。长名称、工具参数和长正文可以换行，保留加载、空、错误状态。托管连接字段及启停、保存、重连权限沿用原合同。

## 独立版本与交付范围

| 组件 | 新版本 |
| --- | --- |
| Base | `0.1.25` |
| Research | `0.1.22` |
| Research Store | `4.1.4` |
| MCP | `0.2.17` |
| Skills 设置插件 | `0.2.8` |
| 系统提示词 | `8.4.7-research-rmcp.2` |

修改的 16 个 RMCP/研究 Skill 升至 `0.1.3`。共享研究写作策略变化还涉及 academic-paper、academic-pipeline、deep-research（`0.1.4`）、academic-paper-reviewer（`0.1.3`）和 zerowall-fiji（`0.1.2`）；未修改资源不升版。

详细测试、受限构建、原生包大小/SHA-256 与布局证据保存在 `artifacts/verification/8.4.7/research-automation-20261023/`。本次不升级 DSH，不构建安装器，不发布资源或改动桌面更新指针。
