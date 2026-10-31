---
name: zerowall-presentation
description: 用 dsh-ppt-maker 创建、修改、检查、渲染和导出科研 PPTX；逐页独立并发，当前画布和选定历史版本均可随时导出。
---

# ZeroWall PPT 工作流

所有 PPT、PPTX、幻灯片、答辩和汇报使用 dsh-ppt-maker。默认 output_mode=image：完整 PNG 作为整页图片；用户明确要求可编辑时使用独立 output_mode=editable 工程，保留原生文字、表格、图表和图片。保留用户选择的模型、分组、质量、尺寸、协议及参数。

## 内容计划与风格

先保存 presentation-spec.json 和 visual-assets.json，再调用 presentation_prepare 绑定 spec_path、manifest_path、dir 和 mode。新工程自动创建并打开工作台。已有工程普通文字修改可直接 ppt_edit；受管图片修改先绑定 mode=edit。

最小计划：

```json
{"width":960,"height":540,"fonts":{},"palette":{},"stylePrompt":"用户原样提供的风格说明","styleReferenceAssetIds":["style-reference"],"slides":[{"text":["逐字标题","逐字正文"],"assetIds":[]},{"text":["第二页"],"stylePrompt":"本页风格覆盖","styleReferenceAssetIds":[]}]}
```

全局 stylePrompt 和 styleReferenceAssetIds 分别继承；每页可独立覆盖，空字符串/空数组表示清除该字段的继承。参考图先 presentation_record_assets 登记，纯风格图使用 role=style-reference。存在任何参考图时走 edit_image，无参考图时走 generate_image；保存原始 prompt、实际组合 prompt、参考图哈希、模型、质量和 .generation.json 回执。

事实素材在 assetIds 中明确指定。用户项目图、文献图和数据图应原样嵌入，记录来源文件、页码、图号、数据源、单位和哈希；图片型以 assetPlacements:[{assetId,bounds:[x,y,width,height]}] 指定位置，可编辑型引用真实图片对象。纯风格参考只用于生图，不自动成为事实图片，不要求 assetPlacements。来源、提示词和回执写入素材清单和 notes，不把派生提示词替代用户原文。

## 每页独立处理

presentation_generate_templates 传 templates:[{page,prompt,output_path,asset_id}]，可附 reference_asset_ids；concurrency 取 1–10，默认 10。接口立即返回 taskId 和逐页 queued 状态，不等整批完成。每页独立生成、写入、检查和渲染；成功结果立即保留，单页失败不丢弃其他页。PPTD 写入采用短事务串行，不并行提交同一 baseRevision。后完成的前页不挡住先完成的后页，未完成页按当前可见状态保留。

使用 presentation_status 查看 state.pageJobs 的生成回执、图片路径、SHA-256、revision、错误和逐页状态。可编辑模式生成图后进入 awaiting-editable：只为这些页保存 presentation_plan_editable_pages 原生对象计划，再 presentation_resume_pages 恢复选定页。不得拿旧原生计划假装已转换新图。

## 单页或多页修改与版本

只修改用户选择的页。presentation_repair_templates 的 repairs 可指定一页或多页：asset_id、expected_sha256、prompt、output_path、new_asset_id。普通改图也可使用，调用 edit_image，保留原图和每次修改 prompt、父图哈希；新路径/ID 避免覆盖旧版素材。无需先把图片标为失败才允许修改。

每次页面构建保存独立 PPT 修订；直接 ppt_edit 可传 newVersion=true。修改后只对这些页 presentation_check_pages，不重生、不重写、不重查未变化页。版本历史可预览或切换并直接导出；导出选中的版本，不用恢复磁盘游标才能导出历史预览。

## 质量、导出和恢复

逐页查看实际 PNG，检查文字、乱码、错漏字、布局和事实准确性。presentation_review_templates 保存实际 text_transcription 和当前图片哈希，presentation_record_reviews 保存成品观察与 warning 接受记录。失败记录不能伪造成通过；这些质量记录供提示与回执，不是构建或导出的门槛。

ppt_export 立即导出当前工程，不等待生图、检查或审阅，不因 blocker、过期来源账本或缺少 review 而拒绝。顶部导出先提交活动文字编辑器到本地草稿，然后导出当前画布、基准修订和未提交操作的临时快照；冲突时仍导出所见版本加草稿。快照不改写原工程；回执记录 revision、snapshotHash 和已知质量问题。只有真实序列化失败、必要素材不可读等构建错误才失败。

导出后可回读 PPTX 验证图片或可编辑对象，质量改进可继续在后台进行，不延迟用户明确要求的交付。skipCheck 保留兼容，不再代表绕过不同层级的门禁。

重启后未完成任务标为 interrupted，保留逐页输入、完成图片和回执。不自动重试可能计费的生图。仅在用户明确选择页后调用 presentation_resume_pages(pages:[...])；复用已完成图片和回执，不重跑其他页。实际失败与未验证项如实说明。
