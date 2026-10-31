# ZeroWall Science 图片与 PPT 工作流

`@zerowallscience/plugin-images` 提供 `generate_image`、`edit_image` 以及面向 `dsh-ppt-maker` 的图片生成协作能力。图片模型、分组、质量、比例和尺寸来自环境配置；保留用户明确选择，不用媒体工作台配置覆盖生图路由。

## PPT 输出

- 默认输出 `output_mode: image`：每页先生成整页 PNG，再由 `dsh-ppt-maker` 导出图片型 PPTX，速度快，适合不可编辑交付。
- 用户明确要求可编辑时输出 `output_mode: editable`：整页 PNG 只作视觉参考，最终工程保留独立文字、形状、原生表格、原生图表和图片对象。
- 用户需要两种版本时，复用内容计划和素材账本，分别导出两份 PPTX，并分别保存 `ppt_check`、`ppt_render`、`ppt_export` 和回读结果。

## 图片来源和提示词

优先复用用户项目图片、文献图和数据图表。缺少合适素材时调用 `generate_image` / `edit_image`。每次生图都保存原始 prompt、模型、质量、比例、输出文件和 SHA-256。文献图记录论文路径、页码和图号；项目图记录授权路径和用途；数据图表记录数据源、时间范围、单位和生成参数。

原始 prompt 必须逐字写入素材回执、PPTD manifest 和页面 notes。可以另存面向模型的派生说明，但不能用派生说明替代原始文本。

## 验收

生成或编辑完成后由 `dsh-ppt-maker` 执行 `ppt_check`、`ppt_render` 和 `ppt_export`。质量问题逐页记录和修复，导出随时使用当前可见版本；blocker、未审阅或过期账本不拦截导出。图片型 PPTX 回读后应以整页图片为主，可编辑 PPTX 回读后应确认文字、表格、图表和图片对象仍可编辑。详细工作流见 `resources/extensions/skills/zerowall-presentation/SKILL.md`。

逐页生成与修改：presentation_generate_templates、presentation_repair_templates 立即返回任务 ID，默认并发 10（1–10）。每页完成后独立写入、检查和渲染，单页失败保留其他成功结果。presentation_status 显示 pageJobs，重启中断页需用户明确选择后 presentation_resume_pages 恢复。修改只处理选定页并保存独立 PPT 修订，工作台历史选中哪版即可导出哪版。

内容计划支持全局/逐页 stylePrompt、styleReferenceAssetIds 的逐字段继承覆盖；参考图走 edit_image，无参考图走 generate_image。保留原始/组合提示词、参考图哈希和生成回执。纯风格图不作为事实内容嵌入，也不要求 assetPlacements。
