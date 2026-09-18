---
name: zerowall-integrity-report
description: 根据已有 ZeroWall 科研分析任务生成或重建完整性报告、证据图和简明解读；不重新扫描未变化输入，不虚构已完成的检测或引用核验。
---

# ZeroWall 科研报告与结果解读

定位已有任务的 `manifest.json` 和 `output/findings.json`。没有任务结果时先选择 `zerowall-image-dup`、`zerowall-paper-analysis` 或 `zerowall-paper-compare`。

通过 `python` 工具运行 `zerowall-image-dup/scripts/zerowall_integrity.py report --workspace <任务根目录> --trace-id <任务编号>`，生成 JSON、Markdown 和 HTML，保留相对证据图片路径。

先检查每个检测步骤与 `skipped`，再解读 findings。报告包含材料、已检查内容、主要发现、证据 ID 与原文定位、未完成检查和复核建议。用户只要摘要时直接从现有结果总结，不重复运行检测。

默认中文，按用户语言调整文字。报告中的筛查信号不构成学术不端认定；缺依赖、输入解码失败、未联网核验必须清楚说明。返回实际存在的报告及证据文件链接。

## OCR 与任务续跑

- PDF/文档默认由 `mineru-document-parser` 的 Precision VLM 解析，显式传 `isOcr: true`，保留 Markdown、图片、表格、页码与坐标。不需要安装本地 MinerU、EasyOCR 或 Torch。
- 检测使用同一托管 Python，工具 `timeoutMs: 600000`；脚本默认 `--budget-seconds 480`，到时保存报告与检查点。读取 `incomplete_execution`，为 true 时以相同输入和参数再次调用，直到完成或用户停止；不要反复增加超时或删除检查点。
- `partial` 表示筛查覆盖存在缺口，`incomplete_execution` 表示执行尚未完成。两者都要说明；无参考文献、伦理章节或适用表格属于材料限制，不等同于 Python 缺依赖。
- 分析返回 `ocr_requests` 指向需补充识别的图像列表。按列表对图片调用 `mineru_parse`（`precision`、`isOcr: true`）；将每个结果用 `--region-parsed "<图片绝对路径>=<parse-manifest.json绝对路径>"` 交给下一次分析。增加解析材料后生成新 trace，保留旧报告。图注不代表图内标注已识别。
- 只生成报告时不重复检测或提交 OCR。报告需附解析来源、已完成数量、待执行数量和未完成原因；没有页码/bbox 时明确标为未知。
