# ZeroWall Science 5.12.0

本版本升级表格读取、托管科研 Python 环境和 MCP 依赖管理，保持单篇文献独立工作目录与安全的文件读取边界。

## 表格与 Office

- 新增内置 `zerowall-spreadsheet` Skill；工作区 `.xlsx` 优先使用 `excel_read`，不再把 OOXML 二进制文件交给通用文本读取工具。
- 集成固定版本的 `dsh-office-tools`，提供 Excel/Word 结构化读取和创建、更新能力；PPT 继续由现有演示文稿插件处理。
- `zerowall-literature` 生成 `papers.xlsx` 后自动检查工作表、标题行和记录数量。

## 托管科研环境

- MCP 环境升级至 `1.2.0`、内容修订 `1`，从锁定依赖重建并验证核心 Python imports、`pip check`、MCP 服务和文献脚本。
- 新增 Skills 依赖审计，明确标记 ready、managed、optional、external 和 incompatible 能力，避免把未验证依赖宣称为可用。
- Python 工具同时加载只读核心 site-packages 与用户 overlay；用户包安装后执行 import 和 `pip check` 验证，并支持用户包更新检测。
- MCP 页面不再重复显示科研环境更新卡片；环境版本、健康状态、更新和包管理统一放在“Python 环境”页面。
- 环境仅在首次安装、版本/修订/hash 变化或必要修复时更新，普通桌面软件升级不会重复下载。

## 发布信息

- Windows x64 Stable 安装包版本为 5.12.0。
- MCP 环境与桌面应用版本解耦，使用签名 manifest、归档 SHA-256 和双槽更新策略。
