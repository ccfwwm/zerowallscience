---
name: media-create
description: 通过对话创作用户明确要求的独立视频、音乐与宣传片。普通图片生成和编辑使用 gpt-image-generator；媒体项目中的图片只作为视频参考素材。
---

# 多媒体创作

先按交付物严格选择能力。普通图片生成、图片编辑、海报、插画、封面、PPT/PPTX、幻灯片、文档和报告配图，加载 `gpt-image-generator`，调用 `generate_image` / `edit_image`，沿用环境配置的生图模型、分组及参数。PPT 同时遵循 `zerowall-presentation` / `univer-slide`，使用真实 PNG 和 `.generation.json` 回执注册配图；不为普通配图建立媒体项目，不调用本技能的媒体工具。生图配置出错时报告实际错误，不用媒体任务作为替代。

只有用户明确要求独立视频、音频/音乐或宣传片时，才使用下面的媒体流程。视频可以使用用户提供或已生成的图片作为参考素材，但这不改变图片请求的路由。不要因为“生成”“制作一张”“做一张图”等泛化措辞调用媒体工具；“生成一张海报”仍然是 `gpt-image-generator`。混合需求分别交付：图片走图片工具，明确的视频或音乐另行走媒体工具。

保持当前会话的文字模型、协议与推理参数。通过 media_project 管理 media-projects/<projectId>/ 下的方案、分镜和素材。

用户只需描述想法，普通对话就是入口，不要求使用命令、打开工作台、填写项目 ID、JSON、密钥、参数或费用。project_id 可省略，插件自动使用当前会话的项目。不要一开始连续追问风格、受众、比例等；缺少信息时采用合理创作方案，只有实际阻止执行的问题才询问。

不要把项目标题、文件路径、中文名称、空字符串或占位符当作 `project_id`；默认项目省略该字段。任务 `id` 只使用真实工具结果中的值（8–128 位字母、数字、下划线或短横线），首次 prepare/generate 省略。需要恢复任务但不知道 ID 时，先 `media_job(action: "status")` 且省略 id 列出原任务，再按返回的项目 ID 和任务 ID 查询；不要为了查状态重新生成。ID 校验失败要纠正调用，不能伪造 ID 或绕过校验。

用户明确要求独立视频、音频/音乐或宣传片并且要实际生成时，使用 media_job generate：kind 只能为 video 或 music，填写 prompt。普通图片生成和编辑不能使用 media_job；不要传 kind=image。插件沿用已有模型和参数，首次未配置时自动选可用模型；费用和限制在后台检查，直接提交，不要求用户再次确认。仅讨论方案、修改文案或用户说“先给草稿”时用 prepare，不提交付费生成。无权限时明确说明分组权限问题，不假装成功。失效选择不擅自换模型。

使用 media_models list 查询真实能力、choices 查询已有选择、select 按用户明确要求更换模型与参数。不要编造模型。media_job 支持项目内 reference_paths、会话图片 input_attachment_ids、mask_path。使用 media_import 导入用户在当前对话发来的图片、视频、音频附件，或工作区路径；project_id 可省略。导入后使用返回的素材路径，所有临时认证及凭据由 Host 管理。用户说“把这个视频作为第二镜头”“导入这段音乐”时直接导入和保存方案，不要求手工导入。

宣传片根据提示形成 brief 与分镜，默认横屏、1080p、30fps，用户提供比例或时长时采用用户要求。media_project read 会自动建立会话项目，返回项目对象及素材与任务；助手在后台编辑对象，通过 save 保存镜头、顺序、时长、字幕、音乐音量和淡入淡出。缺少素材时根据用户的制作要求逐镜头 generate，然后 status/collect 收集；失败或状态未知时不重复提交。配音模型暂不可用时可使用导入旁白，或交付无旁白版本并说明；不用音乐代替说话。

通过 media_project compose 合成本地素材，默认1080p、30fps、MP4 H.264/AAC。图像支持平移/缩放、视频裁切、字幕、片头片尾、音乐与旁白、淡入淡出。合成前检查本地依赖，按素材实际时长验证。修改文字不调用付费接口。

保存项目时直接使用 read 返回的项目对象，保留 schemaVersion、id、sessionId、revision、editRevision、assets、outputs。先完成素材导入，再 read 一次取最新方案，然后 save；不要复用早期工具输出中的项目对象。镜头字段为 shots: [{id:"shot-1",asset:"导入返回的素材路径",duration:3,trimStart:0,motion:"zoom-in",caption:"字幕"}]；motion 可为 none、zoom-in、zoom-out。配乐字段 music:{path:"音乐素材路径",volume:0.2,fadeIn:0.5,fadeOut:0.5}，旁白字段 voiceover:{path:"旁白素材路径",volume:0.8}。aspectRatio 为 16:9、9:16 或 1:1，fps 为30。以 save 返回的 editRevision 作为 edit_revision 调用 compose，同时可传最新 revision。素材和输出更新不会使 editRevision 失效；方案确实被其他操作修改时，重新 read，将本次修改合并到最新方案，再 save，最多重试一次，不抹掉其他修改、不向用户抛出内部错误。

视频镜头的 trimStart + duration 不能超过素材实际 duration；图片可指定任意有效镜头时长。例如素材视频只有2秒、成片要求6秒，可安排图片4秒+视频2秒，不让2秒视频充当3秒镜头；字幕和音轨按总时长安排，音乐短于成片时可淡出并留静音。没有素材时按用户要求生成；现有素材满足需要时直接合成。合成任务与结果自动显示在“任务与结果”，不要求用户到素材库找成片。工具已提供完整结构，不需要搜索插件源码、运行 git 检查或让用户填写这些字段。

任务异步返回后报告“已提交”及进度，不声称已完成。status/collect 恢复同一任务，不重复请求。submission-uncertain、unknown、manual_review 表示待核查。完成后在对话直接展示图片或音视频文件，并说明实际结果；用户不需要去工作台寻找文件。右侧“多媒体创作”仅提供模型设置、进度、作品预览和备用入口。停止等待不等于取消或退款。不要读取、打印或写入账号凭据。原始素材和历史项目始终保留。
