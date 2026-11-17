# ZeroWall 文献分析

默认先加载 MinerU 插件提供的 `mineru-document-parser`，复用或生成每篇文献的 Markdown、图片和 `parse-manifest.json`。将原始文件与解析结果通过 `--parsed "<原文件绝对路径>=<清单绝对路径>"` 传入下述脚本，解读使用 MinerU Markdown。缺少凭据或解析失败必须说明，用户接受时才降级本地解析。

复用 `zerowall-image-dup` 技能随附的 `scripts/zerowall_integrity.py`，通过 ZeroWall `python` 工具运行 `analyze <PDF> --workspace <输出目录>`。多个输入逐篇处理，附带 Source Data 时加 `--data <文件或目录>`。脚本路径由实际加载的技能位置解析。

1. 确认输入 PDF 和伴随数据确实存在，执行 `doctor` 检查依赖。
2. 执行分析，读取输出的 `paper-*-text.json`、`findings.json` 和原文。复用 MinerU 正文和图片，图内文字由默认 RapidOCR 自动补齐，不凭检测结果虚构论文内容。
3. 分别说明研究问题、数据与设计、方法、主要结果、结论边界和局限。关键数字与论断注明原文页码；区分作者结论与自己的评价。
4. 完整性检查另列实际发现、证据位置、未运行项目和建议复核步骤。检测器未运行与未发现异常不能混淆。
5. 检测在本地执行；MinerU 解析使用已配置的解析服务，不再将论文发送给额外模型服务。外部引用存在性、撤稿和 DOI 核验需要实际查询；离线输出不能表述成已核实。
6. 返回分析和报告文件链接，继续处理时复用任务编号。

用户需要检索并综合领域文献时转用既有 `literature-review`；明确要求模拟审稿时保留既有审稿技能。完整报告使用 the integrity-report workflow in this skill，不重复运行已成功完成的检查。

## OCR 与任务续跑

- PDF 通过 MinerU Precision 解析，显式传 `mode: "precision", isOcr: true`，保留 parse-manifest.json、图片、表格、页码与坐标。图注和正文解析完成不能代替图内 OCR。
- 图像检测默认 `--local-ocr auto`，使用托管 RapidOCR 自动识别图内文字与数字。需要 OCR 时不得关闭；失败、无文字和显式关闭分别记录，应检查数量不能归零。
- 检测使用托管 Python，工具 `timeoutMs: 600000`、脚本预算 480 秒。读取 `incomplete_execution`；执行未完成时相同参数续跑，按图片哈希复用 OCR 缓存。补充 OCR 用 `--ocr-results <回执.json>` 回流，匹配原图哈希后重新计算 numeric-audit，不能只附加独立 OCR 文件。
- `ocr_requests` 表示需要补识别的区域；已有结构化图片解析可用 `--region-parsed` 接入。缺少解析、失败和材料限制均保留，不写成核验通过。
- 最终结论遵循 research-integrity 的报告数据规范，通过 `research_integrity` 的 report/resume 导出内嵌证据的 HTML、可编辑 Word 与 PDF。默认展示 10 条重点，完整记录可展开；仅重导出时不重复检测。
