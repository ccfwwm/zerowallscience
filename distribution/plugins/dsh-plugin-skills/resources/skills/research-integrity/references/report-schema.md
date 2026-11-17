# 论文核验报告数据规范

`schema_version: 1` 的清单是报告编译输入。路径相对当前工作目录，支持工作目录内的绝对路径；符号链接不能逃出工作目录。导出前重新核对证据文件哈希，变更需重新审查并生成新修订。工具不替代科学判断。

```json
{
  "schema_version": 1,
  "paper": {"title": "论文标题", "citation": "作者 期刊 年份 DOI"},
  "conclusion": "现有材料确认了哪些问题、影响哪些结论。",
  "inputs": [{"path": "inputs/paper.pdf", "sha256": "实际SHA256"}],
  "coverage": [{"title": "图内OCR", "done": 12, "total": 12, "status": "done", "note": "识别完成不表示逐字校订"}],
  "gaps": [{"text": "缺少原始样品映射，无法核验实验独立性。", "blocking": false}],
  "findings": [{
    "id": "F-01", "title": "图示样本量与统计导出不一致", "status": "issue",
    "severity": "high", "module": "statistics", "priority": 1,
    "summary": "概括可复现的不一致及影响，避免大段推演。",
    "limitation": "版本差异原因待澄清，不能据此认定捏造。",
    "action": "统一最终数据版本并更正图示。",
    "evidence": [
      {"kind": "image", "path": "evidence/crop.png", "caption": "图中样本量", "source": {"path": "inputs/paper.pdf", "page": 2, "bbox": [100, 200, 300, 400]}},
      {"kind": "table", "caption": "原始列与导出比较", "headers": ["项目", "原始值", "导出值"], "rows": [["样本量", 12, 13]], "source": {"path": "inputs/data.xlsx", "sheet": "fig 1f", "range": "F3:F14"}},
      {"kind": "text", "text": "实际核读的原文摘录", "source": {"path": "inputs/paper.pdf", "page": 3}}
    ]
  }],
  "candidate_input": {"path": "image_audit/output/findings.json", "reviews": "outputs/image_manual_review.json"}
}
```

`inputs`、`coverage`、`gaps`、`candidate_input` 可按材料省略；`issue` 和 `verified` 必须有可显示的证据，图片、表格及摘录必须指向本地可读取来源。源位置使用 PDF 的 1 起始页码、原始坐标或工作簿 sheet/range；不确定时留空，不能编造。表格的数值由核查步骤产生，编译器只检查结构和来源身份，不执行任意公式或推断数值。

严重度为 `critical/high/medium/info`。整体结论从所有 finding 推导：有 `issue` 为发现问题；有待澄清项为需要澄清；没有已核验项或关键材料缺失为材料不足；其余才是在核查范围内未发现问题。机器信号从不直接增加确认问题计数。

`reportDir/latest.json` 指向已提交修订；每个 `revision-0001` 等目录包含 `report.json`、`report.html`、`summary.md`、`report.docx` 和 `exports.json`。`data_sha256` 绑定同一份报告数据；PDF 来自同修订 DOCX。导出失败不会覆盖旧修订。HTML 内嵌图片且无外部资源请求，默认展开 10 条重点，其余记录可展开查看。Word 的文字和表格可编辑，包含全部发现及证据，重点之后的记录放在附录。完整机器台账保存在 JSON 与 HTML 的可展开部分，不插入结论正文。
