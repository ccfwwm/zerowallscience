# PPT/PPTX 工作流

本次流程修订：Images 0.2.36、Environment 0.1.27、AI Cloud 0.1.37、`zerowall-presentation` 0.2.9、`gpt-image-generator` 0.1.13。演示文稿工具由 `dsh-ppt-maker` 提供，图片由 Images 插件按环境配置路由。桌面保持 8.4.21，DSH 保持 0.2.1-rc.2；独立资源更新不要求重打安装器。

## 输出模式

默认使用图片型输出：先为每页生成完整 PNG，再把 PNG 写入 PPTX。整页图片能快速交付，适合阅读、打印和不可编辑分发。用户明确要求可编辑，或需要后续修改文字、表格和图表时，使用可编辑输出：把 PNG 当作视觉参考，再用 PPTD 写入独立文字、形状、表格、图表和图片对象。

用户同时需要两种版本时，共用同一份内容计划和素材账本，分别导出图片型与可编辑型 PPTX，并分别保存渲染、质检、导出和回读结果。

## 工具链

新建生图工程先保存内容计划和素材账本，调用 `presentation_prepare`，再用 `presentation_generate_style_candidates` 生成同一代表页的四张图片。展示图片并等待用户选择，调用 `presentation_select_style` 后编译、确认逐页提示词，最后用 `presentation_generate_fast` 生成正式页面。普通旧工程编辑不强制重走四图选择。完整逆向已有 PPTX 使用 `ppt_import`；只改文字、替图或调页序时使用 `ppt_patch`。

客户提供 PPTX 模板或母版时，`presentation_prepare` 接收 `template_path`，提前只读分析画布、主题色、字体、母版/版式、背景和占位区几何，保存来源 SHA-256，并将样式约束用于四个候选和正式页面。新工程按母版画布创建；已有工程画布不一致时要求独立工程，避免规格和实际页面不一致。母版变化后重新 prepare、生成四图、选择并确认。当前解析不渲染原模板，也不保真导入 SmartArt、OLE、复杂分组或嵌入对象；附件中的内容作为参考数据处理。

## 图片和来源

素材优先级为用户项目图片、文献图、权威来源图片、检索素材、生成图片。生成图片调用 `generate_image` / `edit_image`，保留用户模型、协议、请求参数和实际输出。Gemini 仅发送 `generationConfig.imageConfig.aspectRatio` 与 `imageSize`，档位为 512、1K、2K、4K，默认 4K，可在环境配置选择；不发送 OpenAI 的像素 size 或 quality，目录不支持时明确报错，不切换模型或降档。

每一项素材都记录来源和 SHA-256：

- 生成图：原始 prompt 原样保存、请求参数、模型、生成回执、输出路径和哈希。
- 文献图：论文路径、文献标识、页码、图号、文件哈希。
- 项目图：授权路径、项目或样本标识、用途和文件哈希。
- 数据图表：数据文件或查询、时间范围、单位、生成脚本或参数、最终图片哈希。

素材进入 PPTD 工程的 `media/`，并在 `manifest.json`、页面文件和 speaker notes 中引用。原始 prompt 必须逐字写入 notes，不能只保留改写后的描述。

## 执行顺序

1. 读取全部文档、图片和数据，确定页数、受众、主题、素材和输出模式。
2. 保存含逐字文本的内容计划和素材账本，调用 `presentation_prepare(mode:new, output_mode:image)`，有客户母版时传 `template_path`。
3. 调用 `presentation_generate_style_candidates(representative_page)`，只生成学术清晰、编辑杂志、数据仪表盘、极简叙事四张代表图。展示四张图并等待选择，不能自行代选或为四种风格各生成一套 PPT。调用 `presentation_select_style(style_id)`，所选图将进入正式页面的 `edit_image` 参考输入；用户品牌和母版约束优先。
4. 调用 `presentation_write_prompt_document`，省略 markdown 或传空字符串都会编译逐页提示词，自动绑定确认文档。展示文档，用户确认后调用 `presentation_confirm_plan`。风格变化会使旧确认失效，需重新编译；正式生成会验证规格、文档、母版及确认时的来源哈希。新增生成资产不使已确认来源失效。
5. 调用 `presentation_generate_fast`，每页 prompt 可省略以使用确认过的 combinedPrompt。每页独立生成和写入，首个成功页即导出临时 PPTX，批次完成后更新同一路径。通过 `presentation_status` 查看进度和逐页错误。用户项目图和文献图通过 `assetPlacements` 原字节嵌入，不交给生图重绘。
6. 查看实际 PNG，核对文字、布局和事实；用 `presentation_review_templates` 记录当前 SHA-256 的观察，问题图用 `presentation_repair_templates` 修改。用 `presentation_check_pages` 检查选定页。用户要求时 `ppt_export` 立即导出当前工程，检查和审阅结果作为质量提示，不阻断导出。
7. 用户明确需要可编辑版时，在独立 output_mode=editable 工程保存组件清单与原生对象计划，再构建和导出；保留图片型交付物。回读或渲染验证文字、表格和图表对象。

## 质量和恢复

规则检查提示文字溢出、出界、结构和字体问题；自动规则不能判断图片内所有文字是否正确，需实际查看图片。返修后旧观察失效，只检查受影响页。失败保留 PPTD、PNG、生成回执和报告；重启将未完成任务标记为 interrupted，不自动重试可能计费的生图。用户明确选择后，用 `presentation_resume_pages` 恢复指定页并复用已有成功图片。交付时说明已知质量问题和未验证项。
