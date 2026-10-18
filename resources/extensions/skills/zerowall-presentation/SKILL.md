---
name: zerowall-presentation
description: 用 dsh-ppt-maker 创建、编辑、检查、渲染并导出科研演示文稿；默认生成可快速交付的整页图片型 PPTX，用户明确要求可编辑时生成原生文字、表格、图表和图片对象。
---

# ZeroWall PPT 工作流

所有 PPT、PPTX、幻灯片、答辩、汇报和讲义请求统一使用 `dsh-ppt-maker`。工具优先调用 `ppt_create`、`ppt_edit`、`ppt_check`、`ppt_render`、`ppt_export`；已有 PPTX 需要保留未修改部件时使用 `ppt_import` 或 `ppt_patch`。

## 输出模式

- 默认 `output_mode: image`：每页先生成完整 PNG 视觉稿，再把 PNG 作为整页图片写入 PPTX。这条路径速度快、版式稳定，适合快速交付和不可编辑成品。
- 用户明确要求“可编辑”或需要后续修改文字、表格、图表时使用 `output_mode: editable`：用完整 PNG 作为视觉参考，再用 `ppt_edit` 写入独立文字、形状、原生表格、原生图表和可替换图片，最后 `ppt_check`、`ppt_render`、`ppt_export`。
- 用户要求两种版本时，在同一份内容计划上分别导出图片型和可编辑型 PPTX；复用同一份已经通过审核的整页图和素材账本，另建 `output_mode: editable` 工程并在原生计划中显式设置 `template_asset_id` 为旧图片型的资产 ID，不重复生图。两份成品保存各自的质检、渲染和导出回执。

## 图片与证据

图片优先使用用户提供的项目或文献图片；缺少合适素材时调用 `generate_image` / `edit_image`。每个生成请求都保存原始 prompt（逐字保存，不改写）、模型、质量、比例、输出文件和 SHA-256。文献图片保存论文路径、文献标识、页码、图号和文件哈希；项目图片保存来源路径、文件哈希和用途；数据图表保存数据来源、脚本或查询、时间范围、单位和最终图表哈希。

项目图、文献图和数据图原样嵌入，禁止生图重绘事实素材。图片型先生成带留白的背景，再无损合成原图；提示词逐字保留，并明确“在指定区域原样插入所附图片，不改动图中文字、数据、比例和内容”。PPTD 规范位于 `dsh-ppt-maker/docs/pptd-spec.md`，相对插件技能目录为 `../../docs/pptd-spec.md`。

生成图和外部图都进入 PPTD 工程的 `media/`，并在 `manifest.json`、页面文件和备注中保存 provenance。原始 prompt 也写入页面 notes，确保导出后仍可追溯。不要把提示词改写后替代原文；可以另存一份面向模型的派生说明，但必须保留原始文本。

## 建议顺序

1. 读取全部文档、图片和数据，确认页数、目的、受众、风格和输出模式；不清楚且会改变成品时先询问用户。
2. 使用 `ppt_themes` 选择主题。先保存含逐字文本的 `presentation-spec.json` 和空或已注册的 `visual-assets.json`，再调用 `presentation_prepare` 绑定 `spec_path`、`manifest_path`、`dir`、`mode: new` 和输出模式；工程不存在时会自动 `ppt_create` 并打开演示台。绑定成功后才能调用后续 `presentation_*` 工具，不要只单独 `ppt_create` 就开始生图。最小内容计划与绑定参数见下方示例。
3. 在 `spec.slides[].text` 保存每页逐字文本，使用 `presentation_generate_templates` 批量生成每页 PNG 视觉稿，默认并发 10，保留用户指定的并发值。生成成功只代表图片已生成，不代表质量通过。逐页打开返回的真实 PNG（无法直接显示时使用返回的绝对路径），全分辨率检查乱码、错漏字、图中文字、布局、逻辑与事实素材；把实际读到的文字写入 `text_transcription`，通过 `presentation_review_templates` 记录当前 `expected_sha256`、三项检查及问题，全文必须与 spec 逐字一致才能通过。
4. 有乱码、错漏字、错误内容或不合理布局时将状态记录为 `repair-required`，用 `presentation_repair_templates` 仅对失败页并发调用 `edit_image`，保留原图、最初 prompt 和每次返修 prompt/父图 SHA。不得改用其他模型、降低质量或重生全部页面。打开新图重新核验；旧失败图不能直接改成通过，新图也不能继承旧图审阅。全部通过后，图片型用 `presentation_build_pages` 写入；可编辑型先 `presentation_plan_editable_pages` 再构建独立对象。未通过审核的图会被代码阻止组装、转换和导出。
5. 事实图在图片型页面用 `spec.slides[].assetPlacements: [{assetId,bounds:[x,y,width,height]}]` 指定留白区域，代码将原文件字节作为图片对象覆盖到该区域，`contain` 保持比例。缺少明确位置会阻止构建；只复制到 media 不算嵌入。可编辑页面也必须实际引用原图对象。用 `ppt_edit` 原子提交，每次携带最新 `baseRevision`，冲突时重新读取 manifest。
6. 导出前使用 `presentation_check_pages` 批量检查和渲染，复用未变化页。修复所有 blocker；查看返回的 PNG，检查清晰度、裁切、溢出、重叠、对比度和数据准确性，再用 `presentation_record_reviews` 批量记录具体观察及接受的 warning 哈希。该最终成品审阅不能代替前面的生图审核。导出阻塞时读取 `presentation_status.requirements`：缺 review 就补审阅，检查或渲染过期才重跑受影响页。
7. 调用 `ppt_export` 导出 PPTX。导出后重新读取或渲染 PPTX，确认图片型页面保持整页图与原样事实图，可编辑页面保留文字、表格、图表和图片对象。

最小 `presentation-spec.json`（省略 `assetIds` 时按素材登记的目标页自动匹配；如显式提供 `assetIds`，注册新素材后必须同步追加 ID）：

```json
{"width":960,"height":540,"fonts":{},"palette":{},"slides":[{"text":["逐字标题","逐字正文"]}]}
```

空素材账本 `visual-assets.json`：`{"schemaVersion":2,"assets":[]}`。随后调用 `presentation_prepare`：

```json
{"spec_path":"presentation-spec.json","manifest_path":"visual-assets.json","dir":"presentation-image","mode":"new","output_mode":"image"}
```

明确要求可编辑时使用独立目录并设 `output_mode: editable`。已有原生工程的普通编辑继续 `ppt_import` / `ppt_open` / `ppt_edit`；需要受管生图或模板转换时，先准备内容计划并用 `presentation_prepare(mode: edit)` 绑定。

## 质量和恢复

`ppt_check` 的规则层阻断文字溢出、出界、结构损坏和关键字体问题；AI 视觉检查只提供建议。任何失败都保留 PPTD 工程、PNG、素材回执和 QA 报告，修复受影响页面后重跑检查。仅使用当前可用的工作流工具完成操作。

`skipCheck: true` 仅跳过规则检查，不能跳过受管整页图的文字、布局、内容审核，也不能替代绑定工作流的最终页面审阅。
