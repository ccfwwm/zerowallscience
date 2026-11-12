---
name: office-academic-docx
description: 对话式学术 Word 排版与格式审计：按论文、报告、项目材料或参考 DOCX 重排，输出 DOCX、PDF 和格式审计报告，同时保护正文和表格内容不变。
---

# Academic Word formatting

When the user asks for Word formatting or template-based reformatting, use the existing conversational question capability before editing:

1. Ask for document type: A 中文/英文论文, B 报告, C 开题/基金/项目材料, or D 按参考 DOCX 重排.
2. If D, ask for format source: A 参考 DOCX, B 期刊或学校要求, or C 自定义格式说明.
3. Ask only for missing input paths, output language, and whether the default `DOCX + PDF + 格式审计报告` output is acceptable. Do not create a new Word UI.

Before any formatting mutation, compute content fingerprints for body paragraphs, tables, equations, captions, references, and embedded media with `scripts/docx_content_fingerprint.py`. Keep the source fingerprint in the audit report. Reopen the saved DOCX and reject the formatted output if any protected content fingerprint changes. Formatting changes may update styles, page breaks, table widths, caption placement, headers, footers, numbering, and fields, but may not silently rewrite content.

Use the existing `office-docx`, `office-render`, and `office-export-pdf` skills and the installed LibreOffice Kit paths. Inspect rendered PDF pages when layout quality is part of the request. Check heading hierarchy, abstract, body, equations, figures, tables, captions, references, table width, page overflow, blank pages, missing images, and caption position. Record each check as `pass`, `issue`, `review_required`, or `unverifiable` with evidence and limitation.

The audit must distinguish layout issues from content integrity. Never claim a document is correct merely because it exported successfully. If rendering is unavailable, report the content and structure checks separately and mark visual checks `unverifiable`.
