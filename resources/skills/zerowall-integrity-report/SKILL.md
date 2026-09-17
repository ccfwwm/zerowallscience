---
name: zerowall-integrity-report
description: 根据已有 ZeroWall 科研分析任务生成或重建完整性报告、证据图和简明解读；不重新扫描未变化输入，不虚构已完成的检测或引用核验。
---

# ZeroWall 科研报告与结果解读

定位已有任务的 `manifest.json` 和 `output/findings.json`。没有任务结果时先选择 `zerowall-image-dup`、`zerowall-paper-analysis` 或 `zerowall-paper-compare`。

通过 `python` 工具运行 `zerowall-image-dup/scripts/zerowall_integrity.py report --workspace <任务根目录> --trace-id <任务编号>`，生成 JSON、Markdown 和 HTML，保留相对证据图片路径。

先检查每个检测步骤与 `skipped`，再解读 findings。报告包含材料、已检查内容、主要发现、证据 ID 与原文定位、未完成检查和复核建议。用户只要摘要时直接从现有结果总结，不重复运行检测。

默认中文，按用户语言调整文字。报告中的筛查信号不构成学术不端认定；缺依赖、输入解码失败、未联网核验必须清楚说明。返回实际存在的报告及证据文件链接。
