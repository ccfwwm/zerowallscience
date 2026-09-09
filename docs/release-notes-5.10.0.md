# ZeroWall Science 5.10.0

本版本更新文献研究工作流、中文报告图表和科研 MCP 环境适配，提供 Windows x64 Stable 安装包。

## 文献研究工作流

- `zerowall-literature` 每次只处理一篇主文章，并为每篇文章使用独立工作目录。
- 输入表格检测到多个主文章标题时直接拒绝，避免不同研究任务混淆。
- `papers.xlsx` 使用扁平、可筛选工作表，数组和对象字段会转换为可读的标量文本，不再生成 TSV sidecar。
- 报告使用中文说明，保留英文引文原文，并输出引用上下文、作者档案、PDF 状态和去重账本。

## 图表与报告

- 统计图优先使用 Microsoft YaHei、SimHei 或其他可用 CJK 字体，修复中文标题、坐标轴和状态标签显示为方框的问题。
- 图表来自真实任务数据，报告同时提供 Markdown 数据表和 PNG 统计图。

## MCP 环境更新策略

- 新安装首次启动时下载并校验完整签名 MCP 环境。
- 已安装用户启动时只在签名 manifest 的环境版本、内容修订或归档 SHA-256 变化时更新 MCP。
- 更新使用双槽原子切换，健康检查失败时保留当前可用环境并支持回滚。
- MCP 环境与桌面应用版本解耦，便于只发布 MCP 内容更新。
- MCP 设置页显示本地版本、在线版本和更新结果；更新失败时明确显示原因，同时保留旧环境继续工作。

## Python 环境

- 设置中新增独立“Python 环境”页面，可检测 Python 版本、解释器路径、环境状态和已安装包数量。
- 支持搜索/查看已安装包，输入 PyPI 包名或版本约束后自动安装。
- 用户安装包写入独立 overlay，不修改签名 MCP slot；同一 Python 主次版本更新后继续复用。
- Python 环境仅在签名 MCP manifest 确实变化时更新，不随桌面应用版本重复下载。

## TSG 授权下载

- `zerowall-tsg-literature` 作为 `zerowall-literature` 的授权 PDF 后备流程，在公开来源和 `paper-download` 级联失败后按显式 `--allow-tsg` 使用。
- 环境配置页只显示并保存四个浏览器 Cookie：`TSG_PM_JSESSIONID`、`TSG_SESSIONID`、`TSG_SGUSER`、`TSG_TSGUSER`。
- 所有 TSG 凭据存入本机安全存储，Cookie 按域注入，日志、报告和来源账本均不写入凭据值。

## 桌面安装包

- Windows x64 安装包版本为 5.10.0。
- Stable 更新渠道继续使用七牛云签名元数据和 SHA-256 校验。
