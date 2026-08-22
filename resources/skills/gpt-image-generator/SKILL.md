---
name: gpt-image-generator
description: Generate or edit PNG images with ZeroWall's built-in generate_image and edit_image tools and the current AI Cloud account's configured gpt-image-2 model. Use for 生图、生成图片、改图、局部重绘、换背景、删除元素、调整颜色、保持构图、插画、海报、封面、背景图、视觉概念图、科研配图 or other raster-image requests. When the user has not supplied a separate API key and endpoint, automatically use the signed-in ZeroWall AI Cloud configuration without asking for credentials again.
---

# GPT Image 生成与编辑

使用 Host 内置的 `generate_image` 生成新 PNG，使用 `edit_image` 基于已有图片修改。默认模型固定为当前 ZeroWall AI Cloud 账号已经发现并配置的 `gpt-image-2`；密钥只在 Host 的系统加密存储中读取，不进入对话、Shell 环境或项目文件。

## 工具路由

- 用户明确要求新画面、重新构思，或没有任何编辑已有图片的意图时，调用 `generate_image`。
- 用户要求修改主体、换背景、删除元素、调整颜色、保持构图、局部重绘、模板复刻或基于参考图延展，并且存在源图时，调用 `edit_image`。
- 源图选择优先级固定为：用户明确指定路径 > 本轮明确指定的图片 > 当前会话最近一次成功的 `generate_image` / `edit_image` 输出。
- 有编辑意图但没有源图时，询问用户提供或指定图片；存在多个同等合理候选时列出候选并询问，不得擅自选一张，也不得退化成新生成。
- `edit_image` 最多传 16 张 `input_paths`。第一张是主要编辑对象，后续图片是风格、主体或构图参考；只有局部区域明确可由 alpha mask 表达时才传 `mask_path`。

## 工作流

1. 从用户描述中整理清晰的画面主体、构图、风格、光线、色彩、文字要求和用途。信息足够时直接生成，不重复追问 Key 或地址。
2. 在当前会话工作目录内选择明确的 `.png` 输出路径。不要写到项目目录外；默认不要覆盖已有文件。
3. 按“工具路由”调用 `generate_image` 或 `edit_image`：
   - `prompt`：完整生图提示词。
   - `output_path`：当前项目内的相对或绝对 PNG 路径。
   - `model`：用户未指定时省略，让工具精确选择 `gpt-image-2`。
   - `size`：按用途选择 `1024x1024`、`1536x1024`、`1024x1536` 或 `auto`。
   - `quality`：默认 `auto`；成品图可选 `high`。
   - `overwrite`：只有用户明确要求替换已有图时才设为 `true`。
   - `input_paths`：仅 `edit_image` 使用，按源图优先级排列，主图放第一张。
- `mask_path`：仅 `edit_image` 可选；必须是独立于 `input_paths[0]` 的 alpha 蒙版，且与主图尺寸、格式一致。整图编辑时省略此字段，禁止传空字符串，也绝不能把主图路径重复填入 `mask_path`；工具会将这种模型回显视为未提供蒙版。
4. 返回生成或编辑文件的绝对路径，并简要说明实际模型与尺寸意图。成功结果会直接显示在对话中；预览失败但文件已保存时，明确报告预览警告，不把文件结果判为失败。需要多张变体时使用不同文件名，可在合理并发范围内生成。

## 凭据与失败处理

- 用户没有显式提供独立 Key 和地址时，必须直接调用 `generate_image` / `edit_image` 使用当前 AI Cloud 配置；不要扫描项目 `.env`、用户目录、Codex/Claude 配置或进程环境，也不要要求已经登录的用户再次提供 Key。
- 不得把 `gpt-image-2` 发送到聊天 `/messages` 或 `/chat/completions`；新图走 Image generations，编辑走 Image edits。
- 如果工具提示未登录、没有 `gpt-image-2` 或分组凭据缺失，引导用户打开左下角 AI Cloud，登录并刷新模型列表，然后重试。
- 如果用户明确指定了另一套 Key/地址，只能通过用户明确授权的外部连接方式临时使用；不得把凭据写进脚本、技能、日志、项目文件或持久化配置。

## 输出约束

- 输出格式为 PNG。
- 提示词中的文字内容必须逐字保留，并提醒用户生成式图片中的长文本可能需要后期校对。
- 不声称成功，除非 `generate_image` 或 `edit_image` 返回了真实文件路径。
