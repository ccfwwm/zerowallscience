---
name: zerowall-presentation
description: 用 dsh-ppt-maker 创建、修改、检查、渲染和导出科研 PPTX；先做四种样式和逐页提示词确认，默认快速交付图片型 PPTX，用户确认后再做高还原可编辑转换。
---

# ZeroWall PPT 工作流

所有 PPT、PPTX、幻灯片、答辩和汇报使用 dsh-ppt-maker。默认 output_mode=image：完整 PNG 作为整页图片，优先快速导出图片型 PPTX；导出后询问是否需要可编辑版，用户明确确认后才使用独立 output_mode=editable 工程。保留用户选择的模型、分组、质量、尺寸、协议及参数。

图片协议按账户目录的分组类型路由：显式 Gemini 分组使用 Gemini `generateContent`，其他或无法识别的分组默认使用 OpenAI Images。模型 ID、模型前缀和分组名称只用于展示/检索，不能选择协议；`gemini-nano-banana-2.1` 等具体模型是否具备图片能力、比例或分辨率，以当前上游能力目录为准。

## 内容计划与风格

先快速分析主题、正文、文献和参考图，生成同一代表性页面的四种样式候选，让用户选择或要求调整。选定后保存 presentation-spec.json、visual-assets.json、presentation-prompts.md 和 presentation-sources.json，再调用 presentation_prepare 绑定 spec_path、manifest_path、dir 和 mode。正式全套生图前调用 presentation_confirm_plan；提示词文档、规格、来源资产或选定样式变化都会使确认失效。新工程自动创建并打开工作台。已有工程普通文字修改可直接 ppt_edit；受管图片修改先绑定 mode=edit。

最小计划：

```json
{"width":960,"height":540,"fonts":{},"palette":{},"stylePrompt":"用户原样提供的风格说明","styleReferenceAssetIds":["style-reference"],"slides":[{"text":["逐字标题","逐字正文"],"assetIds":[]},{"text":["第二页"],"stylePrompt":"本页风格覆盖","styleReferenceAssetIds":[]}]}
```

全局 stylePrompt 和 styleReferenceAssetIds 分别继承；每页可独立覆盖，空字符串/空数组表示清除该字段的继承。参考图先 presentation_record_assets 登记，纯风格图使用 role=style-reference。存在任何参考图时走 edit_image，无参考图时走 generate_image；保存 originalPrompt、analysisPrompt、combinedPrompt、editablePlanPrompt、参考图哈希、模型、质量和 .generation.json 回执。四种样式只能改变视觉语言，不得改写确认过的事实文字或替换文献图。

事实素材在 assetIds 中明确指定。用户项目图、文献图和数据图应原样嵌入，记录来源文件、页码、图号、数据源、单位和哈希；图片型以 assetPlacements:[{assetId,bounds:[x,y,width,height]}] 指定位置，可编辑型引用真实图片对象。纯风格参考只用于生图，不自动成为事实图片，不要求 assetPlacements。来源、提示词和回执写入素材清单和 notes，不把派生提示词替代用户原文。

## 每页独立处理

确认计划后，presentation_generate_templates 传 templates:[{page,prompt,output_path,asset_id}]，可附 reference_asset_ids；concurrency 取 1–10，默认 10。接口立即返回 taskId 和逐页 queued 状态，不等整批完成。每页独立生成、写入、检查和渲染；成功结果立即保留，单页失败不丢弃其他页。PPTD 写入采用短事务串行，不并行提交同一 baseRevision。后完成的前页不挡住先完成的后页，未完成页按当前可见状态保留。

使用 presentation_status 查看 state.pageJobs 的生成回执、图片路径、SHA-256、revision、错误和逐页状态。图片型页面先直接构建并导出 PPTX；用户确认转可编辑后，调用 presentation_write_component_manifest 保存每页组件的类型、bbox、sourceRegion、zIndex、OCR 置信度和 fallback，再调用 presentation_plan_editable_pages 保存原生对象计划，最后用 presentation_resume_pages 恢复选定页。文字、线条、色块、表格和有结构数据的图表优先保留原生对象；文献/项目图按原字节嵌入；无法安全分层的区域保留为独立 complex-raster 图片。不得拿旧原生计划假装已转换新图。

## 单页或多页修改与版本

只修改用户选择的页。presentation_repair_templates 的 repairs 可指定一页或多页：asset_id、expected_sha256、prompt、output_path、new_asset_id。普通改图也可使用，调用 edit_image，保留原图和每次修改 prompt、父图哈希；新路径/ID 避免覆盖旧版素材。无需先把图片标为失败才允许修改。

每次页面构建保存独立 PPT 修订；直接 ppt_edit 可传 newVersion=true。修改后只对这些页 presentation_check_pages，不重生、不重写、不重查未变化页。版本历史可预览或切换并直接导出；导出选中的版本，不用恢复磁盘游标才能导出历史预览。

## 质量、导出和恢复

逐页查看实际 PNG，检查文字、乱码、错漏字、布局和事实准确性。presentation_review_templates 保存实际 text_transcription 和当前图片哈希，presentation_record_reviews 保存成品观察与 warning 接受记录。失败记录不能伪造成通过；这些质量记录供提示与回执，不是构建或导出的门槛。

ppt_export 立即导出当前工程，不等待生图、检查或审阅，不因 blocker、过期来源账本或缺少 review 而拒绝。顶部导出先提交活动文字编辑器到本地草稿，然后导出当前画布、基准修订和未提交操作的临时快照；冲突时仍导出所见版本加草稿。快照不改写原工程；回执记录 revision、snapshotHash 和已知质量问题。只有真实序列化失败、必要素材不可读等构建错误才失败。

导出后可回读 PPTX 验证图片或可编辑对象；图片型 PPTX 与可编辑 PPTX 独立保存，转换失败不得覆盖图片型交付物。质量改进可继续在后台进行，不延迟用户明确要求的图片型交付。skipCheck 保留兼容，不再代表绕过提示词确认或来源完整性检查。

重启后未完成任务标为 interrupted，保留逐页输入、完成图片和回执。不自动重试可能计费的生图。仅在用户明确选择页后调用 presentation_resume_pages(pages:[...])；复用已完成图片和回执，不重跑其他页。实际失败与未验证项如实说明。
