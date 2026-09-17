---
name: zerowall-paper-analysis
description: 分析用户提供论文的研究问题、方法、结果和局限，并执行图片、表格、统计和引用完整性筛查。用于指定 PDF 精读与科研核查，不替代文献检索综述或模拟同行评审。
---

# ZeroWall 文献分析

默认先加载 `mineru-document-parser`，复用或生成每篇文献的 Markdown、图片和 `parse-manifest.json`。将原始文件与解析结果通过 `--parsed "<原文件绝对路径>=<清单绝对路径>"` 传入下述脚本，解读使用 MinerU Markdown。缺少凭据或解析失败必须说明，用户接受时才降级本地解析。

复用 `zerowall-image-dup` 技能随附的 `scripts/zerowall_integrity.py`，通过 ZeroWall `python` 工具运行 `analyze <PDF> --workspace <输出目录>`。多个输入逐篇处理，附带 Source Data 时加 `--data <文件或目录>`。脚本路径由实际加载的技能位置解析。

1. 确认输入 PDF 和伴随数据确实存在，执行 `doctor` 检查依赖。
2. 执行分析，读取输出的 `paper-*-text.json`、`findings.json` 和原文。默认直接复用 MinerU 的 OCR 正文和图片，不重复启用大型 OCR 模型，不凭检测结果虚构论文内容。
3. 分别说明研究问题、数据与设计、方法、主要结果、结论边界和局限。关键数字与论断注明原文页码；区分作者结论与自己的评价。
4. 完整性检查另列实际发现、证据位置、未运行项目和建议复核步骤。检测器未运行与未发现异常不能混淆。
5. 检测在本地执行；MinerU 解析使用已配置的解析服务，不再将论文发送给额外模型服务。外部引用存在性、撤稿和 DOI 核验需要实际查询；离线输出不能表述成已核实。
6. 返回分析和报告文件链接，继续处理时复用任务编号。

用户需要检索并综合领域文献时转用既有 `literature-review`；明确要求模拟审稿时保留既有审稿技能。完整报告使用 `zerowall-integrity-report`，不重复运行已成功完成的检查。
