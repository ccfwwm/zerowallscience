# ZeroWall Science 图片与 PPT 工作流

`@zerowallscience/plugin-images` 提供 `generate_image`、`edit_image` 以及面向 `dsh-ppt-maker` 的图片生成协作能力。图片模型、分组、质量、比例和尺寸来自环境配置；保留用户明确选择，不用媒体工作台配置覆盖生图路由。

普通生图先从当前任务的对话提取尺寸，已有尺寸直接调用，仅在缺少规格时询问。GPT/OpenAI 使用像素 `size` 和 `quality`，质量取用户指定值或实时环境值，包含 `auto` 的字段也完整发送；Gemini 使用 `image_size` 与 `aspect_ratio`。会话工具在缺少尺寸且环境没有具体像素尺寸时返回 `IMAGE_SIZE_REQUIRED`，在发出计费请求前要求补齐。`image_generation_options` 只读提供配置，本轮已有快照时无需重复查询或展示确认单。

## PPT 输出

- 默认输出 `output_mode: editable`：先确认内容、素材、风格和逐页提示词，再构建原生文字、形状、表格、图表与独立图片对象。先完成并确认代表页，再处理其余页面。
- 用户选择快速图片交付时显式输出 `output_mode: image`：每页生成整页 PNG，再由 `dsh-ppt-maker` 导出渐进式图片型 PPTX。
- 用户需要两种版本时，复用内容计划和素材账本，分别导出两份 PPTX，并分别保存 `ppt_check`、`ppt_render`、`ppt_export` 和回读结果。

## 图片来源和提示词

优先复用用户项目图片、文献图和数据图表。缺少合适素材时调用 `generate_image` / `edit_image`。每次生图都保存原始 prompt、模型、质量、比例、输出文件和 SHA-256。文献图记录论文路径、页码和图号；项目图记录授权路径和用途；数据图表记录数据源、时间范围、单位和生成参数。

原始 prompt 必须逐字写入素材回执、PPTD manifest 和页面 notes。可以另存面向模型的派生说明，但不能用派生说明替代原始文本。

## 验收

生成或编辑完成后由 `dsh-ppt-maker` 执行 `ppt_check`、`ppt_render` 和 `ppt_export`。质量问题逐页记录和修复，导出随时使用当前可见版本；blocker、未审阅或过期账本不拦截导出。图片型 PPTX 回读后应以整页图片为主，可编辑 PPTX 回读后应确认文字、表格、图表和图片对象仍可编辑。详细工作流见 `resources/extensions/skills/zerowall-presentation/SKILL.md`。

逐页生成与修改：presentation_generate_templates、presentation_repair_templates 立即返回任务 ID，默认并发 10（1–10）。新建可编辑稿先生成代表页并调用 `presentation_confirm_editable_samples` 确认实际渲染，确认前 Host 拒绝排队、计划或构建其他页。每页完成后独立写入、检查和渲染，单页失败保留其他成功结果。presentation_status 显示 pageJobs，重启中断页需用户明确选择后 presentation_resume_pages 恢复。修改只处理选定页并保存独立 PPT 修订，工作台历史选中哪版即可导出哪版。

内容计划支持全局/逐页 stylePrompt、styleReferenceAssetIds 的逐字段继承覆盖；参考图走 edit_image，无参考图走 generate_image。保留原始/组合提示词、参考图哈希和生成回执。纯风格图不作为事实内容嵌入，也不要求 assetPlacements。

## 图片稿重建与独立验收

`presentation_reconstruct_pages` 默认使用两个常驻本地 worker，可由用户调为 1–10，分开缓存原始 OCR、字体拟合和页面渲染。当前默认仍为签名的 RapidOCR ONNXRuntime 模型；v5 是开发候选，未通过独立语料及签名资源验收前不切换默认。原始 OCR 缓存的摘要同时覆盖识别结果和字符框，审阅失败原因单独记录。

处理完成 (`status=complete`) 与质量通过 (`qualityStatus=passed`) 分开。实际 PPTX 渲染失败记为 failed；渲染后至多三轮局部修正、连续两轮无改善停止并保留较好版本。SSIM ≥ 0.98、文字边缘 P95 ≤ 2 像素、独立完整清单、文字正确性和科研图片编辑边界必须同时满足。缺少清单或仍有图片文字时显示待核对。用户编辑或同路径媒体字节变化后，旧渲染证据失效。

文字几何使用同一工程快照的独立 PPTX 文本测量副本，保留真实字体和排版，并用对象颜色区分相邻文字。源字形蒙版经过摘要检查；正常最终渲染继续用于页面质量比较，测量图不作为交付画面。校正补偿字号变化带来的基线偏移；候选不得通过丢失难测文字、降低笔画质量或降低整页相似度获选。当前单页测量上限为 216 个文本对象，超限明确失败，不静默漏项。

可用 `reference_pptx` 提供旧稿文字候选，`analysis_path` 提供源图校对结果。分析文件是结构化数据，不能指定执行命令、输出路径或改变模型。格式：

```json
{
  "schemaVersion": 1,
  "sourceSha256": "原始输入 PPTX 文件 SHA-256",
  "pages": {
    "1": {
      "regions": [{"kind": "card", "sourceBounds": [100, 200, 800, 500]}],
      "textAnnotations": [{"text": "已按源图核对的文字", "sourceBounds": [120, 220, 600, 80], "verifiedAgainstSource": true, "reviewer": "实际校对记录"}],
      "fontProfile": {"basis": "joint-fit", "roles": {"cjk-title": {"fontFamily": "Microsoft YaHei", "bold": true}}},
      "inventory": {"sourceSha256": "该页原始媒体图片 SHA-256", "verifiedAgainstSource": true, "reviewer": "实际校对记录", "complete": false, "scientificImagesReviewed": false, "items": [{"id": "title", "type": "text", "sourceBounds": [120, 220, 600, 80], "text": "已按源图核对的文字", "nativeRequired": true}]}
    }
  }
}
```

区域坐标为原图像素，所有权区域不可重叠。可省略任意阶段数据；`regions` 存在时替代自动轮廓提案。局部清单必须保持 `complete=false`，不能将未核对区域排除后标记全页通过。字体角色为 cjk/latin × title/body/label；共享字体仅作候选先验，不强迫每行使用误差明显更大的字体。纯色底板原生化时，原始边缘和细节保留为透明图片图层；这不代表细节已转成原生形状。

图片重建以还原度为首要条件。`presentation_reconstruct_pages` 的 `concurrency` 默认 2，可按用户要求设为 1–10，例如 3、4、5。选择保存在当前工程，后续批次省略参数时沿用；排队记录和工作台显示实际选择。全局队列与常驻 worker 池均支持该范围，取消等待中的任务不占用处理槽。工程写入串行，生图并发单独控制。

科研证据区域可在 `regions` 中指定 `kind:"scientific-image"`，或显式设置 `preserveSourcePixels:true`。区域作为完整源图裁片保留，区域内 OCR 不擦除文字、不重画像素，也不拆成内部轮廓；这些文字记为 `protected-scientific-region` 的编辑边界。该选项需要基于原图确定所有权范围，不能将自动轮廓默认宣称为完整科研图片。

云端局部去字调用 `edit_image(mask_path=..., preserve_outside_mask=true)`；保持源图尺寸，透明蒙版区域可编辑，其他像素由本地原图回填，并记录源图、蒙版摘要与像素数量。服务返回不同尺寸时拒绝应用。该处理不自动触发付费调用，不用于重画显微或实验数据。
