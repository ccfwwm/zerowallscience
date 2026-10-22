---
name: media-create
description: 通过对话创作用户明确要求的独立视频、音乐与宣传片。普通图片生成和编辑使用 gpt-image-generator；媒体项目中的图片只作为视频参考素材。
---

# 多媒体创作

协议接口：统一请求通过 Host 使用 Sub2API `/v1/videos`；任务查询复用返回的 `/v1/tasks/{id}`，不重新提交。视频时长用 `seconds`（兼容 `duration`），比例用 `ratio`（兼容 `aspect_ratio`），素材用 `images`、`videos`、`audios`。普通参考优先传 URL 或完整 MIME Data URL 字符串，不自行补充 `role: reference`。用户明确给出的角色、顺序和扩展参数必须保留，首尾帧使用 `first_frame` / `last_frame`。上游字段名、对象/字符串结构、精确属性过滤和响应解析由 Sub2API 的固定版本协议模板负责，不根据模型名猜格式，也不在插件中硬编码某个供应商。

如果普通参考对象被上游拒绝，管理员应免费预览账号模型的有效模板，核对实际出站 `images`。V6K 的字符串参考接口可以使用明确过滤 `role=reference` 的模板；该规则不适用于首尾帧或其他扩展属性。不能把参数错误直接解释成图片 URL 或 Base64 不支持，更不能删除参考素材改成纯文本生成。HTTP 400 明确未受理时保留旧记录，修正配置后按用户的生成要求创建新请求；已受理或状态不明只查原任务。

维护联调可使用随技能提供的 `inspect_request.py`：默认只离线检查请求结构；显式指定 `--online` 时只访问模型列表、能力、免费估价和可选原任务查询，不调用生成接口。凭据从环境变量读取，不写入请求文件或输出。正常对话优先使用已登录 Host 的媒体工具，不要求用户手填密钥或运行脚本。

先按交付物严格选择能力。普通图片生成、图片编辑、海报、插画、封面、PPT/PPTX、幻灯片、文档和报告配图，加载 `gpt-image-generator`，调用 `generate_image` / `edit_image`，沿用环境配置的生图模型、分组及参数。PPT 同时遵循 `zerowall-presentation` / `ppt-maker`，使用真实 PNG 和 `.generation.json` 回执注册配图；不为普通配图建立媒体项目，不调用本技能的媒体工具。生图配置出错时报告实际错误，不用媒体任务作为替代。

只有用户明确要求独立视频、音频/音乐或宣传片时，才使用下面的媒体流程。视频可以使用用户提供或已生成的图片作为参考素材，但这不改变图片请求的路由。不要因为“生成”“制作一张”“做一张图”等泛化措辞调用媒体工具；“生成一张海报”仍然是 `gpt-image-generator`。混合需求分别交付：图片走图片工具，明确的视频或音乐另行走媒体工具。

保持当前会话的文字模型、协议与推理参数。通过 media_project 管理 media-projects/<projectId>/ 下的方案、分镜和素材。

用户只需描述想法，普通对话就是入口，不要求使用命令、打开工作台、填写项目 ID、JSON、密钥、参数或费用。project_id 可省略，插件自动使用当前会话的项目。不要一开始连续追问风格、受众、比例等；缺少信息时采用合理创作方案，只有实际阻止执行的问题才询问。

不要把项目标题、文件路径、中文名称或占位符当作 `project_id`；默认项目省略该字段或传 `null`。工具兼容供应商补入的空字符串和纯空白，将其视为未提供，统一使用当前会话项目。任务 `id` 只使用真实工具结果中的值（8–128 位字母、数字、下划线或短横线），首次 prepare/generate 省略或传 `null`；空值同样视为未提供。需要恢复任务但不知道 ID 时，先 `media_job(action: "status")` 且省略 id 列出原任务，再按返回的项目 ID 和任务 ID 查询；不要为了查状态重新生成。非空 ID 校验失败要纠正调用，不能伪造 ID 或绕过校验。

用户明确要求独立视频、音频/音乐、语音合成或宣传片并且要实际生成时，使用 media_job generate：kind 为 video、music 或 speech，填写 prompt。普通图片生成和编辑不能使用 media_job；不要传 kind=image。插件沿用已有模型和参数，首次未配置时自动选可用模型；费用和限制在后台检查，直接提交，不要求用户再次确认。仅讨论方案、修改文案或用户说“先给草稿”时用 prepare，不提交付费生成。无权限时明确说明分组权限问题，不假装成功。失效选择不擅自换模型。

使用 media_models list 查询真实能力、choices 查询已有选择、select 按用户明确要求更换模型与参数。不要编造模型。media_job 支持项目内 reference_paths、会话图片 input_attachment_ids、mask_path。使用 media_import 导入用户在当前对话发来的图片、视频、音频附件，或工作区路径；project_id 可省略。导入后使用返回的素材路径，所有临时认证及凭据由 Host 管理。用户说“把这个视频作为第二镜头”“导入这段音乐”时直接导入和保存方案，不要求手工导入。

宣传片根据提示形成 brief 与分镜，默认横屏、1080p、30fps，用户提供比例或时长时采用用户要求。media_project read 会自动建立会话项目，返回项目对象及素材与任务；助手在后台编辑对象，通过 save 保存镜头、顺序、时长、字幕、音乐音量和淡入淡出。缺少素材时根据用户的制作要求逐镜头 generate，通过 status 查询状态；用户要求恢复收集时用 collect。失败或状态未知时不重复提交。配音模型暂不可用时可使用导入旁白，或交付无旁白版本并说明；不用音乐代替说话。

通过 media_project compose 合成本地素材，默认1080p、30fps、MP4 H.264/AAC。图像支持平移/缩放、视频裁切、字幕、片头片尾、音乐与旁白、淡入淡出。合成前检查本地依赖，按素材实际时长验证。修改文字不调用付费接口。

保存项目时直接使用 read 返回的项目对象，保留 schemaVersion、id、sessionId、revision、editRevision、assets、outputs。先完成素材导入，再 read 一次取最新方案，然后 save；不要复用早期工具输出中的项目对象。镜头字段为 shots: [{id:"shot-1",asset:"导入返回的素材路径",duration:3,trimStart:0,motion:"zoom-in",caption:"字幕"}]；motion 可为 none、zoom-in、zoom-out。配乐字段 music:{path:"音乐素材路径",volume:0.2,fadeIn:0.5,fadeOut:0.5}，旁白字段 voiceover:{path:"旁白素材路径",volume:0.8}。aspectRatio 为 16:9、9:16 或 1:1，fps 为30。以 save 返回的 editRevision 作为 edit_revision 调用 compose，同时可传最新 revision。素材和输出更新不会使 editRevision 失效；方案确实被其他操作修改时，重新 read，将本次修改合并到最新方案，再 save，最多重试一次，不抹掉其他修改、不向用户抛出内部错误。

视频镜头的 trimStart + duration 不能超过素材实际 duration；图片可指定任意有效镜头时长。例如素材视频只有2秒、成片要求6秒，可安排图片4秒+视频2秒，不让2秒视频充当3秒镜头；字幕和音轨按总时长安排，音乐短于成片时可淡出并留静音。没有素材时按用户要求生成；现有素材满足需要时直接合成。合成任务与结果自动显示在“任务与结果”，不要求用户到素材库找成片。工具已提供完整结构，不需要搜索插件源码、运行 git 检查或让用户填写这些字段。

任务异步返回后报告“已提交”及进度，不声称已完成，然后结束本轮回复，让用户继续对话。status 查询状态并尊重 paused/failed，不恢复已停止或失败的收集；用户明确要求继续、重试收集或重新获取时才用 collect，恢复同一任务的后台查询和下载并立即返回。不重复请求、不循环调用、不用脚本持续等待。生成 completed 但 assets 为空表示上游生成完成、本地作品尚未收集，不能说文件已交付；collection=querying/downloading 表示后台查询/下载；waiting 表示原任务作品尚未可取或网络暂时受阻，Host 会持续跟踪同一原任务并自动恢复查询和下载，没有整体时长或轮数上限，可随时手动停止。failed 只表示本地收集已暂停，不代表上游生成失败；使用 collect 恢复同一原任务，未经用户明确要求新生成，禁止再次 generate、重新估价或更换模型。paused 表示本地收集已停止。用户要求停止等待时调用 media_job pause；只停止本地查询/下载，不声称上游生成已取消或退款。submission-uncertain、manual_review 表示需人工核查；unknown 或未识别的临时状态若有原 taskId 且未返回错误，仍由 Host 持续按原 ID 查询，不提交替代任务。完成收集后在对话直接展示图片或音视频文件，并说明实际结果；用户不需要去工作台寻找文件。右侧“多媒体创作”提供模型设置、进度、作品预览及恢复/停止本地收集入口。不要读取、打印或写入账号凭据。原始素材和历史项目始终保留。

历史任务恢复沿用原 requestId、taskId 与账号凭据，不重新生成。工作台“恢复原任务”会将可信账号历史任务转入“任务与结果”，立即开始后台收集；同一任务重复点击仍复用同一条记录。可以“停止本地收集”或稍后“重新获取”，也可以继续对话、新建会话。停止后不自动恢复下载，用户重新获取时才恢复原任务。

## 多媒体参考与请求恢复

每次新建或明确重试草稿前，读取最近一次已完成的账号能力目录，避免每个生成请求都触发上游模型发现与限流。`profile_id` / `public_profile_id` 是服务端配置版本，不是模型名；版本失效时，仅当同一分组、同一模型、同一操作存在唯一当前能力时更新 profile，保留用户选择的模型、参数和全部参考素材。需要刷新目录时通过模型列表同步操作执行。出现多条候选或模型下线时报告实际选择错误，不擅自切换模型。`invalid_public_profile` 与 `estimate_configuration_changed` 表示目录或模板配置已变化：保留原草稿，刷新后重新估价；已明确 rejected 的请求保留拒绝记录并使用新请求 ID。超时、断网、5xx、`submission-uncertain` 或已有 task ID 只恢复原任务，不能因刷新目录自动重提生成。

视频时长使用用户提供的 `seconds`，兼容的 `duration` 会由 Host 映射为 `seconds`；比例 `aspect_ratio` 映射为 `ratio`。两种写法同时提供且值不同会明确拒绝，不自动覆盖。图片、视频、音频参考分别使用统一 `images`、`videos`、`audios` 数组，协议字段和编码由管理员绑定的固定模板版本处理。价格由渠道定价按公开模型名匹配，插件不维护独立价格。

本地图片、视频、音频参考默认由 Host 编码为 Base64。创作者优先通过 `images`、`videos`、`audios` 提交统一素材数组，支持 URL、完整 MIME Data URL，以及带 `role` 或其他模板属性的对象；也可用 `references_file` 读取含公网 URL 的清单。不得根据模型名或上游域名选择协议字段，模型绑定的协议模板由管理员配置。`parameters_json` 只用于兼容其他模型参数；若重复提供统一素材字段，内容必须一致，否则先修正冲突。旧 `references_json` 仍可用于描述项目文件、会话附件、公网 URL 或当前任务的 `reference_id`；URL 填 `media_type`，图片角色可为 reference/first_frame/last_frame，首尾帧不可混普通图片。音乐参考仅影响视频，不自动额外生成音乐。能力要求公网 URL 或服务端明确拒绝 Base64 时，只询问缺失素材的 HTTPS 直链，不上传七牛或其他图床。已有 URL 或原任务 reference_id 直接复用，不重复导入或上传。明确未受理的 rejected 任务修正后生成新请求，保留旧记录；超时、断网、5xx 或已受理任务只恢复原任务，不自动重提。鉴权、余额、内容拒绝、限流不能一概要求改 URL。

`references_json` 示例：`[{"path":"media-projects/<真实项目>/assets/ref.mp4","role":"reference"},{"url":"https://example.com/ref.jpg","media_type":"image/jpeg","role":"first_frame"}]`。每项仅一个来源：项目 path、会话 attachment_id、公网 url，或当前任务摘要返回的 reference_id（sha256）。使用新参数时不能再传 reference_paths/input_attachment_ids；不要输出 Base64、凭据或签名 URL。


### 参考素材完整性

通过 `media_job.references_file` 读取工作区 JSON 清单（与 `references_json`、旧参考输入互斥），例如 `source/reference-inputs.json`。清单每项包含 `url`、`media_type`，可带 `role` 与供应商附加属性。不能仅把目录路径写进 prompt。

URL 与 Base64 的序列化方式由管理员模板决定。插件始终提交统一的 `images`、`videos`、`audios` 字段；模型能力目录仅作提示。相同语义字段冲突时在提交前明确报错，不覆盖素材。

估价失败返回 `validation-failed` 草稿及原 ID，素材仍保存。修正参数时复用原任务，省略参考输入会继承项目意图；`[]` 不会清空已有素材，只有用户明确要求无参考创作时才使用 `clear_references`。不得因报错去掉图片或视频、更换模型或重建空参考任务。提交前核对返回的参考数量；准备参数、尝试发送和上游受理是不同状态，历史未记录时不得推断素材已经发送。
