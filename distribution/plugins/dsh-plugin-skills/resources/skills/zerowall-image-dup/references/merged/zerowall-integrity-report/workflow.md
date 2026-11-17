# ZeroWall 科研报告与结果解读

定位已有任务的 `manifest.json` 和 `output/findings.json`。没有任务结果时先选择 `zerowall-image-dup`、the paper-analysis workflow in this skill 或 the paper-comparison workflow in this skill。

检测器的 report 子命令只重建筛查结果。最终结论先整理 report-spec.json，再调用 `research_integrity` 的 `report`，输出同一修订的 JSON、摘要、内嵌证据 HTML、Word 和 PDF。

先检查每个检测步骤与 `skipped`，再解读 findings。报告包含材料、已检查内容、主要发现、证据 ID 与原文定位、未完成检查和复核建议。用户只要摘要时直接从现有结果总结，不重复运行检测。

默认中文，按用户语言调整文字。报告中的筛查信号不构成学术不端认定；缺依赖、输入解码失败、未联网核验必须清楚说明。通过现有文档预览展示实际报告，图片、表格和摘录直接显示，不能以证据链接替代。

## OCR 与任务续跑

- PDF 通过 MinerU Precision 解析，显式传 `mode: "precision", isOcr: true`，保留 parse-manifest.json、图片、表格、页码与坐标。图注和正文解析完成不能代替图内 OCR。
- 图像检测默认 `--local-ocr auto`，使用托管 RapidOCR 自动识别图内文字与数字。需要 OCR 时不得关闭；失败、无文字和显式关闭分别记录，应检查数量不能归零。
- 检测使用托管 Python，工具 `timeoutMs: 600000`、脚本预算 480 秒。读取 `incomplete_execution`；执行未完成时相同参数续跑，按图片哈希复用 OCR 缓存。补充 OCR 用 `--ocr-results <回执.json>` 回流，匹配原图哈希后重新计算 numeric-audit，不能只附加独立 OCR 文件。
- `ocr_requests` 表示需要补识别的区域；已有结构化图片解析可用 `--region-parsed` 接入。缺少解析、失败和材料限制均保留，不写成核验通过。
- 最终结论遵循 research-integrity 的报告数据规范，通过 `research_integrity` 的 report/resume 导出内嵌证据的 HTML、可编辑 Word 与 PDF。默认展示 10 条重点，完整记录可展开；仅重导出时不重复检测。
