# ZeroWall 文献对比

默认先加载 MinerU 插件提供的 `mineru-document-parser`，逐篇复用或生成 Markdown、图片和 `parse-manifest.json`。每篇分别追加 `--parsed "<原文件绝对路径>=<清单绝对路径>"`，禁止把不同文献的图片混成同一个来源。

通过现有 `python` 工具运行 `zerowall-image-dup/scripts/zerowall_integrity.py compare <PDF1> <PDF2> ... --workspace <输出目录>`。使用实际加载技能路径和真实附件路径。

- 先执行 `doctor`，缺依赖时修复或准确报告阻塞。
- 读取每篇提取正文并核对原文，以研究问题、样本/数据、方法、结果、创新和局限组织内容对比。
- 脚本会把各篇图片放入同一检测集合，执行真实跨文献匹配。只依据带两边文件、页码及图像证据的 findings 描述复用；不能从两篇告警数接近推断借用。
- 引用原文时保留所属文献和页码，不混淆不同文献中的同名图片、表格或作者结论。
- 相同图片可能有合法授权、共享数据或方法示意用途，展示证据并要求人工解释，不自动认定抄袭。
- 返回内容对照表、需要复核的匹配、未完成检查及报告链接。不要声称已运行未提供的全文文本相似度算法。

## OCR 与任务续跑

- PDF 通过 MinerU Precision 解析，显式传 `mode: "precision", isOcr: true`，保留 parse-manifest.json、图片、表格、页码与坐标。图注和正文解析完成不能代替图内 OCR。
- 图像检测默认 `--local-ocr auto`，使用托管 RapidOCR 自动识别图内文字与数字。需要 OCR 时不得关闭；失败、无文字和显式关闭分别记录，应检查数量不能归零。
- 检测使用托管 Python，工具 `timeoutMs: 600000`、脚本预算 480 秒。读取 `incomplete_execution`；执行未完成时相同参数续跑，按图片哈希复用 OCR 缓存。补充 OCR 用 `--ocr-results <回执.json>` 回流，匹配原图哈希后重新计算 numeric-audit，不能只附加独立 OCR 文件。
- `ocr_requests` 表示需要补识别的区域；已有结构化图片解析可用 `--region-parsed` 接入。缺少解析、失败和材料限制均保留，不写成核验通过。
- 最终结论遵循 research-integrity 的报告数据规范，通过 `research_integrity` 的 report/resume 导出内嵌证据的 HTML、可编辑 Word 与 PDF。默认展示 10 条重点，完整记录可展开；仅重导出时不重复检测。
