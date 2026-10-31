---
name: gpt-image-generator
description: Generate or edit PNG images with ZeroWall's built-in generate_image and edit_image tools and the environment's configured image model, group and parameters. Use for PPT/PPTX 配图、幻灯片插图、报告配图、生图、生成图片、改图、局部重绘、换背景、删除元素、调整颜色、保持构图、插画、海报、封面、背景图、视觉概念图、科研配图 or other raster-image requests. Use the configured image route without asking for credentials again.
---

# ZeroWall Image Generation

## Latency and delivery

Call `generate_image` or `edit_image` directly and deliver the returned PNG promptly. Avoid extra model calls for prompt summaries or unnecessary regeneration. The result and `.generation.json` receipt include provider, download and processing timings. If the tool reports a preview warning while returning a PNG path, treat the image as successful and report the warning briefly. The tool result carries a durable image attachment for the first tool response; preserve that image in the conversation.

Keep the user's configured model, group, quality and size. `high`, `xhigh` and `max` are explicit user/environment choices; never lower them to hide latency. The Host handles both native image groups and image profiles in 图片音频视频分组 behind these same tools. It selects the verified response format for the configured route; do not force `response_format` across groups or change the route yourself.

A CDN URL means generation has succeeded. The Host accelerates slow URL transfers with validated HTTP byte ranges and retries incomplete segments. On `IMAGE_DOWNLOAD_FAILED` or `IMAGE_DOWNLOAD_TIMEOUT`, retry the same tool once with exactly the same prompt, output path, model, size, quality and references: the encrypted pending result restores the download without another generation POST. Do not choose a new filename to recover a download. If recovery still fails, report the error and preserve successful assets for later recovery.

这是 ZeroWall 唯一默认的生图工作流。直接使用当前对话上下文，不启动额外提示词摘要模型；尽量保留用户原话，只补足缺少的构图、用途、格式或尺寸约束。

PPT/PPTX、幻灯片、文档和报告的配图也使用本技能。通过 `generate_image` / `edit_image` 取得工作区 PNG 与真实 `.generation.json` 回执，再交给 `dsh-ppt-maker`；将图片原样放入工程素材，并把每张图的原始 prompt 逐字保存在素材清单和 speaker notes 中。不调用 `media_models`、`media_import`、`media_project` 或 `media_job`，不创建媒体项目、时间线或任务。只有用户另行明确要求生成视频、音频/音乐或宣传片时，该交付物才使用 `media-create`；其中图片仅作为视频参考素材，普通生图和改图始终使用本技能。图片配置由 Host 从环境配置读取，助手不要读取或打印环境变量中的秘密；环境配置错误要如实报告，不能改走媒体任务、切换分组或换模型。

## 工具路由

Claude Agent SDK 会话中，相同工具通过 Host MCP 桥显示为 `mcp__zerowall__generate_image` 和 `mcp__zerowall__edit_image`。先使用当前已提供的工具；若定义被延迟加载，用 ToolSearch 搜索准确的桥接名称或 `+zerowall generate_image edit_image`。只调用实际发现的工具，参数和返回值与 Host 工具一致。发现失败时报告工具桥或资源状态，不重复猜测不存在的名称，也不改走其他模型或媒体工作流。


- 用户明确要求新画面、重新构思，或没有任何编辑已有图片的意图时，调用 `generate_image`。
- 用户要求修改主体、换背景、删除元素、调整颜色、保持构图、局部重绘、模板复刻或基于参考图延展，并且存在源图时，调用 `edit_image`。
- 源图选择优先级固定为：用户明确指定路径 > 本轮明确指定的图片 > 当前会话最近一次成功的 `generate_image` / `edit_image` 输出。
- 有编辑意图但没有源图时，询问用户提供或指定图片；存在多个同等合理候选时列出候选并询问，不得擅自选一张，也不得退化成新生成。
- `edit_image` 至少提供一种 `input_attachment_ids` 或 `input_paths`，最多 16 张。第一张是主要编辑对象，后续图片是风格、主体或构图参考；只有局部区域明确可由 alpha mask 表达时才传 `mask_path`。

## 工作流

1. 从用户描述中整理清晰的画面主体、构图、风格、光线、色彩、文字要求和用途。信息足够时直接生成，不重复追问 Key 或地址。
2. 在当前会话工作目录内选择明确的 `.png` 输出路径。不要写到项目目录外；默认不要覆盖已有文件。
3. 按“工具路由”调用 `generate_image` 或 `edit_image`：
   - `prompt`：完整生图提示词。
   - `output_path`：当前项目内的相对或绝对 PNG 路径。
   - `model`：用户未指定时省略，沿用环境配置的生图模型；用户明确指定时只覆盖当前请求。
   - `size`：用户未指定时省略，沿用 Host 配置；指定时使用 `WIDTHxHEIGHT`。
   - `quality`：用户未指定时省略，读取环境配置；用户明确指定时可传 `auto`、`low`、`medium`、`high`、`xhigh` 或 `max`，并遵守当前分组及模型的实际质量选项。`auto` 省略 API 质量参数，不擅自改变已保存的质量。“生图分组-gpt逆向”的 GPT Image 2.5 可选 `high`、`xhigh`、`max`，不将此能力推广到其他分组的同名模型。
   - `overwrite`：只有用户明确要求替换已有图时才设为 `true`。
   - `input_attachment_ids`：优先传当前会话附件 ID；`input_paths` 可用于用户指定或当前已生成的工作区资源，按源图优先级排列，主图放第一张。
- `mask_path`：仅 `edit_image` 可选；必须是独立于 `input_paths[0]` 的 alpha 蒙版，且与主图尺寸、格式一致。整图编辑时省略此字段，禁止传空字符串，也绝不能把主图路径重复填入 `mask_path`；工具会将这种模型回显视为未提供蒙版。
4. 并发由 `concurrency` 控制，默认上限为 10。识别用户提示词中的并发要求，例如“生成 20 张，并发上限 5”就把 `concurrency: 5` 传给这一批的每个 `generate_image` / `edit_image` 调用；同一批必须使用同一个 1–10 的整数，未指定时省略参数并使用默认 10。使用工具的并发调用生成多张变体，不要逐张串行；编辑依赖必须等待对应主图完成。这个上限只用于 Host 排队，不要把 `concurrency` 写入生图提示词或 provider 请求。
5. 首次成功回复必须直接显示图片：工具返回的 image attachment 会由 DSH 渲染；助手最终文本也必须逐张原样复制工具返回的 `![...](<绝对路径>)` Markdown 图片嵌入，放在普通文本中且不放入反引号。不要只返回路径、普通下载链接或“图片已附上”。Windows 路径使用 `/`，含空格的路径保留 `<...>`。多图逐张嵌入，只展示成功输出并保留 warning；不要为了展示再次生图。
6. 返回生成或编辑文件的绝对路径，并简要说明实际模型与尺寸意图。预览失败但文件已保存时，明确报告预览警告，不把文件结果判为失败。

科研 PPT 遵循 `zerowall-presentation`：根据用户指定的模板、视觉语言和页面角色直接生成；不强制三张样张、内容种子或逐图二次编辑。默认快速生成整页 PNG 图片型 PPTX；用户明确要求可编辑时，依据 PNG 视觉稿构建独立文字、形状、表格、图表和图片对象。用户要求的文字可以进入生成图，需按版面给出准确文案、层级和放置区域，并检查中文 glyph、拼写和可读性；没有用户样式要求时才从主题推导统一风格，不固定白底、色板、分区数量或“禁止文字”。优先使用用户项目图片、文献原图和数据图；保留图片来源、原始 prompt、生成回执和视觉清单，失败后复用成功资产。

## PPT 风格、选择性修改与恢复

PPT 内容计划的全局 stylePrompt、styleReferenceAssetIds 分别继承到每页；每页同名字段可覆盖，空值可清除继承。原始 prompt 与组合 prompt 分别保存。纯风格参考图进入 edit_image 的 input_paths 和来源回执，不自动嵌入成页面事实图，也不要求 assetPlacements。无参考图时使用 generate_image。

presentation_generate_templates 立即返回 taskId，每页独立生成、写入、检查和渲染。默认并发 10，范围 1–10。普通单页或多页修改使用 presentation_repair_templates，仅选中页走 edit_image，保留旧图和 PPT 版本；查看 presentation_status 的逐页结果。可编辑模式新图需对应新原生对象计划，不能重复使用旧页计划冒充转换。导出当前画布或选定历史版本不等待这些任务，不受审阅记录或 QA blocker 拦截。

重启后仅保留中断记录，用户明确选择页后用 presentation_resume_pages 手动恢复；复用已完成生图回执和资产。单页失败不丢弃其他页，不重新执行整批计费请求。

## 凭据与失败处理

- 用户没有显式提供独立 Key 和地址时，必须直接调用 `generate_image` / `edit_image` 使用当前 AI Cloud 配置；不要扫描项目 `.env`、用户目录、Codex/Claude 配置或进程环境，也不要要求已经登录的用户再次提供 Key。
- 不得把 `gpt-image-2` 发送到聊天 `/messages` 或 `/chat/completions`；新图走 Image generations，编辑走 Image edits。
- 如果工具提示未登录、所选生图模型不可用或分组凭据缺失，按实际错误引导用户检查 AI Cloud 登录、模型目录或环境中的生图配置后重试；保留所选模型、分组、质量和参数，不擅自降级或切换路线。
- 如果用户明确指定了另一套 Key/地址，只能通过用户明确授权的外部连接方式临时使用；不得把凭据写进脚本、技能、日志、项目文件或持久化配置。

## 输出约束

- 输出格式为 PNG。
- 不要声称固定输出 `2048x2048`；以工具返回的真实 PNG 宽高和实际质量为准。
- 提示词中的文字内容必须逐字保留，并提醒用户生成式图片中的长文本可能需要后期校对。
- 不声称成功，除非 `generate_image` 或 `edit_image` 返回了真实文件路径。
