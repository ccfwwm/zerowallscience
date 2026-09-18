---
name: zerowall-paper-compare
description: 对比两篇或多篇指定论文的研究问题、方法、结果、局限及跨文献图片复用，提供逐项原文定位与图像证据。用于论文比较，不把告警数量差异当成抄袭证据。
---

# ZeroWall 文献对比

默认先加载 `mineru-document-parser`，逐篇复用或生成 Markdown、图片和 `parse-manifest.json`。每篇分别追加 `--parsed "<原文件绝对路径>=<清单绝对路径>"`，禁止把不同文献的图片混成同一个来源。

通过现有 `python` 工具运行 `zerowall-image-dup/scripts/zerowall_integrity.py compare <PDF1> <PDF2> ... --workspace <输出目录>`。使用实际加载技能路径和真实附件路径。

- 先执行 `doctor`，缺依赖时修复或准确报告阻塞。
- 读取每篇提取正文并核对原文，以研究问题、样本/数据、方法、结果、创新和局限组织内容对比。
- 脚本会把各篇图片放入同一检测集合，执行真实跨文献匹配。只依据带两边文件、页码及图像证据的 findings 描述复用；不能从两篇告警数接近推断借用。
- 引用原文时保留所属文献和页码，不混淆不同文献中的同名图片、表格或作者结论。
- 相同图片可能有合法授权、共享数据或方法示意用途，展示证据并要求人工解释，不自动认定抄袭。
- 返回内容对照表、需要复核的匹配、未完成检查及报告链接。不要声称已运行未提供的全文文本相似度算法。

## OCR 与任务续跑

- PDF/文档默认由 `mineru-document-parser` 的 Precision VLM 解析，显式传 `isOcr: true`，保留 Markdown、图片、表格、页码与坐标。不需要安装本地 MinerU、EasyOCR 或 Torch。
- 检测使用同一托管 Python，工具 `timeoutMs: 600000`；脚本默认 `--budget-seconds 480`，到时保存报告与检查点。读取 `incomplete_execution`，为 true 时以相同输入和参数再次调用，直到完成或用户停止；不要反复增加超时或删除检查点。
- `partial` 表示筛查覆盖存在缺口，`incomplete_execution` 表示执行尚未完成。两者都要说明；无参考文献、伦理章节或适用表格属于材料限制，不等同于 Python 缺依赖。
- 分析返回 `ocr_requests` 指向需补充识别的图像列表。按列表对图片调用 `mineru_parse`（`precision`、`isOcr: true`）；将每个结果用 `--region-parsed "<图片绝对路径>=<parse-manifest.json绝对路径>"` 交给下一次分析。增加解析材料后生成新 trace，保留旧报告。图注不代表图内标注已识别。
- 只生成报告时不重复检测或提交 OCR。报告需附解析来源、已完成数量、待执行数量和未完成原因；没有页码/bbox 时明确标为未知。
