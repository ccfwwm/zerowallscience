---
name: research-integrity
description: 对文献、引用、正文、图片、图表、数据、统计和来源链执行对话式可信度核查；先询问缺失范围，再生成带证据、指标、限制和建议的 JSON、Markdown 或 HTML 报告。相似度或来源缺失不会被表述为已证实造假。
---

# 对话式科研可信度核查

用户提出查重、核对可信度、检查文章或怀疑文献/图片/数据问题时，复用 `ask_user_question` 逐项补齐选择，不建设新的侧栏或工作台。用户已经给出的选项不要重复询问。

## 选择顺序

1. 核查强度：A 初级核对（本地引用、文本、图片和文件重复）；B 标准核对（初级加公共文献源核验和图表/数据一致性）；C 深度核对（标准加 PDF 图件分割、局部复用、OCR、统计和来源追溯）。
2. 检查对象：文献与引用、正文相似度、图片和图件重复、图表与源数据一致性、原始数据重复、统计报告和可复现性、图件/数据/脚本来源追溯，可多选。
3. 只有所选对象需要线上核验时，询问公共来源（Crossref、OpenAlex、PubMed/Europe PMC、arXiv）、公共来源加已配置 Semantic Scholar，或仅本地检查。
4. 只有材料不明确时，询问 PDF、Word、图片/图表、数据文件或 DOI/URL/文献条目。

每次运行保存 `profile`、`modules`、`onlineSources`、`inputRefs`、`privacyMode`、`outputFormat`。使用现有 `citation-reviewer`、`nature-ref-verifier`、`nature-academic-search`、`paper-download`、`nature-downloader`、`zerowall-image-dup`、`figure-provenance`、`stats-integrity`、`nature-statistics` 和 `nature-data`，不要建立第二套结果数据库。

结果只能使用 `verified`、`issue`、`review_required` 或 `unverifiable`，严重度只能使用 `critical`、`high`、`medium` 或 `info`。每条 finding 必须包含 module、evidence、source、metric、limitation 和 suggested_action。相似、来源缺失、404、超时、限流或检测失败都不得单独生成“已证实造假”。

图片重复要保留证据裁剪和标注文件。报告支持 JSON、Markdown、HTML。记录 `research-integrity/requested` 和 `research-integrity/completed` 事件；进度帧只更新任务状态，不追加会话事件。
