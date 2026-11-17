---
kind: upgrade-guide
description: 图内 OCR 与证据报告采用明确覆盖状态和带版本的导出。
---

# 核验证据报告

[English](guide.md) | 中文

## 变更

图内 OCR 默认从 EasyOCR 改为本地 RapidOCR。显式 `--local-ocr off` 记录关闭状态和应检查数量，不再写成不适用。旧筛查文件保持原样。既有 `research_integrity` 工具增加 `report`、`resume`、`status`、`export`：带版本的证据清单生成离线 HTML、可编辑 Word 和 PDF，默认优先展示 10 条。机器候选不会因生成报告或分组而变成确认问题。

## 迁移

1. 为 RapidOCR 准备托管 `skill-integrity` 能力；只有明确可用时才选择 `--local-ocr easyocr` 及其依赖。补充 OCR 通过 `--ocr-results` 接入，匹配源文件哈希后重新运行数值核查。
2. 使用随包 research-integrity Skill 及其 schema-1 报告指令。源文件和证据必须位于所选工作区。旧筛查 JSON 需要经过复核的发现与证据位置，才能形成结论报告。
3. Word 需要托管 Python 的 `skill-integrity-report` 能力，PDF 还需要共享 Office 转换服务。PDF 失败会保留 HTML 和 Word；对同一报告目录重试 `export`。`resume` 创建新修订。插件设置或工具参数 `priorityLimit` 可调整默认的 10 条。
