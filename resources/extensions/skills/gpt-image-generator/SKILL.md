---
name: gpt-image-generator
description: Generate or edit PNG images with ZeroWall's built-in generate_image and edit_image tools and the environment's configured image model, group and parameters. Use for PPT/PPTX 配图、幻灯片插图、报告配图、生图、生成图片、改图、局部重绘、换背景、删除元素、调整颜色、保持构图、插画、海报、封面、背景图、视觉概念图、科研配图 or other raster-image requests. Use the configured image route without asking for credentials again.
---

# ZeroWall Image Generation

这是 ZeroWall 唯一默认的生图工作流。直接使用当前对话上下文，不启动额外提示词摘要模型；尽量保留用户原话，只补足缺少的构图、用途、格式或尺寸约束。

PPT/PPTX、幻灯片、文档和报告的配图也使用本技能。通过 `generate_image` / `edit_image` 取得工作区 PNG 与真实 `.generation.json` 回执，再交给 `presentation_record_assets` 和 Univer；不调用 `media_models`、`media_import`、`media_project` 或 `media_job`，不创建媒体项目、时间线或任务。用户另行明确要求独立媒体项目、视频、音乐或宣传片时，该独立交付物才使用 `media-create`。图片配置由 Host 从环境配置读取，助手不要读取或打印环境变量中的秘密；环境配置错误要如实报告，不能改走媒体任务、切换分组或换模型。

## 工具路由

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
4. 返回生成或编辑文件的绝对路径，并简要说明实际模型与尺寸意图。成功结果会直接显示在对话中；预览失败但文件已保存时，明确报告预览警告，不把文件结果判为失败。需要多张变体时使用不同文件名，可在合理并发范围内生成。

科研 PPT 遵循 `zerowall-presentation`：根据用户指定的模板、视觉语言和页面角色直接生成；不强制三张样张、内容种子或逐图二次编辑。用户要求的文字可以进入生成图，需按版面给出准确文案、层级和放置区域，并检查中文 glyph、拼写和可读性；正式标题、正文、公式、数值和图表仍保留为 Univer 可编辑对象。没有用户样式要求时才从主题推导统一风格，不固定白底、色板、分区数量或“禁止文字”。图片、生成回执和视觉清单分别保留；失败后复用成功资产。

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
