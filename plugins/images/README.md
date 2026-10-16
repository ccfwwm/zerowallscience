# ZeroWall Science 图片与演示文稿工作流

`@zerowallscience/plugin-images` 提供 `generate_image`、`edit_image` 和演示文稿质量检查工具。图片模型、分组、质量及适用的分辨率、比例来自环境配置；保留用户明确选择，不使用媒体工作台的模型选择作为回退。

## Desktop 8.3.0 功能说明

- PPT/PPTX、文档和报告中的配图使用 `gpt-image-generator` Skill 与 `generate_image` / `edit_image`。视频、音乐和用户明确请求的独立媒体项目由 `media-create` / `media_*` 处理。图片工具底层复用 AI Cloud 传输服务，不等于创建媒体工作台项目或调用媒体任务工具。
- 先调用 `presentation_prepare` 绑定内容计划、素材清单和 Slide 草稿，再用 `presentation_generate_templates` 生成整页 PNG 视觉参考。批次默认最多同时执行两项生图任务，结果保留实际 PNG、SHA-256 和 `.generation.json` 回执；无效页码、重复 ID 和输出路径在生成前拒绝。底层图片服务也限制同时请求数为两项。
- 整页 PNG 注册为 `role: template`，仅作视觉参考，不编译为整页背景。`presentation_plan_editable_pages` 保存每页文字、形状、图片、表格、图表和连接线的类型、内容及边界。随后根据计划编写完整 SVG；每个计划元素都必须在 SVG 节点上声明唯一的 `data-zerowall-element-id` 与匹配的 `data-zerowall-element-type`，否则 `presentation_compile_pages` 会拒绝编译。通过校验后再编译，并通过 Univer 插入原生图表、表格和备注。规划工具不会自动识别 PNG 或自动生成全部可编辑对象。
- 不同页的独立生图和布局准备可并行推进。修改同一个草稿的编译串行执行；生图失败时已成功的 PNG 与回执留在工作区，可沿用相同请求恢复。一个批次全部生成成功后才批量登记模板。
- 导出前还会读取绑定草稿中的实际 Univer 元素，按计划检查对象类型、文字内容和位置范围；图表/表格必须具备原生 `chartId` / `tableId`。缺少实际可编辑对象时，`presentation_status.state.reconstructionFailures` 会给出原因，导出被阻止，不能用审核 waiver 绕过。SVG 中预留的图表/表格矩形仍需在最终替换后插入对应原生对象。
- `univer_execute` 的 `codeFile: "/none"`、`"none"` 和空字符串按未提供文件归一化；真实 `codeFile` 与非空内联 `code` 同时存在时，在派发前抛出 `INVALID_EXECUTION_SOURCE`，应修正输入而非重试。
- 导出前仍须完成实际页面 inspect、lint、截图和当前模型的视觉审查；导出后须重新打开或渲染 PPTX，确认文字、图表、表格和独立图片保持可编辑。模板和规划记录本身不构成导出验收。

本轮自动测试使用本地 PNG 与模拟传输，不代表真实付费生图、实时 Univer 界面或最终 PPTX 已通过视觉验收。详细操作合同见仓库内 `resources/extensions/skills/zerowall-presentation/SKILL.md`。
