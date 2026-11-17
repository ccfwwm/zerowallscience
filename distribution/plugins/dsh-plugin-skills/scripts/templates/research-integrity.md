---
name: research-integrity
description: 对论文文献、正文、图片、图表、数据和统计执行证据核查；自动补图内 OCR，区分确认问题、需澄清和材料不足，生成默认 10 条重点的内嵌证据报告，导出离线 HTML、可编辑 Word 和 PDF。
---

# 论文核验与结论报告

先读用户已给出的范围和既往请求；只有缺少会影响执行的选择才调用 `ask_user_question`。`research_integrity` 的 `start` 只登记范围，不是检测或最终报告。保留原文、原会话和既有结果；复查或新证据生成新的报告修订。

## 执行

1. 保存核查强度、模块、联网范围和材料清单。复用 `nature-ref-verifier`、`citation-reviewer`、`zerowall-image-dup`、`stats-integrity`、`nature-data` 和图件来源追溯工作流；按需加载对应技能。公共文献身份匹配不代表引用语境成立。
2. PDF 用 `mineru_parse` 的 Precision 模式及 `isOcr: true`，保留结构化图片、表格、页码和坐标。图内文字仍作为图片返回时，必须让图像检测器以默认 `--local-ocr auto` 调用 RapidOCR；禁止为了提速关闭需要的 OCR。正文解析完成不等于图中文字已识别。
3. 图像检测使用托管 Python，`timeoutMs: 600000`、检测预算默认 480 秒。执行未完成时用相同输入续跑，按图片哈希复用 OCR。已有补充 OCR 可用 `--ocr-results <回执.json>` 回流，再计算 numeric-audit；哈希不匹配的回执不得复用。识别无文字、OCR 执行失败、主动关闭分别记录。
4. 检查每个模块的实际完成数和材料限制。机器信号按同一来源组合分组，保留每条 ID；诊断指标、相似文字/坐标和实验纹理分开解释。一个候选的人工排除不能传递给同组其他候选；未打开或哈希变化的图片不能判阴性。
5. 对重要线索核对真实图片、原始数值、原文和实验语境。结果使用 `issue`、`review_required`、`verified`、`unverifiable`；仅确认具体不一致，不推断意图。缺少原始数据时说明影响哪些结论，不要求用户无限补材料。

## 报告

按同目录 [报告数据规范](references/report-schema.md) 保存 `report-spec.json`。先用一句结论回答有何已确认问题及其影响，再列 10 条重点。每条包含短说明、可直接看到的图片/表格/摘录、原文位置、解释范围和下一步。重要缺口合并成少量说明，完整记录放在可展开部分，禁止堆叠几十个重复的“未核验”。

调用 `research_integrity`：`action: "report"`，`reportSpec` 为工作目录中的证据清单，`reportDir` 为新报告目录，`priorityLimit: 10`，`exportFormats: ["html", "docx", "pdf"]`。工具使用托管依赖，自动生成 JSON、摘要、离线 HTML、可编辑 Word，并通过共享 Office 服务从该 Word 转成 PDF。缺少转换服务或转换失败时，保留 Word 和 HTML，明确 PDF 未完成；用 `action: "export"` 和同一 `reportDir` 重试。

`status` 查询最后已提交修订及导出回执。`resume` 在补证据后编译新的不可变修订；它不自动把既往候选改成已核验。生成报告不重复提交 MinerU 或重跑几何检测。通过现有文档预览/`present` 展示实际生成的 HTML、Word、PDF，不能只返回不存在的路径或大量证据链接。

FigScan 仅供参考证据审阅体验，Figshare 仅供参考版本、元数据和可追溯资料组织。未获用户授权不接入付费检测服务、不公开上传论文或数据。结论不以任何网站样式或机器分数代替证据。
